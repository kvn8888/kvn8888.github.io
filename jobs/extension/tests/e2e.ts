import { chromium, type BrowserContext, type Page } from "playwright";
import { createServer } from "node:http";
import { createClient } from "@libsql/client";
import { readFile, mkdir, writeFile, cp, rm, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const makeFixture = createRequire(import.meta.url)("./hosted-fixture.cjs");
const dir = await mkdtemp("/tmp/jobsutility-e2e-");
await mkdir(".test-output", { recursive: true });
const db = createClient({ url: `file:${dir}/db.sqlite` });
await db.executeMultiple(
  await readFile("schema/001_job_collection.sql", "utf8"),
);
const key = "a".repeat(64),
  readKey = "b".repeat(64);
const makeServer = await makeFixture(db, key, readKey);
let api = makeServer();
await new Promise<void>((r) => api.listen(43128, "127.0.0.1", r));
const fixture = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  const path = req.url || "/";
  if (path.startsWith("/jobs")) {
    const num = new URL(path, "http://fixture").searchParams.get("page") || "1";
    res.end(
      `<!doctype html><title>Example Jobs</title><h1>Open jobs</h1><a href="/jobs?page=2">Page 2</a><a href="/jobs?page=3">Page 3</a><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: num }, title: "Cloud Engineer " + num, hiringOrganization: { name: "Example Company" }, description: "Build useful cloud services. Full job description.", jobLocationType: "TELECOMMUTE", url: `http://127.0.0.1:43129/job/${num}` })}</script><a href="/apply/profile">Apply</a>`,
    );
    return;
  }
  if (path.includes("/questions"))
    res.end(
      '<!doctype html><title>Application</title><h1>Questions</h1><label>Why this role?<textarea name="why"></textarea></label><label>Contact me<input name="contact" type="checkbox"></label><a href="/apply/profile">Back</a><button onclick="location.href=\'/confirmation\'">Submit application</button>',
    );
  else if (path.includes("/confirmation"))
    res.end(
      "<!doctype html><title>Confirmation</title><h1>Application received</h1><p>Thank you.</p>",
    );
  else
    res.end(
      '<!doctype html><title>Application</title><h1>Profile</h1><label>Full name<input name="full-name" value="Example Applicant"></label><label>Password<input type="password" name="password" value="DO_NOT_CAPTURE"></label><a href="/apply/questions">Next</a>',
    );
});
await new Promise<void>((r) => fixture.listen(43129, "127.0.0.1", r));
const extension = resolve("dist/extension");
let context!: BrowserContext;
let panel!: Page;
let id = "";
const errors: string[] = [];
async function launch() {
  context = await chromium.launchPersistentContext(dir + "/profile", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--remote-debugging-port=9337",
    ],
    viewport: { width: 450, height: 1000 },
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  id = new URL(worker.url()).host;
  panel = await context.newPage();
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.waitForSelector("nav");
}
async function cmd(type: string, data: object = {}) {
  return panel.evaluate(
    async (m) => {
      const r = await chrome.runtime.sendMessage(m);
      if (!r?.ok) throw Error(r?.error);
      return r.data;
    },
    { type, ...data },
  );
}
async function state() {
  return cmd("state");
}
async function until(fn: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error(message);
}
try {
  await launch();
  // Real extension page, permissions, content script, worker, HTTP API, and SQLite.
  await panel.getByRole("tab", { name: "Settings", exact: true }).click();
  await panel.locator("#api-url").fill("http://127.0.0.1:43128");
  await panel.locator("#api-key").fill(key);
  await panel.getByRole("button", { name: "Connect", exact: true }).click();
  await until(
    async () => !!(await state()).connection,
    "Connection import failed",
  );
  let jobPage = await context!.newPage();
  await jobPage.goto("http://127.0.0.1:43129/jobs?page=1");
  await jobPage.bringToFront();
  await panel.getByRole("tab", { name: "Collection", exact: true }).click();
  await until(async () => !!(await state()).tab, "No target tab");
  await panel
    .getByRole("button", { name: "Collect on this site", exact: true })
    .click();
  await until(
    async () =>
      Number(
        (await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n,
      ) === 1,
    "First job did not sync",
  );
  for (const page of [2, 3, 1]) {
    await jobPage.goto(`http://127.0.0.1:43129/jobs?page=${page}`);
    await new Promise((r) => setTimeout(r, 600));
  }
  await until(
    async () =>
      Number(
        (await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n,
      ) === 3,
    "Pagination/deduplication failed",
  );
  console.log(
    "PASS collection: three pages, full descriptions, destinations, deduplication, backend persistence",
  );
  await panel.getByRole("tab", { name: "Collection", exact: true }).click();
  await panel.screenshot({
    path: ".test-output/collection.png",
    fullPage: true,
  });
  const downloading = panel.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download .txt", exact: true })
    .click();
  const exported = await downloading;
  const lines = (await readFile((await exported.path())!, "utf8"))
    .trim()
    .split("\n");
  assert.equal(lines.length, 3);
  assert.ok(
    lines.every((line) => line.startsWith("http://127.0.0.1:43129/job/")),
  );
  console.log(
    "PASS export: downloaded text contains three unique application URLs",
  );
  // Stop the backend, capture a fourth job, then restart Chrome to prove the queue persists.
  await new Promise<void>((r) => api.close(() => r()));
  await jobPage.goto("http://127.0.0.1:43129/jobs?page=4");
  await until(
    async () => (await state()).queue.length > 0,
    "Offline job was not queued",
  );
  await context!.close();
  await launch();
  assert.ok((await state()).queue.length > 0, "Queue lost on browser restart");
  api = makeServer();
  await new Promise<void>((r) => api.listen(43128, "127.0.0.1", r));
  await cmd("retry");
  await until(
    async () => (await state()).queue.length === 0,
    "Restarted queue did not sync",
  );
  console.log(
    "PASS offline/restart: queued job survived browser restart and synced after reconnect",
  );
  jobPage = await context!.newPage();
  await jobPage.goto("http://127.0.0.1:43129/apply/profile");
  await jobPage.bringToFront();
  await panel.getByRole("tab", { name: "Applications", exact: true }).click();
  await panel.locator("#attach-job").selectOption({ index: 1 });
  await panel
    .getByRole("button", { name: "Start capture on this tab", exact: true })
    .click();
  await until(
    async () => (await state()).captures[0]?.pages.length > 0,
    "Capture did not start",
  );
  await jobPage.getByLabel("Full name").fill("Changed Applicant");
  await new Promise((r) => setTimeout(r, 650));
  await jobPage.getByRole("link", { name: "Next", exact: true }).click();
  await jobPage
    .getByLabel("Why this role?")
    .fill("I like building useful tools.");
  await new Promise((r) => setTimeout(r, 650));
  await panel
    .getByRole("button", { name: "Capture this section", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  await until(
    async () => (await state()).captures[0].status === "review",
    "Finish did not enter review",
  );
  let c = (await state()).captures[0];
  assert.equal(c.pages.length, 2);
  assert.ok(JSON.stringify(c.pages).includes("Changed Applicant"));
  assert.ok(JSON.stringify(c.pages).includes("I like building useful tools."));
  assert.ok(!JSON.stringify(c.pages).includes("DO_NOT_CAPTURE"));
  assert.equal(
    Number(
      (await db.execute("SELECT count(*) n FROM job_applications")).rows[0].n,
    ),
    0,
    "Premature tracker insert",
  );
  await panel.screenshot({
    path: ".test-output/application-review.png",
    fullPage: true,
  });
  await panel.getByRole("checkbox", { name: /I submitted/ }).check();
  await panel
    .getByRole("button", { name: "Save submitted application", exact: true })
    .click();
  await until(
    async () => (await state()).captures[0].status === "saved",
    "Submission did not save",
  );
  c = (await state()).captures[0];
  const row = (await db.execute("SELECT * FROM job_applications")).rows[0];
  assert.equal(row.company, "Example Company");
  assert.equal(row.status, "submitted");
  assert.equal(JSON.parse(String(row.other_details)).pages.length, 2);
  await cmd("retry");
  assert.equal(
    Number(
      (await db.execute("SELECT count(*) n FROM job_applications")).rows[0].n,
    ),
    1,
  );
  const diagnostics = await cmd('diagnostics');
  assert.equal(diagnostics.version, '0.3.0');
  assert.equal(diagnostics.extension_id, id);
  assert.ok(/^[a-f0-9]{64}$/.test(diagnostics.build_hash));
  assert.equal(JSON.stringify(diagnostics).includes(key), false);
  assert.equal('connection' in diagnostics, false);
  assert.equal('captures' in diagnostics, false);
  const diagnosticsPage = await context.newPage();
  await diagnosticsPage.goto(`chrome-extension://${id}/diagnostics.html`);
  await diagnosticsPage.getByRole('heading', {name: 'Jobs Utility Diagnostics'}).waitFor();
  await diagnosticsPage.close();
  console.log('PASS diagnostics: running identity/version, build hash, activity counts; no credentials or answers');
  assert.deepEqual(errors, []);
  console.log(
    "PASS application: prefill, edits, two sections, secret exclusion, review gate, confirmed JSON submission",
  );
  await writeFile(
    ".test-output/e2e-report.json",
    JSON.stringify(
      {
        passed: true,
        collection_rows: 4,
        application_rows: 1,
        console_errors: errors,
        production_writes: 0,
      },
      null,
      2,
    ),
  );
  if (process.env.KEEP_BROWSER === "1") {
    console.log(
      `INSPECT_EXTENSION=chrome-extension://${id}/panel.html CDP=9337`,
    );
    await new Promise((r) => setTimeout(r, 55000));
  }
} catch (e) {
  if (panel! && !panel.isClosed()) {
    console.log("DEBUG UI", await panel.locator("body").innerText());
    console.log("DEBUG STATE", JSON.stringify(await state()));
    await panel.screenshot({
      path: ".test-output/failure.png",
      fullPage: true,
    });
  }
  throw e;
} finally {
  await context!?.close();
  await new Promise<void>((r) => api.close(() => r()));
  await new Promise<void>((r) => fixture.close(() => r()));
  db.close();
}

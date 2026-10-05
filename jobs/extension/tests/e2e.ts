import {CLIENT_VERSION} from '../src/shared/version';
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
const makeServer = await makeFixture(db, key, readKey, "c".repeat(64));
let api = makeServer();
await new Promise<void>((r) => api.listen(43128, "127.0.0.1", r));
const fixture = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  const path = req.url || "/";
  if (path.startsWith("/jobs") || path.startsWith('/job/')) {
    const num = path.startsWith('/job/') ? path.split('/')[2].split('?')[0] : new URL(path, "http://fixture").searchParams.get("page") || "1";
    res.end(
      `<!doctype html><title>Example Jobs</title><h1>Open jobs</h1><a href="/jobs?page=2">Page 2</a><a href="/jobs?page=3">Page 3</a><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: num }, title: "Cloud Engineer " + num, hiringOrganization: { name: "Example Company" }, description: "Build useful cloud services. Full job description.", jobLocationType: "TELECOMMUTE", url: `http://127.0.0.1:43129/job/${num}` })}</script>${num==='9'?'<a target="_blank" href="https://job-boards.greenhouse.io/example/jobs/98765?jr_id=fixture">Apply</a>':'<a href="/apply/profile">Apply</a>'}`,
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
assert.ok(!JSON.parse(await readFile(resolve(extension,"manifest.json"),"utf8")).permissions.includes("tabs"),"Do not request browser-wide tab metadata");
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
  // Synthetic ATS page only; never contacts an employer or submits a real application.
  await context.route('https://job-boards.greenhouse.io/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Example Company — Cloud Engineer 9</h1><p>Application landing page</p>'}));
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
  await panel.getByRole("button", { name: /^System:/ }).click();
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
  await panel.getByRole("tab", { name: "Here", exact: true }).click();
  await until(async () => !!(await state()).tab, "No target tab");
  await panel
    .getByRole("radio", { name: "Auto", exact: true })
    .check();
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
  await panel.getByRole("tab", { name: "Here", exact: true }).click();
  await panel.screenshot({
    path: ".test-output/collection.png",
    fullPage: true,
  });
  await panel.getByRole("tab",{name:"Jobs",exact:true}).click();
  await panel.getByText("Export application links",{exact:true}).click();
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
  jobPage=await context.newPage();await jobPage.goto('http://127.0.0.1:43129/jobs?page=1');await jobPage.bringToFront();
  await cmd('enable',{mode:'manual'});
  assert.equal((await state()).sites.includes('http://127.0.0.1:43129'),false,'Rollback must not turn a manual site into automatic collection');
  assert.equal((await cmd('diagnostics')).collection_sites,1,'Manual enrichment is active work for reload checks');
  const beforeManual=Number((await db.execute('SELECT count(*) n FROM job_collection')).rows[0].n);
  await jobPage.goto('http://127.0.0.1:43129/jobs?page=9');await new Promise(r=>setTimeout(r,700));
  assert.equal(Number((await db.execute('SELECT count(*) n FROM job_collection')).rows[0].n),beforeManual);
  await assert.rejects(cmd('addSelected'),/Open one job posting/);
  await jobPage.goto('http://127.0.0.1:43129/job/9');await jobPage.bringToFront();
  await panel.getByRole('tab',{name:'Here',exact:true}).click();
  await panel.getByRole('button',{name:'Save this job',exact:true}).click();
  await until(async()=>!!(await db.execute("SELECT id FROM job_collection WHERE source_job_id='9'")).rows.length,'Manual job not saved');
  const manualId=String((await db.execute("SELECT id FROM job_collection WHERE source_job_id='9'")).rows[0].id);
  await until(async()=>(await state()).queue.length===0,'Manual write still queued');
  await jobPage.getByRole('link',{name:'Apply',exact:true}).click();
  await until(async()=>String((await db.execute({sql:'SELECT application_url FROM job_collection WHERE id=?',args:[manualId]})).rows[0].application_url).includes('greenhouse.io'),'Employer tab was not linked to original opportunity');
  assert.equal(Number((await db.execute('SELECT count(*) n FROM job_collection')).rows[0].n),beforeManual+1);
  assert.equal((await db.execute({sql:'SELECT ats_job_id FROM job_collection WHERE id=?',args:[manualId]})).rows[0].ats_job_id,'98765');
  const employerPage=context.pages().find(p=>p.url().includes('/example/jobs/98765'))!;
  await employerPage.goto('https://job-boards.greenhouse.io/example/jobs/22222');await new Promise(r=>setTimeout(r,500));
  assert.equal((await db.execute({sql:'SELECT ats_job_id FROM job_collection WHERE id=?',args:[manualId]})).rows[0].ats_job_id,'98765','Later navigation to a different posting must not overwrite the linked job');
  await until(async()=>(await state()).queue.length===0,'Destination still queued');
  await cmd('archiveJob',{id:manualId,reason:'Disposable fixture archive test'});
  await jobPage.bringToFront();await jobPage.reload();await new Promise(r=>setTimeout(r,700));
  await assert.rejects(cmd('addSelected'),/archived/);
  await panel.getByRole('tab',{name:'Here',exact:true}).click();
  assert.equal(await panel.getByRole('button',{name:/Cloud Engineer 9.*Lead/}).count(),0);
  assert.ok((await db.execute({sql:'SELECT archived_at FROM job_collection WHERE id=?',args:[manualId]})).rows[0].archived_at);
  await jobPage.bringToFront();await cmd('enable',{mode:'auto'});
  await panel.getByRole('tab',{name:'Jobs',exact:true}).click();
  await panel.getByRole('button',{name:/Cloud Engineer 1/}).click();
  await panel.getByLabel('Company',{exact:true}).fill('Unsaved draft company');
  await panel.getByRole('tab',{name:'Here',exact:true}).click();
  await panel.getByRole('tab',{name:'Jobs',exact:true}).click();
  await panel.getByRole('button',{name:/Cloud Engineer 1/}).click();
  assert.equal(await panel.getByLabel('Company',{exact:true}).inputValue(),'Unsaved draft company','Tab navigation lost the unsaved draft');
  await panel.getByRole('tab',{name:'Jobs',exact:true}).click();
  await panel.getByRole('button',{name:'Archived',exact:true}).click();
  await panel.getByRole('button',{name:/Cloud Engineer 9/}).click();
  await panel.getByText('Restore opportunity',{exact:true}).click();
  await panel.getByLabel('Reason',{exact:true}).fill('Restore disposable fixture');
  await panel.getByRole('button',{name:'Restore job',exact:true}).click();
  await until(async()=>!(await db.execute({sql:'SELECT archived_at FROM job_collection WHERE id=?',args:[manualId]})).rows[0].archived_at,'Restore UI did not persist');
  console.log('PASS manual selection: no incidental inserts, same-record ATS navigation, archive hidden and restore retains identity');
  jobPage = await context!.newPage();
  await jobPage.goto("http://127.0.0.1:43129/apply/profile");
  await jobPage.bringToFront();
  await panel.getByRole("tab", { name: "Here", exact: true }).click();
  await panel.locator("#attach-job").selectOption({ index: 1 });
  await panel
    .getByRole("button", { name: "Start capture on this tab", exact: true })
    .click();
  await until(
    async () => (await state()).captures[0]?.pages.length > 0,
    "Capture did not start",
  );
  await panel.getByRole('button',{name:'Pause capture',exact:true}).click();
  await until(async()=>(await state()).captures[0].paused===true,'Draft did not pause');
  await jobPage.getByLabel('Full name').fill('Change while paused');
  await new Promise(r=>setTimeout(r,650));
  assert.ok(!JSON.stringify((await state()).captures[0].pages).includes('Change while paused'));
  await panel.getByRole('button',{name:'Resume capture',exact:true}).click();
  await until(async()=>(await state()).captures[0].status==='recording','Draft did not resume');
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
  const answer=c.pages.flatMap((p:any)=>p.fields).find((f:any)=>f.label==='Why this role?');
  const answerBox=panel.locator('.answer').filter({hasText:'Why this role?'});
  await answerBox.locator('summary').click();
  await answerBox.getByLabel('Answer',{exact:true}).fill('Reviewed answer for this role.');
  await answerBox.getByRole('button',{name:'Save answer',exact:true}).click();
  await until(async()=>(await state()).captures[0].pages.flatMap((p:any)=>p.fields).find((f:any)=>f.field_id===answer.field_id)?.answer==='Reviewed answer for this role.','Answer edit was not persisted');
  const choice=panel.locator('.answer').filter({hasText:'Contact me'});
  await choice.locator('summary').click();
  await choice.getByLabel('Answer',{exact:true}).selectOption('true');
  await choice.getByRole('button',{name:'Save answer',exact:true}).click();
  await until(async()=>(await state()).captures[0].pages.flatMap((p:any)=>p.fields).find((f:any)=>f.label==='Contact me')?.answer?.checked===true,'Checkbox edit lost its type');
  await panel.getByRole("checkbox", { name: /I submitted/ }).check();
  await panel
    .getByRole("button", { name: "Save submitted application", exact: true })
    .click();
  await until(
    async () => (await state()).captures[0].status === "saved",
    "Submission did not save",
  );
  await panel.getByText(/was saved and read back/).waitFor();
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
  await panel.getByRole('tab',{name:'Applied',exact:true}).click();
  await panel.getByRole('button',{name:/Cloud Engineer/}).click();
  await panel.getByText('Saved answers & capture record',{exact:true}).click();
  assert.ok((await panel.locator('.answers-readback').innerText()).includes('Reviewed answer for this role.'));
  await panel.setViewportSize({width:360,height:900});
  assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Applied detail overflows narrow panel');
  await panel.screenshot({path:'.test-output/applied-readback.png',fullPage:true});
  await panel.setViewportSize({width:450,height:1000});
  const diagnostics = await cmd('diagnostics');
  assert.equal(diagnostics.version, CLIENT_VERSION);
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
  // One installed extension: agent queues in the API, human restores and confirms from the queue UI.
  const agentApi=async(path:string,body?:any)=>{const r=await fetch('http://127.0.0.1:43128'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
  const queueJob={...JSON.parse(JSON.stringify((await state()).jobs[0])),id:crypto.randomUUID(),identity_key:'fixture:human-queue',source_job_id:'human-queue',source_url:'http://127.0.0.1:43129/handoff',application_url:'http://127.0.0.1:43129/handoff',canonical_url:'http://127.0.0.1:43129/handoff'};
  delete queueJob.updated_at;
  const queuedJob=(await agentApi('/api/job-collection',queueJob)).job;
  const token=crypto.randomUUID()+crypto.randomUUID(),attemptId=crypto.randomUUID(),handoffId=crypto.randomUUID();
  await agentApi('/api/job-workflow/attempts',{id:attemptId,collection_id:queuedJob.id,version:queuedJob.version,claim_token:token});
  await agentApi('/api/job-workflow/attempts/'+attemptId+'/handoff',{id:handoffId,claim_token:token,reason_code:'captcha',notes:'Synthetic human handoff',packets:[{schema_version:'1.0',id:crypto.randomUUID(),created_at:new Date().toISOString(),application_url:'http://127.0.0.1:43129/handoff',status:'ready_for_human',fields:[{name:'full-name',label:'Full name',type:'text',value:'Handoff Applicant'}]}]});
  await cmd('connect',{connection:{baseUrl:'http://127.0.0.1:43128',apiKey:'c'.repeat(64)}});
  const human=await context.newPage();await human.goto(`chrome-extension://${id}/panel.html`);await human.getByRole('tab',{name:'Handoffs',exact:true}).click();
  await human.getByRole('button',{name:'Take handoff',exact:true}).click();await human.getByRole('button',{name:'Open application URL',exact:true}).waitFor();
  await cmd('handoff-open',{packetIndex:0});
  const handoffState=await cmd('handoff-state');assert.ok(handoffState.work.tabId);assert.equal('token' in handoffState.work,false);
  const restored=await cmd('handoff-restore',{packetIndex:0,confirmPage:true});assert.equal(restored.filled,1);
  const restoredPage=context.pages().find(p=>p.url()==='http://127.0.0.1:43129/handoff'&&p!==jobPage)!;assert.equal(await restoredPage.getByLabel('Full name').inputValue(),'Handoff Applicant');
  assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,1);
  await restoredPage.getByRole('link',{name:'Next',exact:true}).click();
  await restoredPage.getByLabel('Why this role?').fill('Human final step answer');
  await cmd('handoff-submit-start');
  await restoredPage.getByRole('button',{name:'Submit application',exact:true}).click();
  await restoredPage.getByRole('heading',{name:'Application received',exact:true}).waitFor();
  await human.getByRole('checkbox',{name:/I personally submitted/}).check();await human.getByRole('button',{name:'Save confirmed application',exact:true}).click();
  await until(async()=>!(await cmd('handoff-state')).work,'Human handoff completion failed');
  assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,2);
  assert.equal((await agentApi('/api/job-workflow/handoffs')).total,0);
  const finalDocument=JSON.parse(String((await db.execute('SELECT other_details FROM job_applications ORDER BY id DESC LIMIT 1')).rows[0].other_details));
  assert.ok(finalDocument.human_final_page.fields.some((f:any)=>f.value==='Human final step answer'));
  await human.screenshot({path:'.test-output/unified-handoff.png',fullPage:true});await human.close();
  console.log('PASS unified handoff: atomic agent queue, human lease, field restore, confirmed save and queue resolution');
  await panel.getByRole('tab',{name:'Here',exact:true}).click();
  await panel.setViewportSize({width:360,height:900});
  assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Here view overflows narrow panel');
  await panel.screenshot({path:'.test-output/here-360.png',fullPage:true});
  await panel.setViewportSize({width:450,height:1000});
  await panel.getByRole('button',{name:/^System:/}).click();
  assert.equal(await panel.locator('#api-key').inputValue(),'','Stored credential must not be reflected into settings');
  await panel.screenshot({path:'.test-output/system.png',fullPage:true});
  assert.deepEqual(errors, []);
  console.log(
    "PASS application: prefill, edits, two sections, secret exclusion, review gate, confirmed JSON submission",
  );
  await writeFile(
    ".test-output/e2e-report.json",
    JSON.stringify(
      {
        passed: true,
        collection_rows: Number((await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n),
        application_rows: 2,
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

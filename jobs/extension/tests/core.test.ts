import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { createClient } from "@libsql/client";
import { JSDOM } from "jsdom";
import { Store } from "../src/server/store";
import { server } from "../src/server/http";
import {
  emptyJob,
  mergePages,
  normalizeUrl,
  exportUrls,
} from "../src/shared/model";
import { extractJobs, capturePage } from "../src/extension/extract";
test("manual corrections survive later page observations and can explicitly clear a field", async () => {
  const db = await testDb();
  try {
    const store = new Store(db);
    const original = job("manual");
    await store.collect(original);
    await store.collect({
      ...original,
      company: "Correct Company",
      location: null,
      metadata_json: JSON.stringify({
        user_edited_fields: ["company", "location"],
      }),
    });
    const result = await store.collect({
      ...original,
      company: "Wrong page text",
      location: "Incorrect city",
      last_seen_at: new Date(Date.now() + 1000).toISOString(),
    });
    assert.equal(result.company, "Correct Company");
    assert.equal(result.location, null);
  } finally {
    db.close();
  }
});
export async function testDb() {
  const db = createClient({
    url: "file:" + mkdtempSync("/tmp/jobsutility-test-") + "/test.db",
  });
  await db.executeMultiple(
    readFileSync("schema/001_job_collection.sql", "utf8"),
  );
  await db.executeMultiple(
    `CREATE TABLE job_applications(id INTEGER PRIMARY KEY AUTOINCREMENT,company TEXT NOT NULL,role TEXT NOT NULL,description TEXT,date TEXT,source TEXT,type TEXT,location TEXT,work_mode TEXT,application_url TEXT,status TEXT,submitted_at TEXT,started_at TEXT,completed_at TEXT,other_details TEXT,request_key TEXT UNIQUE,request_hash TEXT,external_id TEXT);`,
  );
  return db;
}
function job(id: string, source = "linkedin") {
  return {
    ...emptyJob(`https://${source}.com/jobs/${id}`),
    source,
    identity_key: `${source}:${id}`,
    source_job_id: id,
    company: "Example",
    role: "Cloud Engineer",
  };
}
const doc = (html: string) =>
  new JSDOM(html, { url: "https://example.com/apply" }).window.document;
test("URL cleanup preserves requisition parameters, fragments and rejects unsafe protocols", () => {
  assert.equal(
    normalizeUrl("https://x.com/job?id=42&utm_source=li#apply"),
    "https://x.com/job?id=42#apply",
  );
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("https://user:pass@x.com"), null);
});
test("collection merge preserves full descriptions and merges unresolved cross-site rows", async () => {
  const db = await testDb();
  try {
    const store = new Store(db);
    const a = job("1"),
      b = job("2", "indeed");
    await store.collect(a);
    await store.collect({
      ...b,
      application_url: "https://ats.com/42",
      canonical_url: "https://ats.com/42",
      resolution_status: "resolved",
      description: "Full description",
      description_status: "full",
    });
    const merged = await store.collect({
      ...a,
      application_url: "https://ats.com/42",
      canonical_url: "https://ats.com/42",
      resolution_status: "resolved",
      description: "preview",
      description_status: "partial",
    });
    assert.equal(merged.description, "Full description");
    assert.equal(
      (await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n,
      1,
    );
    await store.collect(b);
    assert.equal(
      (await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n,
      1,
    );
    assert.ok(
      JSON.parse(merged.sources_json).some((v: any) => v.source === "indeed"),
    );
    assert.ok((await store.getJob(b.id)).id);
  } finally {
    db.close();
  }
});
test("source identity is stable and similar titles do not merge different jobs", async () => {
  const db = await testDb();
  try {
    const store = new Store(db);
    const a = job("1");
    await store.collect(a);
    await store.collect({ ...a, id: crypto.randomUUID() });
    await store.collect(job("2"));
    assert.equal((await store.search(new URLSearchParams())).total, 2);
  } finally {
    db.close();
  }
});
function payload() {
  const at = new Date().toISOString();
  return {
    schema_version: 1,
    capture_id: crypto.randomUUID(),
    job: job("1"),
    pages: [
      capturePage(
        doc(
          '<label>Why?<textarea name="why">My exact answer.</textarea></label>',
        ),
        "https://example.com/apply",
      ),
    ],
    gaps: [],
    started_at: at,
    finished_at: at,
    submitted_at: at,
    submission_confirmation: "user_confirmed",
    date: "2026-09-08",
  };
}
test("submission retries produce one row, conflicting retry fails, collection remains separate", async () => {
  const db = await testDb();
  try {
    const store = new Store(db),
      p = payload(),
      key = `jobsutility:${p.capture_id}`;
    const one = await store.submit(p, key),
      two = await store.submit(p, key);
    assert.equal(one.id, two.id);
    assert.equal(two.replayed, true);
    await assert.rejects(
      store.submit({ ...p, date: "2026-09-09" }, key),
      /different data/,
    );
    assert.equal(
      (await db.execute("SELECT count(*) n FROM job_collection")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.execute("SELECT count(*) n FROM job_applications")).rows[0].n,
      1,
    );
    const row = await store.application(one.id);
    assert.equal(
      JSON.parse(String(row.other_details)).pages[0].fields[0].answer,
      "My exact answer.",
    );
  } finally {
    db.close();
  }
});
test("submission requires confirmation and nonempty company and role", async () => {
  const db = await testDb();
  try {
    const store = new Store(db),
      p = payload();
    await assert.rejects(
      store.submit(
        { ...p, submission_confirmation: "clicked_submit" },
        `jobsutility:${p.capture_id}`,
      ),
    );
    await assert.rejects(
      store.submit(
        { ...p, job: { ...p.job, company: "" } },
        `jobsutility:${p.capture_id}`,
      ),
      /Company and role/,
    );
  } finally {
    db.close();
  }
});
test("LLM read-only key cannot write; hostile origins and unauthenticated clients are refused", async () => {
  const db = await testDb();
  const api = server(new Store(db), "w".repeat(64), "r".repeat(64));
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  const port = (api.address() as any).port,
    url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(url + "/jobs")).status, 401);
    assert.equal(
      (
        await fetch(url + "/jobs", {
          headers: { Authorization: "Bearer " + "r".repeat(64) },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(url + "/jobs", {
          method: "POST",
          headers: { Authorization: "Bearer " + "r".repeat(64) },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/jobs", {
          headers: {
            Authorization: "Bearer " + "w".repeat(64),
            Origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/jobs?limit=-1", {
          headers: { Authorization: "Bearer " + "r".repeat(64) },
        })
      ).status,
      400,
    );
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()));
    db.close();
  }
});
test("native form capture preserves blank, false, multi-select, repeated and prefilled answers; excludes secrets", () => {
  const d = doc(
    `<h1>Experience</h1><label>Name<input name="name" value="Prefilled"></label><label>Extra<textarea name="extra"></textarea></label><label>Agree<input name="agree" type="checkbox"></label><label>Team<select name="team" multiple><option value="p" selected>Platform</option><option value="d" selected>Data</option></select></label><fieldset><legend>Employer</legend><input name="company" value="A"></fieldset><fieldset><legend>Employer</legend><input name="company" value="B"></fieldset><label>Password<input name="password" type="password" value="secret"></label><input type="hidden" name="csrf" value="token"><input autocomplete="one-time-code" placeholder="Verification code" value="1234">`,
  );
  const p = capturePage(d, "https://example.com/apply");
  assert.equal(p.fields.length, 6);
  assert.equal(p.fields[0].answer, "Prefilled");
  assert.equal(p.fields[1].answer_state, "blank");
  assert.deepEqual(p.fields[2].answer, { checked: false, value: "on" });
  assert.deepEqual(p.fields[3].answer, [
    { value: "p", label: "Platform" },
    { value: "d", label: "Data" },
  ]);
  assert.notEqual(p.fields[4].field_id, p.fields[5].field_id);
  assert.ok(!JSON.stringify(p).includes("secret"));
});
test("returning to a section updates answers without losing another section", () => {
  const first = capturePage(
    doc('<h1>Profile</h1><input name="name" value="Old">'),
    "https://example.com/apply",
  );
  const second = capturePage(
    doc('<h1>Questions</h1><textarea name="why">Because</textarea>'),
    "https://example.com/apply",
  );
  const corrected = capturePage(
    doc('<h1>Profile</h1><input name="name" value="New">'),
    "https://example.com/apply",
  );
  const pages = mergePages(mergePages([first], second), corrected);
  assert.equal(pages.length, 2);
  assert.equal(
    pages.find((p) => p.title === "Profile")?.fields[0].answer,
    "New",
  );
  assert.equal(
    pages.find((p) => p.title === "Questions")?.fields[0].answer,
    "Because",
  );
});
test("JSON-LD descriptions, company, location and application URLs extract without running HTML", () => {
  const d = doc(
    `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Full Stack Engineer", hiringOrganization: { name: "Example" }, description: "<p>Hello <b>world</b></p>", url: "https://example.com/jobs/1", jobLocationType: "TELECOMMUTE", jobLocation: { address: { addressLocality: "NYC", addressCountry: "US" } } })}</script>`,
  );
  const j = extractJobs(d, "https://example.com/jobs/1")[0];
  assert.equal(j.company, "Example");
  assert.equal(j.description, "Hello world");
  assert.equal(j.work_mode, "remote");
  assert.equal(j.type, "full_stack");
  assert.equal(j.resolution_status, "resolved");
});
test("LinkedIn cards retain unresolved URLs and use job IDs", () => {
  const d = doc(
    '<div data-job-id="42"><a class="job-card-list__title" href="https://www.linkedin.com/jobs/view/42/">Cloud Engineer</a><span class="artdeco-entity-lockup__subtitle">Example</span></div>',
  );
  const j = extractJobs(d, "https://www.linkedin.com/jobs/search")[0];
  assert.equal(j.identity_key, "linkedin:42");
  assert.equal(j.company, "Example");
  assert.equal(j.application_url, null);
  assert.equal(exportUrls([j]), "");
});
test("search uses literal wildcards and parameterized filters", async () => {
  const db = await testDb();
  try {
    const s = new Store(db);
    await s.collect(job("1"));
    assert.equal(
      (await s.search(new URLSearchParams({ company: "' OR 1=1 --" }))).total,
      0,
    );
    assert.equal((await s.search(new URLSearchParams({ q: "%" }))).total, 0);
  } finally {
    db.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { emptyJob } from "../src/shared/model";
import {
  collectionMode,
  shouldObserve,
  selectedJob,
  applicationDestination,
  watchAccepts,
  descriptionStatusAfterEdit,
} from "../src/shared/collection";
import {
  extractJobs,
  extractSelectedJob,
  structuredText,
  applicationClick,
} from "../src/extension/extract";
const doc = (html: string) => new JSDOM(html).window.document;

test("old enabled sites migrate to auto; manual adds no unknown cards; archive and pause stop observations", () => {
  const origin = "https://jobright.ai",
    j = emptyJob(origin + "/jobs/info/abc");
  assert.equal(collectionMode({ sites: [origin] }, origin), "auto");
  assert.equal(
    collectionMode(
      { sites: [origin], siteModes: { [origin]: "manual" } },
      origin,
    ),
    "manual",
  );
  assert.equal(shouldObserve("manual", undefined), false);
  assert.equal(shouldObserve("manual", j), true);
  assert.equal(shouldObserve("paused", j), false);
  assert.equal(
    shouldObserve("auto", { ...j, archived_at: new Date().toISOString() }),
    false,
  );
});
test("manual selected-job capture excludes related cards and rejects a one-card search list", () => {
  const html =
    '<a href="/jobs/info/first"><h2>Selected Engineer</h2></a><a href="/jobs/info/second"><h2>Other Role</h2></a><main><h1>Selected Engineer</h1><div data-job-description>Expanded description</div></main>';
  const selected = extractSelectedJob(
    doc(html),
    "https://jobright.ai/jobs/info/first",
  );
  assert.equal(selected?.identity_key, "jobright:first");
  assert.equal(selected?.description, "Expanded description");
  assert.equal(
    extractSelectedJob(
      doc('<a href="/jobs/info/first"><h2>Engineer</h2></a>'),
      "https://jobright.ai/jobs/recommend",
    ),
    null,
  );
});
test("Handshake without logos captures company, location, employment, dates and promotes no description from card text", () => {
  const html =
    '<div data-hook="job-result-card | 42"><a role="button" href="/job-search/42"></a><div role="region" aria-labelledby="title"><div>Example Company</div><div id="title">Software Intern</div><div>$25/hr · Internship · May 1—Aug 1</div><div>New York City, NY</div><div>1wk ago</div></div></div>';
  const j = extractJobs(
    doc(html),
    "https://app.joinhandshake.com/job-search",
  )[0];
  assert.equal(j.company, "Example Company");
  assert.equal(j.location, "New York City, NY");
  // The salary/term line must also yield the explicit employment type.
  assert.equal(j.employment_type, "Internship");
  assert.equal(j.posted_at_raw, "1wk ago");
  assert.equal(j.description, null);
});
test("Handshake detail captures glance values and preserves paragraphs and bullets", () => {
  const html =
    '<div data-hook="right-content"><a href="/e/1">Example</a><h1>Engineer</h1><div><h3>At a glance</h3></div><div><div>Onsite, based in Binghamton, NY</div><span>Internship</span><span>Full-time</span></div><div><h3>Job description</h3></div><div><p>First paragraph.</p><p>Requirements:</p><ul><li>C++</li><li>Testing</li></ul><button>More</button></div></div>';
  const j = extractJobs(
    doc(html),
    "https://app.joinhandshake.com/job-search/42",
  )[0];
  assert.equal(j.location, "Binghamton, NY");
  assert.equal(j.work_mode, "onsite");
  assert.equal(j.employment_type, "Internship");
  assert.match(
    j.description!,
    /First paragraph\.\nRequirements:\n- C\+\+\n- Testing/,
  );
  assert.match(JSON.parse(j.metadata_json).at_a_glance, /Binghamton/);
  assert.equal(j.description_status, "partial");
});
test("LinkedIn badges outside company header are still associated with the selected ID", () => {
  const html =
    '<div><a href="/company/example">Example</a><a href="/jobs/view/42/">Engineer</a></div><a href="/jobs/search-results/?currentJobId=42">Remote</a><a href="/jobs/search-results/?currentJobId=42">Full-time</a><a href="/jobs/search-results/?currentJobId=99">On-site</a><div><h2>About the job</h2></div><div><p>One.</p><p>Two.</p><button>… more</button></div>';
  const j = extractJobs(
    doc(html),
    "https://www.linkedin.com/jobs/search-results/?currentJobId=42",
  )[0];
  assert.equal(j.work_mode, "remote");
  assert.equal(j.employment_type, "Full-time");
  assert.equal(j.description, "One.\nTwo.");
});
test("description completeness is not inferred from editing company or location", () => {
  const j = {
    ...emptyJob("https://example.com/job/1"),
    description: "Preview",
    description_status: "partial" as const,
  };
  assert.equal(descriptionStatusAfterEdit(j, "Preview", false), "partial");
  assert.equal(descriptionStatusAfterEdit(j, "Expanded", false), "partial");
  assert.equal(descriptionStatusAfterEdit(j, "Expanded", true), "full");
});
test("employer destinations retain requisition IDs, remove tracking and preserve canonical identity across apply URLs", () => {
  const g = applicationDestination(
    "https://job-boards.greenhouse.io/embed/job_app?for=example&token=12345&jr_id=old&access_token=secret",
  )!;
  assert.equal(g.ats_job_id, "12345");
  assert.equal(g.ats_tenant, "example");
  assert.equal(
    g.canonical_url,
    "https://job-boards.greenhouse.io/example/jobs/12345",
  );
  assert.ok(!g.application_url!.includes("secret"));
  assert.ok(g.application_url!.includes("token=12345"));
  assert.equal(
    applicationDestination(
      "https://job-boards.greenhouse.io/example/jobs/12345",
    )?.canonical_url,
    g.canonical_url,
  );
  const w = applicationDestination(
    "https://example.wd1.myworkdayjobs.com/en-US/Careers/job/NY/Software-Engineer_JR42/apply?source=LinkedIn",
  )!;
  assert.equal(w.ats_job_id, "JR42");
  assert.equal(w.ats_tenant, "example:Careers");
  assert.equal(
    applicationDestination(
      "https://example.wd1.myworkdayjobs.com/Careers/login",
    ),
    null,
  );
  assert.equal(
    applicationDestination("https://example.com/careers", true),
    null,
  );
  assert.equal(applicationDestination("https://evil.example/anything"), null);
});
test("navigation watches expire and reject unrelated tabs; only selected Apply controls create intents", () => {
  const w = {
    jobId: "job",
    sourceTabId: 1,
    targetTabId: 2,
    sourceOrigin: "https://jobright.ai",
    startedAt: 1000,
  };
  assert.equal(watchAccepts(w, 2, 5000), true);
  assert.equal(watchAccepts(w, 3, 5000), false);
  assert.equal(watchAccepts(w, 2, 121001), false);
  const d = doc(
    '<main><h1>Engineer</h1><button id="apply">Apply on company website</button><button id="save">Save</button></main>',
  );
  assert.equal(
    applicationClick(
      d,
      "https://jobright.ai/jobs/info/abc",
      d.querySelector("#apply")!,
    )?.identity_key,
    "jobright:abc",
  );
  assert.equal(
    applicationClick(
      d,
      "https://jobright.ai/jobs/info/abc",
      d.querySelector("#save")!,
    ),
    null,
  );
});


test('Jobright Original Job Post captures a custom employer destination on the same selected identity',()=>{
 const url='https://jobright.ai/jobs/info/selected-123';
 const html='<a href="https://jobs.example.com/job/city/software-engineer/123/456?jr_id=selected-123"><svg aria-label="job post link"></svg><span>Original Job Post</span></a><div id="overview-1"><h1>Software Engineer 1</h1><div class="company-name">Example</div><section><h2>Responsibilities</h2><ul><li>Build services</li></ul></section></div>';
 const job=extractSelectedJob(doc(html),url)!;
 assert.equal(job.identity_key,'jobright:selected-123');
 assert.equal(job.source_url,url);
 assert.equal(job.application_url,'https://jobs.example.com/job/city/software-engineer/123/456');
 assert.equal(job.resolution_status,'resolved');
 assert.equal(JSON.parse(job.metadata_json).destination_source,'jobright_original_post');
 for(const bad of ['javascript:alert(1)','https://jobs.example.com/login','https://jobs.example.com/careers','https://jobright.ai/jobs/recommend']){
  const rejected=extractSelectedJob(doc(html.replace('https://jobs.example.com/job/city/software-engineer/123/456?jr_id=selected-123',bad)),url)!;
  assert.equal(rejected.application_url,null);
 }
 assert.equal(extractJobs(doc(html),'https://jobright.ai/jobs/recommend').length,0,'Unselected board must not attach the link to unrelated cards');
});

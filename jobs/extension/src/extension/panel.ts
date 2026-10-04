import {
  descriptionStatusAfterEdit,
  applicationDestination,
} from "../shared/collection";
import {
  emptyJob,
  exportUrls,
  jobSchema,
  normalizeUrl,
  type Job,
  type Capture,
} from "../shared/model";
import { mountHandoffs } from "./handoff";
const app = document.querySelector<HTMLDivElement>("#app")!;
let state: any = { jobs: [], captures: [], queue: [], sites: [] },
  view = "here",
  systemReturn = "here",
  reviewId: string | null = null,
  editJob: Job | null = null;
let remoteJobs: any[] | null = null,
  remoteTotal = 0,
  remoteCursor: string | null = null,
  searchTerm = "",
  archived = false,
  loadError = "";
let appliedJobs: any[] = [],
  appliedTotal = 0,
  appliedOffset = 0,
  appliedSearch = "",
  appliedDetail: any = null;
let disposeHandoff: (() => void) | null = null,
  skipRemember = false;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function command(type: string, data: object = {}) {
  const r = await chrome.runtime.sendMessage({ type, ...data });
  if (!r?.ok) throw Error(r?.error || "Extension did not respond");
  return r.data;
}
function toast(text: string) {
  const el = document.querySelector<HTMLDivElement>("#toast")!;
  el.textContent = text;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 5500);
}
async function refresh() {
  state = await command("state");
  render();
}
const button = (action: string, label: string, primary = false, extra = "") =>
  `<button type="button" class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${label}</button>`;
const input = (
  name: string,
  label: string,
  value: unknown = "",
  large = false,
) =>
  `<label class="field ${large ? "full" : ""}">${label}${large ? `<textarea name="${name}">${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}">`}</label>`;
function jobFields(j: Job) {
  return `<div class="grid">${input("company", "Company", j.company)}${input("role", "Role", j.role)}${input("location", "Location", j.location)}<label class="field">Work mode<select name="work_mode">${[
    ["", "Unknown"],
    ["remote", "Remote"],
    ["hybrid", "Hybrid"],
    ["onsite", "Onsite"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${j.work_mode === v ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label>${input("employment_type", "Employment type", j.employment_type)}${input("posted_at_raw", "Posted date as shown", j.posted_at_raw)}${input("type", "Role category", j.type)}${input("source", "Source", j.source)}${input("application_url", "Application URL", j.application_url)}${input("source_url", "Source URL", j.source_url)}${input("description", "Job description", j.description, true)}</div><label class="check"><input type="checkbox" name="description_full" ${j.description_status === "full" ? "checked" : ""}>The description is complete. Leave unchecked for a preview or unfinished capture.</label>`;
}
function readJob(form: HTMLFormElement, original: Job) {
  const data = new FormData(form);
  const next = { ...original };
  for (const key of [
    "company",
    "role",
    "location",
    "work_mode",
    "type",
    "employment_type",
    "posted_at_raw",
    "source",
    "application_url",
    "source_url",
    "description",
  ] as const)
    (next as any)[key] = String(data.get(key) || "").trim() || null;
  next.canonical_url = next.application_url
    ? normalizeUrl(next.application_url)
    : null;
  next.resolution_status = next.application_url ? "resolved" : "unresolved";
  if (next.application_url) {
    const destination = applicationDestination(next.application_url, true);
    if (!destination)
      throw Error(
        "Use an employer job URL, not a board, login page or careers homepage.",
      );
    Object.assign(next, destination);
  }
  next.description_status = descriptionStatusAfterEdit(
    original,
    next.description,
    data.get("description_full") === "on",
  );
  next.updated_at = new Date().toISOString();
  next.last_seen_at = next.updated_at;
  const metadata = JSON.parse(original.metadata_json);
  next.metadata_json = JSON.stringify({
    ...metadata,
    user_edited_fields: [
      ...new Set([
        ...(metadata.user_edited_fields || []),
        ...Object.keys(next).filter(
          (k) =>
            next[k as keyof Job] !== original[k as keyof Job] &&
            !["updated_at", "last_seen_at", "metadata_json"].includes(k),
        ),
      ]),
    ],
  });
  return jobSchema.parse(next);
}
function link(url: unknown, label: string) {
  const safe = normalizeUrl(String(url || ""));
  return safe
    ? `<a class="button" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`
    : `<span class="tiny muted">${label}: not seen yet</span>`;
}
function answerEditor(f: any) {
  const choice =
    f.answer &&
    typeof f.answer === "object" &&
    !Array.isArray(f.answer) &&
    typeof f.answer.checked === "boolean";
  const editable =
    choice ||
    typeof f.answer === "string" ||
    f.answer === null ||
    typeof f.answer === "boolean";
  if (!editable)
    return `<p class="tiny muted">Change this selection on the application page and resume capture to record it.</p>`;
  return `<label class="field">Answer${choice || typeof f.answer === "boolean" ? `<select aria-label="Answer" name="answer:${esc(f.field_id)}"><option value="true" ${(choice ? f.answer.checked : f.answer) ? "selected" : ""}>Yes / checked</option><option value="false" ${!(choice ? f.answer.checked : f.answer) ? "selected" : ""}>No / unchecked</option></select>` : `<textarea aria-label="Answer" name="answer:${esc(f.field_id)}">${esc(f.answer ?? "")}</textarea>`}</label>${button("save-answer", "Save answer", false, `data-field="${esc(f.field_id)}"`)}`;
}
function answerText(value: any): string {
  if (value === null || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return (
      value
        .map((v) =>
          typeof v === "object"
            ? v.label || v.filename || v.value || JSON.stringify(v)
            : String(v),
        )
        .join("\n") || "No selection"
    );
  if (typeof value === "object" && typeof value.checked === "boolean")
    return value.checked ? "Checked" : "Not checked";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
const shortId = (id: unknown) =>
  String(id || "")
    .slice(0, 8)
    .toUpperCase();
function jobRow(j: any) {
  return `<article class="job-row"><button class="job-open" data-action="edit-job" data-id="${esc(j.id)}"><span class="row"><strong>${esc(j.role || "Role not seen yet")}</strong><span class="mono tiny">#${esc(shortId(j.id))}</span></span><span class="job-meta">${esc(j.company || "Company not seen yet")} · ${esc(j.location || "Location not seen yet")}</span><span class="tiny muted">${j.archived_at ? "Archived" : j.description_status === "full" ? "● Full description" : j.description_status === "partial" ? "◐ Description excerpt" : "◐ Lead"}${j.application_url ? " · Apply link saved" : " · Apply link not seen yet"}${j.availability === "expired" ? " · Posting expired" : ""}</span></button></article>`;
}
function collection() {
  const jobs =
    remoteJobs ??
    state.jobs.filter(
      (j: Job) =>
        Boolean(j.archived_at) === archived &&
        (!searchTerm ||
          `${j.company} ${j.role}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase())),
    );
  return `<div class="section-heading"><div><h1>Saved jobs</h1><p class="muted">Leads grow as you browse.</p></div>${button("manual", "Add manually")}</div><form id="search-form" class="search-row"><label class="sr" for="job-search">Search company or role</label><input id="job-search" name="q" value="${esc(searchTerm)}" placeholder="Company or role">${button("search", "Search")}</form><div class="row toolbar"><div class="segmented" aria-label="Job list"><button data-action="active-jobs" aria-pressed="${!archived}">Active</button><button data-action="archived-jobs" aria-pressed="${archived}">Archived</button></div><span class="tiny muted">${remoteJobs ? `${remoteJobs.length} of ${remoteTotal}` : `${jobs.length} on this device`}</span></div>${loadError ? `<div class="notice warning" role="alert">${esc(loadError)} Local data is preserved. ${button("search", "Try again")}</div>` : ""}${jobs.length ? `<div class="cards">${jobs.map(jobRow).join("")}</div>` : `<div class="empty"><h2>${archived ? "No archived jobs" : "A place for your next role"}</h2><p>Open a posting, then use Here to save it. Missing details can be added as you browse.</p></div>`}${remoteCursor ? button("more", "Load more") : ""}<details class="spacer"><summary>Export application links</summary><p class="tiny muted">Exports resolved employer links from the jobs loaded in this view.</p><div class="actions">${button("copy", "Copy URLs")}${button("download", "Download .txt")}</div></details>`;
}
function here() {
  const origin = state.tab?.origin;
  const jobs = state.jobs.filter(
    (j: Job) =>
      !j.archived_at && origin && new URL(j.source_url).origin === origin,
  );
  const captures = state.captures.filter((c: Capture) => c.status !== "saved");
  return `<div class="section-heading"><div><p class="eyebrow">Current page</p><h1>${esc(origin ? new URL(origin).hostname : "Open a job site")}</h1></div>${button("refresh-page", "Refresh")}</div>
  ${!state.connection ? `<div class="notice">Connect your tracker to start saving jobs. ${button("system", "Connect tracker", true)}</div>` : ""}
  ${state.tab ? `<fieldset class="mode-picker"><legend>Collection on this site</legend><div class="segmented">${["auto", "manual", "paused"].map((mode) => `<label><input type="radio" name="site-mode" value="${mode}" ${state.mode === mode ? "checked" : ""}><span>${mode === "auto" ? "Auto" : mode === "manual" ? "Manual" : "Paused"}</span></label>`).join("")}</div></fieldset><p class="mode-note">${state.mode === "auto" ? "Visible listings are saved automatically. Open and expand a posting to add details." : state.mode === "manual" ? "Only jobs you choose are added. Saved jobs still gain details as you browse." : "Collection and enrichment are paused on this site."}</p><div class="actions">${button("add-selected", "Save this job", true)}${button("scan", "Refresh details")}</div><p class="tiny muted">Select one posting before saving. Incomplete listings are useful leads.</p>` : `<div class="empty"><p>Switch to a supported job or application tab. If its address is unavailable, allow access below.</p>${button("grant-job-sites", "Allow supported job sites", true)}</div>`}
  <section class="section"><div class="section-heading"><h2>Saved on this site</h2><span class="tiny muted">${jobs.length}</span></div>${jobs.length ? jobs.slice(-8).reverse().map(jobRow).join("") : '<p class="muted">No saved jobs from this site on this device yet.</p>'}${jobs.length > 8 ? button("all-jobs", "See all jobs") : ""}</section>
  <section class="section"><div class="section-heading"><h2>Application capture</h2>${button("captures", "Open drafts")}</div><p class="muted">Keep answers across steps, then review them before recording a confirmed application.</p><label class="field">Attach collected job<select id="attach-job"><option value="">Use the current application page</option>${state.jobs
    .filter((j: Job) => !j.archived_at)
    .map(
      (j: Job) =>
        `<option value="${esc(j.id)}">${esc(j.company || "Unknown company")} — ${esc(j.role || "Untitled")}</option>`,
    )
    .join(
      "",
    )}</select></label>${button("start", "Start capture on this tab", true)}<p class="tiny muted">${captures.length} local draft${captures.length === 1 ? "" : "s"} · Passwords, verification codes and file contents are excluded.</p></section>
  ${
    state.jobs.some((j: Job) => !j.archived_at)
      ? `<details class="section"><summary>Link an employer application page</summary><p class="muted">Apply navigation normally links supported destinations. For an unmatched page, choose the saved job and confirm its employer and role.</p><label class="field">Saved job<select id="destination-job"><option value="">Choose a job</option>${state.jobs
          .filter((j: Job) => !j.archived_at)
          .map(
            (j: Job) =>
              `<option value="${esc(j.id)}">${esc(j.company)} — ${esc(j.role)} · #${esc(shortId(j.id))}</option>`,
          )
          .join(
            "",
          )}</select></label>${button("link-destination", "Link current application page")}</details>`
      : ""
  }`;
}
function captureView() {
  const c = state.captures.find((c: Capture) => c.capture_id === reviewId) as
    Capture | undefined;
  if (!c)
    return `<div class="section-heading"><h1>Capture drafts</h1>${button("back-here", "← Here")}</div><p class="muted">A finished capture is a record of your answers. It becomes an application only after you confirm submission.</p>${state.captures.length ? state.captures.map((c: Capture) => `<article class="job-row"><span class="eyebrow">${esc(c.paused ? "Paused draft" : c.status === "review" ? "Ready to review" : c.status === "recording" ? "Recording" : c.status === "queued" ? "Save pending" : "Saved application")}</span><h2>${esc(c.job.company || "Application capture")}</h2><p class="muted">${esc(c.job.role || "Job details not added")} · ${c.pages.length} sections</p><div class="actions">${button("open-capture", "Open capture", true, `data-id="${c.capture_id}"`)}${c.status !== "queued" ? button("discard", "Remove local copy", false, `data-id="${c.capture_id}"`) : ""}</div></article>`).join("") : '<div class="empty"><h2>No drafts yet</h2><p>Start capture from Here while your application tab is open.</p></div>'}`;
  const editable = c.status === "review";
  return `${button("back-captures", "← Drafts")}<div class="section-heading"><div><p class="eyebrow">${esc(c.paused ? "Paused draft" : c.status)}</p><h1>${esc(c.job.company || "Application capture")}</h1><p>${esc(c.job.role || "Job details not added")}</p></div></div>
  ${c.status === "recording" ? `<div class="actions">${button("capture-section", "Capture this section", true)}${button("pause-capture", "Pause capture")}${button("finish", "Finish & review")}</div>` : ""}
  ${c.paused ? `<div class="notice">Your draft is preserved. Resume to capture another section, or finish to review the complete capture.<div class="actions">${button("resume", "Resume capture", true)}${button("finish-paused", "Finish & review")}</div></div>` : ""}
  <details class="notice"><summary>Coverage and excluded information</summary><p>${esc(c.gaps.join(" "))}</p>${c.pages
    .flatMap((p) => p.gaps)
    .map((g) => `<p>${esc(g)}</p>`)
    .join(
      "",
    )}<p>Unobserved steps are not inferred. Passwords, codes and file contents are not recorded.</p></details>
  <form id="capture-form" data-draft="capture:${c.capture_id}">${editable ? `<details><summary>Job details</summary>${jobFields(c.job)}${button("save-details", "Save details")}</details>` : ""}
  ${c.pages.map((p) => `<details open class="section"><summary>${esc(p.title)} · ${p.fields.length} fields</summary>${p.fields.map((f) => `<div class="answer"><div class="row"><strong>${esc(f.label)}</strong><span class="tiny muted">${esc(f.answer_state)}</span></div><pre>${esc(answerText(f.answer))}</pre>${editable ? `<details><summary>Edit or exclude answer</summary>${answerEditor(f)}<div class="actions">${button("remove-field", "Exclude answer", false, `data-field="${esc(f.field_id)}"`)}</div></details>` : ""}</div>`).join("")}</details>`).join("")}
  ${editable && !c.paused ? `<section class="section"><h2>Record a confirmed application</h2><p>Finishing capture does not submit anything. Confirm only after you have submitted on the employer’s site.</p><label class="field">When did you submit?<input type="datetime-local" name="submittedAt" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></label><label class="check"><input type="checkbox" name="confirmed">I submitted this application on the employer's site and have reviewed this capture.</label><div class="actions">${button("submit-capture", "Save submitted application", true)}${button("resume", "Resume capture")}</div></section>` : c.status === "saved" ? `<div class="notice">Application #${esc(c.application_id)} was saved and read back. ${button("view-applied", "View application", false, `data-id="${c.application_id}"`)}</div>` : c.status === "queued" ? `<div class="notice">Saved locally; waiting for the tracker to confirm the write. ${button("system", "View sync status")}</div>` : ""}</form>`;
}
function settings() {
  const compat = state.compatibility;
  const label =
    compat?.status === "verified"
      ? "Verified"
      : compat?.status === "incompatible"
        ? "Update required"
        : compat?.status === "offline"
          ? "Unable to check"
          : "Not recently checked";
  return `<div class="section-heading"><h1>System</h1>${button("close-system", "Done")}</div><section><h2>Connection</h2><p>${state.connection ? esc(state.connection.baseUrl) : "Connect to keep jobs and applications in your shared tracker."}</p><p class="status-line">${esc(label)}${compat?.checked_at ? ` · ${esc(new Date(compat.checked_at).toLocaleString())}` : ""}</p>${state.connection ? button("check-compatibility", "Check now") : ""}<details ${!state.connection ? "open" : ""}><summary>${state.connection ? "Replace connection key" : "Connect tracker"}</summary><form id="connection-form"><label class="field">API URL<input id="api-url" type="url" value="${esc(state.connection?.baseUrl || "https://www.kevinc.dev")}" required></label><label class="field">Extension API key<input id="api-key" type="password" autocomplete="off" placeholder="Paste your dedicated extension key" required></label>${button("connect-key", "Connect", true)}</form><p class="tiny muted">Use your dedicated human extension key. Stored keys are never displayed.</p></details></section><section class="section"><div class="section-heading"><h2>Sync queue</h2><span class="tiny muted">${state.queue.length} pending</span></div>${state.queue.length ? `<p>Local work is preserved while these writes wait.</p>${state.queue.map((q: any) => `<div class="queue-row"><strong>${esc(q.kind === "application" ? "Confirmed application" : q.kind === "capture" ? "Answer capture" : "Job details")}</strong><p class="tiny ${q.error ? "attention" : "muted"}">${esc(q.error || "Waiting to sync")}</p></div>`).join("")}${button("retry", "Retry sync")}` : '<p class="muted">No pending writes.</p>'}<p class="tiny muted">Last completed sync: ${state.lastSync ? esc(new Date(state.lastSync).toLocaleString()) : "No writes yet"}</p></section><section class="section"><h2>Version & updates</h2><p>Jobs Utility ${esc(chrome.runtime.getManifest().version)}</p><p class="muted">Pause collection on every site, finish active captures and attempts, and wait for pending writes. Stage the update, reload this same extension entry, then verify a fresh diagnostics report. Review drafts remain saved.</p><div class="actions">${button("diagnostics", "Download diagnostics")}<a class="button" href="diagnostics.html" target="_blank">Diagnostics & updates ↗</a></div><p class="tiny muted">Diagnostics contain version, compatibility and activity counts. No keys or captured answers.</p><a href="https://www.kevinc.dev/jobs/docs" target="_blank" rel="noopener noreferrer">Setup, releases & workflow guide ↗</a></section>`;
}
function applicationView() {
  if (appliedDetail) {
    const j = appliedDetail;
    let capture: any = null;
    try {
      capture =
        typeof j.other_details === "string"
          ? JSON.parse(j.other_details)
          : j.other_details;
    } catch {}
    return `${button("back-applied", "← Applied")}<p class="eyebrow spacer">Application #${esc(j.id)} · ${esc(j.date)}</p><h1>${esc(j.role || "Application")}</h1><p>${esc(j.company)}</p><dl class="facts">${Object.entries(
      j,
    )
      .filter(
        ([k, v]) =>
          v !== null &&
          v !== "" &&
          ![
            "id",
            "role",
            "company",
            "other_details",
            "description",
            "cover_letter_text",
          ].includes(k),
      )
      .map(
        ([k, v]) =>
          `<div><dt>${esc(k.replaceAll("_", " "))}</dt><dd>${esc(typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "object" ? JSON.stringify(v) : v)}</dd></div>`,
      )
      .join(
        "",
      )}</dl>${j.description ? `<details><summary>Job description</summary><div class="description">${esc(j.description)}</div></details>` : ""}${capture ? `<details><summary>Saved answers & capture record</summary><div class="readback answers-readback">${(capture.pages || []).map((p: any) => `<section><h3>${esc(p.title)}</h3>${(p.fields || []).map((f: any) => `<div class="answer"><strong>${esc(f.label)}</strong><pre>${esc(answerText(f.answer))}</pre></div>`).join("")}</section>`).join("")}${(capture.packets || []).map((p: any, i: number) => `<section><h3>Original saved page ${i + 1}</h3>${(p.fields || []).map((f: any) => `<div class="answer"><strong>${esc(f.label || f.name)}</strong><pre>${esc(answerText(f.value))}</pre></div>`).join("")}</section>`).join("")}${capture.human_final_page ? `<section><h3>Your final captured page</h3>${(capture.human_final_page.fields || []).map((f: any) => `<div class="answer"><strong>${esc(f.label || f.name)}</strong><pre>${esc(answerText(f.value))}</pre></div>`).join("")}</section>` : ""}</div><details><summary>Raw capture document</summary><pre class="readback">${esc(JSON.stringify(capture, null, 2))}</pre></details></details>` : j.other_details ? `<details><summary>Other details</summary><div class="description">${esc(j.other_details)}</div></details>` : ""}${j.cover_letter_text ? `<details><summary>Cover letter</summary><div class="description">${esc(j.cover_letter_text)}</div></details>` : ""}<p class="tiny muted">Loaded from the saved tracker record.</p>`;
  }
  return `<h1>Applied</h1><p class="muted">Submitted applications and existing tracker history.</p><form id="applied-search-form" class="search-row"><label class="sr" for="applied-search">Search company</label><input id="applied-search" name="application-q" placeholder="Company" value="${esc(appliedSearch)}">${button("search-applied", "Search")}</form>${loadError ? `<div class="notice warning" role="alert">${esc(loadError)} ${button("reload-applied", "Try again")}</div>` : ""}${appliedJobs.length ? appliedJobs.map((j) => `<article class="job-row"><button class="job-open" data-action="view-applied" data-id="${j.id}"><span class="row"><strong>${esc(j.role || "Application")}</strong><span class="mono tiny">#${j.id}</span></span><span class="job-meta">${esc(j.company)}</span><span class="tiny muted">${esc(j.date)} · ${esc(j.status || "Legacy tracker record")}</span></button></article>`).join("") : `<div class="empty"><h2>${state.connection ? "No applications in this view" : "Connect to view applications"}</h2><p>Collected, blocked and skipped opportunities belong in Jobs and Handoffs.</p></div>`}${appliedTotal > 20 ? `<nav class="pagination" aria-label="Application pages">${button("previous-applied", "Previous", false, appliedOffset === 0 ? "disabled" : "")}<span>Page ${appliedOffset / 20 + 1} of ${Math.ceil(appliedTotal / 20)}</span>${button("next-applied", "Next", false, appliedOffset + 20 >= appliedTotal ? "disabled" : "")}</nav>` : ""}`;
}
function jobDetail() {
  const j = editJob!;
  return `${button("close-edit", "← Back")}<p class="eyebrow spacer">${j.archived_at ? "Archived opportunity" : "Saved job"} · #${esc(shortId(j.id))}</p><h1>${esc(j.role || "Job details")}</h1><p class="muted">${esc(j.company || "Company not seen yet")}</p><div class="links-row">${link(j.source_url, "Posting")}${link(j.application_url, "Apply at")}</div><form id="job-form" data-draft="job:${esc(j.id)}">${jobFields(j)}${button("selected-description", "Use highlighted description")}<div class="actions">${button("save-job", "Save job", true)}</div></form>${state.connection ? `<details class="section"><summary>${j.archived_at ? "Restore opportunity" : "Archive opportunity"}</summary><p class="muted">${j.archived_at ? "Return this opportunity to normal lists. Its history and application status are retained." : "Hide this opportunity while keeping its history. Active attempts must be resolved first."}</p>${input("archive_reason", "Reason")}${button(j.archived_at ? "restore-job" : "archive-job", j.archived_at ? "Restore job" : "Archive job")}</details>` : ""}`;
}
const drafts = new Map<
  string,
  Record<string, { value: string; checked: boolean }>
>();
function rememberDrafts() {
  document
    .querySelectorAll<HTMLFormElement>("form[data-draft]")
    .forEach((form) => {
      const values: Record<string, { value: string; checked: boolean }> = {};
      form
        .querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("[name]")
        .forEach(
          (el) =>
            (values[el.name] = {
              value: el.value,
              checked: (el as HTMLInputElement).checked,
            }),
        );
      drafts.set(form.dataset.draft!, values);
    });
}
function render() {
  if (!skipRemember) rememberDrafts();
  skipRemember = false;
  const focus = (document.activeElement as HTMLInputElement)?.name;
  const position = (document.activeElement as HTMLInputElement)?.selectionStart;
  const compat = state.compatibility;
  const status = !state.connection
    ? "Not connected"
    : state.queue.some((q: any) => q.error)
      ? "Needs attention"
      : state.queue.length
        ? `${state.queue.length} pending`
        : compat?.status === "verified"
          ? "Connected"
          : compat?.status === "incompatible"
            ? "Update required"
            : "Check connection";
  const body = editJob
    ? jobDetail()
    : view === "here"
      ? here()
      : view === "jobs"
        ? collection()
        : view === "capture"
          ? captureView()
          : view === "applied"
            ? applicationView()
            : view === "handoffs"
              ? '<div id="handoff-root"></div>'
              : settings();
  app.innerHTML = `<header class="app-header"><span class="wordmark">Jobs Utility</span><button class="status-chip" data-action="system" aria-label="System: ${esc(status)}"><span aria-hidden="true">${state.queue.some((q: any) => q.error) ? "!" : "○"}</span> ${esc(status)}</button></header><nav class="tabs" role="tablist" aria-label="Main navigation">${[
    ["here", "Here"],
    ["jobs", "Jobs"],
    ["handoffs", "Handoffs"],
    ["applied", "Applied"],
  ]
    .map(
      ([id, label]) =>
        `<button data-view="${id}" role="tab" aria-selected="${view === id || (id === "here" && view === "capture")}">${label}</button>`,
    )
    .join("")}</nav><main id="main" tabindex="-1">${body}</main>`;
  document
    .querySelectorAll<HTMLFormElement>("form[data-draft]")
    .forEach((form) => {
      const saved = drafts.get(form.dataset.draft!);
      if (!saved) return;
      form
        .querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("[name]")
        .forEach((el) => {
          const value = saved[el.name];
          if (value) {
            el.value = value.value;
            if (el instanceof HTMLInputElement) el.checked = value.checked;
          }
        });
    });
  if (focus) {
    const el = [...document.querySelectorAll<HTMLInputElement>("[name]")].find(
      (el) => el.name === focus,
    );
    if (el) {
      el.focus();
      if (position !== null && ["text", "search", "url"].includes(el.type))
        el.setSelectionRange(position, position);
    }
  }
  disposeHandoff?.();
  disposeHandoff = null;
  if (view === "handoffs" && !editJob)
    disposeHandoff = mountHandoffs(document.querySelector("#handoff-root")!);
}
async function loadJobs(more = false) {
  if (!state.connection) {
    remoteJobs = null;
    return;
  }
  const r = await command("search", {
    filters: {
      q: searchTerm,
      archived: String(archived),
      limit: "30",
      ...(more && remoteCursor ? { cursor: remoteCursor } : {}),
    },
  });
  remoteJobs = more ? [...(remoteJobs || []), ...r.jobs] : r.jobs;
  remoteTotal = r.total;
  remoteCursor = r.next_cursor;
}
async function loadApplications() {
  if (!state.connection) {
    appliedJobs = [];
    appliedTotal = 0;
    return;
  }
  const r = await command("applications", {
    offset: appliedOffset,
    q: appliedSearch,
  });
  appliedJobs = r.jobs;
  appliedTotal = r.total;
}
async function navigate(next: string) {
  rememberDrafts();
  view = next;
  editJob = null;
  loadError = "";
  state = await command("state");
  try {
    if (next === "jobs") await loadJobs();
    if (next === "applied") await loadApplications();
  } catch (e) {
    loadError = (e as Error).message;
    if (next === "jobs") remoteJobs = null;
  }
  render();
  document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
async function permit() {
  state = await command("state");
  if (!state.tab)
    throw Error(
      "Allow access to supported job sites, then return to the posting and try again.",
    );
  if (
    !(await chrome.permissions.request({ origins: [state.tab.origin + "/*"] }))
  )
    throw Error("Site permission was declined.");
}
async function snapshot() {
  if (!state.tab) throw Error("Open the application tab.");
  await command("scan");
  const r = await chrome.tabs.sendMessage(state.tab.id, { type: "scan" });
  if (!r?.ok) throw Error(r?.error || "Section capture did not complete.");
}
function download(text: string, name: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
let busy = false;
async function run(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (e) {
    toast((e as Error).message);
  } finally {
    busy = false;
    app.removeAttribute("aria-busy");
  }
}
function discardFormDraft(key: string) {
  drafts.delete(key);
  skipRemember = true;
}
app.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = (e.target as HTMLElement).id;
  document
    .querySelector<HTMLButtonElement>(
      id === "search-form"
        ? '[data-action="search"]'
        : id === "applied-search-form"
          ? '[data-action="search-applied"]'
          : id === "job-form"
            ? '[data-action="save-job"]'
            : id === "capture-form"
              ? '[data-action="save-details"]'
              : '[data-action="connect-key"]',
    )
    ?.click();
});
app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.name === "site-mode")
    void run(async () => {
      try {
        if (el.value === "paused") await command("pause");
        else {
          await permit();
          await command("enable", { mode: el.value });
          await snapshot();
        }
      } finally {
        await refresh();
      }
    });
});
app.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(
    "[data-action],[data-view]",
  );
  if (!el) return;
  e.preventDefault();
  void run(async () => {
    if (el.dataset.view) {
      await navigate(el.dataset.view);
      return;
    }
    const action = el.dataset.action;
    if (action === "system") {
      systemReturn = view === "system" ? systemReturn : view;
      await navigate("system");
      return;
    }
    if (action === "close-system") {
      await navigate(systemReturn);
      return;
    }
    if (action === "back-here") {
      await navigate("here");
      return;
    }
    if (action === "all-jobs") {
      await navigate("jobs");
      return;
    }
    if (action === "captures") {
      reviewId = null;
      await navigate("capture");
      return;
    }
    if (action === "refresh-page") {
      await refresh();
      return;
    }
    if (action === "connect-key") {
      await command("connect", {
        connection: {
          baseUrl: (document.querySelector("#api-url") as HTMLInputElement)
            .value,
          apiKey: (document.querySelector("#api-key") as HTMLInputElement)
            .value,
        },
      });
      toast("Connected to your tracker.");
    }
    if (action === "check-compatibility") {
      try {
        await command("checkCompatibility");
        toast("Current client compatibility verified.");
      } finally {
        await refresh();
      }
    }
    if (action === "diagnostics")
      download(
        JSON.stringify(await command("diagnostics"), null, 2),
        "jobs-workflow-diagnostics.json",
        "application/json",
      );
    if (action === "grant-job-sites") {
      if (
        !(await chrome.permissions.request({
          origins: [
            "https://jobright.ai/*",
            "https://www.linkedin.com/*",
            "https://app.joinhandshake.com/*",
            "https://rit-csm.symplicity.com/*",
          ],
        }))
      )
        throw Error("Site access was declined.");
      toast("Access granted. Return to a posting and choose Auto or Manual.");
    }
    if (action === "add-selected") {
      await permit();
      await command("addSelected");
      await snapshot();
      remoteJobs = null;
      toast("Job saved. Expanded details will enrich the same record.");
    }
    if (action === "scan") {
      await permit();
      await snapshot();
      toast("Visible details refreshed.");
    }
    if (action === "link-destination") {
      const id = (
        document.querySelector("#destination-job") as HTMLSelectElement
      ).value;
      if (!id) throw Error("Choose the matching saved job first.");
      await permit();
      await command("linkDestination", { id });
      remoteJobs = null;
      toast("Application destination saved.");
    }
    if (action === "manual") {
      editJob = emptyJob(state.tab?.url || "https://example.com");
      render();
      return;
    }
    if (action === "edit-job") {
      editJob = state.connection
        ? (await command("getJob", { id: el.dataset.id })).job
        : state.jobs.find((j: Job) => j.id === el.dataset.id);
      if (!editJob) throw Error("Job is not available on this device.");
      render();
      return;
    }
    if (action === "close-edit") {
      editJob = null;
      await navigate(view);
      return;
    }
    if (action === "selected-description") {
      await permit();
      const value = await command("selected-text");
      if (new URL(value.url).origin !== new URL(editJob!.source_url).origin)
        throw Error("Selected text is from a different site.");
      (
        document.querySelector('[name="description"]') as HTMLTextAreaElement
      ).value = value.text;
      toast("Selected text added. Review and save.");
      return;
    }
    if (action === "save-job") {
      await command("manualJob", {
        job: readJob(
          document.querySelector<HTMLFormElement>("#job-form")!,
          editJob!,
        ),
      });
      discardFormDraft("job:" + editJob!.id);
      editJob = null;
      remoteJobs = null;
      toast("Saved locally and queued for sync.");
    }
    if (action === "archive-job" || action === "restore-job") {
      const reason = (
        document.querySelector('[name="archive_reason"]') as HTMLInputElement
      ).value;
      await command(action === "archive-job" ? "archiveJob" : "restoreJob", {
        id: editJob!.id,
        reason,
      });
      discardFormDraft("job:" + editJob!.id);
      editJob = null;
      remoteJobs = null;
      await loadJobs();
      toast(
        action === "archive-job"
          ? "Archived with history retained. Restore it from Archived."
          : "Restored with history retained.",
      );
    }
    if (["search", "more", "active-jobs", "archived-jobs"].includes(action!)) {
      const q = document.querySelector<HTMLInputElement>('[name="q"]');
      searchTerm = q ? q.value.trim() : searchTerm;
      if (action === "active-jobs" || action === "archived-jobs")
        archived = action === "archived-jobs";
      loadError = "";
      await loadJobs(action === "more");
    }
    if (action === "copy" || action === "download") {
      const urls = exportUrls((remoteJobs || state.jobs) as Job[]);
      if (!urls) throw Error("No employer application URLs in this view yet.");
      if (action === "copy") {
        await navigator.clipboard.writeText(urls);
        toast("Application URLs copied.");
      } else download(urls, "job-application-urls.txt");
    }
    if (action === "start") {
      const id = (document.querySelector("#attach-job") as HTMLSelectElement)
        .value;
      await permit();
      reviewId = await command("start", {
        job: state.jobs.find((j: Job) => j.id === id),
      });
      view = "capture";
      await snapshot();
    }
    if (action === "open-capture") {
      reviewId = el.dataset.id!;
      view = "capture";
    }
    if (action === "back-captures") reviewId = null;
    if (action === "capture-section") {
      await snapshot();
      toast("Current section captured.");
    }
    if (action === "pause-capture") {
      await snapshot();
      await command("pauseCapture", { id: reviewId });
      toast("Capture paused. Your draft is saved on this device.");
    }
    if (action === "finish" || action === "finish-paused") {
      if (action === "finish") await snapshot();
      await command("review", { id: reviewId });
    }
    if (action === "resume") {
      await permit();
      await command("resume", { id: reviewId });
      await snapshot();
    }
    if (
      [
        "save-details",
        "save-answer",
        "remove-field",
        "submit-capture",
      ].includes(action!)
    ) {
      const c = state.captures.find((c: Capture) => c.capture_id === reviewId);
      const form = document.querySelector<HTMLFormElement>("#capture-form")!;
      let fieldEdit;
      if (action === "save-answer") {
        const f = c.pages
          .flatMap((p: any) => p.fields)
          .find((f: any) => f.field_id === el.dataset.field);
        const value = String(
          new FormData(form).get("answer:" + el.dataset.field) ?? "",
        );
        fieldEdit = {
          field_id: f.field_id,
          answer:
            typeof f.answer === "boolean"
              ? value === "true"
              : f.answer &&
                  typeof f.answer === "object" &&
                  !Array.isArray(f.answer)
                ? { ...f.answer, checked: value === "true" }
                : value,
        };
      }
      const data = new FormData(form);
      if (action === "submit-capture" && data.get("confirmed") !== "on")
        throw Error(
          "Confirm submission on the employer site before saving an application.",
        );
      await command("editCapture", {
        id: reviewId,
        job: readJob(form, c.job),
        removeField: action === "remove-field" ? el.dataset.field : undefined,
        fieldEdit,
      });
      discardFormDraft("capture:" + reviewId);
      if (action === "submit-capture") {
        await command("submit", {
          id: reviewId,
          confirm: true,
          submittedAt: String(data.get("submittedAt") || ""),
        });
        toast(
          "Confirmed application queued. We will read it back after saving.",
        );
      } else
        toast(
          action === "remove-field"
            ? "Answer excluded from this capture."
            : "Capture changes saved locally.",
        );
    }
    if (action === "discard") {
      if (
        !confirm(
          "Remove this local capture? Its saved tracker records will remain.",
        )
      )
        return;
      await command("discard", { id: el.dataset.id });
      drafts.delete("capture:" + el.dataset.id);
    }
    if (action === "retry") {
      await command("retry");
      toast("Sync retry requested.");
    }
    if (action === "view-applied") {
      appliedDetail = (await command("application", { id: el.dataset.id })).job;
      await navigate("applied");
      return;
    }
    if (action === "back-applied") appliedDetail = null;
    if (
      [
        "search-applied",
        "reload-applied",
        "next-applied",
        "previous-applied",
      ].includes(action!)
    ) {
      if (action === "search-applied") {
        appliedSearch = (
          document.querySelector("#applied-search") as HTMLInputElement
        ).value.trim();
        appliedOffset = 0;
      }
      if (action === "next-applied") appliedOffset += 20;
      if (action === "previous-applied")
        appliedOffset = Math.max(0, appliedOffset - 20);
      loadError = "";
      await loadApplications();
    }
    await refresh();
  });
});
document.addEventListener("keydown", (e) => {
  if (
    (e.target as Element).closest(
      'input,textarea,select,[contenteditable="true"]',
    ) ||
    e.altKey ||
    e.metaKey ||
    e.ctrlKey
  )
    return;
  if (
    (e.target as Element).closest(".tabs") &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = ["here", "jobs", "handoffs", "applied"];
    const current = Math.max(0, tabs.indexOf(view));
    const index =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 3
          : (current + (e.key === "ArrowRight" ? 1 : 3)) % 4;
    void run(async () => {
      await navigate(tabs[index]);
      document
        .querySelector<HTMLElement>(`[data-view="${tabs[index]}"]`)
        ?.focus();
    });
    return;
  }
  const next: Record<string, string> = {
    "1": "here",
    "2": "jobs",
    "3": "handoffs",
    "4": "applied",
  };
  if (next[e.key]) {
    e.preventDefault();
    void run(() => navigate(next[e.key]));
  }
  if (e.key === "/" && view === "jobs") {
    e.preventDefault();
    document.querySelector<HTMLInputElement>("#job-search")?.focus();
  }
  if (e.key === "Escape" && (editJob || view === "system")) {
    e.preventDefault();
    void run(() => navigate(view === "system" ? systemReturn : view));
  }
});
let updateTimer: ReturnType<typeof setTimeout>;
chrome.storage.onChanged.addListener(() => {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    if (
      !busy &&
      view !== "handoffs" &&
      !document.activeElement?.matches("input,textarea,select") &&
      !editJob &&
      !(view === "capture" && reviewId)
    )
      void refresh().catch((e) => toast(e.message));
  }, 500);
});
void refresh().catch(
  (e) => (app.textContent = "Unable to load extension: " + e.message),
);

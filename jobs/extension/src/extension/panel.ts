import {
  emptyJob,
  exportUrls,
  jobSchema,
  normalizeUrl,
  type Job,
  type Capture,
} from "../shared/model";
const app = document.querySelector<HTMLDivElement>("#app")!;
let state: any = { jobs: [], captures: [], queue: [], sites: [] },
  view = "collection",
  reviewId: string | null = null,
  editJob: Job | null = null,
  remoteJobs: any[] | null = null,
  remoteTotal = 0,
  remoteCursor: string | null = null,
  searchTerm = "",
  selectedJob: string | null = null;
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
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${label}</button>`;
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
    )}</select></label>${input("type", "Role category", j.type)}${input("source", "Source", j.source)}${input("application_url", "Application URL", j.application_url)}${input("source_url", "Source URL", j.source_url)}${input("description", "Job description", j.description, true)}</div>`;
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
  next.description_status = next.description ? "full" : "missing";
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
function card(j: Job) {
  return `<article class="card"><div class="eyebrow">${esc(j.company || "Company not captured")}</div><h3>${esc(j.role || "Untitled job")}</h3><div class="subtitle muted">${esc(j.location || "Location unknown")} · ${esc(j.source)}</div><span class="tag ${j.resolution_status === "resolved" ? "" : "warning"}">${j.resolution_status === "resolved" ? "Application link ready" : "Link unresolved"}</span><span class="tag">${esc(j.description_status || "missing")} description</span><div class="actions"><a class="button" href="${esc(j.application_url || j.source_url)}" target="_blank" rel="noopener noreferrer">Open job ↗</a>${button("edit-job", "Details", false, `data-id="${esc(j.id)}"`)}</div></article>`;
}
function collection() {
  const jobs =
    remoteJobs ??
    state.jobs.filter(
      (j: Job) =>
        !searchTerm ||
        `${j.company} ${j.role} ${j.location}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
    );
  const ready = state.jobs.filter(
    (j: Job) => j.resolution_status === "resolved",
  ).length;
  return `<div class="eyebrow">Your next opportunity</div><h2>A little less busywork.</h2><p class="muted">Browse jobs normally. Keep the details and application links here.</p><div class="stats"><div><strong>${state.jobs.length}</strong><span>ON THIS DEVICE</span></div><div><strong>${ready}</strong><span>LINKS READY</span></div><div><strong>${state.queue.length}</strong><span>WAITING TO SYNC</span></div></div>
 <div class="notice"><div class="row"><strong>${state.tab ? esc(new URL(state.tab.url).hostname) : "Open a job page"}</strong><span class="tiny">${state.tab && state.sites.includes(state.tab.origin) ? "Collecting" : "Paused"}</span></div><div class="actions">${state.tab && state.sites.includes(state.tab.origin) ? button("pause", "Pause collection") : button("enable", "Collect on this site", true)}${button("scan", "Scan now")}${button("manual", "Add current job")}</div><div class="tiny">LinkedIn cards and standard JobPosting data. Other layouts may need manual capture.</div></div>
 <form id="search-form" class="row"><label class="field" style="flex:1">Find a job<input name="q" value="${esc(searchTerm)}" placeholder="Company, role, or location"></label>${button("search", "Search")}</form>
 <div class="row wrap"><span class="tiny muted">${remoteJobs ? `${remoteJobs.length} of ${remoteTotal} saved jobs` : `${jobs.length} local jobs`}</span><div class="actions">${button("copy", "Copy URLs")}${button("download", "Download .txt")}</div></div>
 ${jobs.length ? `<div class="cards">${jobs.map(card).join("")}</div>${remoteJobs && remoteJobs.length < remoteTotal ? button("more", "Load more") : ""}` : `<div class="empty"><div class="number">01 /</div><h2>Start with a job page.</h2><p class="muted">Enable collection, then scroll or open job details. Missing descriptions and links stay marked so you know what needs another look.</p></div>`}`;
}
function captureView() {
  const c = state.captures.find((c: Capture) => c.capture_id === reviewId) as
    Capture | undefined;
  if (c) {
    const editable = c.status === "review";
    return `<div class="row">${button("back-captures", "← All captures")}<span class="tag">${esc(c.status)}</span></div><h2>${esc(c.job.company || "Application capture")}</h2><p>${esc(c.job.role || "Add job details below")}</p><div class="notice warning">${esc(c.gaps.join(" "))} ${c.pages.flatMap((p) => p.gaps).length} section warnings.</div>
 <form id="capture-form">${editable ? `<details open><summary>Job details</summary>${jobFields(c.job)}</details>${button("save-details", "Save details")}` : ""}
 ${c.pages.map((p) => `<details open><summary>${esc(p.title)} · ${p.fields.length} fields</summary>${p.gaps.map((g) => `<p class="tiny muted">${esc(g)}</p>`).join("")}${p.fields.map((f) => `<div class="answer"><div class="row"><strong>${esc(f.label)}</strong>${editable ? button("remove-field", "Remove", false, `data-field="${esc(f.field_id)}"`) : ""}</div><div class="tiny muted">${esc(f.control_type)} · ${esc(f.answer_state)}</div><pre>${esc(typeof f.answer === "string" ? f.answer : JSON.stringify(f.answer, null, 2))}</pre></div>`).join("")}</details>`).join("")}
 ${editable ? `<label class="field">When did you submit? <input type="datetime-local" name="submittedAt" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></label><label class="check"><input type="checkbox" name="confirmed">I submitted this application on the employer's site and have reviewed this capture.</label><div class="actions">${button("submit-capture", "Save submitted application", true)}${button("resume", "Resume capture")}</div>` : c.status === "recording" ? `<div class="actions">${button("capture-section", "Capture this section", true)}${button("finish", "Finish & review")}</div>` : c.status === "saved" ? `<div class="notice">Saved to job_applications · Record ${c.application_id}</div>` : `<div class="notice">Saved locally and queued for sync. Keep the backend running.</div>`}</form>`;
  }
  return `<div class="eyebrow">Keep what you wrote</div><h2>Your application notebook.</h2><p class="muted">Capture each section as you apply. Review your answers in one place, even when the employer doesn't offer a review page.</p><label class="field">Attach collected job<select id="attach-job"><option value="">Use the current application page</option>${state.jobs.map((j: Job) => `<option value="${esc(j.id)}">${esc(j.company || "Unknown")} — ${esc(j.role || "Untitled")}</option>`).join("")}</select></label><div class="actions">${button("start", "Start capture on this tab", true)}</div><p class="tiny muted">Capture is limited to this tab and site. Passwords and verification codes are excluded.</p>${state.captures.length ? state.captures.map((c: Capture) => `<article class="card"><span class="eyebrow">${esc(c.status)}</span><h3>${esc(c.job.company || "New application")}</h3><p class="muted">${esc(c.job.role || "Job details not added")} · ${c.pages.length} sections</p><div class="actions">${button("open-capture", "Open capture", false, `data-id="${c.capture_id}"`)}${c.status !== "queued" ? button("discard", "Remove local copy", false, `data-id="${c.capture_id}"`) : ""}</div></article>`).join("") : `<div class="empty"><div class="number">02 /</div><p class="muted">Open an application and start before filling out the first section.</p></div>`}`;
}
function settings() {
  return `<div class="eyebrow">Your shared tracker</div><h2>Connect to KevinC.dev.</h2><p class="muted">Paste your Job Tracker API key. Jobs and confirmed applications will be saved through your private site's API.</p><form id="connection-form"><label class="field">API URL<input id="api-url" type="url" value="${esc(state.connection?.baseUrl || "https://www.kevinc.dev")}" required></label><label class="field">Job Tracker API key<input id="api-key" type="password" autocomplete="off" placeholder="Paste your API key" required></label>${button("connect-key", "Connect", true)}</form>${state.connection ? `<div class="notice">Connected: ${esc(state.connection.baseUrl)}<br>Last sync: ${state.lastSync ? esc(new Date(state.lastSync).toLocaleString()) : "No writes yet"}</div>` : ""}<h3 class="spacer">Sync queue</h3><p>${state.queue.length} pending operations.</p>${button("retry", "Retry sync")}${state.queue
    .filter((q: any) => q.error)
    .map(
      (q: any) =>
        `<div class="notice warning">${esc(q.kind)}: ${esc(q.error)}</div>`,
    )
    .join(
      "",
    )}<p class="tiny muted spacer">Your API key is stored only in the extension's private local storage. Website scripts cannot read it. The Turso database token stays on the server.</p>`;
}
function render() {
  app.innerHTML = `<header><div class="eyebrow">JobsUtilityExtension / 01</div><div class="brand"><h1>Jobs Utility</h1><div class="mark">j.</div></div><div class="connection"><span class="dot ${state.connection ? "online" : ""}"></span>${state.connection ? "Hosted tracker configured" : "Local storage · connect in Settings"}</div></header><nav role="tablist">${["collection", "capture", "settings"].map((v) => `<button role="tab" aria-selected="${view === v}" data-view="${v}">${v === "collection" ? "Collection" : v === "capture" ? "Applications" : "Settings"}${v === "settings" && state.queue.length ? ` (${state.queue.length})` : ""}</button>`).join("")}</nav><div class="row"><a href="diagnostics.html" target="_blank">Diagnostics & updates</a> · <a href="https://www.kevinc.dev/jobs/docs" target="_blank">Workflow guide</a></div><main>${editJob ? `<div class="row">${button("close-edit", "← Collection")}</div><h2>Job details</h2><form id="job-form">${jobFields(editJob)}<div class="actions">${button("save-job", "Save job", true)}</div></form>` : view === "collection" ? collection() : view === "capture" ? captureView() : settings()}</main>`;
}
async function permit() {
  if (!state.tab) throw Error("Select a job or application tab first");
  const ok = await chrome.permissions.request({
    origins: [state.tab.origin + "/*"],
  });
  if (!ok) throw Error("Site permission was declined");
}
async function snapshot() {
  if (!state.tab) throw Error("Open the application tab");
  await command("scan");
  const reply = await chrome.tabs.sendMessage(state.tab.id, { type: "scan" });
  if (!reply?.ok)
    throw Error(reply?.error || "Section capture did not complete.");
}
function download(text: string, name: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
app.addEventListener("submit", (e) => e.preventDefault());
app.addEventListener("click", async (event) => {
  const el = (event.target as Element).closest<HTMLElement>(
    "[data-action],[data-view]",
  );
  if (!el) return;
  event.preventDefault();
  if (el.dataset.view) {
    view = el.dataset.view;
    editJob = null;
    await refresh();
    return;
  }
  const action = el.dataset.action;
  try {
    if (action === "connect-key") {
      await command("connect", {
        connection: {
          baseUrl: (document.querySelector("#api-url") as HTMLInputElement)
            .value,
          apiKey: (document.querySelector("#api-key") as HTMLInputElement)
            .value,
        },
      });
      toast("Connected to your Job Tracker.");
    }
    if (action === "enable") {
      await permit();
      await command("enable");
      await snapshot();
    }
    if (action === "pause") await command("pause");
    if (action === "scan") {
      await permit();
      await snapshot();
      toast("Page scanned. Open job details if descriptions are missing.");
    }
    if (action === "manual") {
      editJob = emptyJob(state.tab?.url || "https://example.com");
      render();
      return;
    }
    if (action === "edit-job") {
      editJob =
        state.jobs.find((j: Job) => j.id === el.dataset.id) ||
        jobSchema.parse((await command("getJob", { id: el.dataset.id })).job);
      render();
      return;
    }
    if (action === "close-edit") {
      editJob = null;
    }
    if (action === "save-job") {
      await command("manualJob", {
        job: readJob(
          document.querySelector<HTMLFormElement>("#job-form")!,
          editJob!,
        ),
      });
      editJob = null;
      toast("Job saved locally and queued.");
    }
    if (action === "search" || action === "more") {
      searchTerm = (
        document.querySelector<HTMLInputElement>('[name="q"]')?.value ||
        searchTerm
      ).trim();
      if (state.connection) {
        const r = await command("search", {
          filters: {
            q: searchTerm,
            limit: "50",
            ...(action === "more" && remoteCursor
              ? { cursor: remoteCursor }
              : {}),
          },
        });
        remoteJobs =
          action === "more" ? [...(remoteJobs || []), ...r.jobs] : r.jobs;
        remoteTotal = r.total;
        remoteCursor = r.next_cursor;
      } else remoteJobs = null;
    }
    if (action === "copy" || action === "download") {
      const jobs = (remoteJobs || state.jobs) as Job[];
      const urls = exportUrls(jobs);
      if (!urls) throw Error("No resolved application URLs in this view yet.");
      if (action === "copy") {
        await navigator.clipboard.writeText(urls);
        toast("Application URLs copied.");
      } else download(urls, "job-application-urls.txt");
    }
    if (action === "start") {
      await permit();
      const id = (document.querySelector("#attach-job") as HTMLSelectElement)
        .value;
      reviewId = await command("start", {
        job: state.jobs.find((j: Job) => j.id === id),
      });
      await snapshot();
    }
    if (action === "open-capture") reviewId = el.dataset.id!;
    if (action === "back-captures") reviewId = null;
    if (action === "capture-section") {
      await snapshot();
      toast("Current section captured.");
    }
    if (action === "finish") {
      await snapshot();
      await command("review", { id: reviewId });
    }
    if (action === "resume") {
      await permit();
      await command("resume", { id: reviewId });
      await snapshot();
    }
    if (
      action === "save-details" ||
      action === "remove-field" ||
      action === "submit-capture"
    ) {
      const c = state.captures.find((c: Capture) => c.capture_id === reviewId);
      const form = document.querySelector<HTMLFormElement>("#capture-form")!;
      await command("editCapture", {
        id: reviewId,
        job: readJob(form, c.job),
        removeField: el.dataset.field,
      });
      if (action === "submit-capture") {
        const data = new FormData(form);
        await command("submit", {
          id: reviewId,
          confirm: data.get("confirmed") === "on",
          submittedAt: String(data.get("submittedAt") || ""),
        });
        toast("Confirmed application queued for saving.");
      } else
        toast(
          action === "remove-field"
            ? "Field removed from this capture."
            : "Details saved.",
        );
    }
    if (action === "retry") {
      await command("retry");
      toast("Sync retry requested.");
    }
    if (action === "discard") {
      if (
        !confirm(
          "Remove this local capture? Any saved database record will remain.",
        )
      )
        return;
      await command("discard", { id: el.dataset.id });
    }
    await refresh();
  } catch (e) {
    toast((e as Error).message);
  }
});
let updateTimer: ReturnType<typeof setTimeout>;
chrome.storage.onChanged.addListener(() => {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    if (
      !document.activeElement?.matches("input,textarea,select") &&
      !editJob &&
      !(
        view === "capture" &&
        state.captures.find((c: Capture) => c.capture_id === reviewId)
          ?.status === "review"
      )
    )
      void refresh();
  }, 500);
});
void refresh().catch((e) => {
  app.textContent = "Unable to load extension: " + e.message;
});

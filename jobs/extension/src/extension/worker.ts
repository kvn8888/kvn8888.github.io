declare const __JOBS_BUILD_HASH__: string;
import { preflight, compatibilitySnapshot } from '../shared/discovery';
import {
  hostedRequest,
  collectHosted,
  submitHosted,
  saveDraftHosted,
  decodeJob,
} from "./hosted";
import {
  emptyJob,
  jobSchema,
  mergePages,
  type Job,
  type Capture,
  type PageSnapshot,
  type QueueItem,
} from "../shared/model";
type State = {
  jobs: Job[];
  captures: Capture[];
  queue: QueueItem[];
  sites: string[];
  targetTab?: number;
  connection?: { baseUrl: string; apiKey: string };
  lastSync?: string;
  error?: string;
};
const defaults: State = { jobs: [], captures: [], queue: [], sites: [] };
let serial = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const p = serial.then(fn, fn);
  serial = p.then(
    () => {},
    () => {},
  );
  return p;
}
async function read(): Promise<State> {
  return {
    ...defaults,
    ...(((await chrome.storage.local.get("state")).state as Partial<State>) ||
      {}),
  };
}
async function save(s: State) {
  await chrome.storage.local.set({ state: s });
}
const localOnly = () =>
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
void localOnly();
async function request(s: State, path: string, method = "GET", body?: unknown) {
  if (!s.connection)
    throw Error("Paste your Job Tracker API key in Settings first.");
  if (path === "/health")
    return hostedRequest(s.connection, "/api/job-workflow/connection");
  if (path.startsWith("/jobs/"))
    return {
      job: decodeJob(
        (
          await hostedRequest(
            s.connection,
            "/api/job-collection/" + path.slice(6),
          )
        ).job,
      ),
    };
  if (path.startsWith("/jobs?"))
    return hostedRequest(
      s.connection,
      "/api/job-collection?" + path.split("?")[1],
    );
  if (path === "/applications")
    return hostedRequest(s.connection, "/api/jobs?view=applied&limit=100");
  return hostedRequest(s.connection, path, method, body);
}
async function sync() {
  return locked(async () => {
    const s = await read();
    if (!s.connection) return;
    let changed = false;
    for (const item of [...s.queue]
      .filter((x) => !x.blocked && (!x.next_try || x.next_try <= Date.now()))
      .slice(0, 20)) {
      try {
        if (item.kind === "application" && !item.claimToken) {
          item.claimToken = crypto.randomUUID() + crypto.randomUUID();
          await save(s);
        }
        const data =
          item.kind === "capture"
            ? { draft: await saveDraftHosted(s.connection, item.payload) }
            : item.kind === "job"
              ? { job: await collectHosted(s.connection, item.payload as Job) }
              : await submitHosted(
                  s.connection,
                  item.payload,
                  item.claimToken!,
                );
        if ("job" in data) {
          const j = jobSchema.parse(data.job);
          const aliases = JSON.parse(j.metadata_json).aliases || [];
          s.jobs = s.jobs.filter(
            (v) =>
              v.id !== j.id &&
              !aliases.includes(v.id) &&
              v.identity_key !== j.identity_key,
          );
          s.jobs.push(j);
        } else if ("id" in data) {
          const c = s.captures.find((c) => c.capture_id === item.id);
          if (c) {
            c.status = "saved";
            c.application_id = data.id;
            c.error = undefined;
          }
        }
        s.queue = s.queue.filter((q) => q.id !== item.id);
        s.lastSync = new Date().toISOString();
        s.error = undefined;
        changed = true;
      } catch (e) {
        item.attempts++;
        item.error = e instanceof Error ? e.message : "Sync failed";
        item.blocked = [400, 409, 413].includes((e as any).status);
        item.next_try =
          Date.now() + Math.min(300000, 5000 * 2 ** Math.min(item.attempts, 6));
        s.error = item.error;
        changed = true;
        break;
      }
    }
    if (changed) await save(s);
  });
}
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "sync") void sync();
});
async function init() {
  await localOnly();
  await chrome.alarms.create("sync", { periodInMinutes: 1 });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(() => void init());
chrome.runtime.onStartup.addListener(() => {
  void init();
  void locked(async () => {
    const s = await read();
    s.targetTab = undefined;
    for (const c of s.captures)
      if (c.status === "recording") {
        c.status = "review";
        c.gaps.push(
          "Chrome restarted. Resume capture on the original application tab.",
        );
      }
    await save(s);
  });
});
chrome.action.onClicked.addListener(
  (tab) =>
    void locked(async () => {
      const s = await read();
      s.targetTab = tab.id;
      await save(s);
    }),
);
chrome.tabs.onActivated.addListener(
  ({ tabId }) =>
    void locked(async () => {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && /^https?:/.test(tab.url)) {
        const s = await read();
        s.targetTab = tabId;
        await save(s);
      }
    }),
);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url && tab.active && /^https?:/.test(change.url))
    void locked(async () => {
      const s = await read();
      s.targetTab = tabId;
      await save(s);
    });
});
chrome.tabs.onRemoved.addListener(
  (tabId) =>
    void locked(async () => {
      const s = await read();
      for (const c of s.captures)
        if (c.tab_id === tabId && c.status === "recording") {
          c.status = "review";
          c.gaps.push(
            "The application tab was closed. Resume capture before continuing.",
          );
        }
      if (s.targetTab === tabId) s.targetTab = undefined;
      await save(s);
    }),
);
async function inject(tabId: number, origin: string) {
  const id = "site-" + btoa(origin).replace(/[^a-z0-9]/gi, "");
  if (
    !(await chrome.scripting.getRegisteredContentScripts()).some(
      (s) => s.id === id,
    )
  )
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [origin + "/*"],
        js: ["content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}
async function target(s: State, tabId?: number) {
  const id =
    tabId ??
    s.targetTab ??
    (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (id === undefined) throw Error("Open a job or application page first.");
  let tab;
  try {
    tab = await chrome.tabs.get(id);
  } catch {
    tab = (
      await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    )[0];
  }
  if (!tab?.url || !/^https?:/.test(tab.url))
    throw Error("Select an HTTP or HTTPS job page.");
  return { id: tab.id!, url: tab.url, origin: new URL(tab.url).origin };
}
async function handle(m: any, sender: chrome.runtime.MessageSender) {
  const trusted =
    sender.id === chrome.runtime.id &&
    !!sender.url?.startsWith(chrome.runtime.getURL(""));
  if (!trusted) {
    if (
      sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 ||
      !sender.tab?.id ||
      !sender.url
    )
      throw Error("Invalid sender");
    const s = await read(),
      origin = new URL(sender.url).origin;
    const capture = s.captures.find(
      (c) =>
        c.status === "recording" &&
        c.tab_id === sender.tab!.id &&
        c.origin === origin,
    );
    if (m.type === "context")
      return {
        collect: s.sites.includes(origin),
        capture: capture ? { capture_id: capture.capture_id } : null,
      };
    if (m.type === "observed") {
      if (
        !s.sites.includes(origin) ||
        !Array.isArray(m.jobs) ||
        m.jobs.length > 200
      )
        throw Error("Collection is not enabled");
      for (const value of m.jobs) {
        const j = jobSchema.parse(value);
        if (new URL(j.source_url).origin !== origin)
          throw Error("Source origin mismatch");
        const previous = s.jobs.find((v) => v.identity_key === j.identity_key);
        if (previous) {
          j.id = previous.id;
          j.first_seen_at = previous.first_seen_at;
          if (
            previous.description_status === "full" &&
            j.description_status !== "full"
          ) {
            j.description = previous.description;
            j.description_status = "full";
          }
          if (!j.application_url && previous.application_url) {
            j.application_url = previous.application_url;
            j.canonical_url = previous.canonical_url;
            j.resolution_status = "resolved";
          }
          for (const k of [
            "company",
            "role",
            "location",
            "type",
            "work_mode",
          ] as const)
            if (!j[k]) (j as any)[k] = previous[k];
          const metadata = JSON.parse(previous.metadata_json);
          for (const key of metadata.user_edited_fields || []) {
            if (
              key in j &&
              ![
                "id",
                "identity_key",
                "source",
                "source_job_id",
                "first_seen_at",
                "last_seen_at",
                "updated_at",
              ].includes(key)
            )
              (j as any)[key] = (previous as any)[key];
          }
          j.metadata_json = JSON.stringify({
            ...JSON.parse(j.metadata_json),
            user_edited_fields: metadata.user_edited_fields || [],
          });
        }
        s.jobs = s.jobs.filter((v) => v.id !== j.id);
        s.jobs.push(j);
        s.queue = s.queue.filter((q) => q.kind !== "job" || q.id !== j.id);
        s.queue.push({ id: j.id, kind: "job", payload: j, attempts: 0 });
      }
      await save(s);
      return { count: m.jobs.length };
    }
    if (m.type === "snapshot") {
      if (!capture || capture.capture_id !== m.captureId)
        throw Error("No active capture");
      const p = m.page as PageSnapshot;
      if (
        !p ||
        new URL(p.url).origin !== origin ||
        !Array.isArray(p.fields) ||
        p.fields.length > 1000 ||
        JSON.stringify(p).length > 1_000_000
      )
        throw Error("Invalid or oversized section");
      capture.pages = mergePages(capture.pages, p);
      if (JSON.stringify(capture).length > 1_000_000)
        throw Error(
          "Capture is too large. Review and remove unnecessary sections.",
        );
      await save(s);
      return { fields: p.fields.length };
    }
    throw Error("Page cannot access this command");
  }
  const s = await read();
  switch (m.type) {
    case "diagnostics": {
      const info = await (await fetch(chrome.runtime.getURL('build-info.json'))).json();
      const active = s.captures.filter(c => c.status === 'recording').length;
      const attempts = s.queue.filter(item => item.kind === 'application' && item.claimToken).length;
      return {schema_version:1,generated_at:new Date().toISOString(),extension_id:chrome.runtime.id,version:chrome.runtime.getManifest().version,build_hash:__JOBS_BUILD_HASH__,storage_schema:info.storage_schema,compatibility:compatibilitySnapshot(),active_captures:active,active_attempts:attempts,pending_queue:s.queue.length,collection_sites:s.sites.length,safe_to_reload:active===0 && attempts===0 && s.queue.length===0 && s.sites.length===0};
    }
    case "state": {
      let tab = null;
      try {
        tab = await target(s);
      } catch {}
      return {
        ...s,
        connection: s.connection ? { baseUrl: s.connection.baseUrl } : null,
        tab,
      };
    }
    case "connect": {
      const u = new URL(m.connection?.baseUrl);
      const supported =
        u.origin === "https://www.kevinc.dev" ||
        (["127.0.0.1", "localhost"].includes(u.hostname) &&
          u.protocol === "http:");
      if (
        !supported ||
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash
      )
        throw Error(
          "Use https://www.kevinc.dev (or a local development server).",
        );
      const apiKey = String(m.connection?.apiKey || "").trim();
      if (apiKey.length < 32 || /\s/.test(apiKey))
        throw Error("Paste a valid Job Tracker API key.");
      s.connection = { baseUrl: u.origin, apiKey };
      await preflight(u.origin, true);
      const health = await request(s, "/health");
      if (health.access === "read")
        throw Error(
          "This is a read-only key. Use your Job Tracker API key to save jobs.",
        );
      await save(s);
      return true;
    }
    case "enable": {
      if (!s.connection) throw Error("Connect to the hosted tracker first.");
      await preflight(s.connection.baseUrl, true);
      const t = await target(s, m.tabId);
      if (!(await chrome.permissions.contains({ origins: [t.origin + "/*"] })))
        throw Error("Site permission is required");
      s.sites = [...new Set([...s.sites, t.origin])];
      s.targetTab = t.id;
      await save(s);
      await inject(t.id, t.origin);
      return true;
    }
    case "pause": {
      const t = await target(s);
      s.sites = s.sites.filter((x) => x !== t.origin);
      await save(s);
      return true;
    }
    case "scan": {
      const t = await target(s);
      await inject(t.id, t.origin);
      return true;
    }
    case "manualJob": {
      const j = jobSchema.parse(m.job);
      s.jobs = s.jobs.filter((v) => v.id !== j.id);
      s.jobs.push(j);
      s.queue = s.queue.filter((q) => q.id !== j.id);
      s.queue.push({ id: j.id, kind: "job", payload: j, attempts: 0 });
      await save(s);
      return true;
    }
    case "start": {
      if (!s.connection) throw Error("Connect to the hosted tracker first.");
      await preflight(s.connection.baseUrl, true);
      const t = await target(s);
      if (s.captures.some((c) => c.status === "recording" && c.tab_id === t.id))
        throw Error("This tab already has a capture");
      await inject(t.id, t.origin);
      const j = m.job ? jobSchema.parse(m.job) : emptyJob(t.url);
      const c: Capture = {
        schema_version: 1,
        capture_id: crypto.randomUUID(),
        tab_id: t.id,
        origin: t.origin,
        status: "recording",
        started_at: new Date().toISOString(),
        finished_at: null,
        job: j,
        pages: [],
        gaps: [
          "Capture includes only observed sections. Check earlier pages and custom controls before saving.",
        ],
        submitted_at: null,
      };
      s.captures.push(c);
      await save(s);
      return c.capture_id;
    }
    case "resume": {
      const c = s.captures.find((c) => c.capture_id === m.id);
      if (!c || !["review", "recording"].includes(c.status))
        throw Error("Capture cannot be resumed");
      const t = await target(s);
      if (t.origin !== c.origin)
        throw Error("Open the original application site to resume");
      if (
        s.captures.some(
          (v) =>
            v.capture_id !== c.capture_id &&
            v.status === "recording" &&
            v.tab_id === t.id,
        )
      )
        throw Error("Finish the other capture first");
      c.tab_id = t.id;
      c.status = "recording";
      await save(s);
      await inject(t.id, t.origin);
      return true;
    }
    case "review": {
      const c = s.captures.find((c) => c.capture_id === m.id);
      if (!c || !["recording", "review"].includes(c.status))
        throw Error("Capture is already queued or saved");
      c.status = "review";
      c.finished_at = new Date().toISOString();
      c.cloud_revision = (c.cloud_revision || 0) + 1;
      s.queue.push({
        id: crypto.randomUUID(),
        kind: "capture",
        attempts: 0,
        payload: {
          id: crypto.randomUUID(),
          capture_id: c.capture_id,
          revision: c.cloud_revision,
          job: c.job,
          captured_at: c.finished_at,
          document: {
            schema_version: 1,
            pages: c.pages,
            gaps: c.gaps,
            started_at: c.started_at,
          },
        },
      });
      await save(s);
      return true;
    }
    case "editCapture": {
      const c = s.captures.find((c) => c.capture_id === m.id);
      if (!c || c.status !== "review")
        throw Error("Finish capture before editing");
      c.job = jobSchema.parse(m.job);
      if (m.removeField)
        for (const p of c.pages)
          p.fields = p.fields.filter((f) => f.field_id !== m.removeField);
      await save(s);
      return true;
    }
    case "submit": {
      const c = s.captures.find((c) => c.capture_id === m.id);
      if (!c || c.status !== "review" || m.confirm !== true)
        throw Error("Review and confirm submission first");
      if (!c.job.company?.trim() || !c.job.role?.trim())
        throw Error("Enter company and role before saving");
      if (!c.pages.some((p) => p.fields.length))
        throw Error("Capture at least one section first");
      const submitted = new Date(m.submittedAt);
      if (
        !m.submittedAt ||
        Number.isNaN(submitted.getTime()) ||
        submitted.getTime() > Date.now() + 60000
      )
        throw Error("Enter a valid submission date and time");
      c.submitted_at = submitted.toISOString();
      c.finished_at ||= new Date().toISOString();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(submitted);
      const payload = {
        schema_version: 1,
        capture_id: c.capture_id,
        capture_revision: (c.cloud_revision || 0) + 1,
        job: c.job,
        pages: c.pages,
        gaps: c.gaps,
        started_at: c.started_at,
        finished_at: c.finished_at,
        submitted_at: c.submitted_at,
        submission_confirmation: "user_confirmed",
        date,
      };
      c.status = "queued";
      s.queue.push({
        id: c.capture_id,
        kind: "application",
        payload,
        attempts: 0,
      });
      await save(s);
      return true;
    }
    case "retry": {
      for (const q of s.queue) {
        q.blocked = false;
        q.next_try = 0;
      }
      await save(s);
      return true;
    }
    case "search":
      return request(s, "/jobs?" + new URLSearchParams(m.filters || {}));
    case "getJob":
      return request(s, "/jobs/" + encodeURIComponent(m.id));
    case "applications":
      return request(s, "/applications");
    case "discard": {
      const c = s.captures.find((c) => c.capture_id === m.id);
      if (c?.status === "queued")
        throw Error("Queued capture must finish syncing before removal");
      s.captures = s.captures.filter((c) => c.capture_id !== m.id);
      await save(s);
      return true;
    }
    default:
      throw Error("Unknown command");
  }
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  locked(() => handle(m, sender)).then(
    (data) => {
      respond({ ok: true, data });
      if (
        [
          "observed",
          "review",
          "submit",
          "retry",
          "connect",
          "manualJob",
        ].includes(m.type)
      )
        void sync();
    },
    (e) =>
      respond({
        ok: false,
        error: e instanceof Error ? e.message : "Operation failed",
      }),
  );
  return true;
});

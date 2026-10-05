import type { operations } from "../shared/api-types";
import { CLIENT_VERSION } from "../shared/version";
import type { Connection } from "./hosted";
type Batch =
  operations["recordClientEvents"]["requestBody"]["content"]["application/json"];
export type JobEvent = Batch["events"][number];
type Log = {
  client_id: string;
  recent: JobEvent[];
  pending: JobEvent[];
  dropped: number;
  last_reported_at?: string;
  transport_error?: JobEvent["error_code"];
};
const key = "jobsObservability",
  uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let serial = Promise.resolve(),
  sending = false,
  lastSend = 0;
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const result = serial.then(fn, fn);
  serial = result.then(
    () => {},
    () => {},
  );
  return result;
}
export function traceId(value?: unknown) {
  return typeof value === "string" && uuid.test(value)
    ? value
    : crypto.randomUUID();
}
export function telemetrySource(raw: string): JobEvent["source"] {
  try {
    const h = new URL(raw).hostname;
    for (const [domain, source] of [
      ["jobright.ai", "jobright"],
      ["joinhandshake.com", "handshake"],
      ["linkedin.com", "linkedin"],
      ["symplicity.com", "symplicity"],
    ] as const)
      if (h === domain || h.endsWith("." + domain)) return source;
  } catch {}
  return "other";
}
export function errorCode(error: unknown): JobEvent["error_code"] {
  const e = error as { status?: number; name?: string };
  return e?.status === 401
    ? "unauthorized"
    : e?.status === 403
      ? "forbidden"
      : e?.status === 409 || e?.status === 412
        ? "conflict"
        : e?.status === 429
          ? "rate_limited"
          : e?.status && e.status >= 500
            ? "unavailable"
            : e?.status && e.status >= 400
              ? "invalid_input"
              : e?.name === "TimeoutError" || e?.name === "AbortError"
                ? "timeout"
                : e?.name === "TypeError"
                  ? "network"
                  : "unknown";
}
// Copy only technical fields. Neither exception text nor page/answer payloads enter the log.
export function sanitizeEvent(
  input: Partial<JobEvent> & Pick<JobEvent, "name">,
): JobEvent {
  const event: JobEvent = {
    id: traceId(input.id),
    at: new Date().toISOString(),
    trace_id: traceId(input.trace_id),
    name: input.name,
  };
  const enums = {
    name: [
      "worker_started",
      "scan_finished",
      "scan_failed",
      "sync_succeeded",
      "sync_failed",
      "site_mode",
      "destination_saved",
    ],
    source: ["jobright", "handshake", "linkedin", "symplicity", "other"],
    mode: ["auto", "manual", "paused"],
    operation: ["job", "capture", "application"],
    error_code: [
      "unauthorized",
      "forbidden",
      "invalid_input",
      "conflict",
      "rate_limited",
      "unavailable",
      "network",
      "timeout",
      "context_invalidated",
      "unknown",
    ],
  };
  if (!enums.name.includes(input.name)) throw Error("Unknown event");
  for (const field of ["source", "mode", "operation", "error_code"] as const)
    if (input[field] && enums[field].includes(input[field]!))
      (event as any)[field] = input[field];
  for (const [field, max] of [
    ["found", 200],
    ["queued", 200],
    ["skipped", 200],
    ["queue_depth", 100000],
    ["duration_ms", 300000],
    ["http_status", 599],
  ] as const) {
    const value = input[field];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= (field === "http_status" ? 100 : 0)
    )
      event[field] = Math.min(max, Math.floor(value));
  }
  return event;
}
async function read(): Promise<Log> {
  const value = (await chrome.storage.local.get(key))[key] as Log | undefined;
  if (value?.client_id) return value;
  const created = {
    client_id: crypto.randomUUID(),
    recent: [],
    pending: [],
    dropped: 0,
  };
  await save(created);
  return created;
}
async function save(value: Log) {
  await chrome.storage.local.set({ [key]: value });
}
export async function recordEvent(
  input: Partial<JobEvent> & Pick<JobEvent, "name">,
) {
  try {
    await locked(async () => {
      const log = await read(),
        event = sanitizeEvent(input);
      log.recent = [...log.recent, event].slice(-100);
      log.pending.push(event);
      log.dropped = Math.min(
        1000000,
        log.dropped + Math.max(0, log.pending.length - 100),
      );
      log.pending = log.pending.slice(-100);
      await save(log);
    });
  } catch {
    /* Telemetry must never fail a job operation. */
  }
}
export async function diagnosticsLog() {
  try {
    return await locked(async () => {
      const log = await read();
      return {
        client_id: log.client_id,
        recent: log.recent,
        pending_events: log.pending.length,
        dropped: log.dropped,
        last_reported_at: log.last_reported_at,
        transport_error: log.transport_error,
      };
    });
  } catch {
    return { recent: [], pending_events: 0, unavailable: true };
  }
}
export async function traceHeaders(trace: string) {
  const log = await diagnosticsLog();
  return {
    "X-Jobs-Trace-Id": trace,
    ...("client_id" in log && log.client_id
      ? { "X-Jobs-Client-Id": log.client_id }
      : {}),
  };
}
export async function flushEvents(connection?: Connection) {
  if (!connection || sending || Date.now() - lastSend < 30000) return;
  sending = true;
  lastSend = Date.now();
  try {
    const log = await locked(read);
    if (!log.pending.length) return;
    const events = log.pending.slice(0, 25),
      batch: Batch = {
        client_id: log.client_id,
        client_version: CLIENT_VERSION,
        events,
        dropped: log.dropped,
      };
    const response = await fetch(
      connection.baseUrl + "/api/job-workflow/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(3500),
      },
    );
    if (!response.ok)
      throw Object.assign(Error("Telemetry transport"), {
        status: response.status,
      });
    const ack = await response.json();
    if (ack.accepted !== events.length) throw Error("Invalid acknowledgment");
    const sent = new Set(events.map((e) => e.id));
    await locked(async () => {
      const current = await read();
      current.pending = current.pending.filter((e) => !sent.has(e.id));
      current.last_reported_at = new Date().toISOString();
      delete current.transport_error;
      await save(current);
    });
  } catch (error) {
    try {
      await locked(async () => {
        const log = await read();
        log.transport_error = errorCode(error);
        await save(log);
      });
    } catch {}
  } finally {
    sending = false;
  }
}

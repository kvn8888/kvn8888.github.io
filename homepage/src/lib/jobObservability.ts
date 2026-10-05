import { after, NextResponse } from "next/server";
import { reportServerEvent, queryServerEvents } from "./axiom";
import { clientEventsSchema } from "./jobTelemetrySchema";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function jobRequestMetadata(
  request: Request,
  status: number,
  duration: number,
) {
  const raw = request.headers.get("x-jobs-trace-id") || "";
  const client = request.headers.get("x-jobs-client-id") || "";
  const path = new URL(request.url).pathname;
  const normalized = path.replace(/[a-f0-9-]{36}/gi, "{id}");
  const route =
    /^\/api\/job-collection(?:\/\{id\})?$/.test(normalized) ||
    /^\/api\/job-workflow\/(?:events|attempts|captures|attempts\/\{id\}\/(?:heartbeat|outcome|complete|recover|handoff)|blockers\/\{id\}\/resolve|handoffs\/\{id\}\/claim|jobs\/\{id\}\/availability)$/.test(
      normalized,
    )
      ? normalized
      : "unrecognized_jobs_route";
  return {
    route,
    method: request.method,
    requestId: uuid.test(raw) ? raw : crypto.randomUUID(),
    ...(uuid.test(client) ? { client_id: client } : {}),
    status,
    duration_ms: Math.max(0, Math.round(duration)),
  };
}
export async function observeJobRequest(
  request: Request,
  action: () => Promise<Response>,
) {
  const start = Date.now();
  const response = await action();
  const data = jobRequestMetadata(request, response.status, Date.now() - start);
  const send = () =>
    reportServerEvent({
      event: "jobs.request",
      level:
        response.status >= 500
          ? "error"
          : response.status >= 400
            ? "warn"
            : "info",
      message: "Jobs request completed",
      data,
    });
  // Reporting must not delay or replace the business response. Next keeps after() alive.
  try {
    after(send);
  } catch {
    void send().catch(() => {});
  }
  response.headers.set("X-Jobs-Request-Id", data.requestId);
  return response;
}
export async function handleJobEvents(request: Request) {
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Telemetry batch too large" },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(bytes);
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Invalid telemetry JSON" },
        { status: 400 },
      );
    }
    const parsed = clientEventsSchema.safeParse(input);
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid telemetry batch; only documented technical fields are accepted",
        },
        { status: 400 },
      );
    const data = parsed.data;
    // Strict allowlist rejects URLs, answers, keys, raw errors and other page contents.
    await reportServerEvent({
      event: "jobs.client.events",
      level: data.events.some((e) => e.error_code) ? "warn" : "info",
      message: "Jobs client activity",
      data,
    });
    return NextResponse.json(
      { accepted: data.events.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const params = new URL(request.url).searchParams;
  const client = params.get("client_id");
  const trace = params.get("trace_id");
  if ((client && !uuid.test(client)) || (trace && !uuid.test(trace)))
    return NextResponse.json(
      { error: "Client and trace IDs must be UUIDs" },
      { status: 400 },
    );
  const limit = Number(params.get("limit") || 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return NextResponse.json(
      { error: "limit must be from 1 to 100" },
      { status: 400 },
    );
  try {
    const result = await queryServerEvents({
      startTime: "now-24h",
      buildApl: (dataset) => {
        const filters = [
          'service == "kevinc-homepage"',
          '(event == "jobs.client.events" or event == "jobs.request")',
        ];
        if (client) filters.push(`data.client_id == ${JSON.stringify(client)}`);
        if (trace)
          filters.push(
            `(requestId == ${JSON.stringify(trace)} or tostring(data.events) contains ${JSON.stringify(trace)})`,
          );
        return `[${JSON.stringify(dataset)}] | where ${filters.join(" and ")} | sort by _time desc | limit ${limit}`;
      },
    });
    return NextResponse.json(
      { backend: "axiom", result: result.result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        backend: "server_logs",
        note: "Axiom query access is unavailable. Use the project runtime logs; client diagnostics retain recent sanitized events.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

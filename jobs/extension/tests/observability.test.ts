import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeEvent,
  recordEvent,
  diagnosticsLog,
  flushEvents,
  errorCode,
  telemetrySource,
} from "../src/extension/observability";
const storage: Record<string, unknown> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: storage[key] }),
      set: async (value: object) => {
        Object.assign(storage, structuredClone(value));
      },
    },
  },
};
test("technical telemetry drops sensitive and unknown fields, bounds values and maps safe errors", () => {
  const event = sanitizeEvent({
    name: "scan_finished",
    found: 1000,
    queue_depth: -1,
    source: "jobright",
    apiKey: "secret",
    answers: ["private"],
    url: "https://example.com/?token=secret",
    message: "private",
  } as any);
  assert.equal(event.found, 200);
  assert.equal(event.queue_depth, undefined);
  for (const value of ["secret", "private", "example.com"])
    assert.ok(!JSON.stringify(event).includes(value));
  assert.equal(errorCode({ status: 412, message: "secret" }), "conflict");
  assert.equal(errorCode(Error("private")), "unknown");
  assert.equal(
    telemetrySource("https://jobright.ai/jobs/info/123"),
    "jobright",
  );
  assert.equal(telemetrySource("https://jobright.ai.evil.example/"), "other");
});
test("logs are bounded and upload failures preserve events without touching business state", async () => {
  storage.state = { queue: [{ id: "business-write", payload: "private" }] };
  for (let i = 0; i < 110; i++)
    await recordEvent({
      name: "scan_finished",
      found: 1,
      queued: 1,
      skipped: 0,
    });
  const before = await diagnosticsLog();
  assert.equal(before.recent.length, 100);
  assert.equal(before.pending_events, 100);
  assert.equal("dropped" in before && before.dropped, 10);
  const original = globalThis.fetch;
  let sent: any;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(String(options?.body));
    return new Response("{}", { status: 503 });
  };
  try {
    await flushEvents({ baseUrl: "http://localhost", apiKey: "secret" });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(sent.events.length, 25);
  assert.ok(!JSON.stringify(sent).includes("secret"));
  assert.ok(!JSON.stringify(sent).includes("private"));
  const after = await diagnosticsLog();
  assert.equal(after.pending_events, 100);
  assert.equal(
    "transport_error" in after && after.transport_error,
    "unavailable",
  );
  assert.deepEqual(storage.state, {
    queue: [{ id: "business-write", payload: "private" }],
  });
  const now = Date.now;
  Date.now = () => now() + 31000;
  globalThis.fetch = async () => new Response(JSON.stringify({ accepted: 25 }));
  try {
    await flushEvents({ baseUrl: "http://localhost", apiKey: "secret" });
  } finally {
    globalThis.fetch = original;
    Date.now = now;
  }
  const accepted = await diagnosticsLog();
  assert.equal(accepted.pending_events, 75);
  assert.equal(accepted.recent.length, 100);
  assert.equal(
    "transport_error" in accepted && accepted.transport_error,
    undefined,
  );
  assert.equal(
    "client_id" in accepted && accepted.client_id,
    "client_id" in before && before.client_id,
  );
});

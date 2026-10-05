import { z } from "zod";
export const jobEventSchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime(),
  trace_id: z.uuid(),
  name: z.enum([
    "worker_started",
    "scan_finished",
    "scan_failed",
    "sync_succeeded",
    "sync_failed",
    "site_mode",
    "destination_saved",
  ]),
  source: z
    .enum(["jobright", "handshake", "linkedin", "symplicity", "other"])
    .optional(),
  mode: z.enum(["auto", "manual", "paused"]).optional(),
  operation: z.enum(["job", "capture", "application"]).optional(),
  found: z.number().int().min(0).max(200).optional(),
  queued: z.number().int().min(0).max(200).optional(),
  skipped: z.number().int().min(0).max(200).optional(),
  queue_depth: z.number().int().min(0).max(100000).optional(),
  duration_ms: z.number().int().min(0).max(300000).optional(),
  http_status: z.number().int().min(100).max(599).optional(),
  error_code: z
    .enum([
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
    ])
    .optional(),
});
export const clientEventsSchema = z.strictObject({
  client_id: z.uuid(),
  client_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  events: z.array(jobEventSchema).min(1).max(25),
  dropped: z.number().int().nonnegative().max(1000000).optional(),
});

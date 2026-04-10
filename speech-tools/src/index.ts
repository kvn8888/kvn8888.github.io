/**
 * index.ts — Express server entry point for the speech-tools Render service.
 *
 * Routes:
 *   GET  /health      — health check (used by Render and upstream callers)
 *   POST /diarize     — accepts audio upload, streams SSE diarization results
 *
 * SSE (Server-Sent Events) is used instead of WebSockets because:
 * - SSE is one-way (server → client), which is exactly what we need
 * - Works with fetch() / EventSource natively in the browser
 * - HTTP/1.1 compatible — no upgrade handshake required
 * - Simpler to implement: just write `data: ...\n\n` to the response stream
 *
 * The caller (Next.js Speech Lab) should open an EventSource to /diarize
 * and listen for the event types defined in types.ts.
 */

import express, { Request, Response } from "express";
import multer from "multer";
import { runDiarize } from "./diarize.js";
import type { SseEvent } from "./types.js";
import { logger } from "./logger.js";

const app = express();
// multer stores uploaded files in memory as Buffers — no temp disk writes for the raw upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB max

const PORT = parseInt(process.env.PORT ?? "8080", 10);

// ---------------------------------------------------------------------------
// Health check — Render pings this to confirm the service is alive
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "speech-tools" });
});

// ---------------------------------------------------------------------------
// POST /diarize — upload an audio file, receive SSE stream of results
//
// Request (multipart/form-data):
//   audio       (file)   — required, any format ffmpeg supports
//   max_workers (string) — optional, default "10"
//
// Response: text/event-stream
//   Each event is JSON-encoded and follows the SseEvent discriminated union
//   (see types.ts). Listen for: started, chunk_start, chunk_done, complete, error
// ---------------------------------------------------------------------------
app.post("/diarize", upload.single("audio"), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No audio file provided. Send as multipart field 'audio'." });
    return;
  }

  const maxWorkers = Math.min(20, Math.max(1, parseInt(req.body?.max_workers ?? "10", 10)));
  const reqLog = logger.child({ file: req.file.originalname, sizeBytes: req.file.size, maxWorkers });
  reqLog.info("diarize request received");
  const reqStart = Date.now();

  // Configure SSE response headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Allow cross-origin requests from the Next.js app
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Helper to write a typed SSE event to the response
  const send = (event: SseEvent): void => {
    // SSE format: "data: <json>\n\n"
    // We include the event type in the data payload (not as "event: <name>")
    // so that fetch-based pollers can parse it without EventSource
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runDiarize(req.file.buffer, req.file.originalname, maxWorkers, send);
    reqLog.info({ durationMs: Date.now() - reqStart }, "diarize complete");
  } catch (err) {
    // Catch-all for unexpected errors — surface them as a final SSE event
    reqLog.error({ err: String(err), durationMs: Date.now() - reqStart }, "diarize error");
    send({ type: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.info({
    port: PORT,
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "(not set)",
    diarizeDeployment: process.env.AZURE_OPENAI_DIARIZE_DEPLOYMENT ?? "gpt-4o-transcribe-diarize",
    axiomEnabled: !!(process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET),
  }, "speech-tools started");
});

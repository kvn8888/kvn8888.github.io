/**
 * transcribe.ts — Handles batch and streaming transcription for non-diarize models.
 *
 * SUPPORTED MODELS:
 *   voxtral-mini-transcribe-2507, voxtral-mini-latest   → Mistral /v1/audio/transcriptions (batch)
 *   gpt-4o-transcribe, gpt-4o-mini-transcribe           → Azure transcriptions with stream=true (SSE)
 *
 * SSE EVENT FORMAT (same for all models — simpler than diarize events):
 *   { type: "delta", text: "Hello" }               — incremental token (Azure streaming only)
 *   { type: "done", text: "Hello world", segments? }— final transcript + optional word segments
 *   { type: "error", message: "..." }               — failure
 *
 * FOR VOXTRAL (batch):
 *   Mistral's transcription API returns the full text in one shot.
 *   We emit a single "done" event. No deltas. Same UX as today on Vercel.
 *
 * FOR AZURE GPT-4O-TRANSCRIBE (streaming):
 *   Azure accepts stream=true on the transcription endpoint.
 *   The model processes the full audio first, then streams tokens as SSE.
 *   We translate Azure's transcript.text.delta events into our "delta" format.
 *   First token arrives after ~5-30s of model processing. Then text streams word by word.
 */

import { readFileSync } from "node:fs";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { SseEvent, SimpleSegment } from "./types.js";
import { makeTempDir, writeSourceFile, getAudioDuration, splitOneChunkAsync, CHUNK_DURATION_SEC } from "./audio.js";
import { Semaphore } from "./semaphore.js";
import { logger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Model routing helpers
// ─────────────────────────────────────────────────────────────────────────────

const VOXTRAL_MODELS = new Set([
  "voxtral-mini-transcribe-2507",
  "voxtral-mini-latest",
]);

const AZURE_TRANSCRIBE_MODELS = new Set([
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
]);

export function isSupportedTranscribeModel(model: string): boolean {
  return VOXTRAL_MODELS.has(model) || AZURE_TRANSCRIBE_MODELS.has(model);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mistral Voxtral — batch transcription
// ─────────────────────────────────────────────────────────────────────────────

async function transcribeVoxtral(
  filePath: string,
  model: string,
  send: (e: SseEvent) => void
): Promise<void> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  const url = "https://api.mistral.ai/v1/audio/transcriptions";
  const fileBuffer = readFileSync(filePath);

  const formData = new FormData();
  // The Blob type (audio/*) is a hint — Mistral auto-detects the actual format
  formData.append(
    "file",
    new Blob([fileBuffer], { type: "audio/*" }),
    path.basename(filePath)
  );
  formData.append("model", model);

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Mistral API error ${resp.status}: ${errBody}`);
  }

  // Mistral returns { text: string, segments?: [{start, end, text}] } (Whisper-compatible format)
  const data = (await resp.json()) as {
    text: string;
    segments?: SimpleSegment[];
  };

  send({ type: "done", text: data.text, segments: data.segments });
}

// ─────────────────────────────────────────────────────────────────────────────
// Azure gpt-4o-transcribe — streaming transcription
// ─────────────────────────────────────────────────────────────────────────────

async function transcribeAzure(
  filePath: string,
  model: string,
  send: (e: SseEvent) => void
): Promise<void> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview";

  // Allow overriding deployment name via env, fallback to the model identifier
  const deployment =
    (model === "gpt-4o-mini-transcribe"
      ? process.env.AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_MINI_TRANSCRIBE
      : process.env.AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE) || model;

  if (!apiKey || !endpoint) {
    throw new Error("AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT is not set");
  }

  const url =
    `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
    `/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`;

  const fileBuffer = readFileSync(filePath);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileBuffer]),
    path.basename(filePath)
  );
  formData.append("response_format", "text"); // text + stream=true gives clean delta events
  formData.append("stream", "true"); // Enable SSE streaming from Azure

  const azureRes = await fetch(url, {
    method: "POST",
    headers: { "api-key": apiKey },
    body: formData,
  });

  if (!azureRes.ok || !azureRes.body) {
    const errBody = await azureRes.text().catch(() => "");
    throw new Error(`Azure transcription error ${azureRes.status}: ${errBody}`);
  }

  // Parse the Azure SSE stream.
  // Azure emits:
  //   data: {"type":"transcript.text.delta","delta":"Hello"}
  //   data: {"type":"transcript.text.done","text":"Hello world"}
  //   data: [DONE]
  const reader = azureRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      try {
        const event = JSON.parse(raw) as {
          type: string;
          delta?: string;
          text?: string;
        };

        if (event.type === "transcript.text.delta" && event.delta) {
          // Forward incremental token to caller
          send({ type: "delta", text: event.delta });
          finalText += event.delta;
        } else if (event.type === "transcript.text.done" && event.text) {
          // Azure confirms the final authoritative text
          finalText = event.text;
        }
      } catch {
        // Ignore non-JSON lines (Azure may emit event: type headers)
      }
    }
  }

  // Emit the authoritative done event. No word segments in streaming mode.
  send({ type: "done", text: finalText });
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel entry point — split large files into chunks, process in parallel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Files above this threshold are split into chunks and transcribed in parallel.
 * Smaller files are sent as a single request (Azure streaming delta or Voxtral batch).
 * 20 MB covers files that would exceed Azure's 25 MB single-file limit at typical bitrates.
 */
const PARALLEL_THRESHOLD_BYTES = 20 * 1024 * 1024;

/** Max concurrent transcription calls per request */
const DEFAULT_MAX_WORKERS = 10;

/** Stagger is no longer needed — the split pipeline provides natural ~2.6s-per-chunk stagger */

async function runTranscribeParallel(
  buffer: Buffer,
  filename: string,
  model: string,
  maxWorkers: number,
  send: (e: SseEvent) => void
): Promise<void> {
  const workDir = makeTempDir();

  try {
    const chunkDurationSec = AZURE_TRANSCRIBE_MODELS.has(model)
      ? 300   // 5 minutes — stays under Azure's 25 MB per-file limit at 32kbps
      : CHUNK_DURATION_SEC; // 10 minutes (Voxtral supports up to 1 GB per file)

    // Write source file once — splitOneChunkAsync reads from this path for each chunk
    const inputPath = writeSourceFile(buffer, filename, workDir);

    // Get total duration first (fast — ffprobe reads container metadata without decoding)
    // This lets us know nChunks and emit transcribe_started BEFORE any ffmpeg split begins
    const totalDurationSec = getAudioDuration(inputPath);
    const nChunks = Math.ceil(totalDurationSec / chunkDurationSec);

    logger.info({ model, file: filename, chunks: nChunks, totalDurationSec }, "parallel transcription started");
    send({ type: "transcribe_started", totalChunks: nChunks });

    const semaphore = new Semaphore(maxWorkers);
    let completedCount = 0;
    const results: Map<number, string> = new Map();
    const workerPromises: Promise<void>[] = [];

    // Pipeline: split chunk i → immediately launch its transcription worker.
    // The sequential await on each split means chunk 1 doesn't start splitting
    // until chunk 0's split is done — but transcription workers for completed
    // splits run freely in the background.  The ~2.6s per-chunk split time
    // naturally provides stagger so no explicit setTimeout delay is needed.
    for (let i = 0; i < nChunks; i++) {
      // Await the split (blocks this loop iteration only, not any running workers)
      const chunk = await splitOneChunkAsync(inputPath, i, chunkDurationSec, workDir);

      // Fire off transcription worker immediately (fire-and-forget into promise array)
      workerPromises.push(
        (async () => {
          await semaphore.acquire();
          const workerStart = Date.now();

          try {
            let text = "";

            // captureSend intercepts the inner transcription's SSE events:
            // - delta events (Azure streaming tokens) are forwarded to the outer stream
            //   as chunk_delta events tagged with this chunk's index, so the client can
            //   show live typing inside each chunk slot simultaneously
            // - done event records the authoritative final text for assembly
            const captureSend = (e: SseEvent) => {
              if (e.type === "done" && e.text) {
                text = e.text;
              } else if (e.type === "delta" && e.text) {
                text += e.text;
                send({ type: "chunk_delta", index: chunk.index, text: e.text });
              }
            };

            if (VOXTRAL_MODELS.has(model)) {
              await transcribeVoxtral(chunk.path, model, captureSend);
            } else {
              await transcribeAzure(chunk.path, model, captureSend);
            }

            completedCount++;
            results.set(chunk.index, text);
            send({
              type: "chunk_text_done",
              index: chunk.index,
              text,
              completed: completedCount,
              total: nChunks,
              durationMs: Date.now() - workerStart,
            });
            logger.info({ model, chunkIndex: chunk.index, completedCount, total: nChunks, durationMs: Date.now() - workerStart }, "chunk transcribed");
          } catch (err) {
            completedCount++;
            results.set(chunk.index, "");
            logger.error({ model, chunkIndex: chunk.index, err: String(err) }, "chunk transcription error");
            send({
              type: "chunk_text_done",
              index: chunk.index,
              text: "",
              completed: completedCount,
              total: nChunks,
              durationMs: Date.now() - workerStart,
            });
          } finally {
            semaphore.release();
          }
        })()
      );
    }

    await Promise.all(workerPromises);

    // Assemble final transcript in chunk order (not completion order)
    const assembled = Array.from({ length: nChunks }, (_, i) => results.get(i) ?? "")
      .join(" ")
      .trim();

    send({ type: "done", text: assembled });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — auto-selects parallel vs single based on file size + duration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe a pre-recorded audio file using the specified model.
 *
 * For files ≤ 20 MB AND ≤ 1500s (Azure): single-shot transcription.
 * For files > 20 MB OR > 1500s (Azure only): automatic parallel chunking.
 * Voxtral supports up to 1 GB per file so only the size threshold applies.
 *
 * @param buffer     Raw audio file bytes (from multer memory storage)
 * @param filename   Original filename (for content-type hints)
 * @param model      Model identifier: voxtral-mini-latest, gpt-4o-transcribe, etc.
 * @param send       Callback invoked for each SSE event to emit to the client
 * @param maxWorkers Max parallel API calls for large-file chunked mode (default 10)
 */
export async function runTranscribe(
  buffer: Buffer,
  filename: string,
  model: string,
  send: (e: SseEvent) => void,
  maxWorkers = DEFAULT_MAX_WORKERS
): Promise<void> {
  if (!isSupportedTranscribeModel(model)) {
    throw new Error(`Unsupported model: ${model}`);
  }

  const start = Date.now();
  const isBigFile = buffer.byteLength > PARALLEL_THRESHOLD_BYTES;

  // Azure gpt-4o-transcribe has a hard 1500-second (~25 min) duration limit per request.
  // A file can be small in bytes (e.g., 16 MB at 64kbps) but still be 34 minutes long —
  // well past Azure's limit. We probe duration BEFORE sending to catch this case.
  // Voxtral supports up to 1 GB / unlimited duration so this check only applies to Azure.
  const AZURE_MAX_SINGLE_DURATION_SEC = 1500;
  const isAzureModel = AZURE_TRANSCRIBE_MODELS.has(model);

  let useParallel = isBigFile;

  if (!useParallel && isAzureModel) {
    // Quick ffprobe pass — reads the container's metadata header, no decode
    const probDir = makeTempDir();
    const probPath = path.join(probDir, filename);
    try {
      writeFileSync(probPath, buffer);
      const durationSec = getAudioDuration(probPath);
      if (durationSec > AZURE_MAX_SINGLE_DURATION_SEC) {
        logger.info(
          { model, file: filename, durationSec, limit: AZURE_MAX_SINGLE_DURATION_SEC },
          "file exceeds Azure duration limit — upgrading to parallel"
        );
        useParallel = true;
      }
    } catch {
      // Can't determine duration — safer to use parallel and avoid a 400 from Azure
      logger.warn({ model, file: filename }, "could not probe duration, forcing parallel");
      useParallel = true;
    } finally {
      rmSync(probDir, { recursive: true, force: true });
    }
  }

  logger.info({ model, file: filename, sizeBytes: buffer.byteLength, parallel: useParallel }, "runTranscribe");

  if (useParallel) {
    await runTranscribeParallel(buffer, filename, model, maxWorkers, send);
  } else {
    // Small file — single request (Azure streams delta events, Voxtral returns one done)
    const workDir = makeTempDir();
    const filePath = path.join(workDir, filename);
    try {
      writeFileSync(filePath, buffer);
      if (VOXTRAL_MODELS.has(model)) {
        await transcribeVoxtral(filePath, model, send);
      } else {
        await transcribeAzure(filePath, model, send);
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  logger.info({ model, durationMs: Date.now() - start }, "runTranscribe complete");
}



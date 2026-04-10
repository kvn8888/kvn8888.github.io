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
import path from "node:path";
import type { SseEvent, SimpleSegment } from "./types.js";
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
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe a pre-recorded audio file using the specified model.
 *
 * @param buffer   Raw audio file bytes (from multer memory storage)
 * @param filename Original filename (for content-type hints)
 * @param model    Model identifier: voxtral-mini-latest, gpt-4o-transcribe, etc.
 * @param send     Callback invoked for each SSE event to emit to the client
 */
export async function runTranscribe(
  buffer: Buffer,
  filename: string,
  model: string,
  send: (e: SseEvent) => void
): Promise<void> {
  const { makeTempDir } = await import("./audio.js");
  const { writeFileSync, rmSync } = await import("node:fs");

  const workDir = await makeTempDir();
  const filePath = path.join(workDir, filename);

  try {
    writeFileSync(filePath, buffer);
    const start = Date.now();

    if (VOXTRAL_MODELS.has(model)) {
      logger.info({ model, file: filename, sizeBytes: buffer.byteLength }, "starting voxtral transcription");
      await transcribeVoxtral(filePath, model, send);
    } else if (AZURE_TRANSCRIBE_MODELS.has(model)) {
      logger.info({ model, file: filename, sizeBytes: buffer.byteLength }, "starting azure transcription");
      await transcribeAzure(filePath, model, send);
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }

    logger.info({ model, durationMs: Date.now() - start }, "transcription complete");
  } finally {
    // Always clean up the temp file even if transcription failed
    rmSync(workDir, { recursive: true, force: true });
  }
}

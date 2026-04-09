/**
 * azure.ts — Azure OpenAI gpt-4o-transcribe-diarize API caller.
 *
 * KEY LEARNINGS (the hard way):
 * 1. Do NOT use the OpenAI SDK for this endpoint. The SDK's `extra_body`
 *    field is silently ignored for multipart/form-data requests, so
 *    `chunking_strategy` never reaches Azure.
 * 2. Azure rejects `chunking_strategy: "auto"`. Must use `{"type":"server_vad"}`.
 *    This contradicts the official OpenAI docs.
 * 3. Model has a per-chunk duration limit (the full 84-min file always fails).
 *    Split to ≤10-minute chunks before sending.
 * 4. `chunking_strategy` must be JSON-stringified as a form field value,
 *    not passed as a nested object — fetch's FormData doesn't nest JSON.
 *
 * API shape (diarized_json):
 *   { "segments": [{ "speaker": "A", "text": "...", "start": 0.0, "end": 2.5 }] }
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { AudioChunk, DiarizedSegment } from "./types.js";

/** How long to wait for a single chunk response. 5 minutes is generous. */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/** Max retry attempts per chunk (with exponential backoff) */
const MAX_RETRIES = 3;

/** Azure OpenAI config — read from environment on startup */
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY ?? "";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview";
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DIARIZE_DEPLOYMENT ?? "gpt-4o-transcribe-diarize";

if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
  console.warn("[azure] WARNING: AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY not set");
}

/**
 * Transcribe one audio chunk and return its speaker-labeled segments.
 * Applies exponential backoff on rate-limit (429) or server errors (5xx).
 *
 * @param chunk    AudioChunk with path and offsetSec
 * @returns Array of segments with start/end ALREADY adjusted by offsetSec
 */
export async function transcribeChunk(chunk: AudioChunk): Promise<DiarizedSegment[]> {
  const url =
    `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}` +
    `/audio/transcriptions?api-version=${AZURE_API_VERSION}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Exponential backoff: 0s, 2s, 4s (only applied after the FIRST failure)
    if (attempt > 0) {
      const waitMs = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Build the multipart form data.
    // IMPORTANT: chunking_strategy must be JSON.stringify'd — it's a form
    // field value (string), not a nested JSON object in the form.
    const formData = new FormData();
    const audioBytes = readFileSync(chunk.path);
    formData.append(
      "file",
      new Blob([audioBytes], { type: "audio/mpeg" }),
      path.basename(chunk.path)
    );
    formData.append("response_format", "diarized_json");
    formData.append("chunking_strategy", JSON.stringify({ type: "server_vad" }));

    // AbortController gives us a timeout on the fetch call
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        // DO NOT set Content-Type header — fetch sets boundary automatically for FormData
        headers: { "api-key": AZURE_API_KEY },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // AbortError means timeout; any other fetch error (network, DNS) → retry
      const isTimeout = err instanceof Error && err.name === "AbortError";
      console.error(`[chunk ${chunk.index}] fetch error (attempt ${attempt + 1}): ${err}`);
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`chunk ${chunk.index} failed after ${MAX_RETRIES} attempts: ${err}`);
      }
      continue;
    }

    clearTimeout(timer);

    // 429 or 5xx → retry
    if (resp.status === 429 || resp.status >= 500) {
      const body = await resp.text();
      console.warn(`[chunk ${chunk.index}] HTTP ${resp.status} (attempt ${attempt + 1}): ${body}`);
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`chunk ${chunk.index} HTTP ${resp.status} after ${MAX_RETRIES} attempts`);
      }
      continue;
    }

    if (!resp.ok) {
      const body = await resp.text();
      // 4xx (other than 429) — not worth retrying
      throw new Error(`chunk ${chunk.index} HTTP ${resp.status}: ${body}`);
    }

    // Parse the diarized_json response
    const data = (await resp.json()) as { segments?: RawSegment[] };
    const rawSegments = data.segments ?? [];

    // Apply the time offset so start/end are absolute within the full recording
    return rawSegments.map((s) => ({
      speaker: s.speaker ?? "?",
      text: s.text ?? "",
      start: (s.start ?? 0) + chunk.offsetSec,
      end: (s.end ?? 0) + chunk.offsetSec,
    }));
  }

  // TypeScript requires a return here, but the loop always throws or returns
  throw new Error(`chunk ${chunk.index} exhausted retries`);
}

/** Raw segment shape from the Azure API (before offset adjustment) */
interface RawSegment {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
}

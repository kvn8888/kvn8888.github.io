/**
 * diarize.ts — Parallel diarization coordinator.
 *
 * Orchestrates the full pipeline:
 *   1. Split uploaded audio into 10-min chunks
 *   2. Send all chunks to Azure in parallel (limited concurrency)
 *   3. Stream SSE events back to the caller as each chunk completes
 *   4. Merge all segments, sort by absolute timestamp, emit "complete"
 *
 * CONCURRENCY PATTERN:
 * JavaScript doesn't have ThreadPoolExecutor, but we can simulate it with
 * Promise.all and a semaphore (a counting variable that limits how many
 * concurrent fetches are in-flight). Each task acquires the semaphore
 * before starting and releases it when done. Tasks that can't acquire
 * wait on a queue of resolve callbacks.
 *
 * WHY 10 WORKERS BY DEFAULT:
 * Azure handled 9 simultaneous 10-min chunks with no rate-limit errors.
 * With 10 workers (more than our typical chunk count), all chunks start
 * almost immediately and the wall-clock time approaches a single chunk's
 * latency (~2.5 min for an 84-min file).
 */

import type { AudioChunk, ChunkResult, DiarizedSegment, SseEvent } from "./types.js";
import { splitIntoChunks, makeTempDir } from "./audio.js";
import { transcribeChunk } from "./azure.js";
import { Semaphore } from "./semaphore.js";

/** Default: allow 10 concurrent Azure calls */
const DEFAULT_MAX_WORKERS = 10;

/** Stagger: start workers 1.5s apart to soften burst impact */
const STAGGER_MS = 1500;

/**
 * Full diarization pipeline for one request.
 * Splits audio, runs chunks in parallel, streams progress via `send`.
 *
 * @param audioBuffer  Raw audio bytes from the multipart upload
 * @param filename     Original filename (for file extension detection)
 * @param maxWorkers   Max concurrent Azure calls (default 10)
 * @param send         SSE emitter function — call this to push real-time events
 */
export async function runDiarize(
  audioBuffer: Buffer,
  filename: string,
  maxWorkers: number = DEFAULT_MAX_WORKERS,
  send: (event: SseEvent) => void
): Promise<void> {
  const startMs = Date.now();
  const workDir = makeTempDir();

  // Step 1: Split audio into chunks using ffmpeg
  // This is fast (~10s for 9 chunks) and happens synchronously before we start workers
  let chunks: AudioChunk[];
  let totalDurationSec: number;
  try {
    ({ chunks, totalDurationSec } = splitIntoChunks(audioBuffer, filename, workDir));
  } catch (err) {
    send({ type: "error", message: `Audio splitting failed: ${err}` });
    return;
  }

  // Announce how many chunks we'll process (with the real duration from ffprobe)
  send({ type: "started", totalChunks: chunks.length, durationSec: totalDurationSec });

  // Step 2: Process all chunks in parallel with limited concurrency
  const semaphore = new Semaphore(maxWorkers);
  const results: ChunkResult[] = new Array(chunks.length);
  let completedCount = 0;

  await Promise.all(
    chunks.map(async (chunk) => {
      // Stagger: chunk 0 starts immediately, chunk 1 waits 1.5s, etc.
      // This softens the burst when all workers start at once.
      await new Promise((r) => setTimeout(r, chunk.index * STAGGER_MS));

      // Acquire a concurrency slot (blocks if at max workers)
      await semaphore.acquire();

      send({ type: "chunk_start", index: chunk.index, offsetSec: chunk.offsetSec });
      const chunkStart = Date.now();

      try {
        const segments = await transcribeChunk(chunk);
        const durationMs = Date.now() - chunkStart;
        completedCount++;

        results[chunk.index] = { index: chunk.index, segments, durationMs, error: null };

        send({
          type: "chunk_done",
          index: chunk.index,
          segmentCount: segments.length,
          completed: completedCount,
          total: chunks.length,
          durationMs,
          segments, // Include the actual segments so callers can stream partial results
        });
      } catch (err) {
        const durationMs = Date.now() - chunkStart;
        const errMsg = String(err);
        results[chunk.index] = { index: chunk.index, segments: [], durationMs, error: errMsg };
        completedCount++;

        send({
          type: "chunk_error",
          index: chunk.index,
          error: errMsg,
          willRetry: false, // retries happen inside transcribeChunk, so if we're here, we've exhausted them
        });
      } finally {
        // Always release the slot so the next waiter can proceed
        semaphore.release();
      }
    })
  );

  // Step 3: Merge all segments and sort by absolute start time
  const allSegments: DiarizedSegment[] = results
    .filter((r) => r != null) // guard against any gaps
    .flatMap((r) => r.segments)
    .sort((a, b) => a.start - b.start);

  // Collect unique speaker labels for the summary
  const uniqueSpeakers = [...new Set(allSegments.map((s) => s.speaker))].sort();

  const totalMs = Date.now() - startMs;
  send({
    type: "complete",
    segments: allSegments,
    totalSegments: allSegments.length,
    uniqueSpeakers,
    totalMs,
  });
}

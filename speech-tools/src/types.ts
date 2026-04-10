/**
 * types.ts — Shared TypeScript types for the speech-tools service.
 * Keeping types separate from logic makes it easy to share them with callers.
 */

/** A single speaker-labeled segment returned by Azure diarization */
export interface DiarizedSegment {
  /** Speaker label local to this chunk — "A", "B", etc. */
  speaker: string;
  /** Segment text (may be truncated in SSE previews) */
  text: string;
  /** Absolute start time in seconds (offset already applied) */
  start: number;
  /** Absolute end time in seconds (offset already applied) */
  end: number;
}

/** One audio chunk: file path on disk + its start time in the full recording */
export interface AudioChunk {
  /** Absolute path to the temp mp3 file for this chunk */
  path: string;
  /** Offset in seconds from the start of the full recording */
  offsetSec: number;
  /** Index of this chunk (0-based), used for logging */
  index: number;
}

/** Result returned after processing one chunk */
export interface ChunkResult {
  index: number;
  segments: DiarizedSegment[];
  /** How long the Azure API call took in milliseconds */
  durationMs: number;
  /** null if successful, error message string if it failed */
  error: string | null;
}

/** SSE event shapes emitted as diarization progresses */
export type SseEvent =
  | { type: "started"; totalChunks: number; durationSec: number }
  | { type: "chunk_start"; index: number; offsetSec: number }
  | { type: "chunk_done"; index: number; segmentCount: number; completed: number; total: number; durationMs: number; segments: DiarizedSegment[] }
  | { type: "chunk_error"; index: number; error: string; willRetry: boolean }
  | { type: "complete"; segments: DiarizedSegment[]; totalSegments: number; uniqueSpeakers: string[]; totalMs: number }
  | { type: "error"; message: string };

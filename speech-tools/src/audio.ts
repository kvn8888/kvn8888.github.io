/**
 * audio.ts — ffmpeg helpers for splitting audio into chunks.
 *
 * Why ffmpeg? It's the universal audio processing tool: converts formats,
 * extracts duration, and slices without re-encoding the entire file.
 * By running ffmpeg as a child process, we avoid heavy native bindings.
 *
 * IMPORTANT: ffmpeg must be installed in the Docker container (see Dockerfile).
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AudioChunk } from "./types.js";

/** Default chunk size: 10 minutes (same as the Python script) */
export const CHUNK_DURATION_SEC = 600;

/**
 * Get the duration of an audio file in seconds using ffprobe.
 * ffprobe is bundled alongside ffmpeg and reads the container metadata
 * without decoding any audio.
 */
export function getAudioDuration(filePath: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr}`);
  }

  const secs = parseFloat(result.stdout.trim());
  if (isNaN(secs)) {
    throw new Error(`ffprobe returned non-numeric duration: ${result.stdout}`);
  }
  return secs;
}

/**
 * Split an audio buffer into 10-minute mp3 chunks.
 *
 * This writes the input buffer to a temp file, then calls ffmpeg once per
 * chunk with -ss (start) and -t (duration) to extract the segment.
 * Extraction is lossy (m4a/mp3 → mp3), but at 32kbps mono, the quality is
 * more than sufficient for ASR — and the files stay well under 3MB each.
 *
 * @param audioBuffer  Raw bytes of the uploaded audio file
 * @param originalName Filename hint for file extension (e.g. "recording.m4a")
 * @param workDir      Temp directory to write chunks into
 * @returns Object with chunks array and totalDurationSec
 */
export function splitIntoChunks(
  audioBuffer: Buffer,
  originalName: string,
  workDir: string
): { chunks: AudioChunk[]; totalDurationSec: number } {
  // Write the uploaded buffer to disk so ffmpeg can read it
  const ext = path.extname(originalName) || ".m4a";
  const inputPath = path.join(workDir, `source${ext}`);
  writeFileSync(inputPath, audioBuffer);

  // Determine the total duration so we know how many chunks to make
  const totalSec = getAudioDuration(inputPath);
  const nChunks = Math.ceil(totalSec / CHUNK_DURATION_SEC);

  const chunks: AudioChunk[] = [];

  for (let i = 0; i < nChunks; i++) {
    const startSec = i * CHUNK_DURATION_SEC;
    const chunkPath = path.join(workDir, `chunk_${String(i).padStart(3, "0")}.mp3`);

    // ffmpeg args:
    //   -ss <start>   : seek to start position (fast seek, placed before -i)
    //   -i <input>    : input file
    //   -t <duration> : extract at most this many seconds
    //   -ac 1         : mono (halves file size, fine for ASR)
    //   -ar 16000     : 16kHz sample rate (Azure diarize is comfortable here)
    //   -b:a 32k      : 32kbps bitrate → ~2.3MB per 10-min chunk
    //   -y            : overwrite if already exists
    const result = spawnSync(
      "ffmpeg",
      [
        "-ss", String(startSec),
        "-i", inputPath,
        "-t", String(CHUNK_DURATION_SEC),
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "32k",
        "-y",
        chunkPath,
      ],
      { encoding: "utf8" }
    );

    if (result.status !== 0) {
      throw new Error(`ffmpeg chunk ${i} failed: ${result.stderr}`);
    }

    chunks.push({ path: chunkPath, offsetSec: startSec, index: i });
  }

  return { chunks, totalDurationSec: totalSec };
}

/**
 * Create a temporary working directory for this request.
 * Named by timestamp so concurrent requests don't collide.
 */
export function makeTempDir(): string {
  const dir = path.join(tmpdir(), `speech-tools-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

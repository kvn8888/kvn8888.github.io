/**
 * audio.ts — ffmpeg helpers for splitting audio into chunks.
 *
 * Why ffmpeg? It's the universal audio processing tool: converts formats,
 * extracts duration, and slices without re-encoding the entire file.
 * By running ffmpeg as a child process, we avoid heavy native bindings.
 *
 * IMPORTANT: ffmpeg must be installed in the Docker container (see Dockerfile).
 */

import { execSync, spawnSync, spawn } from "node:child_process";
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
  // First try: read duration from the container's format header (instant)
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

  if (result.status === 0) {
    const secs = parseFloat(result.stdout.trim());
    if (!isNaN(secs) && secs > 0) return secs;
  }

  // Fallback: WebM from browser MediaRecorder often lacks duration metadata.
  // Force ffprobe to scan packets (slower, but handles headerless containers).
  const fallback = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      "-analyzeduration", "2147483647",
      "-probesize", "2147483647",
      filePath,
    ],
    { encoding: "utf8" }
  );

  if (fallback.status === 0) {
    const secs = parseFloat(fallback.stdout.trim());
    if (!isNaN(secs) && secs > 0) return secs;
  }

  throw new Error(`ffprobe returned non-numeric duration: ${result.stdout?.trim() ?? "N/A"}`);
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
  workDir: string,
  chunkDurationSec: number = CHUNK_DURATION_SEC
): { chunks: AudioChunk[]; totalDurationSec: number } {
  // Write the uploaded buffer to disk so ffmpeg can read it
  const ext = path.extname(originalName) || ".m4a";
  const inputPath = path.join(workDir, `source${ext}`);
  writeFileSync(inputPath, audioBuffer);

  // Determine the total duration so we know how many chunks to make
  const totalSec = getAudioDuration(inputPath);
  const nChunks = Math.ceil(totalSec / chunkDurationSec);

  const chunks: AudioChunk[] = [];

  for (let i = 0; i < nChunks; i++) {
    const startSec = i * chunkDurationSec;
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
        "-t", String(chunkDurationSec),
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

/**
 * Write an audio buffer to a stable source file in the work directory.
 * Returns the absolute path, which can be passed to ffprobe/ffmpeg.
 */
export function writeSourceFile(buffer: Buffer, originalName: string, workDir: string): string {
  const ext = path.extname(originalName) || ".m4a";
  const inputPath = path.join(workDir, `source${ext}`);
  writeFileSync(inputPath, buffer);
  return inputPath;
}

/**
 * Async variant of the chunk split — runs a single ffmpeg call without blocking the event loop.
 *
 * Why async? The synchronous `splitIntoChunks` runs ALL ffmpeg calls sequentially before
 * any transcription worker can start. By splitting one chunk at a time asynchronously, the
 * caller (runTranscribeParallel) can start transcribing chunk 0 while chunk 1 is still
 * being split, giving a "pipelined" effect.
 *
 * The ~2.6s per-chunk split time naturally staggers transcription workers — no need for
 * an explicit setTimeout stagger.
 *
 * Copy-mode optimization: if the input is m4a/mp4, ffmpeg can COPY the compressed AAC
 * stream directly into a new m4a container — no decode+encode pass. This drops per-chunk
 * time from ~2.6s to ~0.05s. Both Azure and Voxtral accept m4a natively, so no quality
 * or compatibility tradeoff. Other formats fall back to the standard mp3 re-encode path.
 *
 * @param inputPath       Absolute path to the source audio file written by writeSourceFile
 * @param chunkIndex      0-based index of this chunk
 * @param chunkDurationSec Max seconds extracted per chunk
 * @param workDir         Directory where the chunk will be written
 * @returns Resolved AudioChunk once ffmpeg completes
 */
export function splitOneChunkAsync(
  inputPath: string,
  chunkIndex: number,
  chunkDurationSec: number,
  workDir: string
): Promise<AudioChunk> {
  const startSec = chunkIndex * chunkDurationSec;

  // Use copy mode for m4a/mp4 — avoids decode+encode, near-instant I/O speed.
  // Both Azure gpt-4o-transcribe and Mistral Voxtral accept m4a natively.
  const inputExt = path.extname(inputPath).toLowerCase();
  const useCopyMode = inputExt === ".m4a" || inputExt === ".mp4";
  const chunkExt = useCopyMode ? ".m4a" : ".mp3";
  const chunkPath = path.join(workDir, `chunk_${String(chunkIndex).padStart(3, "0")}${chunkExt}`);

  // Build ffmpeg args based on mode:
  //   copy mode  : -c:a copy  — splice compressed AAC frames, output m4a (no re-encode)
  //   re-encode  : -ac 1 -ar 16000 -b:a 32k — mono 16kHz 32kbps mp3 (standard ASR format)
  const codecArgs = useCopyMode
    ? ["-c:a", "copy"]
    : ["-ac", "1", "-ar", "16000", "-b:a", "32k"];

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-ss", String(startSec),
        "-i", inputPath,
        "-t", String(chunkDurationSec),
        ...codecArgs,
        "-y",
        chunkPath,
      ]
    );

    // We don't care about stdout/stderr for normal operation, but collect stderr for errors
    const errChunks: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => errChunks.push(d));

    proc.on("close", (code) => {
      if (code !== 0) {
        const errMsg = Buffer.concat(errChunks).toString().slice(-500);
        reject(new Error(`ffmpeg chunk ${chunkIndex} exited ${code}: ${errMsg}`));
      } else {
        resolve({ path: chunkPath, offsetSec: startSec, index: chunkIndex });
      }
    });

    proc.on("error", reject);
  });
}

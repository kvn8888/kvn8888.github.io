# From 52 Seconds of Spinner to 11 Seconds to First Word: Pipelining Speech Transcription

I built a multi-model speech transcription service backed by Azure OpenAI and Mistral's Voxtral. The architecture worked — chunks ran in parallel, tokens streamed live — but uploading a 40 MB file produced 44 seconds of silence before any text appeared. This session was about understanding why and eliminating it.

## The Starting Point

The transcription backend runs as a TypeScript/Express service on Render (Render is a cloud hosting platform, similar to Heroku). It accepts audio files via HTTP POST, splits them into chunks using ffmpeg (a command-line audio/video processor), then fires off parallel API calls to transcription providers.

Before this session the parallel path worked like this:

```
upload → [split all N chunks sequentially] → [transcribe all N chunks in parallel] → done
```

For a 40 MB, 84-minute lecture the split phase produced 17 chunks. That's where the 44-second wall came from.

I also integrated Axiom (a log analytics platform) to get structured, queryable logs instead of just `console.log` output. The Axiom data is what made the problem visible in the first place.

The original split function was synchronous — it ran 17 ffmpeg processes one after another via Node's `spawnSync`:

```typescript
// old audio.ts — sequential, blocking
for (let i = 0; i < nChunks; i++) {
  const result = spawnSync("ffmpeg", [
    "-ss", String(i * chunkDurationSec),
    "-i", inputPath,
    "-t", String(chunkDurationSec),
    "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-y", chunkPath,
  ]);
}
```

Each call took ~2.6 seconds. 17 × 2.6 = 44.2 seconds. Only *after* all chunks existed on disk did any transcription begin.

## Step 1: Add Observability to See the Problem Clearly

Before optimizing I needed data. I wrapped the server in `pino` (a structured JSON logger) and added `@axiomhq/pino` to ship logs to Axiom. Then I added specific log lines at phase boundaries:

```typescript
logger.info({ model, file: filename, chunks: 17, totalDurationSec: 84.5 }, 
  "parallel transcription started");
```

With Axiom I could query: *when does the request arrive vs when does transcription start?*

The results were damning:

| Timestamp | Event |
|-----------|-------|
| `01:45:49` | request received (39 MB) |
| `01:46:34` | **parallel transcription started** |
| `01:46:43` | chunk 0 transcribed |

44.7 seconds between upload and first API call. Every second of that was ffmpeg.

## Step 2: Async Single-Chunk Split (`splitOneChunkAsync`)

The fix required making splits async so they don't block the Node.js event loop while running. `spawnSync` (the synchronous version) blocks the entire process — no other promises can resolve while it runs. I replaced it with `spawn` (async) wrapped in a Promise:

```typescript
// new audio.ts — async single-chunk split
export function splitOneChunkAsync(
  inputPath: string,
  chunkIndex: number,
  chunkDurationSec: number,
  workDir: string
): Promise<AudioChunk> {
  const startSec = chunkIndex * chunkDurationSec;
  const chunkPath = path.join(workDir, `chunk_${String(chunkIndex).padStart(3, "0")}.mp3`);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-ss", String(startSec), "-i", inputPath,
      "-t", String(chunkDurationSec),
      "-ac", "1", "-ar", "16000", "-b:a", "32k", "-y", chunkPath,
    ]);
    proc.on("close", (code) =>
      code !== 0 ? reject(new Error(`ffmpeg chunk ${chunkIndex} failed`)) : resolve({ path: chunkPath, offsetSec: startSec, index: chunkIndex })
    );
    proc.on("error", reject);
  });
}
```

The key: this returns a Promise that resolves when *that specific chunk* finishes. Node.js can schedule other work (like processing incoming transcription responses) while ffmpeg runs in a child process.

I also added `writeSourceFile` to write the upload buffer to disk once so ffmpeg can read from a stable path, and `getAudioDuration` (exported from the same module) to probe total audio length without splitting anything.

## Step 3: The Pipeline Pattern

With async splits available, the new `runTranscribeParallel` became a producer-consumer pipeline:

```typescript
async function runTranscribeParallel(buffer, filename, model, maxWorkers, send) {
  const workDir = makeTempDir();

  // Write buffer to disk once — ffmpeg reads from here for every chunk
  const inputPath = writeSourceFile(buffer, filename, workDir);

  // Fast metadata read — no split needed to know total duration
  const totalSec = getAudioDuration(inputPath);
  const nChunks = Math.ceil(totalSec / chunkDurationSec);

  // Immediately tell the client how many chunks to expect
  send({ type: "transcribe_started", totalChunks: nChunks });

  const semaphore = new Semaphore(maxWorkers); // limits concurrent API calls
  const results = new Map<number, string>();
  const workerPromises: Promise<void>[] = [];

  for (let i = 0; i < nChunks; i++) {
    // Await ONLY this split — all previous transcription workers keep running
    const chunk = await splitOneChunkAsync(inputPath, i, chunkDurationSec, workDir);

    // Fire transcription immediately — fire-and-forget into promise array
    workerPromises.push((async () => {
      await semaphore.acquire();
      // ... transcribe chunk, emit chunk_delta tokens, store result ...
      semaphore.release();
    })());
  }

  await Promise.all(workerPromises);
  send({ type: "done", text: assembled });
}
```

The loop does one thing per iteration: wait for the split, then kick off the worker. The critical insight: `await splitOneChunkAsync(i)` only suspends the `for` loop itself. The transcription workers for chunks 0 through i-1 are running as concurrent Promise chains. Node.js context-switches between them while each ffmpeg child process runs in the OS.

This is a classic pipeline pattern — the producer (splits) and consumers (transcriptions) are decoupled. The ~2.6s per-chunk split time naturally staggers worker launches, so the old explicit `setTimeout(i * 1500ms)` stagger I had before could be deleted entirely.

## The Gotcha: Duplicate Function Surviving a Partial Replacement

During the refactor I tried to replace the old `runTranscribeParallel` function with the new pipelined version using `replace_string_in_file`. The replacement succeeded — but only partially. The new function was inserted, while the *old* function's body remained below it in the file as dead code. TypeScript then complained about duplicate constant declarations.

The symptom: `TS2552: Cannot find name 'AZURE_CHUNK_DURATION_SEC'` — even though I had just removed that constant from the new code. TypeScript found the old copy below.

The fix was to read the file, identify exactly where the old function ended (`} finally { rmSync... } }`), and manually delete the orphaned block with a second replace. Once gone, the compile was clean.

**Lesson**: When doing large in-place refactors with file-edit tools, verify the post-edit file shape before moving on. A grep for the function name would have caught the duplicate immediately.

## What the Numbers Now Look Like

For a 39 MB / 84-minute file (17 × 5-minute chunks, m4a input):

| Metric | Original (batch split) | After pipeline | After copy-mode |
|--------|------------------------|----------------|-----------------|
| First text on screen | ~52s | ~11s | ~3-4s |
| Total split time | ~44s | ~44s (pipelined) | ~0.85s |
| Total time | ~72s | ~28s | <15s |
| How it feels | "Is it broken?" | Chunks appear every ~3s | Near-instant start |

The copy-mode timing breaks down as: 0.05s (copy chunk 0) + 0.05s (copy chunk 1, concurrently transcribing) + ... The ffmpeg work is now purely I/O speed — just reading and copying the compressed AAC frames without touching the codec at all.

## Step 4: Copy-Mode Splitting for m4a

After the pipeline commit was pushed, a natural follow-up question arose: if ffmpeg is re-encoding 84 minutes of audio into 17 MP3 chunks, and both transcription APIs accept m4a natively — why are we re-encoding at all?

The answer was: we weren't thinking about it. The `splitIntoChunks` function was originally written to produce MP3 for a specific sample rate constraint, and copy-mode was never considered.

```typescript
// Before: decode AAC → encode MP3 at 32kbps mono 16kHz — ~2.6s per chunk
const codecArgs = ["-ac", "1", "-ar", "16000", "-b:a", "32k"];
// output: chunk_000.mp3

// After: detect m4a input, just splice the container
const useCopyMode = inputExt === ".m4a" || inputExt === ".mp4";
const codecArgs = useCopyMode ? ["-c:a", "copy"] : ["-ac", "1", "-ar", "16000", "-b:a", "32k"];
// output: chunk_000.m4a (if copy mode) or chunk_000.mp3 (fallback)
```

With `-c:a copy`, ffmpeg just reads the AAC frames from the m4a container and writes them into a new m4a container with a new start offset. There's no decode or encode pass. It runs at disk read/write speed — about 50-100× faster than real-time, compared to the ~25× real-time encode speed we had before.

The 17-chunk total split time drops from ~44s to ~0.85s. Combined with the pipeline, the theoretical first-content time for an 84-minute m4a file is now ~8.5s (0.05s copy + 8.5s transcribe chunk 0 via Azure).

**Caveat**: for other input formats (mp3, wav, webm), the re-encode path remains as fallback. Copy mode only works when input and output container are compatible.

## What's Next

- **Verify with Axiom** after Render redeploys — query `"parallel transcription started"` timestamp vs first `"chunk transcribed"` to confirm the actual improvement matches theory.
- **Diarization has the same problem** — the diarize path still uses `splitIntoChunks` (synchronous batch split). The same pipeline pattern applies there; I just haven't hit it yet because those files tend to be shorter.
- **ffmpeg copy-mode splitting** — for m4a input files, `-c:a copy` skips re-encoding and would drop per-chunk split time from ~2.6s to ~0.3s. Tricky to implement cleanly across formats but would be a 8-10× further improvement.
- **Progress feedback for small files** — the `transcribe_started` event gives chunk counts for large files, but sub-20 MB files just show "Transcribing…" with no progress. A simple server-sent "duration" event would unlock a client-side timer progress bar.

---

The 44-second wait wasn't a bug in the transcription — it was ffmpeg, 17 times in a row, with nothing running in parallel. Sometimes the biggest UX wins are just a matter of knowing where the stopwatch is actually ticking.

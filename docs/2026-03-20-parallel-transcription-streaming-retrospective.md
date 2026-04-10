# Parallel Transcription Streaming: From Single Requests to Multi-Chunk SSE Waterfalls

When you upload a 90-minute podcast to my speech lab, waiting for a single Azure or Mistral API call to return the full transcript — up to several minutes of silence — is a terrible experience. This session replaced that waiting room with a live waterfall: every 5-minute chunk of audio launches simultaneously, and tokens stream into the UI as each chunk finishes. Here's how that got built.

---

## The Starting Point

The Speech Lab already had a working parallel diarization pipeline. A large audio file would be split into 10-minute chunks by ffmpeg, each chunk sent to Azure's speaker-diarization endpoint in parallel (up to 10 concurrent calls), and the results would stream back as SSE events. It looked great visually: you'd see "Diarizing… 3/8 chunks" and the transcript would fill in live.

But for plain transcription (Voxtral and Azure gpt-4o-transcribe without diarization), the code path was entirely different: a single file, a single API call, a single response. For small files that was fine. For anything above 25MB — Azure's hard per-file limit — it would fail silently or time out.

The ask was simple: apply the same parallel-chunk pattern to transcription. Make parallelism the default. Show all chunks streaming at once.

---

## Step 1: Generalize `splitIntoChunks`

The ffmpeg splitting logic lived in `audio.ts` as `splitIntoChunks()`, hard-coded to 600-second (10-minute) chunks. That worked for diarization, but Azure's gpt-4o-transcribe has a stricter 25MB limit per file. At our ffmpeg settings (16kHz mono, 32kbps), 10 minutes produces about 23.5MB — dangerously close. Five minutes produces ~11.7MB — safe with margin.

The fix was a one-line API change:

```typescript
// Before: hard-coded constant
export function splitIntoChunks(buffer, filename, workDir): Result

// After: configurable, defaults to existing 600s behavior
export function splitIntoChunks(
  buffer, filename, workDir,
  chunkDurationSec: number = CHUNK_DURATION_SEC  // 600s default, 300s for Azure
): Result
```

The caller in `transcribe.ts` picks the right duration based on model:

```typescript
const chunkDurationSec = AZURE_TRANSCRIBE_MODELS.has(model)
  ? 300  // 5 min — stays under Azure's 25MB limit
  : 600; // 10 min — Voxtral supports up to 1GB, no issue
```

This is the kind of change that looks trivial in hindsight but requires knowing the constraints (Azure's limit, our ffmpeg bitrate, the relationship between the two) to get right the first time.

---

## Step 2: Extract the Shared Semaphore

The diarize pipeline had an inline `Semaphore` class — a classic concurrency primitive that lets you limit how many async operations run at once. Transcription needed the same thing. Rather than copy-paste, I extracted it:

```typescript
// speech-tools/src/semaphore.ts
export class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.available = limit;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    // No slots open — park this caller until release() wakes it
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // hand slot directly to the next waiter
    } else {
      this.available++;
    }
  }
}
```

The key insight: `release()` doesn't increment `available` if there's a waiter. It hands the slot directly. If you increment then let the next `acquire()` decrement, you get the same result — but this pattern avoids a race window where two callers might both see `available > 0` before either decrements.

`diarize.ts` was updated to import from `./semaphore.js` (note: `.js` extension in imports is required in ES module TypeScript — the compiled output will be `.js`).

---

## Step 3: `runTranscribeParallel` — The Core of It

The new function in `transcribe.ts` mirrors the diarize pipeline structure exactly:

```typescript
async function runTranscribeParallel(buffer, filename, model, maxWorkers, send) {
  const workDir = await makeTempDir();
  const { chunks } = await splitIntoChunks(buffer, filename, workDir, chunkDurationSec);

  send({ type: "transcribe_started", totalChunks: chunks.length });

  const semaphore = new Semaphore(maxWorkers); // default 10
  const results: Map<number, string> = new Map();
  let completedCount = 0;

  const workers = chunks.map((chunk, i) =>
    new Promise<void>((resolve) => {
      setTimeout(async () => {             // ← 1.5s stagger per chunk
        await semaphore.acquire();
        const start = Date.now();
        try {
          let text = "";
          // Capture SSE events from the single-file transcription function
          const captureSend = (e: SseEvent) => {
            if (e.type === "done") text = e.text!;
            else if (e.type === "delta") text += e.text!;
          };
          await (VOXTRAL_MODELS.has(model)
            ? transcribeVoxtral(chunk.path, model, captureSend)
            : transcribeAzure(chunk.path, model, captureSend));

          results.set(chunk.index, text);
          send({ type: "chunk_text_done", index: chunk.index, text, completed: ++completedCount, total: chunks.length, durationMs: Date.now() - start });
        } finally {
          semaphore.release();
          resolve();
        }
      }, i * 1500);  // stagger: chunk 0 starts immediately, chunk 1 at 1.5s, etc.
    })
  );

  await Promise.all(workers);

  const assembled = chunks
    .sort((a, b) => a.index - b.index)
    .map((c) => results.get(c.index) ?? "")
    .join(" ")
    .trim();

  send({ type: "done", text: assembled });
}
```

**The stagger pattern** deserves explanation. If you launch 20 chunks simultaneously, all 20 hit the API at the same millisecond. That's a burst that often triggers rate-limit errors, especially under Azure's deployment quotas. By adding a 1.5-second delay between each chunk's start, the effective burst is spread over 30 seconds. The semaphore still limits concurrent active calls to 10; the stagger softens the initial wave.

**The `captureSend` pattern** is a neat trick: `transcribeAzure()` was designed to stream `delta` events to the client. But inside the parallel path, we don't want each chunk's tokens flooding the outer SSE stream — we want to wait for the chunk to complete and then emit a single `chunk_text_done` event with the full text. The local `captureSend` captures those deltas silently, accumulates them, and only the final assembled text goes out.

---

## Step 4: Auto-Routing by File Size

The public export `runTranscribe()` now picks single vs parallel automatically:

```typescript
const PARALLEL_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

export async function runTranscribe(buffer, filename, model, send, maxWorkers = 10) {
  if (buffer.byteLength > PARALLEL_THRESHOLD_BYTES) {
    await runTranscribeParallel(buffer, filename, model, maxWorkers, send);
  } else {
    // Single-file path: Azure streams deltas directly, Voxtral returns done
    const workDir = await makeTempDir();
    writeFileSync(path.join(workDir, filename), buffer);
    if (VOXTRAL_MODELS.has(model)) {
      await transcribeVoxtral(filePath, model, send);
    } else {
      await transcribeAzure(filePath, model, send);  // streams delta events
    }
  }
}
```

The 20MB threshold is intentional conservatism: Azure's limit is 25MB, and our ffmpeg-encoded files are smaller than the originals, but the client uploads the raw file. A 20MB raw MP3 might encode to 15MB, which is still under the 25MB Azure limit — but a 22MB raw file might not compress below 25MB. Setting the parallel threshold at 20MB ensures we always chunk when near the limit.

---

## Step 5: The Client-Side Slot UI

On the browser side, `handleRenderTranscribe` in `page.tsx` needed to handle the new event types. The key idea: maintain a slot array keyed by chunk index. When chunk 3 finishes before chunk 1, it fills slot 3 immediately; chunk 1's slot shows a placeholder.

```typescript
const partialTexts = new Map<number, string>()
let totalChunks = 1

// transcribe_started: initialize the slot count
if (event.type === 'transcribe_started') {
  totalChunks = event.totalChunks ?? 1
  setDiarizeProgress({ completed: 0, total: totalChunks })
}

// chunk_text_done: fill the slot, rebuild the visible transcript
if (event.type === 'chunk_text_done') {
  partialTexts.set(event.index ?? 0, event.text ?? '')
  setDiarizeProgress({ completed: event.completed ?? 0, total: event.total ?? totalChunks })

  // Show all slots in order, placeholder for chunks still running
  const assembled = Array.from({ length: event.total ?? totalChunks }, (_, i) =>
    partialTexts.has(i) ? partialTexts.get(i)! : `[Chunk ${i + 1} — processing…]`
  ).join('\n\n')
  setTranscript(assembled.trim())
}
```

What the user sees as a 6-chunk file transcribes:

```
[Chunk 1 — processing…]
[Chunk 2 — processing…]

The hiring manager immediately impressed everyone by opening with a clear agenda...

[Chunk 4 — processing…]
[Chunk 5 — processing…]

In conclusion, the team felt the restructuring was inevitable but...
```

Chunks 3 and 6 finished first (maybe they had less speech, less latency). The gaps fill in as the slower chunks complete. The `done` event at the end carries the fully assembled text as the ground truth.

One small fix: the progress badge in the UI previously hardcoded "Diarizing…" no matter which model was running. One-line fix: `model === 'gpt-4o-transcribe-diarize' ? 'Diarizing' : 'Transcribing'`.

---

## The Gotcha: TypeScript `.js` Extensions in ES Module Imports

This burned a few minutes. TypeScript with `"module": "ESNext"` (Node's native ES modules) requires that import paths resolve to the *compiled* output, not the source. So:

```typescript
// ❌ Works in CommonJS, fails in ESM
import { Semaphore } from "./semaphore"

// ✅ Correct — TypeScript resolves this to semaphore.ts at compile time,
//    Node resolves it to semaphore.js at runtime
import { Semaphore } from "./semaphore.js"
```

This trips up nearly everyone who transitions a project from CommonJS to ESM. The rule: when writing `.ts` files, use `.js` extensions in your relative imports. TypeScript knows to look for `.ts` first; the `.js` extension is for the compiled artifact.

---

## What's Next

The feature is shipped but a few things need real-world validation:

1. **MISTRAL_API_KEY on Render** — Voxtral won't work until this env var is set. Without it, Voxtral calls silently fail at the API authentication step.

2. **Axiom observability** — `AXIOM_TOKEN` and `AXIOM_DATASET` are wired up in `logger.ts` but the Render service doesn't have those env vars yet. Without them, all logging goes to stdout only (still visible in Render logs, just not in Axiom).

3. **Real end-to-end test with a large file** — The code compiles and the types check, but parallel transcription hasn't been browser-tested with an actual 30-minute audio file yet. The diarize parallel path was validated in production already, which gives confidence the pattern is sound — but edge cases like chunk-level auth failures or ffmpeg issues on unusual codecs won't surface until a real test.

4. **Streaming within chunks for single-file path** — For files under 20MB, Azure gpt-4o-transcribe uses `stream: true` and the client sees live token deltas. That's a better experience than "please wait." For chunks in the parallel path, we deliberately suppress deltas (they go through `captureSend`) because showing token deltas for 6 chunks simultaneously would create confusing cross-chunk noise. A future improvement might be to show "live typing" inside each chunk slot, but that's a UI complication that probably isn't worth the complexity.

---

Building parallel audio processing taught me one concrete thing: the hardest part is never the concurrency logic itself — semaphores and Promise.all are well-understood patterns. The hard part is knowing the constraints that justify the design. Why 5-minute chunks? Because Azure's 25MB limit and our 32kbps bitrate math say so. Why stagger? Because rate limits aren't per-call, they're per-time-window. Why capture deltas locally instead of forwarding them? Because the UX of simultaneous multi-chunk token streams looks like chaos, not progress. The code is just a reflection of those constraints.

# The Silent 200: Fixing Pronunciation Assessment and Making Speech Lab Format-Agnostic

The Speech Lab had two quiet failures hiding in it. Pronunciation assessment returned HTTP 200 but showed "No assessment data returned." STT uploads from iOS would fail or produce garbage. Neither error was loud enough to catch during initial testing — which is exactly what made them interesting to investigate and fix.

This is a writeup of what I found, what I changed, and why the bugs were embarrassing in hindsight.

---

## The Starting Point

Speech Lab is a Next.js tool with three panels: TTS (text-to-speech), STT (speech-to-text transcription), and Pronunciation Assessment. The STT panel supports both microphone recording and file upload. Pronunciation uses the Azure Speech Cognitive Services REST API, which returns a JSON payload with phoneme-level scoring data.

The rough data flow for pronunciation:

```
User speaks → MediaRecorder → Blob → POST /api/speech/pronunciation → Azure REST → JSON scores
```

When I started the session, two things were wrong:
1. Pronunciation always silently failed — returning 200 with no usable scores
2. M4A/AIFF/CAF (common Apple audio formats) weren't recognized by the file upload path, and when they were, they'd often fail on non-GPT-4o models

I also noticed Job Tracker's API routes duplicated Turso DB connection logic in three different files with no schema bootstrapping, meaning a fresh database environment would fail on first use.

---

## Step 1: The Pronunciation Bug Was Two Bugs

I started with the most user-visible problem: pronunciation returning nothing despite a clean 200.

When an Azure Cognitive Services pronunciation response has no scoring data, there are three likely causes:
1. Wrong audio format (provider can accept the bytes but can't decode them)
2. Response format not set to `detailed` (default mode omits `NBest[]`)
3. Wrong credentials

Credentials were easy to rule out — the health check script confirmed the Azure Speech key and region were reachable. That left format and detail mode.

### Bug 1: The Content-Type Lie

Look at the original route — `Content-Type` was hardcoded regardless of what was actually uploaded:

```ts
// Before
formData.append('audio', audioBlob, 'pronunciation.webm')

// server route header — hardcoded, always wrong for WebM input
'Content-Type': 'audio/wav'
```

The browser's `MediaRecorder` records audio as WebM/Opus. The server was telling Azure it was receiving WAV — plain pulses/PCM audio. Azure would accept it, but the mismatch likely degraded recognition quality enough that no confident `PronunciationAssessment` block was generated in the response.

The fix was two-pronged: convert the recording to real WAV *before* uploading, and then forward the actual content type from the server instead of lying about it.

```ts
// Client: convert to real WAV before upload
const wavBlob = await convertRecordedBlobToWav(audioBlob)
formData.append('audio', wavBlob, 'pronunciation.wav')

// Server: forward what actually arrived
const contentType = audioFile.type?.trim() || 'audio/wav'
```

### Bug 2: Missing `format=detailed`

The original URL was:

```
/speech/recognition/conversation/cognitiveservices/v1?language=en-US
```

Without `format=detailed`, Azure's response omits `NBest[]` — the nested array that contains `PronunciationAssessment` and `Words[]`. The UI was reading `data.NBest?.[0]?.PronunciationAssessment`, which would be `undefined` if the format wasn't requested.

```ts
const requestUrl =
  `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
  `?language=${encodeURIComponent(language)}&format=detailed`  // ← this was missing
```

Either bug alone could explain the failure. Both were present simultaneously, which is why earlier tests likely never produced good results.

---

## Step 2: Writing WAV From Scratch in the Browser

To convert recorded WebM blobs to WAV, I couldn't rely on a library — the approach needed to be pure Web API to keep bundle size down. The Web Audio API has `AudioContext.decodeAudioData()`, which can decode any browser-decodable format into raw PCM samples. From there, WAV is just a header + 16-bit PCM.

WAV format is a RIFF container. The header is 44 bytes and needs specific fields written in little-endian:

```ts
async function convertRecordedBlobToWav(audioBlob: Blob): Promise<Blob> {
  if (audioBlob.type.includes('wav')) return audioBlob

  const audioContext = new AudioContext()
  try {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    return audioBufferToWavBlob(decoded)
  } finally {
    await audioContext.close()  // always release the AudioContext
  }
}
```

The `audioBufferToWavBlob` function writes the 44-byte RIFF/WAVE/fmt header and then downmixes multi-channel audio to mono (because Azure Speech REST expects single-channel for pronunciation):

```ts
// Mix all channels to mono before writing samples
const mono = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length
const clamped = Math.max(-1, Math.min(1, mono))
view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
```

One thing worth knowing about WAV serialization: the byte order matters. `DataView.setInt16(offset, value, true)` — the `true` at the end is `littleEndian`. Forget it and the file is unreadable. It took me a few minutes to remember why the RIFF spec requires it even though architecturally it doesn't need to.

---

## Step 3: Making STT Format-Agnostic

The original upload path checked MIME type to decide if a file was valid audio or video:

```ts
// Before — too narrow
const ACCEPTED_AUDIO_TYPES = ['audio/wav', 'audio/webm', 'audio/mp3', ...]
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', ...]

if (ACCEPTED_VIDEO_TYPES.includes(file.type) || file.name.match(/\.(mp4|mov|...)$/i)) {
  // handle video
}
```

This approach breaks silently on Apple-format files. iOS records audio as M4A (MIME: `audio/x-m4a` or `audio/mp4a-latm`). macOS QuickTime uses `.mov` which reports `video/quicktime`. CAF and AIFF are Apple formats with no well-known IANA MIME types — browsers often report these as `application/octet-stream`.

The fix was to check both MIME type *and* file extension, with separate lookups per model capability:

```ts
// Extension-based fallback for when MIME is generic or wrong
function isLikelyAudioFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return (
    file.type.startsWith('audio/') ||
    ACCEPTED_AUDIO_TYPES.includes(file.type) ||
    ACCEPTED_AUDIO_EXTENSIONS.includes(ext)  // ← extension as backup
  )
}
```

I also added model-aware routing. Azure's GPT-4o Transcribe deployments accept MP4 and WebM video directly — no need to extract audio first in the browser. Browser-side audio extraction is slower and lossy (it re-encodes), so for GPT-4o it's strictly better to skip it:

```ts
if (isAzureOpenAiSttModel(model) && isLikelyAzureVideoCompatible(file)) {
  // Skip extraction — just upload the video file directly
  await handleTranscribe(file, file.name)
  return
}

// Otherwise, extract audio track in-browser before transcribing
const audioBlob = await extractAudioFromVideo(file)
```

For non-Azure models receiving Apple audio formats, auto-convert to WAV so Mistral (which has a narrower format whitelist) doesn't reject the file:

```ts
if (!isAzureOpenAiSttModel(model) && !isLikelyMistralCompatibleAudio(file)) {
  const wavBlob = await convertRecordedBlobToWav(file)
  await handleTranscribe(wavBlob, `${fileNameWithoutExtension(file.name)}.wav`)
  return
}
```

An important detail about filenames: the original code always sent `'recording.webm'` as the upload filename regardless of what was actually uploaded. The `FormData` filename hint is passed to the upstream provider, and some model providers (including Azure OpenAI) use it to infer MIME type when the `Content-Type` field is ambiguous. Sending the real filename improves routing:

```ts
// Before — lies about what the file actually is
formData.append('audio', audioBlob, 'recording.webm')

// After — preserves real filename/extension
formData.append('audio', audioBlob, uploadFileName)  // e.g., "interview.m4a"
```

---

## Step 4: Job Tracker Schema Bootstrap

Job Tracker stores applications in a Turso database (Turso is a hosted SQLite-over-libSQL service — great for small relational data without managing Postgres). The problem: three separate API routes — `GET/POST /api/jobs`, `PATCH /api/jobs/[id]`, and `GET /api/jobs/stats` — each had their own copy-pasted `getDb()` helper, and none of them created the table if it didn't exist.

On a fresh database, the first request would crash with a SQLite "no such table" error rather than gracefully bootstrapping the schema.

I extracted shared logic into `src/lib/jobsDb.ts`:

```ts
let schemaInitialized = false  // module-level flag — initialized once per server process

export async function ensureJobsSchema(db: Client) {
  if (schemaInitialized) return  // skip if already run this process lifetime

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      ...
    );
    CREATE INDEX IF NOT EXISTS idx_job_applications_date ON job_applications(date DESC);
    CREATE INDEX IF NOT EXISTS idx_job_applications_company ON job_applications(company);
  `)

  schemaInitialized = true
}
```

The `schemaInitialized` flag is a module-level variable — it only runs the DDL once per Node.js process lifetime. That avoids unnecessary round-trips to the database on every request while still guaranteeing the table exists on cold start or a new deployment.

Every route now calls `await ensureJobsSchema(db)` before its first query. No more silent crashes on fresh environments, and no more copy-pasted connection boilerplate.

---

## The Gotcha: Debugging While Your Tooling Is Broken

Halfway through this session, the terminal started returning:

```
ENOPRO: No file system provider found for resource 'file:///workspaces/...'
```

This blocked every attempt to run the speech health check script against a sample WAV file, and blocked `git commit` and `git push` at the end. The same error repeated on every attempt.

The lesson isn't "retry the command." The lesson is that debugging a runtime problem while your observability tools are themselves failing is a situation that requires a methodological shift. Instead of waiting for the terminal to recover, I pivoted to:

1. Static code reading — tracing the exact data flow on paper (MIME type origin, how it propagates through FormData, what Azure receives)
2. API documentation cross-referencing — confirming `format=detailed` is required for `NBest[]` payload
3. Deterministic tests I could reason about without executing — "if the file is WebM and the header says WAV, what would Azure do?"

The answer I arrived at without running a single command was: "Azure probably transcribes successfully but returns a `Simple` format response, which has no `NBest` array." That was enough to fix it confidently without a live test.

When tooling fails mid-investigation, the ability to reason from specs and first principles is the fallback. It's slower, but it produces fixes you can actually explain — which is better than trial-and-error with live execution anyway.

---

## What Changed (File Summary)

| File | Change |
|------|--------|
| `src/app/api/speech/pronunciation/route.ts` | Added `format=detailed`, forwarded actual Content-Type |
| `src/app/projects/tools/speech/page.tsx` | WAV conversion helpers, Apple format support, model-aware video routing, filename preservation, better error diagnostics |
| `src/lib/jobsDb.ts` | New shared helper: connection + schema bootstrap |
| `src/app/api/jobs/route.ts` | Replaced inline `getDb()` with `getJobsDb()` + `ensureJobsSchema()` |
| `src/app/api/jobs/[id]/route.ts` | Same |
| `src/app/api/jobs/stats/route.ts` | Same |
| `homepage/.env.example` | Documented `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (were missing) |

---

## What's Next

1. **Add a live WAV probe to the health check script** — The script currently tests provider reachability but doesn't send a real speech sample. A 1-second sine wave with known transcription would catch format or credential regressions automatically.

2. **Pronunciation file upload** — Right now pronunciation only works from the microphone. Adding a file input path (reusing the same WAV conversion pipeline) would make it testable with saved recordings.

3. **Job Tracker: Turso runtime env verification** — The `.env.local` in this repo has `TURSO_API_TOKEN` (for the usage dashboard) but may be missing `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (for Job Tracker queries). These are separate Turso credentials and easy to accidentally omit when setting up a new environment.

4. **Offline WAV conversion test** — A vitest unit test for `audioBufferToWavBlob` that verifies RIFF header bytes, sample rate, and channel count without requiring a browser. Would catch the little-endian issue and other header bugs before they reach production.

---

The most expensive bugs are the ones that succeed loudly. The dangerous ones are the ones that return 200.

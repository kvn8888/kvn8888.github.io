# Why Azure Pronunciation Returned Nothing (And the Two-Line Bug That Hid It)

I had a weird bug in Speech Lab: pronunciation assessment would spin, return 200 OK, and still show "No assessment data returned." Nothing crashed, but nothing useful came back either. This session was about finding the real cause, fixing it without breaking STT/TTS, and making the failure mode easier to debug next time.

## The Starting Point

The Speech Lab pronunciation flow looked correct at a glance:

- Browser records audio with `MediaRecorder`
- Client sends `FormData` to `/api/speech/pronunciation`
- Route proxies to Azure Speech Pronunciation REST API
- UI reads `NBest[0].PronunciationAssessment` and renders scores

The issue: I got successful responses with empty payload shape for scoring. That usually means one of three things:

1. Provider credentials are wrong
2. Audio format is wrong
3. Response detail level is wrong

Because this failed "softly" (200 + empty structure), it was easy to miss during earlier tests.

## Step 1: Prove It Wasn't Credentials

Before touching code, I ran the speech service health check script so I could rule out `.env.local` drift.

```text
PASS: Gemini TTS reachable and returned audio
PASS: Mistral STT reachable
PASS: Azure OpenAI gpt-4o-transcribe reachable
PASS: Azure pronunciation reachable (response received, but no detailed assessment in this sample)
```

This was useful because it narrowed the search space immediately: auth and networking were fine.

I kept the investigation focused on request construction and response parsing.

## Step 2: Find the Silent Mismatch

The first real bug was in the client/server handshake.

On the client, pronunciation used recorder output (WebM/Opus). On the server route, the request to Azure forced `Content-Type: audio/wav`.

```ts
// Before
formData.append('audio', audioBlob, 'pronunciation.webm')

// Route header (hardcoded)
'Content-Type': 'audio/wav'
```

That mismatch is subtle but important: a provider can accept the request and still fail to produce the detailed recognition shape needed for scoring.

### Fix (Detailed Response Mode)

I changed two things:

1. Convert recorded blobs to real PCM WAV on the client before upload
2. Send uploaded MIME type from the server instead of hardcoding WAV

```ts
// Client: convert recording to WAV before upload
const wavBlob = await convertRecordedBlobToWav(audioBlob)
formData.append('audio', wavBlob, 'pronunciation.wav')

// Server: preserve actual type
const contentType = audioFile.type?.trim() || 'audio/wav'
```

I also made MIME selection safer for browsers by using supported recorder types dynamically instead of assuming one fixed value.

## Step 3: Ask Azure for the Data We Actually Parse

Second bug: the route did not request detailed format from Azure.

The UI expects this shape:

- `NBest[0].PronunciationAssessment`
- `NBest[0].Words[]`

Without `format=detailed`, that payload can be missing even when the request succeeds.

### Fix

```ts
const requestUrl =
  `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
  `?language=${encodeURIComponent(language)}&format=detailed`
```

This was the second half of the root cause. Neither fix alone was enough to be confident.

## The Gotcha: Tooling Can Fail Mid-Debug Too

In the middle of validation, terminal execution started failing with:

```text
ENOPRO: No file system provider found for resource ...
```

That blocked my custom scripted call against the sample WAV for a moment. The key lesson was to keep momentum with code inspection and deterministic provider docs while tooling recovered, instead of waiting passively.

When a debug session includes infra/tooling hiccups, preserving a clear symptom -> hypothesis -> proof loop matters more than perfect command throughput.

## Step 4: Improve Failure Messages for Future Debugging

Previously the UI only showed a generic error when no assessment existed.

I updated diagnostics to include `RecognitionStatus` and recognized text when available.

```ts
const recognitionStatus = data.RecognitionStatus
const recognizedText = data.DisplayText?.trim()

setError(
  `No assessment data returned. Status: ${recognitionStatus}. Recognized: "${recognizedText}".`
)
```

This gives future me (or anyone else) immediate clues about language mismatch, silence, or low-confidence recognition.

## What Changed in Code

- `homepage/src/app/api/speech/pronunciation/route.ts`
  - Added `format=detailed`
  - Forwarded uploaded content type
- `homepage/src/app/projects/tools/speech/page.tsx`
  - Added blob-to-WAV conversion helpers
  - Uploads pronunciation audio as WAV
  - Added better no-assessment diagnostics
  - Improved recorder MIME fallback handling

## What's Next

1. Add a file-upload path to the pronunciation panel (not just microphone capture) so test WAV/M4A files can be evaluated directly.
2. Add a lightweight validation banner before submission showing detected MIME type and duration.
3. Add an integration test fixture for "returns detailed NBest" so this regression cannot quietly return.

The practical takeaway: when an AI/speech API returns "nothing" with 200 OK, treat request metadata and response mode as first-class suspects, not afterthoughts.

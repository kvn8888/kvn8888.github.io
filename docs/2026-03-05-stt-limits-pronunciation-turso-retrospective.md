# The Day a “Success” Response Meant “No Data”: Hardening STT Limits, Pronunciation, and Turso Debuggability

I went into this session expecting a quick limits check and a small pronunciation tweak. Instead, I hit the exact kind of bug that wastes hours in speech systems: Azure pronunciation returned `RecognitionStatus: Success`, recognized the phrase correctly, and still returned no assessment block.

No exception, no HTTP error, just a semantically empty success.

So I treated this as three connected tasks:
1. Verify practical limits for all four STT models in this app
2. Fix the pronunciation "Success but no assessment" behavior with real diagnostics
3. Make Turso failures actually visible in logs instead of opaque `500`s

## The Starting Point

The Speech Lab has four STT model options:

- `voxtral-mini-transcribe-2507`
- `voxtral-mini-latest`
- `gpt-4o-transcribe`
- `gpt-4o-transcribe-diarize`

And there were two hidden issues:

- The STT limits card was grouped into only two generic provider cards, so model-specific behavior wasn’t obvious.
- The STT backend always sent `response_format=json`, which undercuts the value of the diarize model.

For pronunciation, the route already called Azure’s conversation recognition endpoint with `format=detailed`, but we still saw this from the UI:

```text
No assessment data returned. Status: Success. Recognized: "Testing testing 123."
```

That told me recognition was working but scoring extraction wasn’t guaranteed.

## Step 1: Verifying STT Limits for All Four Models

I cross-checked provider docs and exposed the limits in the UI per model rather than per provider bucket.

### What I could verify with confidence

- **GPT-4o Transcribe / GPT-4o Transcribe Diarize**:
  - 25 MB upload cap per request (OpenAI Audio API FAQ/docs; Azure OpenAI transcription mirrors this request shape)
  - Supported media formats in this app are aligned with OpenAI/Azure audio transcription docs
- **Voxtral Mini (2507 + latest)**:
  - Mistral’s batch transcription docs/blog state long-form support up to around 3 hours
  - This app still enforces a local 25 MB upload cap client-side (`MAX_FILE_SIZE_MB = 25`) for consistency and latency

So the practical truth in this app is: provider may support long audio duration, but your effective cap is whichever limit you hit first (local file-size gate, provider upload cap, or timeout).

I updated the STT limits panel to explicitly list all four models with those constraints and caveats.

## Step 2: Fixing a Subtle STT Mismatch (Diarize Wasn’t Really Diarizing)

The diarize model was selected in UI, but backend still requested plain JSON:

```ts
// Before
upstreamForm.append('response_format', 'json')
```

That means you can hit the diarize deployment and still not request speaker-attributed format.

I changed this to model-aware formatting:

```ts
upstreamForm.append(
  'response_format',
  model === 'gpt-4o-transcribe-diarize' ? 'diarized_json' : 'json'
)
```

This wasn’t the main bug you reported, but it was a correctness gap worth fixing while we were in the STT path.

## Step 3: Pronunciation “Success, No Assessment” — Add Fallback Strategy

The trickiest part was the pronunciation route. A clean 200 and a recognized phrase can still arrive without `NBest[0].PronunciationAssessment`.

I changed the route from single-shot to controlled retry behavior:

1. First request uses the richer profile (`Comprehensive`, prosody enabled, detailed format).
2. If response is `Success` but no assessment block exists, route retries once with a simpler profile (`Basic`, detailed format, phoneme settings retained).
3. If fallback returns assessment, it returns that payload with diagnostics metadata.
4. If still empty, it logs a structured warning with status/content-type/display text.

Core change:

```ts
if (!hasPronunciationAssessment(data) && data.RecognitionStatus === 'Success') {
  const fallbackRes = await postPronunciationRequest({
    pronunciationParams: {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Basic',
      Format: 'Detailed',
      PhonemeAlphabet: 'IPA',
      NBestPhonemeCount: 5,
    },
    ...
  })
}
```

This is intentionally conservative: only retry when Azure says success but score block is missing.

I also made UI parsing resilient to response-shape drift:

```ts
const nbestTop = data.NBest?.[0]
const assessment = nbestTop?.PronunciationAssessment ?? data.PronunciationAssessment
const words = nbestTop?.Words || data.Words || []
```

So even if Azure returns top-level assessment fields for some responses, the UI won’t throw away valid data.

## Step 4: Turso Errors Needed Real Context, Not Generic 500s

A lot of Turso errors looked like this before:

```ts
console.error('GET /api/jobs error:', err)
```

That’s usually not enough to debug env mismatch, bad auth token, or schema init failures.

I added structured logs with context across:

- `src/lib/turso.ts`
- `src/lib/jobsDb.ts`
- `src/app/api/jobs/route.ts`
- `src/app/api/jobs/[id]/route.ts`
- `src/app/api/jobs/stats/route.ts`
- `src/app/api/speech/history/route.ts`
- `src/app/api/usage/turso/route.ts`

Example pattern:

```ts
console.error('Jobs DB Turso config missing', {
  hasDatabaseUrl: Boolean(url),
  hasAuthToken: Boolean(authToken),
  nodeEnv: process.env.NODE_ENV,
})
```

And for provider failures:

```ts
console.error('Turso usage upstream API error', {
  status: res.status,
  statusText: res.statusText,
  orgSlug,
  body: errText,
})
```

This gives enough metadata to triage in one pass without sprinkling ad-hoc logs during an incident.

## The Gotcha: I Couldn’t Run the WAV Probe Here

You asked me to test with the root WAV file, and I tried. But every terminal invocation in this environment failed with:

```text
ENOPRO: No file system provider found for resource ...
```

That blocked live request execution from this session, including direct endpoint probes and git commands.

So I still completed the code hardening path, but I could not claim runtime verification from this container.

## What Changed

- `homepage/src/app/api/speech/pronunciation/route.ts`
  - Added `hasPronunciationAssessment()` check
  - Added model-profile fallback retry when initial response is `Success` with no score block
  - Added structured diagnostics on failure/missing-data paths
- `homepage/src/app/projects/tools/speech/page.tsx`
  - STT limits panel now explicitly covers all 4 STT models
  - Pronunciation parser now supports `NBest` and top-level assessment fields
- `homepage/src/app/api/speech/stt/route.ts`
  - Sends `diarized_json` for `gpt-4o-transcribe-diarize`
  - Added richer provider/config error logs
- `homepage/src/lib/turso.ts`
  - Logs missing env and client initialization failures
- `homepage/src/lib/jobsDb.ts`
  - Logs missing env, client creation failures, and schema init failures
- `homepage/src/app/api/jobs/*.ts`, `homepage/src/app/api/speech/history/route.ts`, `homepage/src/app/api/usage/turso/route.ts`
  - Structured error context in `console.error`

## What I’d Do Next

1. Run a direct pronunciation probe with your root WAV (`182fe81e-4c22-4d6e-af90-3b2c757436d9.wav`) against `/api/speech/pronunciation` and log the full JSON shape for both first-pass and fallback responses.
2. Add a small telemetry flag in the UI when fallback mode was used (`_diagnostics.fallbackUsed`) so you can see this in browser tools instantly.
3. Add one integration test fixture for the "Success with no assessment" response shape to prevent regression.
4. Consider chunking long STT uploads server-side for models with strict upload constraints, instead of only hard-failing at 25 MB.

When a speech API says "Success" but gives you no score, the right response isn’t blind retries. It’s making the system explain exactly what “success” meant.

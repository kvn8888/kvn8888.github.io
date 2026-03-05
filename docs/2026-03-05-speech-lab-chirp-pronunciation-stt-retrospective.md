# From "Success, No Assessment" to Actionable Speech UX: A Full Pass on Pronunciation, STT Limits, and Chirp 3 TTS

This session started with one suspicious symptom and ended up touching nearly every part of the Speech Lab stack.

The symptom looked harmless:

- UI error: `No assessment data returned. Status: Success. Recognized: "Testing testing 123."`
- API reality: Azure *did* return rich data, just in a slightly different shape than the UI expected.

From there, the work expanded into a focused product-quality pass:

1. Show more pronunciation insights from the API (recognized text, status, confidence, SNR, lexical form)
2. Improve clarity with score tooltips
3. Set pronunciation default to Auto-generate reference source
4. Add live file-size and duration limit telemetry while STT recording is ongoing
5. Add Chirp 3 voices to TTS with backend support
6. Make choice chips mobile-friendly
7. Refresh profile card hover treatment so it matches the glass/blur language of the app

## What Was Actually Wrong with Pronunciation

The UI parser mostly assumed one response shape:

- `NBest[0].PronunciationAssessment`
- `NBest[0].Words[].PronunciationAssessment`

But the live Azure output for this WAV returned flattened score fields in `NBest[0]`:

- `AccuracyScore`
- `FluencyScore`
- `CompletenessScore`
- `ProsodyScore`
- `PronScore`

and flattened per-word fields:

- `Words[].AccuracyScore`
- `Words[].ErrorType`

The parser now supports both structures and no longer drops a valid scoring response just because the payload shape shifts.

## Pronunciation: Showing More Useful Data

I surfaced more of what Azure already returns so users can debug their own attempts without opening devtools.

Added in the results UI:

- Recognized display text
- Recognition status
- Confidence
- SNR
- Lexical form

This gives immediate context for low scores:

- Was speech recognized correctly?
- Was the signal quality poor?
- Did lexical normalization diverge from the intended phrase?

### Tooltip pass for score cards

Each of these now has an inline help icon tooltip:

- Accuracy
- Fluency
- Completeness
- Prosody

The intent was to remove ambiguity without cluttering the panel with long static copy.

## Pronunciation Defaults: Auto-Generate First

The reference source default was switched to:

- `transcription` (Auto-generate)

That aligns better with typical user behavior in this tool: record once, derive reference automatically, then score.

## STT Recording: Live Limit Telemetry

Before, recording state was binary (`recording` on/off). You didn’t know how close you were to request limits.

Now while recording is active, the UI tracks:

- Elapsed duration (live timer)
- Accumulated recorded bytes
- File size progress vs app upload cap (`25MB`)
- Duration guidance progress vs model-specific advisory limits

And it warns when either crosses an 80% threshold.

### Why this matters

Speech UX fails late if you don’t expose constraints early. This change shifts failure left by making risk visible while the recording is still happening.

## Chirp 3 Voices: Frontend + Backend Wiring

### Frontend

Voice selector now includes two groups:

- Gemini 2.5 Flash voices
- Chirp 3 HD voices

Chirp values are namespaced in UI (`chirp3:<voiceName>`) so backend routing is explicit.

### Backend

`/api/speech/tts` now supports provider branching:

- Gemini path (existing)
- Chirp 3 path (new) via Google Cloud Text-to-Speech API

Chirp 3 auth is done using service-account JWT flow (`GCP_SERVICE_ACCOUNT_KEY`) to fetch an OAuth token with `cloud-platform` scope, then call `texttospeech.googleapis.com/v1/text:synthesize`.

For Chirp 3 output, response mime is MP3; frontend already handled non-L16 audio payloads, so this dropped in cleanly.

## Mobile-Friendly Choice Chips

I made chip layout changes where selection pressure is highest:

- Top modality chips (`TTS`, `STT`, `Pronunciation`) now wrap on smaller screens
- Compact labels are shown on small viewports (`TTS`, `STT`, `Pron`), full labels on `sm+`
- STT model chips now use single-column on phones and 2-column on larger viewports

This avoids horizontal squeeze and preserves tap targets.

## Profile Card Blur Treatment

The avatar trigger used a plain hover opacity change.

That was replaced with a subtle glass interaction:

- hover background tint
- backdrop blur
- soft shadow transition

This matches the existing glassmorphism tone instead of looking like a generic opacity-only hover.

## Implementation Notes

### Flexible pronunciation extraction

The parser now builds assessment from either nested or flat shapes:

```ts
const assessment =
  nbestTop?.PronunciationAssessment ??
  data.PronunciationAssessment ??
  (typeof nbestTop?.AccuracyScore === 'number' &&
  typeof nbestTop?.FluencyScore === 'number' &&
  typeof nbestTop?.CompletenessScore === 'number' &&
  typeof nbestTop?.PronScore === 'number'
    ? {
        AccuracyScore: nbestTop.AccuracyScore,
        FluencyScore: nbestTop.FluencyScore,
        CompletenessScore: nbestTop.CompletenessScore,
        ProsodyScore: nbestTop.ProsodyScore,
        PronScore: nbestTop.PronScore,
      }
    : undefined)
```

### STT recording telemetry

MediaRecorder now emits chunk updates at 1-second intervals:

```ts
recorder.start(1000)
```

and updates live byte counters from `ondataavailable`.

### Chirp provider switch

```ts
const isChirp3 = provider === 'chirp3' || String(voice).startsWith('chirp3:')
```

That lets one endpoint support two synthesis engines cleanly.

## What Went Right

- The curl payload from the real WAV file gave a concrete truth source; this removed guesswork.
- The parser fix was made defensive rather than one-off, so future shape variance is less likely to break UI.
- STT recording telemetry improves reliability perception without backend complexity.

## What Was Risky

- Chirp 3 voice availability can vary by project/region/entitlement. The UI list is optimistic; some voices may fail depending on GCP setup.
- Duration guidance is advisory, not a hard server-side limiter.

## Follow-Ups I’d Recommend

1. Add a small "raw payload" debug toggle (dev-only) in Pronunciation panel for future shape diagnostics.
2. Add a server-side STT preflight endpoint that estimates rejection risk before upload for very large media.
3. Add provider-specific voice capability checks for Chirp 3 (health/probe endpoint) so unavailable voices can be disabled dynamically.

This session was a good example of a practical product lesson: "we got a success response" is not the same as "we handled the response correctly." Once that distinction was addressed, the rest of the UX improvements fell into place naturally.

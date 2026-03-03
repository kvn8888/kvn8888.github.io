# From Manual Prompting to Configurable Reference Transcription in Speech Lab

The pronunciation tool originally required me to type reference text by hand before recording. That worked, but it broke the flow when I just wanted to speak and get scored quickly. In this session, I added a user-selectable transcription service (defaulting to GPT‑4o Transcribe) so the reference text can be auto-generated from the same recording used for pronunciation assessment.

## The Starting Point

The pronunciation panel had a single required `referenceText` input and one recording action. On stop, it immediately sent audio + text to `/api/speech/pronunciation`. The STT panel already supported multiple providers/models, but pronunciation didn’t reuse that path.

So the mismatch was:
- STT already had configurable model routing.
- Pronunciation still assumed manual text entry every time.

## Step 1: Reuse Existing STT Model Choices Instead of Inventing a New Backend

My goal was minimal code change, so I intentionally avoided creating a new API route. I reused the existing `/api/speech/stt` endpoint that already accepts a `model` form field and routes to Mistral or OpenAI.

I introduced a shared `SttModel` union type and used it in both panels. That removed duplication and guaranteed the pronunciation selector can only send supported models.

```ts
type SttModel =
  | 'voxtral-mini-transcribe-2602'
  | 'voxtral-mini-transcribe-realtime-2602'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe'

const [transcriptionModel, setTranscriptionModel] = useState<SttModel>('gpt-4o-transcribe')
```

I chose this because it was the smallest safe change: one source of truth for model IDs and no backend contract changes.

## Step 2: Add a Reference Source Toggle with GPT‑4o as the Default

I added a `Reference Source` dropdown with two modes:
- Manual text input
- Auto-generate from transcription

When transcription mode is selected, the panel shows a `Transcription Service` selector and defaults to GPT‑4o Transcribe, matching the requirement.

This kept manual behavior intact while adding a faster path for users who want hands-free reference generation.

## The Gotcha: Loading State and Error Ownership Across Two Async Steps

The interesting bug risk was async sequencing. In transcription mode, the flow is now:
1. Transcribe the recorded audio
2. Use that text as `referenceText`
3. Submit pronunciation assessment

Symptom I wanted to avoid: spinner getting stuck or getting cleared too early when step 1 succeeds but step 2 fails.

Root cause: two async operations share the same UI state (`loading`, `error`). If both try to fully own loading/error lifecycles independently, state can flicker or end in the wrong final value.

Fix: I scoped transcription errors to the wrapper call in `onstop`, while keeping assessment lifecycle in `handleAssess`. I also passed an explicit `overrideReferenceText` into `handleAssess` so it doesn’t race against React state updates.

```ts
const nextReferenceText = await transcribeReferenceText(blob)
setReferenceText(nextReferenceText)
await handleAssess(blob, nextReferenceText)
```

That small parameterized change made the whole chain deterministic.

## What’s Next

Two follow-ups would improve this further:
1. Add provider/model metadata to pronunciation history so I can compare scoring by reference source.
2. Add UI tests for the mode toggle to lock in the manual vs transcription behavior.

If I were doing a larger refactor, I’d extract shared recorder/transcription hooks so STT and pronunciation stop duplicating recording logic.

---
Small UX switches are deceptively deep: the fastest fix is usually the one that reuses an existing contract instead of designing a new one.

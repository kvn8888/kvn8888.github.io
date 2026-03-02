# From Single-Provider Speech Tools to a Multi-Modal Speech Lab with History

I started this session with a working Speech Lab (TTS, STT, pronunciation), but it felt like a demo surface instead of a tool I’d actually use every day. The goals were to make modalities easier to compare, add provider flexibility (including GPT-4o audio transcription), and persist results across sessions with delete support via Turso.

## The Starting Point

Before this change:

- Speech UI had the three tabs, but no cross-modality history
- STT only supported Mistral Voxtral models
- Transcript output was readable but not optimized for quick copy/paste workflows
- There was no in-page reference section linking official API docs for each modality

So the core issue wasn’t “missing features,” it was “missing workflow glue.”

## Step 1: Add Turso-Backed History (Without Turning It Into a Full Data Layer)

The goal was persistence with minimal churn. I chose Turso via `@libsql/client` because it’s SQLite-compatible and the schema here is intentionally simple (append, list, delete).

I added a tiny shared client helper and one API route:

- `src/lib/turso.ts` for lazy client creation
- `src/app/api/speech/history/route.ts` with `GET`, `POST`, `DELETE`

The core shape is intentionally narrow:

```ts
CREATE TABLE IF NOT EXISTS speech_history (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  modality TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
)
```

I scoped rows per authenticated user email, added bounded field sizes, and hardened JSON parsing so one malformed metadata row doesn’t break the whole response.

### What I’d improve next

Table creation currently runs defensively in-route. Long term, a proper migration/init step would be cleaner.

## Step 2: Expand STT to Support GPT-4o Audio Options

The request asked for GPT Realtime / GPT-4o audio support as transcription options. I kept this surgical by extending the existing STT route instead of creating a parallel API surface.

The key decision: route requests by model prefix.

```ts
const isOpenAiModel = model.startsWith('gpt-4o') || model.startsWith('gpt-realtime')
const apiKey = isOpenAiModel ? process.env.OPENAI_API_KEY : process.env.MISTRAL_API_KEY
const url = isOpenAiModel
  ? 'https://api.openai.com/v1/audio/transcriptions'
  : 'https://api.mistral.ai/v1/audio/transcriptions'
```

On the UI side, I added model pills for:

- `gpt-4o-transcribe`
- `gpt-4o-mini-transcribe`

This keeps the user experience consistent: same upload/record flow, different upstream model.

### What I’d improve next

If realtime websocket streaming is needed (true session-based low-latency interaction), that should likely be a dedicated route and UI mode rather than “just another model button.”

## Step 3: Make Results Actually Usable (Copy-First UX + In-Page Docs)

I changed the transcript output from plain paragraph text to a read-only textarea with a copy button. This seems small, but it removed friction immediately for “transcribe → paste elsewhere” workflows.

I also added:

- History panel with modality filter + delete + refresh
- Reference docs panel with direct links for all modalities, especially Azure pronunciation assessment

The doc links were important because this tool now spans multiple providers and each has different request semantics.

## The Gotcha: Environment/Baseline Failures vs Actual Feature Risk

The biggest confusion point wasn’t feature code — it was validation context.

### Symptom

- `npm run lint` failed with an ESLint circular-structure config error
- `npm run build` failed fetching Google Fonts in this sandboxed environment

### Investigation

I ran baseline checks before changes and saw both issues already present. That made it clear these were environment/config constraints, not regressions from the Speech Lab updates.

### Fix

I switched to targeted validation for changed codepaths:

- `npx tsc --noEmit` for type-safety
- iterative code review + hardening (error messaging, accessibility labels, safe metadata parsing)
- CodeQL security check (no alerts)

That kept confidence high without pretending baseline infra errors were solved here.

## What’s Next

- Add migration-based Turso table management
- Add optimistic/pending UI state for history writes/deletes
- Consider a dedicated realtime mode using OpenAI Realtime websocket flow
- Add end-to-end tests for speech history CRUD and provider-switch STT behavior

---

The biggest lesson: multi-provider AI features aren’t hard because of any one API — they’re hard because the UX between APIs needs to feel like one product.

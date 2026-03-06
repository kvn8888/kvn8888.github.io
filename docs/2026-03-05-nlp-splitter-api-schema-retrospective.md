# From Inline Spaghetti to a Swappable NLP Library — Speech Lab Refactor, API Schema Hardening, and a Notes App

Two sessions of incremental feature work converged on one theme: infrastructure you can actually trust.

The previous state of the TTS panel had its sentence-splitting logic buried in 160 lines of inline comments and implementation inside a 1,000-line React client component file. The usage monitor was hitting imaginary API endpoints. The profile card backdrop was faking frosted glass with a transparency trick that looked awful over text. This session was about cleaning all of that up — and building the structural foundation for replacing `Intl.Segmenter` with a real ML-backed sentence model.

---

## The Starting Point

### Speech Lab — TTS Panel

The TTS panel for Gemini 2.5 Flash and Chirp 3 HD voices had grown a large internal helper block:

```
// speech/page.tsx (BEFORE)
// ~160 lines of:
//   • NLP motivation commentary
//   • textSize() function
//   • buildTtsBatches() with full bin-packing logic
//   • Intl.Segmenter integration
//   • UTF-8 truncation edge cases
```

All of that lived in the same file as the React component state, event handlers, and JSX. No test surface, no way to swap the NLP backend without touching the component, and no clean path to moving batching server-side in the future.

### Usage Monitor

Four new service cards had been added (Mistral AI, Replicate, AWS S3, Resend) based on guessed API schemas. Of those four:
- **Mistral** was hitting `/v1/workspace` — an endpoint that doesn't exist in the Mistral inference API
- **Replicate** was using `Bearer <token>` — but Replicate uses `Token <token>` (completely different scheme)
- **Resend** was missing `created_at` on domain objects, which _is_ in the API response
- **S3** was missing the `Owner` field that `ListBuckets` returns

None of these would crash hard (the routes return 200 with error messages), but they'd show wrong or empty data in production.

---

## Step 1: Extracting the Sentence Splitter into a Proper Library

### Goal

Move the sentence-splitting logic into `src/lib/tts/sentenceSplitter.ts` so it can be:
1. Imported cleanly by the React component (and by future API routes)
2. Tested in isolation (no React dependency)
3. Swapped for a different NLP backend by changing one line

### The Interface

The user gave a code example from a voice options utility module — clean exported functions, no hidden state, dependency-injected parameters:

```typescript
// sentenceSplitter.ts
export interface SentenceSegmenter {
  segment(text: string): string[]
}

export function buildTtsBatches(
  text: string,
  opts: TtsBatchOptions,
  segmenter: SentenceSegmenter = _defaultSegmenter  // ← the swap point
): string[]
```

`SentenceSegmenter` is a two-line interface. Any implementation just needs `segment(text): string[]`. The batching algorithm, byte counting, and truncation logic never need to know what's doing the segmenting. That's the entire design pattern — and it keeps the module honest.

The `_defaultSegmenter` is an `Intl.Segmenter`-backed instance created once at module load. This is the same function they had before, just properly extracted:

```typescript
export function createIntlSegmenter(locale?: string): SentenceSegmenter {
  return {
    segment(text: string): string[] {
      const seg = new Intl.Segmenter(locale, { granularity: 'sentence' })
      return Array.from(seg.segment(text), (s) => s.segment).filter(...)
    }
  }
}
```

### Calling Site — Before vs After

```typescript
// BEFORE (inline, buried in component)
const batches = buildTtsBatches(trimmedText, limit, isChirp3Voice)

// AFTER (imported from lib, explicit segmenter)
import { buildTtsBatches, createIntlSegmenter } from '@/lib/tts/sentenceSplitter'
const _intlSegmenter = createIntlSegmenter()  // module-level singleton
const batches = buildTtsBatches(trimmedText, { limit, isChirp3: isChirp3Voice }, _intlSegmenter)
```

The call site is one line longer but the component file dropped 160 lines of mixed concerns.

---

## Step 2: The Wink-NLP Adapter

### Why Wink-NLP

[wink-nlp](https://winkjs.org/wink-nlp/) is a Node.js NLP library with an ML-trained Sentence Boundary Disambiguation (SBD) model. It handles cases that Unicode Annex #29 (the spec behind `Intl.Segmenter`) sometimes gets wrong:

- Quoted speech with internal terminal punctuation: `"He said 'Wait! I'm not done.'"`
- Adjacent abbreviations and sentence endings: `"Conf. held at 9 a.m. tomorrow."`
- Domain-specific patterns not in the UAX-29 rule table

The test run in Node confirmed it handles the classic case cleanly:

```bash
$ node -e "
const nlp = require('wink-nlp')(require('wink-eng-lite-web-model'))
const doc = nlp.readDoc('Today, the U.S. dollar is worth 1.2 CAD. Dr. Smith confirmed this. It will change.')
console.log(doc.sentences().out())
"
// → ['Today, the U.S. dollar is worth 1.2 CAD.', 'Dr. Smith confirmed this.', 'It will change.']
```

Three correct sentences. No false splits on `U.S.`, `1.2`, or `Dr.`.

### The Implementation

```typescript
// winkSegmenter.ts
import winkNLP from 'wink-nlp'
import model from 'wink-eng-lite-web-model'
import type { SentenceSegmenter } from './sentenceSplitter'

export function createWinkSegmenter(): SentenceSegmenter {
  const nlp = winkNLP(model)
  return {
    segment(text: string): string[] {
      return (nlp.readDoc(text).sentences().out() as string[])
        .filter((s) => s.trim().length > 0)
    }
  }
}
```

That's the entire file. To drop it in:

```typescript
// CHANGE THIS ONE LINE in speech/page.tsx:
import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
const _intlSegmenter = createWinkSegmenter()  // ← swap complete
```

The rest of the codebase — `buildTtsBatches`, the batch progress UI, the WAV concatenation — is untouched.

### The Package Size Trade-off

`wink-eng-lite-web-model` is the browser-compatible variant (designed to be bundled by webpack/Rollup). The dist directory is ~3.8MB. That's meaningful for a client bundle, which is why `Intl.Segmenter` stays as the default for the browser component. The wink adapter lives ready in `winkSegmenter.ts` for when:

1. Batching moves server-side (API route handles splitting before calling TTS)
2. The user accepts the bundle size for higher accuracy
3. We add `transpilePackages: ['wink-nlp', 'wink-eng-lite-web-model']` to `next.config.ts`

---

## Step 3: API Schema Reality Check

### The Mistral Mess

The original Mistral route was calling `GET /v1/workspace`. That endpoint does not exist in Mistral's inference API (`api.mistral.ai/v1`). The inference API is for completions, embeddings, and fine-tuning — not billing.

What Mistral *does* expose (for keys with `billing:read` permissions):

```
GET /v1/usage/monthly
Response: {
  data: [
    { model: string, requests: number, prompt_tokens: number, completion_tokens: number, total_tokens: number }
  ],
  period: { start: string, end: string }
}
```

The new route tries this first, then falls back to `GET /v1/models` (always available) to at least confirm the key is valid:

```typescript
// Try usage first
const usageRes = await fetch('https://api.mistral.ai/v1/usage/monthly', { headers })
if (usageRes.ok) return monthly usage data...

// 401/403 = no billing:read permission — fall through
// Fall back to model list (key validity check)
const modelsRes = await fetch('https://api.mistral.ai/v1/models', { headers })
```

The dashboard card now shows either a per-model token breakdown or a "key valid, N models available" message depending on which path succeeded.

### Replicate Auth Bug

```typescript
// WRONG: Replicate does not use Bearer
Authorization: `Bearer ${apiToken}`

// CORRECT: Replicate uses the "Token" scheme
Authorization: `Token ${apiToken}`
```

This is a one-character difference in the `Authorization` header scheme name, but it means every request was returning 401. The Replicate API docs specify `Token` explicitly.

### Resend and S3 — Missing Fields

Both routes were correctly structured but missing fields that are actually in the response:

- **Resend domains**: `created_at` is always present in the `/domains` response. Added to the frontend card so you can see when each domain was registered.
- **S3 ListBuckets**: Returns `Owner: { DisplayName, ID }` alongside the bucket list. Now surfaced as "Account" in the dashboard card.

---

## The Gotcha: CJS Modules in Next.js ESM Context

wink-nlp and its models are CommonJS (`module.exports`). In a Next.js 15 App Router project with `moduleResolution: bundler`, this means:

- **Server-side (API routes, server components)**: Works fine — Node.js handles CJS natively.
- **Client-side (`'use client'` components)**: webpack will bundle CJS but needs `transpilePackages` in `next.config.ts` to handle the specific packages.

The solution: leave `Intl.Segmenter` as the browser default and put the wink-nlp implementation in a clearly marked server-only file (`winkSegmenter.ts`). The `SentenceSegmenter` interface bridges both worlds — the interface is pure TypeScript and works everywhere.

The module file structure makes the intent explicit:

```
src/lib/tts/
├── sentenceSplitter.ts  ← interface + IntlSegmenter (browser + server)
└── winkSegmenter.ts     ← wink-nlp impl (server-side by default, browser with transpilePackages)
```

---

## What's Next

- **Move batching server-side**: The current architecture has the React client call `/api/speech/tts` once per batch. A cleaner design would have the API route accept full text, split it using `createWinkSegmenter()` (server-side, no bundle cost), and stream or batch the audio back. The interface is ready for this.

- **Streaming TTS**: Gemini 2.5 Flash TTS supports streaming audio. Instead of waiting for each batch to complete before starting the next, we could pipe audio chunks to the browser as they arrive. The WAV header stitching already handles multi-chunk assembly.

- **Notes search**: The `/tools/notes` app has full CRUD but no full-text search. Turso's SQLite `LIKE` or FTS5 extension could power this trivially.

- **Mistral billing:read key**: Create a separate Mistral API key with `billing:read` scope and add it to environment variables so the usage dashboard can show token consumption by model.

---

The architecture session revealed a pattern worth naming: when you stub an API route against a guessed schema and it doesn't fail loudly (returns a 200 with an error message), the bug hides in plain sight for weeks. The fix is simple — check the actual docs before writing the route — but the discipline is easy to skip when you're moving fast. The wink-nlp extraction is the same lesson from a different angle: when the "simple" implementation is good enough to ship, extract it to a module with a clean interface anyway, because the interface is the contract that makes future improvements safe.

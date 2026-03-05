# TTS NLP Sentence Splitting and Request Batching

## Why this exists

Text-to-speech requests have strict per-request character limits that differ by provider:

- **Gemini TTS**: `4000` characters per input request
- **Chirp 3 HD**: `5000` characters per input request

If we naively split text on `"."`, we introduce bad pauses and pronunciation issues for patterns such as:

- Abbreviations (`U.S.`, `Dr.`, `e.g.`)
- Numeric decimals (`1.2`, `3.14159`)

This implementation adds an NLP-aware sentence splitter and a batching layer that **maximizes each request payload** while staying under provider-specific limits.

---

## Is this a DSA problem?

Yes, this maps well to a classic **greedy packing** problem.

### Problem framing

Given a sequence of sentence tokens with lengths:

`L = [l1, l2, l3, ... ln]`

Build ordered groups where each group sum is `<= limit`, minimizing batch count while preserving order.

### Why greedy is appropriate here

We need to preserve semantic order for TTS playback history and recombination.  
A left-to-right greedy strategy ("append next sentence if it still fits, otherwise start a new batch") gives an efficient and practical near-optimal packing under this constraint.

### Pseudocode

```text
sentences = splitIntoSentences(text)
current = ""
chunks = []

for sentence in sentences:
  if len(sentence) > limit:
    flush current into chunks
    hard-split sentence into fixed-size slices <= limit
    append slices to chunks
    continue

  candidate = current + " " + sentence (or sentence if current empty)
  if len(candidate) <= limit:
    current = candidate
  else:
    append current to chunks
    current = sentence

flush current into chunks
```

### Complexity

- Sentence split pass: `O(n)` over input characters
- Batch construction: `O(m)` over sentence count
- Total: `O(n + m)` time, `O(m)` space

---

## Implementation summary

File: `src/lib/tts/sentenceChunking.ts`

### 1) NLP-aware splitter

- Normalizes whitespace
- Splits on `.`, `!`, `?` only at valid sentence boundaries
- Avoids splitting:
  - known abbreviations (`U.S.`, `e.g.`, etc.)
  - decimal points when surrounded by digits

### 2) Limit-aware batching

- Uses per-provider limits:
  - Gemini: `4000`
  - Chirp 3: `5000`
- Greedily combines adjacent sentences into maximal batches
- Handles oversized single sentences by hard-splitting into limit-sized chunks

### 3) Provider model update

- Gemini model constant is now explicitly set to:
  - `gemini-flash-latest`

---

## Edge-case handling details

1. **Abbreviations**
   - The splitter checks a common abbreviation set (e.g. `U.S.`, `Dr.`, `e.g.`) before splitting at a period.
   - This reduces unnatural pauses in generated speech.

2. **Decimal numbers**
   - A period between two digits is treated as decimal punctuation, not sentence termination.
   - Example: `1.2 CAD` remains in the same sentence.

3. **Whitespace normalization**
   - Input is normalized to single spaces before tokenization.
   - This keeps deterministic batching regardless of user-entered spacing.

4. **Oversized single sentence**
   - If one sentence is longer than the provider limit, we hard-split into limit-sized slices.
   - This guarantees every emitted chunk is API-valid.

---

## Worked example

Sentence lengths:

- `S1 = 3000`
- `S2 = 800`
- `S3 = 300`

Total = `4100`

### Chirp 3 (`5000`)

All three fit in one request:

- Batch 1: `3000 + 800 + 300 = 4100`

### Gemini (`4000`)

`3000 + 800 + 300 = 4100` exceeds limit, so:

- Batch 1: `3000 + 800 = 3800`
- Batch 2: `300`

---

## API-usage planning notes (future integration)

The splitter/chunker is intentionally deterministic so it can be reused by:

- request throttling (RPM/TPM/day quotas)
- provider cost accounting
- usage monitoring dashboards
- per-feature history stores (speech/pronunciation/transcription)

Recommended next step: persist per-batch metadata in Turso (provider, chars, model, status, storage key, duration, retries).

For planned quota-aware scheduling:

- Gemini 2.5 Flash TTS PAYG limits (as provided):
  - 10 requests / minute
  - 10k tokens / minute
  - 100 requests / day
- Chirp 3 HD:
  - 200 voices / minute
  - first 1M chars free
  - then `$0.00003` per character (`$30` per 1M chars)

These constraints are orthogonal to sentence splitting itself, but the batcher is designed so a scheduler/rate-limiter can consume deterministic char counts per request.

/**
 * @module winkSegmenter
 *
 * Wink-NLP Sentence Segmenter
 * ───────────────────────────
 * ML-backed sentence boundary detection using wink-nlp + wink-eng-lite-web-model.
 *
 * WHY WINK-NLP OVER Intl.Segmenter
 * ─────────────────────────────────
 * `Intl.Segmenter` implements Unicode Annex #29 which covers most cases well,
 * but wink-nlp adds an ML-trained Sentence Boundary Disambiguation (SBD) model
 * that handles trickier patterns:
 *
 *   • "He said 'Wait! I'm not done.'" — quoted speech with internal terminal punct
 *   • "The price fell from $10.50 to $9.75. Investors panicked." — inline numbers
 *   • Domain-specific abbreviations not in the UAX-29 table
 *
 * HOW TO DROP IN WINK-NLP
 * ──────────────────────────────────────────────────────────────────────────────
 * The `createWinkSegmenter()` factory returns a `SentenceSegmenter` — the same
 * interface used by `buildTtsBatches()` in sentenceSplitter.ts.  Swapping is one
 * line:
 *
 *   // BEFORE (IntlSegmenter, default):
 *   buildTtsBatches(text, { limit: 4096, isChirp3: false })
 *
 *   // AFTER (wink-nlp):
 *   import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
 *   buildTtsBatches(text, { limit: 4096, isChirp3: false }, createWinkSegmenter())
 *
 * USAGE ENVIRONMENTS
 * ──────────────────
 * • Server (Next.js API routes, server components) — works out of the box.
 *   The model loads synchronously from node_modules at cold start.
 *
 * • Browser (client components) — requires Next.js transpilePackages config.
 *   Add to next.config.ts:
 *     transpilePackages: ['wink-nlp', 'wink-eng-lite-web-model']
 *   Then use dynamic import to avoid blocking the initial paint:
 *     const { createWinkSegmenter } = await import('@/lib/tts/winkSegmenter')
 *     const wink = createWinkSegmenter()
 *
 * PERFORMANCE NOTE
 * ────────────────
 * `createWinkSegmenter()` initialises the wink-nlp engine on first call.
 * For long-lived processes (API routes) or components that call buildTtsBatches
 * repeatedly, cache the returned `SentenceSegmenter` instance rather than
 * recreating it on every call.
 *
 *   const wink = createWinkSegmenter()          // init once
 *   buildTtsBatches(text1, opts, wink)           // reuse
 *   buildTtsBatches(text2, opts, wink)           // reuse
 */

import winkNLP from 'wink-nlp'
import model from 'wink-eng-lite-web-model'
import type { SentenceSegmenter } from './sentenceSplitter'

/**
 * Returns a `SentenceSegmenter` backed by wink-nlp's ML sentence boundary model.
 *
 * The wink-nlp engine is initialised inside this call.  For hot code paths,
 * call `createWinkSegmenter()` once and cache the result.
 *
 * @example — server-side API route:
 *   import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
 *   import { buildTtsBatches } from '@/lib/tts/sentenceSplitter'
 *
 *   // Module-level singleton — shared across all requests in the same process
 *   const winkSegmenter = createWinkSegmenter()
 *
 *   // Inside request handler:
 *   const batches = buildTtsBatches(userText, { limit: 4096, isChirp3: false }, winkSegmenter)
 */
export function createWinkSegmenter(): SentenceSegmenter {
  // winkNLP is initialised with the lite web model.
  // The web model is designed for both browser (via bundler) and Node.js.
  const nlp = winkNLP(model)

  return {
    /**
     * Splits `text` into sentences using wink-nlp's SBD (Sentence Boundary
     * Disambiguation) model.  Empty/whitespace-only sentences are excluded.
     */
    segment(text: string): string[] {
      const doc = nlp.readDoc(text)
      // doc.sentences().out() returns string[] — the raw text of each sentence
      // including trailing whitespace.  Filter empties for consistency.
      return (doc.sentences().out() as string[]).filter((s) => s.trim().length > 0)
    },
  }
}

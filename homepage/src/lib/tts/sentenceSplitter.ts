/**
 * @module sentenceSplitter
 *
 * TTS Sentence Splitter & Batch Packer
 * ─────────────────────────────────────
 *
 * WHY THIS EXISTS
 * ───────────────
 * TTS APIs cap requests at a hard character/byte limit:
 *   • Gemini 2.5 Flash TTS  — 4 096 characters per request
 *   • Chirp 3 HD             — 5 000 UTF-8 bytes per request
 *
 * Long prose must be split into multiple API calls and the resulting audio
 * stitched together.  The split points must fall on sentence boundaries,
 * not mid-sentence, or the TTS engine will pause unnaturally.
 *
 * A NAIVE period-split breaks on abbreviations and decimals:
 *   "Today, the U.S. dollar is worth 1.2 CAD."
 *   → ["Today, the U", "S", " dollar is worth 1", "2 CAD"]
 *
 * We use a proper NLP sentence segmenter instead.
 *
 * DSA — THE BIN-PACKING PROBLEM (with ordering constraint)
 * ─────────────────────────────────────────────────────────
 * After segmentation we have N sentences s₀…sₙ₋₁ with sizes ℓ₀…ℓₙ₋₁.
 * We must pack them into batches each of capacity C (the API limit).
 *
 * General bin-packing is NP-hard.  But we have one critical constraint:
 *   ORDERING — sentences must be in their original order (audio must cohere).
 *
 * This ordering constraint reduces the problem to the "chain partitioning"
 * variant, solvable in O(n) with a greedy sequential first-fit pass:
 *
 *   currentBatch = ''  ;  currentSize = 0
 *   FOR each sentence s WITH size ℓ:
 *     IF currentSize + ℓ ≤ C:        append s, currentSize += ℓ
 *     ELSE:                          flush batch, start new with s
 *   flush remaining batch
 *
 * Time: O(n)  —  Space: O(n)
 *
 * First-Fit Decreasing (FFD) is NOT used because sorting sentences by
 * descending size would destroy the chronological speech order.
 *
 * SWAPPABLE SEGMENTER DESIGN
 * ──────────────────────────
 * This module follows the same utility-function pattern as voice/language
 * option helpers (clean exports, no hidden singletons, explicit dependency
 * injection via the optional `segmenter` parameter).
 *
 * To swap in wink-nlp for more accurate sentence detection:
 *
 *   // browser-side preview (synchronous, no model load):
 *   buildTtsBatches(text, opts)                      // uses IntlSegmenter
 *
 *   // server-side or after async init:
 *   import { createWinkSegmenter } from './winkSegmenter'
 *   const wink = createWinkSegmenter()
 *   buildTtsBatches(text, opts, wink)                // uses wink-nlp
 *
 * The segmenter parameter is the only thing that changes — the batching
 * logic, byte counting, and truncation logic stay the same.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A sentence boundary detector.  Receives raw text and returns an ordered
 * array of sentence strings (whitespace trimmed, empty strings excluded).
 *
 * Implement this interface to swap in any NLP backend:
 *   • IntlSegmenter  — browser-native (Unicode Annex #29, default)
 *   • WinkNLP        — ML-based, handles edge cases better (see winkSegmenter.ts)
 *   • Custom regex   — for specific domain text (e.g. legal, code)
 */
export interface SentenceSegmenter {
  /** Split `text` into an ordered array of sentence strings. */
  segment(text: string): string[]
}

/**
 * Options for buildTtsBatches().
 */
export interface TtsBatchOptions {
  /**
   * Maximum size per batch.
   * Characters (Unicode code-units) for Gemini; UTF-8 bytes for Chirp 3.
   */
  limit: number

  /**
   * When true, sizes are measured in UTF-8 bytes (for Chirp 3 HD).
   * When false, sizes are measured in JS string length / code-units (for Gemini).
   */
  isChirp3: boolean
}

// ─── Size utilities ───────────────────────────────────────────────────────────

/**
 * Returns the "size" of a text string as measured by the given provider:
 *   isChirp3 = true  → UTF-8 byte length  (TextEncoder)
 *   isChirp3 = false → JS string length   (code-units, ≈ characters for BMP text)
 *
 * This mirrors the server-side checks in the TTS API route so the client
 * and server agree on whether a batch is within the limit.
 *
 * @example
 *   textSize('hello', false) // 5 (chars)
 *   textSize('こんにちは', true)  // 15 (bytes: 3 bytes × 5 CJK chars)
 */
export function textSize(text: string, isChirp3: boolean): number {
  if (isChirp3) {
    // UTF-8 byte length — mirrors Buffer.byteLength on the server side
    return new TextEncoder().encode(text).length
  }
  // JS string length = UTF-16 code units ≈ Unicode code-points for BMP text
  return text.length
}

// ─── Default segmenter: Intl.Segmenter ───────────────────────────────────────

/**
 * Creates a sentence segmenter backed by the browser-native `Intl.Segmenter`
 * (Unicode Standard Annex #29 sentence boundary rules).
 *
 * Correctly handles:
 *   • Abbreviations — U.S., Dr., etc.
 *   • Decimal numbers — 1.2, $3.50
 *   • Ellipses and quoted speech
 *   • Multiple whitespace styles (CRLF, non-breaking space)
 *
 * Supported everywhere: Chrome 87+, Safari 14.1+, Firefox 78+ (via Intl polyfill),
 * and all modern Node.js versions.
 *
 * Falls back to treating the whole text as a single sentence if `Intl.Segmenter`
 * is unavailable (very old Safari).  The server-side limit check will then
 * reject oversized input with a clear 400 error.
 *
 * @param locale - BCP 47 locale tag (e.g. 'en-US').  Defaults to the runtime
 *                 locale, which is fine for most Latin-script TTS use cases.
 *
 * @example
 *   const segmenter = createIntlSegmenter()
 *   segmenter.segment('Hello there. How are you?')
 *   // → ['Hello there.', 'How are you?']
 */
export function createIntlSegmenter(locale?: string): SentenceSegmenter {
  return {
    segment(text: string): string[] {
      if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) {
        // Graceful degradation for environments without Intl.Segmenter
        return [text]
      }
      const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
      return Array.from(segmenter.segment(text), (seg) => seg.segment).filter(
        (s) => s.trim().length > 0
      )
    },
  }
}

// Singleton default — created once, reused for all batch calls in the same session
const _defaultSegmenter: SentenceSegmenter = createIntlSegmenter()

// ─── Batch packer ─────────────────────────────────────────────────────────────

/**
 * Split `text` into an ordered array of batch strings, each within the API
 * size limit.  Uses greedy sequential first-fit bin packing (O(n)).
 *
 * This is a pure function — pass different `segmenter` instances to swap
 * the NLP backend without touching the batching logic:
 *
 * @example
 *   // Default (Intl.Segmenter, browser-safe):
 *   const batches = buildTtsBatches(longText, { limit: 4096, isChirp3: false })
 *
 *   // Swap to wink-nlp on the server:
 *   import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
 *   const batches = buildTtsBatches(longText, { limit: 4096, isChirp3: false }, createWinkSegmenter())
 *
 * @param text      - Input text to split into TTS batches
 * @param opts      - Limit and provider type (governs size measurement)
 * @param segmenter - Sentence segmenter to use.  Defaults to IntlSegmenter.
 * @returns         Ordered array of batch strings, each ≤ opts.limit in size
 */
export function buildTtsBatches(
  text: string,
  opts: TtsBatchOptions,
  segmenter: SentenceSegmenter = _defaultSegmenter
): string[] {
  const { limit, isChirp3 } = opts
  const trimmed = text.trim()
  if (!trimmed) return []

  // Fast path: entire text fits in a single batch
  if (textSize(trimmed, isChirp3) <= limit) return [trimmed]

  // Segment text into sentences using the injected NLP backend
  const sentences = segmenter.segment(trimmed)

  const batches: string[] = []
  let currentBatch = ''
  let currentSize = 0

  for (const sentence of sentences) {
    const size = textSize(sentence, isChirp3)

    if (currentSize + size <= limit) {
      // Sentence fits in the current batch — keep packing
      currentBatch += sentence
      currentSize += size
    } else {
      // Flush current batch before starting a new one
      if (currentBatch.trim()) batches.push(currentBatch.trim())

      if (size > limit) {
        // Oversized single sentence (rare run-on sentence that exceeds the limit).
        // Truncate to the limit at a valid character boundary to avoid mojibake.
        batches.push(_truncateAtBoundary(sentence, limit, isChirp3))
        currentBatch = ''
        currentSize = 0
      } else {
        // Start a fresh batch with this sentence
        currentBatch = sentence
        currentSize = size
      }
    }
  }

  // Flush the final batch
  if (currentBatch.trim()) batches.push(currentBatch.trim())

  return batches
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Truncates `text` to at most `limit` bytes/chars without splitting a multi-byte
 * character or a UTF-16 surrogate pair.
 *
 * For Chirp 3 (UTF-8 bytes): walks back from `limit` to the nearest leading byte.
 * For Gemini (JS chars):      walks back if we land in the middle of a surrogate pair.
 */
function _truncateAtBoundary(text: string, limit: number, isChirp3: boolean): string {
  if (isChirp3) {
    // UTF-8 byte boundary: continuation bytes are 0x80-0xBF (10xxxxxx).
    // Walk back until we find a leading byte (0x00-0x7F or 0xC0-0xFF).
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const encoded = encoder.encode(text)
    let cutAt = Math.min(limit, encoded.length)
    while (cutAt > 0 && (encoded[cutAt] & 0xc0) === 0x80) cutAt--
    return decoder.decode(encoded.slice(0, cutAt))
  }

  // JS string char boundary: avoid splitting a high surrogate (0xD800-0xDBFF)
  let cutAt = limit
  if (cutAt < text.length) {
    const code = text.charCodeAt(cutAt - 1)
    if (code >= 0xd800 && code <= 0xdbff) cutAt--
  }
  return text.slice(0, cutAt)
}

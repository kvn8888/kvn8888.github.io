export const GEMINI_TTS_MODEL = "gemini-flash-latest";

export const TTS_CHAR_LIMITS = {
  gemini: 4000,
  chirp3: 5000,
} as const;

const COMMON_ABBREVIATIONS = new Set([
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "sr.",
  "jr.",
  "st.",
  "vs.",
  "etc.",
  "u.s.",
  "u.k.",
  "e.g.",
  "i.e.",
]);

function shouldSplitAtPeriod(text: string, index: number): boolean {
  const prev = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";

  if (/\d/.test(prev) && /\d/.test(next)) {
    return false;
  }

  const lookBack = text.slice(Math.max(0, index - 12), index + 1).toLowerCase();
  for (const abbreviation of COMMON_ABBREVIATIONS) {
    if (lookBack.endsWith(abbreviation)) {
      return false;
    }
  }

  return true;
}

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === "." && !shouldSplitAtPeriod(normalized, i)) {
      continue;
    }

    if (char === "." || char === "!" || char === "?") {
      const next = normalized[i + 1];
      const atBoundary = !next || /\s/.test(next);
      if (atBoundary) {
        const sentence = normalized.slice(start, i + 1).trim();
        if (sentence) sentences.push(sentence);

        let nextStart = i + 1;
        while (normalized[nextStart] === " ") nextStart += 1;
        start = nextStart;
      }
    }
  }

  const tail = normalized.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

export function chunkSentencesForLimit(sentences: string[], limit: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      let cursor = 0;
      while (cursor < sentence.length) {
        chunks.push(sentence.slice(cursor, cursor + limit).trim());
        cursor += limit;
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function buildTtsBatches(text: string, provider: keyof typeof TTS_CHAR_LIMITS) {
  const sentences = splitIntoSentences(text);
  const limit = TTS_CHAR_LIMITS[provider];
  const batches = chunkSentencesForLimit(sentences, limit);

  return {
    provider,
    model: provider === "gemini" ? GEMINI_TTS_MODEL : "chirp-3-hd",
    limit,
    sentenceCount: sentences.length,
    batchCount: batches.length,
    batches,
  };
}

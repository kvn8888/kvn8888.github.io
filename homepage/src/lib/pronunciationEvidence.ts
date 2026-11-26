import { createHash } from 'node:crypto'
import type { PronunciationCoachInput } from '@/lib/pronunciationCoach'
import { pronunciationCoachInputSchema } from '@/lib/pronunciationCoach'
import { NORMALIZATION_VERSION } from '@/lib/pronunciationAudio'

export type AzureAssessment = {
  Id?: string; RecognitionStatus?: string; DisplayText?: string; SNR?: number
  NBest?: AzureBest[]; PronunciationAssessment?: AzureScores; Words?: AzureWord[]
}
type AzureScores = { AccuracyScore?: number; FluencyScore?: number; CompletenessScore?: number; ProsodyScore?: number; PronScore?: number; ErrorType?: string; Feedback?: AzureFeedback }
type AzureFeedback = { Prosody?: { Break?: { ErrorTypes?: string[]; UnexpectedBreak?:{Confidence?:number}; MissingBreak?:{Confidence?:number}; BreakLength?:number }; Intonation?: { ErrorTypes?:string[]; Monotone?:{Confidence?:number; WordPitchSlopeConfidence?:number; SyllablePitchDeltaConfidence?:number} } } }
type AzurePart = { Offset?: number; Duration?: number; AccuracyScore?: number; PronunciationAssessment?: AzureScores }
type AzureWord = AzurePart & { Word?: string; ErrorType?: string; Feedback?: AzureFeedback; Syllables?: Array<AzurePart & { Syllable?: string; Grapheme?: string }>; Phonemes?: Array<AzurePart & { Phoneme?: string; NBestPhonemes?: Candidate[]; PronunciationAssessment?: AzureScores & { NBestPhonemes?: Candidate[] } }> }
type Candidate = { Phoneme: string; Score: number }
type AzureBest = AzureScores & { Display?: string; Lexical?: string; Confidence?: number; PronunciationAssessment?: AzureScores; Words?: AzureWord[] }
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export const exerciseHash = (text: string, language: string) => digest(language.toLowerCase() + '\0' + text.trim())
export const TICKS_PER_SECOND = 10_000_000

export function extractAzureEvidence(data: AzureAssessment, context: { referenceText: string; language: string; source: 'recording' | 'reference-voice'; referenceSource: 'manual' | 'transcription' }) {
  const best = data.NBest?.[0]
  const a = best?.PronunciationAssessment ?? data.PronunciationAssessment ?? best
  if (!a) return null
  const words = (best?.Words ?? data.Words ?? []).slice(0, 220).map(word => ({
    word: word.Word ?? '', accuracyScore: word.PronunciationAssessment?.AccuracyScore ?? word.AccuracyScore ?? 0,
    errorType: word.PronunciationAssessment?.ErrorType ?? word.ErrorType ?? 'None', offset: word.Offset, duration: word.Duration,
    syllables: (word.Syllables ?? []).map(s => ({ syllable: s.Syllable ?? '', grapheme: s.Grapheme, offset: s.Offset, duration: s.Duration, accuracyScore: s.PronunciationAssessment?.AccuracyScore ?? s.AccuracyScore ?? 0 })),
    phonemes: (word.Phonemes ?? []).slice(0,64).map(p => ({ phoneme: p.Phoneme ?? '', offset: p.Offset, duration: p.Duration, accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore ?? 0, nBestPhonemes: (p.PronunciationAssessment?.NBestPhonemes ?? p.NBestPhonemes ?? []).slice(0,5).map(c => ({ phoneme: c.Phoneme, score: c.Score })) })),
    prosody: {
      unexpectedBreakConfidence:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Break?.UnexpectedBreak?.Confidence,
      missingBreakConfidence:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Break?.MissingBreak?.Confidence,
      breakLength:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Break?.BreakLength,
      monotoneConfidence:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Intonation?.Monotone?.Confidence,
      wordPitchSlopeConfidence:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Intonation?.Monotone?.WordPitchSlopeConfidence,
      syllablePitchDeltaConfidence:(word.PronunciationAssessment?.Feedback??word.Feedback)?.Prosody?.Intonation?.Monotone?.SyllablePitchDeltaConfidence,
      breakErrorTypes: (word.PronunciationAssessment?.Feedback ?? word.Feedback)?.Prosody?.Break?.ErrorTypes ?? [],
      intonationErrorTypes: (word.PronunciationAssessment?.Feedback ?? word.Feedback)?.Prosody?.Intonation?.ErrorTypes ?? [],
    },
  }))
  const parsed = pronunciationCoachInputSchema.safeParse({
    ...context, recognizedText: best?.Display ?? data.DisplayText ?? '', recognitionStatus: data.RecognitionStatus ?? 'Unknown', snr: data.SNR,
    scores: { pronunciation: a.PronScore, accuracy: a.AccuracyScore, fluency: a.FluencyScore, completeness: a.CompletenessScore, prosody: a.ProsodyScore },
    words,
  })
  if (!parsed.success) return null
  return { input: parsed.data, historyWords: words, lexical: best?.Lexical, confidence: best?.Confidence }
}

export type Alignment = { phonemes: { id: string; phoneme: string; startSec: number; endSec: number }[]; phrases: { id: string; startSec: number; endSec: number; text: string; wordCount: number; wpm: number }[] }
export function buildAlignment(input: PronunciationCoachInput): Alignment {
  const phonemes: Alignment['phonemes'] = [], phrases: Alignment['phrases'] = []
  for (const [wi, w] of input.words.entries()) {
    if (w.errorType === 'Omission' || w.errorType === 'Insertion' || w.offset == null || w.duration == null || w.duration <= 0) continue
    const startSec = w.offset / TICKS_PER_SECOND, endSec = (w.offset + w.duration) / TICKS_PER_SECOND
    const last = phrases.at(-1)
    if (!last || startSec - last.endSec >= 0.45) phrases.push({ id: 'phrase-w' + wi, text: w.word, startSec, endSec, wordCount: 1, wpm: 0 })
    else { last.text += ' ' + w.word; last.endSec = endSec; last.wordCount++ }
    for (const [pi, p] of w.phonemes.entries()) {
      if (!p.phoneme || p.offset == null || p.duration == null || p.duration <= 0) continue
      phonemes.push({ id: 'w' + wi + '.p' + pi, phoneme: p.phoneme, startSec: p.offset / TICKS_PER_SECOND, endSec: (p.offset + p.duration) / TICKS_PER_SECOND })
    }
  }
  for (const p of phrases) p.wpm = Math.round(60 * p.wordCount / Math.max(p.endSec - p.startSec, .5))
  return { phonemes: phonemes.slice(0, 300), phrases: phrases.slice(0, 80) }
}

export function referenceQuality(input: PronunciationCoachInput) {
  if (input.recognitionStatus !== 'Success') return { accepted: false, reason: 'Recognition did not succeed.' }
  if (input.scores.pronunciation < 90) return { accepted: false, reason: 'Overall score below 90.' }
  if (input.words.some(w => ['Omission','Insertion'].includes(w.errorType))) return { accepted: false, reason: 'Reference text alignment differs.' }
  const phones = input.words.flatMap(w => w.phonemes)
  if (!phones.length) return { accepted: false, reason: 'No phoneme measurements.' }
  if (phones.some(p => p.accuracyScore < 60)) return { accepted: false, reason: 'At least one phoneme scored below 60.' }
  return { accepted: true }
}

export const assessmentProfile = (fallback: boolean) => 'azure-rest-conversation-v1/' + (fallback ? 'basic' : 'comprehensive') + '/' + NORMALIZATION_VERSION

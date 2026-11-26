export type MetricRange = { min: number; max: number; mean: number; sampleCount: number }
export type ScoreMetric = 'pronunciation' | 'accuracy' | 'fluency' | 'completeness' | 'prosody'

export interface ReferenceSample {
  id: string
  voice: string
  model: string
  createdAt: number
  score: number | null
  accepted: boolean
  reason?: string
  audioUrl?: string
}

export interface PhoneComparison {
  id: string
  word: string
  phoneme: string
  score: number
  referenceScore: MetricRange
  durationMs: number | null
  referenceDurationMs: MetricRange | null
  vowel?: { f1Hz: number; f2Hz: number; f1Z: number | null; f2Z: number | null; referenceF1Z: MetricRange | null; referenceF2Z: MetricRange | null }
}

export interface PhraseComparison {
  id: string
  text: string
  learnerContour: (number | null)[]
  referenceContour: (MetricRange | null)[]
  learnerDurationMs: number
  referenceDurationMs: MetricRange | null
}

export interface PhonemeTrend {
  phoneme: string
  attemptCount: number
  tokenCount: number
  distinctWords: number
  words: string[]
  meanScore: number
  latestMean: number
  previousMean: number
  suspectedLowCount: number
  lowAttemptCount: number
  lowDistinctWords: number
}

export interface CalibrationReport {
  exerciseId: string
  attemptId: string
  source: 'recording' | 'reference-voice'
  normalizationVersion: string
  referenceSamples: ReferenceSample[]
  eligibleReferenceCount: number
  referenceVoiceCount: number
  learnerScores: Partial<Record<ScoreMetric, number>>
  scoreRanges: Partial<Record<ScoreMetric, MetricRange>>
  phoneComparisons: PhoneComparison[]
  phraseComparisons: PhraseComparison[]
  pauseComparison: { learnerSeconds: number; referenceSeconds: MetricRange } | null
  pauseLocations?: { id:string; afterWord:string; beforeWord:string; learnerSeconds:number; referenceSeconds:MetricRange }[]
  trends: PhonemeTrend[]
  caveat: string
}

import { buildAlignment } from '@/lib/pronunciationEvidence'
import type { PronunciationCoachInput } from '@/lib/pronunciationCoach'

export interface AcousticDelivery {
  version: number
  summary: { durationSec: number; voicedDurationSec: number; pauseCount: number; totalPauseSec: number; longPauseCount: number }
  pitch: { medianHz: number | null; rangeSemitones: number | null; stddevSemitones: number | null; endingDeltaSemitones: number | null; series: { timeSec:number; semitones?:number|null }[] }
  intensity: { rangeDb: number | null; stddevDb: number | null; series: { timeSec:number; db?:number|null }[] }
  speechSegments: {startSec:number; endSec:number; durationSec:number}[]
  pauses: {startSec:number; endSec:number; durationSec:number}[]
  vowels?: {id:string; phoneme:string; f1Hz:number; f2Hz:number; f1Z:number|null; f2Z:number|null}[]
  phrasePitch?: {id:string; contourSemitones:(number|null)[]; endingDeltaSemitones:number|null}[]
  acousticInsights: unknown[]
}
export interface StoredDelivery extends AcousticDelivery {
  speakingRateWpm: number | null
  phrases: ReturnType<typeof buildAlignment>['phrases']
  insights: never[]
}
export function buildStoredDelivery(raw: AcousticDelivery, input: PronunciationCoachInput): StoredDelivery {
  const { phrases } = buildAlignment(input)
  const span = phrases.length ? phrases[phrases.length-1].endSec - phrases[0].startSec : 0
  const speakingRateWpm = span > 0 ? Math.round(60 * phrases.reduce((sum,p)=>sum+p.wordCount,0)/Math.max(span,.5)) : null
  return { ...raw, speakingRateWpm, phrases, insights: [] }
}
export function addDeliveryEvidence(input: PronunciationCoachInput, d: StoredDelivery | null): PronunciationCoachInput {
  if (!d) return input
  return { ...input, delivery: { speakingRateWpm:d.speakingRateWpm,durationSec:d.summary.durationSec,pauseCount:d.summary.pauseCount,totalPauseSec:d.summary.totalPauseSec,pitchRangeSemitones:d.pitch.rangeSemitones,intensityRangeDb:d.intensity.rangeDb,pauses:d.pauses.slice(0,80),phrases:d.phrases.slice(0,80).map(p=>({...p,text:p.text.slice(0,500)})) } }
}

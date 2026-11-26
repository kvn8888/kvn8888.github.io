import { pronunciationDb, mapAttempt, type StoredAttempt } from '@/lib/pronunciationDb'
import type { CalibrationReport, MetricRange, ScoreMetric, PhonemeTrend, PhoneComparison, PhraseComparison } from '@/lib/pronunciationCalibrationTypes'

const metrics: ScoreMetric[] = ['pronunciation','accuracy','fluency','completeness','prosody']
export function range(values: (number|null|undefined)[]): MetricRange | null {
  const finite = values.filter((v):v is number => typeof v === 'number' && Number.isFinite(v))
  return finite.length ? { min:Math.min(...finite),max:Math.max(...finite),mean: Math.round(finite.reduce((a,b)=>a+b,0)/finite.length*100)/100,sampleCount:finite.length } : null
}

const wordKey = (value:string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}'’-]/gu,'')
function alignedPhone(a:StoredAttempt,wi:number,pi:number,word:string,phoneme:string) {
  const w = a.input.words[wi], p = w?.phonemes[pi]
  if (!w || !p || w.errorType==='Omission' || w.errorType==='Insertion' || wordKey(w.word)!==wordKey(word) || p.phoneme!==phoneme) return null
  return p
}
function sampleReferences(attempt:StoredAttempt, rows:StoredAttempt[]) {
  // Prefer different speakers; at most one eligible generation per voice.
  const accepted: StoredAttempt[] = []
  const voices = new Set<string>(), hashes=new Set([attempt.audioSha])
  for (const r of rows) if (r.accepted && r.voice && r.id!==attempt.id && !hashes.has(r.audioSha) && !voices.has(r.voice)) {
    accepted.push(r); voices.add(r.voice); hashes.add(r.audioSha)
    if (accepted.length===3) break
  }
  return accepted
}
export function compareAttempts(attempt:StoredAttempt, rows:StoredAttempt[], trends:PhonemeTrend[]):CalibrationReport {
  const accepted = sampleReferences(attempt,rows)
  const scoreRanges:CalibrationReport['scoreRanges'] = {}
  for (const metric of metrics) {
    const r = range(accepted.map(a=>a.input.scores[metric]))
    if (r) scoreRanges[metric]=r
  }
  const phoneComparisons:PhoneComparison[] = []
  for (const [wi,w] of attempt.input.words.entries()) {
    if (w.errorType==='Omission' || w.errorType==='Insertion') continue
    for (const [pi,p] of w.phonemes.entries()) {
      const id = 'w'+wi+'.p'+pi
      const aligned = accepted.flatMap(a=>{const phone=alignedPhone(a,wi,pi,w.word,p.phoneme); return phone?[{a,phone}]:[]})
      const r = range(aligned.map(a=>a.phone.accuracyScore))
      if (!r) continue
      const pupilVowel=attempt.delivery?.vowels?.find(v=>v.id===id)
      const referenceVowels=aligned.map(({a})=>a.delivery?.vowels?.find(v=>v.id===id&&v.phoneme===p.phoneme))
      phoneComparisons.push({ id,word:w.word,phoneme:p.phoneme,score:p.accuracyScore,referenceScore:r,
        durationMs:p.duration==null?null:p.duration/10000,referenceDurationMs:range(aligned.map(({phone})=>phone.duration==null?null:phone.duration/10000)),
        ...(pupilVowel?{vowel:{ f1Hz:pupilVowel.f1Hz,f2Hz:pupilVowel.f2Hz,f1Z:pupilVowel.f1Z,f2Z:pupilVowel.f2Z,referenceF1Z:range(referenceVowels.map(v=>v?.f1Z)),referenceF2Z:range(referenceVowels.map(v=>v?.f2Z)) }}:{}) })
    }
  }
  const phraseComparisons:PhraseComparison[] = []
  for (const p of attempt.delivery?.phrases??[]) {
    const pitch=attempt.delivery?.phrasePitch?.find(v=>v.id===p.id)
    const reference=accepted.flatMap(a=>{const phrase=a.delivery?.phrases.find(v=>v.id===p.id&&wordKey(v.text)===wordKey(p.text)); const contour=a.delivery?.phrasePitch?.find(v=>v.id===p.id);return phrase&&contour?[{phrase,contour}]:[]})
    if (!pitch||!reference.length) continue
    phraseComparisons.push({ id:p.id,text:p.text,learnerContour:pitch.contourSemitones,referenceContour:pitch.contourSemitones.map((_,i)=>range(reference.map(r=>r.contour.contourSemitones[i]))),
      learnerDurationMs:Math.round((p.endSec-p.startSec)*1000), referenceDurationMs:range(reference.map(r=>(r.phrase.endSec-r.phrase.startSec)*1000)) })
  }
  const pause=range(accepted.map(a=>a.delivery?.summary.totalPauseSec))
  // Compare gaps at matching word boundaries, even when different pauses split phrases differently.
  const pauseLocations:NonNullable<CalibrationReport['pauseLocations']>=[]
  function gap(a:StoredAttempt,wi:number,first:string,next:string) {
    const w=a.input.words[wi], n=a.input.words[wi+1]
    if (!w||!n||wordKey(w.word)!==wordKey(first)||wordKey(n.word)!==wordKey(next)||[w,n].some(x=>x.errorType==='Omission'||x.errorType==='Insertion')||w.offset==null||w.duration==null||n.offset==null) return null
    return Math.max(0,(n.offset-w.offset-w.duration)/10_000_000)
  }
  for (let i=0;i<attempt.input.words.length-1;i++) {
    const first=attempt.input.words[i].word,next=attempt.input.words[i+1].word
    const learner=gap(attempt,i,first,next),ref=range(accepted.map(a=>gap(a,i,first,next)))
    if (learner!=null&&ref&&(learner>=.18||ref.max>=.18)) pauseLocations.push({id:'gap-w'+i,afterWord:first,beforeWord:next,learnerSeconds:learner,referenceSeconds:ref})
  }
  return {
    exerciseId:attempt.exerciseId,attemptId:attempt.id,source:attempt.source,normalizationVersion:attempt.normalizationVersion,
    referenceSamples:rows.slice(0,20).map(r=>({id:r.id,voice:r.voice??'Unknown voice',model:r.model??'Unknown model',createdAt:r.createdAt,score:r.input.scores.pronunciation,accepted:r.accepted,reason:r.reason,audioUrl:r.audioKey?'/api/speech/pronunciation/audio?id='+r.id:r.referenceUrl??undefined})),
    eligibleReferenceCount:accepted.length,referenceVoiceCount:new Set(accepted.map(a=>a.voice)).size,learnerScores:attempt.input.scores,scoreRanges,
    phoneComparisons:phoneComparisons.sort((a,b)=>(a.score-a.referenceScore.mean)-(b.score-b.referenceScore.mean)).slice(0,150),phraseComparisons,
    pauseComparison:pause&&attempt.delivery?{learnerSeconds:attempt.delivery.summary.totalPauseSec,referenceSeconds:pause}:null,pauseLocations:pauseLocations.sort((a,b)=>Math.abs(b.learnerSeconds-b.referenceSeconds.mean)-Math.abs(a.learnerSeconds-a.referenceSeconds.mean)).slice(0,20),trends,
    caveat:'Synthetic ranges are examples, not pass thresholds. Comparisons use the same phrase, language and assessment settings; phone candidates and vowel/formant estimates are uncertain. Within-clip normalized formants need enough varied vowels and are exploratory, not a diagnosis.',
  }
}

export async function getCalibrationReport(attempt:StoredAttempt) {
  const client=await pronunciationDb()
  const common='FROM pronunciation_attempt a JOIN speech_history h ON h.id=a.id AND h.user_email=a.user_email'
  const ref=await client.execute({sql:'SELECT a.* '+common+" WHERE a.user_email=? AND a.exercise_id=? AND a.source='reference-voice' AND a.provider_profile=? AND a.model='elevenlabs/eleven-v4' ORDER BY a.created_at DESC LIMIT 30",args:[attempt.email,attempt.exerciseId,attempt.providerProfile]})
  // Distinct attempts and distinct words; frequency of low estimates is descriptive.
  const history=await client.execute({sql:`SELECT p.phoneme,p.word,p.score,a.id,a.created_at,a.audio_sha FROM pronunciation_phoneme p
    JOIN pronunciation_attempt a ON a.id=p.attempt_id JOIN speech_history h ON h.id=a.id AND h.user_email=a.user_email
    WHERE a.user_email=? AND a.language=? AND a.source='recording' AND a.provider_profile=?
      AND a.id IN (SELECT a2.id FROM pronunciation_attempt a2 JOIN speech_history h2 ON h2.id=a2.id AND h2.user_email=a2.user_email WHERE a2.user_email=? AND a2.language=? AND a2.source='recording' ORDER BY a2.created_at DESC LIMIT 60)
    ORDER BY a.created_at DESC`,args:[attempt.email,attempt.language,attempt.providerProfile,attempt.email,attempt.language]})
  const groups=new Map<string,typeof history.rows>()
  const latestByAudio=new Map<string,string>()
  for (const row of history.rows) {
    const hash=String(row.audio_sha), id=String(row.id)
    if(!latestByAudio.has(hash))latestByAudio.set(hash,id)
    if(latestByAudio.get(hash)!==id)continue
    const key=String(row.phoneme)
    const group=groups.get(key)??[]
    group.push(row);groups.set(key,group)
  }
  const trends:PhonemeTrend[]=[]
  for (const [phoneme,rows] of groups) {
    const attempts=new Set(rows.map(r=>String(r.id))), words=new Set(rows.map(r=>String(r.word).toLowerCase()))
    if (attempts.size<2 || words.size<2 || rows.length<3) continue
    const firstId=rows[0].id
    const latest=range(rows.filter(r=>r.id===firstId).map(r=>Number(r.score)))!, previous=range(rows.filter(r=>r.id!==firstId).map(r=>Number(r.score)))!
    trends.push({phoneme,attemptCount:attempts.size,tokenCount:rows.length,distinctWords:words.size,words:[...words].slice(0,8),meanScore:range(rows.map(r=>Number(r.score)))!.mean,latestMean:latest.mean,previousMean:previous.mean,suspectedLowCount:rows.filter(r=>Number(r.score)<80).length,lowAttemptCount:new Set(rows.filter(r=>Number(r.score)<80).map(r=>r.id)).size,lowDistinctWords:new Set(rows.filter(r=>Number(r.score)<80).map(r=>String(r.word).toLowerCase())).size})
  }
  return compareAttempts(attempt,ref.rows.map(r=>mapAttempt(r as Record<string,unknown>)),trends.sort((a,b)=>b.suspectedLowCount-a.suspectedLowCount||a.meanScore-b.meanScore).slice(0,20))
}

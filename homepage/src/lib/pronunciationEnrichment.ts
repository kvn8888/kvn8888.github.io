import { getAttempt, getAttemptAudio, updateAttemptAnalysis, readCoachCache, claimAttemptWork, releaseAttemptWork } from '@/lib/pronunciationDb'
import { buildAlignment, digest } from '@/lib/pronunciationEvidence'
import { requestAcousticAnalysis } from '@/lib/speechService'
import { buildStoredDelivery, addDeliveryEvidence } from '@/lib/pronunciationDelivery'
import { getCalibrationReport } from '@/lib/pronunciationCalibration'
import { getSecret } from '@/lib/secrets'
import { generatePronunciationCoach, pronunciationCoachInputSchema, PRONUNCIATION_COACH_PROMPT_VERSION, PRONUNCIATION_COACH_MODEL, PRONUNCIATION_COACH_EFFORT } from '@/lib/pronunciationCoach'

export class AttemptNotFound extends Error {}
export class AttemptBusy extends Error {}

export async function enrichDelivery(email:string,attemptId:string) {
  const current=await getAttempt(email,attemptId)
  if (!current) throw new AttemptNotFound()
  if (current.delivery?.version===2) return current.delivery
  const lease=await claimAttemptWork(email,attemptId,'delivery')
  if (lease==null) throw new AttemptBusy()
  try {
    const fresh=await getAttempt(email,attemptId)
    if (!fresh) throw new AttemptNotFound()
    if (fresh.delivery?.version===2) return fresh.delivery
    const audio=await getAttemptAudio(fresh)
    if (digest(audio.buffer)!==fresh.audioSha) throw new Error('Audio evidence hash mismatch')
    const raw=await requestAcousticAnalysis(email,audio.buffer,buildAlignment(fresh.input))
    if (raw.version!==2) throw new Error('Acoustic worker has not yet updated')
    const delivery=buildStoredDelivery(raw,fresh.input)
    await updateAttemptAnalysis(email,attemptId,{delivery,deliveryError:null})
    return delivery
  } catch (err) {
    await updateAttemptAnalysis(email,attemptId,{deliveryError:'Acoustic analysis unavailable'}).catch(()=>{})
    throw err
  } finally { await releaseAttemptWork(email,attemptId,'delivery',lease).catch(()=>{}) }
}

export async function enrichCoaching(email:string,attemptId:string) {
  const attempt=await getAttempt(email,attemptId)
  if (!attempt) throw new AttemptNotFound()
  const input=addDeliveryEvidence(attempt.input,attempt.delivery)
  const report=await getCalibrationReport(attempt)
  const calibrationEvidence:{id:string;description:string}[]=[]
  const subject=attempt.source==='recording'?'learner':'assessed synthetic take'
  if (report.referenceVoiceCount>=2) {
    for (const [metric,r] of Object.entries(report.scoreRanges)) if (r.sampleCount>=2) calibrationEvidence.push({id:'ref.'+metric,description:'Same-phrase synthetic '+metric+' range '+r.min+'–'+r.max+' from '+r.sampleCount+' distinct reference voices; '+subject+' '+input.scores[metric as keyof typeof input.scores]})
    report.phoneComparisons.filter(p=>p.referenceScore.sampleCount>=2).slice(0,12).forEach((p,i)=>calibrationEvidence.push({id:'ref.phone'+i,description:'Aligned '+p.word+' /'+p.phoneme+'/ '+subject+' '+p.score+', same-phrase reference range '+p.referenceScore.min+'–'+p.referenceScore.max+(p.referenceDurationMs&&p.durationMs!=null&&p.referenceDurationMs.sampleCount>=2?'; duration '+p.durationMs.toFixed(0)+' ms vs '+p.referenceDurationMs.min.toFixed(0)+'–'+p.referenceDurationMs.max.toFixed(0)+' ms':'')}))
    for (const [i,p] of (report.pauseLocations??[]).filter(p=>p.referenceSeconds.sampleCount>=2).slice(0,5).entries()) calibrationEvidence.push({id:'ref.gap'+i,description:'Aligned gap after '+p.afterWord+' before '+p.beforeWord+': '+p.learnerSeconds.toFixed(2)+' s; synthetic range '+p.referenceSeconds.min.toFixed(2)+'–'+p.referenceSeconds.max.toFixed(2)+' s'})
    for (const [i,p] of report.phraseComparisons.slice(0,5).entries()) calibrationEvidence.push({id:'ref.phrase'+i,description:'Phrase '+JSON.stringify(p.text)+' relative pitch contour '+JSON.stringify(p.learnerContour)+' semitones; synthetic mean contour '+JSON.stringify(p.referenceContour.map(v=>v?.sampleCount&&v.sampleCount>=2?v.mean:null))+' semitones from own voiced medians'})
  }
  if (attempt.source==='recording') report.trends.filter(t=>t.lowAttemptCount>=2&&t.lowDistinctWords>=2).slice(0,10).forEach((t,i)=>calibrationEvidence.push({id:'trend'+i,description:'/'+t.phoneme+'/ '+t.tokenCount+' measured tokens across '+t.attemptCount+' recorded attempts, '+t.distinctWords+' distinct words ('+t.words.join(', ')+'); '+t.suspectedLowCount+' scores below 80; mean '+t.meanScore+'; low estimates may be in one session'}))
  if (attempt.delivery?.vowels) for (const [i,v] of attempt.delivery.vowels.slice(0,8).entries()) calibrationEvidence.push({id:'vowel'+i,description:'Azure-aligned /'+v.phoneme+'/ Praat F1 '+v.f1Hz+' Hz, F2 '+v.f2Hz+' Hz; within-clip z scores '+(v.f1Z??'unavailable')+', '+(v.f2Z??'unavailable')+'; approximate vowel measurement only'})
  const evidence=pronunciationCoachInputSchema.parse({...input,calibrationEvidence:calibrationEvidence.map(e=>({...e,description:e.description.slice(0,600)}))})
  const cacheKey=digest(JSON.stringify({audio:attempt.audioSha,reference:attempt.referenceSha,model:PRONUNCIATION_COACH_MODEL,effort:PRONUNCIATION_COACH_EFFORT,prompt:PRONUNCIATION_COACH_PROMPT_VERSION,evidence}))
  if (attempt.coachCacheKey===cacheKey&&attempt.coach) return {coach:attempt.coach,cached:true}
  const cached=await readCoachCache(email,cacheKey)
  if (cached) {
    await updateAttemptAnalysis(email,attemptId,{coach:cached,coachError:null,coachCacheKey:cacheKey})
    return {coach:cached,cached:true}
  }
  const lease=await claimAttemptWork(email,attemptId,'coach')
  if (lease==null) throw new AttemptBusy()
  try {
    const already=await readCoachCache(email,cacheKey)
    if (already) {await updateAttemptAnalysis(email,attemptId,{coach:already,coachError:null,coachCacheKey:cacheKey});return {coach:already,cached:true}}
    const key=await getSecret('OPENAI_API_KEY')
    if (!key) throw new Error('AI pronunciation coaching is not configured')
    const coach=await generatePronunciationCoach(evidence,key)
    await updateAttemptAnalysis(email,attemptId,{coach,coachError:null,coachCacheKey:cacheKey})
    return {coach,cached:false}
  } catch (err) {
    await updateAttemptAnalysis(email,attemptId,{coachError:'AI coaching unavailable'}).catch(()=>{})
    throw err
  } finally { await releaseAttemptWork(email,attemptId,'coach',lease).catch(()=>{}) }
}

export async function enrichAttemptInBackground(email:string,attemptId:string) {
  try {
    await enrichDelivery(email,attemptId)
  } catch (err) {
    if (err instanceof AttemptBusy) {
      // A foreground task owns this phase; let its measured result complete before coaching.
      for (let i=0;i<15;i++) {
        await new Promise(resolve=>setTimeout(resolve,2000))
        if ((await getAttempt(email,attemptId))?.delivery) break
      }
    }
  }
  try { await enrichCoaching(email,attemptId) } catch { /* stored evidence remains available for retry */ }
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getSecret } from '@/lib/secrets'
import { normalizePronunciationWav, NORMALIZATION_VERSION } from '@/lib/pronunciationAudio'
import { extractAzureEvidence, digest, type AzureAssessment } from '@/lib/pronunciationEvidence'
import { getTursoClient } from '@/lib/turso'
import { randomUUID } from 'node:crypto'
import { uploadToS3, downloadFromS3, deleteFromS3 } from '@/lib/speechStorage'
import { reportServerEvent } from '@/lib/axiom'

const TEXT='The weather is getting warmer, so I think we should walk to the park.'
const LANGUAGE='en-US'
const FIXTURE='pronunciation-canary.wav'
const BASELINE_FILE='pronunciation-canary-baseline.json'

export async function measurePronunciationCanary() {
  const audio=normalizePronunciationWav(await readFile(path.join(process.cwd(),'src/lib/fixtures',FIXTURE))).wav
  const key=await getSecret('AZURE_SPEECH_KEY'), region=await getSecret('AZURE_SPEECH_REGION')
  if (!key||!region) throw new Error('Azure Speech not configured')
  const params={ReferenceText:TEXT,GradingSystem:'HundredMark',Granularity:'Phoneme',Dimension:'Comprehensive',Format:'Detailed',PhonemeAlphabet:'IPA',NBestPhonemeCount:5,EnableMiscue:'True',EnableProsodyAssessment:'True'}
  const response=await fetch('https://'+region+'.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language='+LANGUAGE+'&format=detailed',{method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000','Pronunciation-Assessment':Buffer.from(JSON.stringify(params)).toString('base64'),Accept:'application/json'},body:new Uint8Array(audio),signal:AbortSignal.timeout(20_000)})
  if (!response.ok) throw new Error('Azure canary HTTP '+response.status)
  const result=extractAzureEvidence(await response.json() as AzureAssessment,{referenceText:TEXT,language:LANGUAGE,source:'reference-voice',referenceSource:'manual'})
  if (!result) throw new Error('Azure canary returned no complete assessment')
  return { audioSha256:digest(audio), normalizationVersion:NORMALIZATION_VERSION,scores:result.input.scores,
    phones:result.input.words.flatMap((w,wi)=>w.errorType==='Omission'?[]:w.phonemes.map((p,pi)=>({id:'w'+wi+'.p'+pi,phoneme:p.phoneme,score:p.accuracyScore})))}
}

export async function runPronunciationCanary() {
  const db=getTursoClient()
  if (!db) throw new Error('Canary database not configured')
  const measurement=await measurePronunciationCanary()
  const baseline=JSON.parse(await readFile(path.join(process.cwd(),'src/lib/fixtures',BASELINE_FILE),'utf8')) as Awaited<ReturnType<typeof measurePronunciationCanary>>
  if (baseline.audioSha256!==measurement.audioSha256 || baseline.normalizationVersion!==measurement.normalizationVersion) throw new Error('Canary fixture or normalization changed; establish a new baseline')
  const scoreDeltas=Object.fromEntries(Object.entries(measurement.scores).map(([k,v])=>[k,typeof baseline.scores[k as keyof typeof baseline.scores]==='number'?Math.round((v-baseline.scores[k as keyof typeof baseline.scores]!)*100)/100:null]))
  const changedPhones=measurement.phones.filter(p=>{const prior=baseline.phones.find(b=>b.id===p.id&&b.phoneme===p.phoneme);return prior&&Math.abs(prior.score-p.score)>=20}).length
  const missingPhones=baseline.phones.filter(p=>!measurement.phones.some(v=>v.id===p.id&&v.phoneme===p.phoneme)).length
  const drift=Object.entries(scoreDeltas).some(([k,v])=>typeof v==='number'&&Math.abs(v)>=(k==='pronunciation'||k==='prosody'?3:5))||changedPhones>2||missingPhones>0
  // Synthetic storage round trip also checks that private evidence persistence is operational.
  const storageKey='speech/pronunciation/attempts/canary/'+randomUUID()+'/verification.json'
  const storageBody=Buffer.from(JSON.stringify({audioSha256:measurement.audioSha256,normalizationVersion:NORMALIZATION_VERSION}))
  let storageVerified=false
  let wrote=false
  try {
    wrote=Boolean(await uploadToS3(storageBody,storageKey,'application/json'))
    if(wrote) storageVerified=(await downloadFromS3(storageKey)).buffer.equals(storageBody)
  } catch { /* preserve the scoring drift result even when storage is unavailable */ }
  finally { if(wrote) await deleteFromS3(storageKey) }
  const record={...measurement,scoreDeltas,changedPhones,missingPhones,drift,storageVerified}
  await db.execute('CREATE TABLE IF NOT EXISTS pronunciation_canary (ran_at INTEGER PRIMARY KEY, audio_sha TEXT NOT NULL, result_json TEXT NOT NULL)')
  await db.execute({sql:'INSERT INTO pronunciation_canary (ran_at,audio_sha,result_json) VALUES (?,?,?)',args:[Date.now(),measurement.audioSha256,JSON.stringify(record)]})
  await reportServerEvent({event:'speech.pronunciation.canary',level:drift||!storageVerified?'warn':'info',message:drift?'Synthetic pronunciation scoring drift detected':'Synthetic pronunciation scoring canary stable',data:{...record,phones:undefined}})
  return {scoreDeltas,changedPhones,missingPhones,drift,storageVerified,audioSha256:measurement.audioSha256}
}

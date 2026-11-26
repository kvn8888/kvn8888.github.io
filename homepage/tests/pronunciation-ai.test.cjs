const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const ts = require('typescript')
const { NextRequest } = require('next/server')
const { createClient } = require('@libsql/client')
const root = path.resolve(__dirname, '..')

function load(relative, mocks = {}, request = fetch, cache = new Map()) {
  const filename = path.join(root, relative)
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  cache.set(filename, module.exports)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const resolve = name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks, request, cache)
    if (name.startsWith('.')) return load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts')),mocks,request,cache)
    return require(name)
  }
  new Function('require', 'module', 'exports', 'fetch', 'console', source)(resolve, module, module.exports, request, { ...console, error: () => {} })
  return module.exports
}
const coachPath = 'src/lib/pronunciationCoach.ts'
const refPath = 'src/app/api/speech/pronunciation/reference/route.ts'
const refText = 'The weather is nice today.'
const voices = load('src/lib/pronunciationVoices.ts')
const coachLib = load(coachPath)
const input = coachLib.pronunciationCoachInputSchema.parse({
  referenceText: refText, recognizedText: refText, language: 'en-US', source: 'recording', referenceSource: 'manual',
  scores: { pronunciation: 95, accuracy: 98, fluency: 99, completeness: 100, prosody: 90 }, recognitionStatus: 'Success',
  words: [{ word: 'the', accuracyScore: 97, errorType: 'None', phonemes: [{ phoneme: 'ð', accuracyScore: 97, nBestPhonemes: [{ phoneme: 'ð', score: 100 }] }] }],
})
const modelOutput = { summary: 'The recording is generally clear.', strengths: [{ title: 'Clear target sounds', evidenceIds: ['score.accuracy'] }], priorities: [{ category: 'prosody', title: 'Explore natural emphasis', practice: 'Repeat the phrase with emphasis on the key word.', confidence: 'low', evidenceIds: ['score.prosody'] }] }

function jsonRequest(url, body, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

test('coach uses actual measured evidence, rejects unsupported evidence, and requests Sol medium', async () => {
  const result = await coachLib.generatePronunciationCoach(input, 'test-key', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-6.2-sol')
    assert.equal(body.reasoning.effort, 'medium')
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.ok(JSON.parse(body.input).evidence.some(e => e.id === 'w0.p0'))
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(modelOutput) }] }] })
  })
  assert.equal(result.model, 'gpt-6.2-sol')
  assert.equal(result.reasoningEffort, 'medium')
  assert.equal(result.strengths[0].evidence, 'Azure accuracy: 98/100')
  assert.equal(result.priorities[0].evidence, 'Azure prosody: 90/100')
  assert.throws(() => coachLib.groundPronunciationCoach(input, { ...modelOutput, strengths: [{ title: 'Made up', evidenceIds: ['w99'] }] }), /Invalid coaching evidence/)
  assert.throws(()=>coachLib.groundPronunciationCoach(input,{...modelOutput,summary:'You scored 23/100.'}),/Unmatched coaching measurement/)
  assert.equal(coachLib.pronunciationCoachInputSchema.safeParse({ ...input, scores: { ...input.scores, accuracy: 105 } }).success, false)
})

test('reference route authenticates, restricts voices and stores private owner-scoped audio', async () => {
  let user = 'user@example.com'
  const stored = new Map()
  const fakeAudio = Uint8Array.from([1, 2, 3])
  const route = load(refPath, {
    '@/auth': { auth: async () => user ? { user: { email: user } } : null },
    '@/lib/secrets': { getSecret: async key => key === 'AI_GATEWAY_API_KEY' ? 'test-gateway-key' : undefined },
    '@/lib/speechStorage': { uploadToS3: async (body, key) => { stored.set(key, body); return 's3://private/object' }, downloadFromS3: async key => { if (!stored.has(key)) throw new Error('not found'); return { buffer: stored.get(key), contentType: 'audio/mpeg' } } },
    '@ai-sdk/gateway': { createGateway: () => ({ speechModel: id => id }) },
    ai: { generateSpeech: async options => { assert.equal(options.model, 'elevenlabs/eleven-v4'); assert.equal(options.voice, voices.DEFAULT_PRONUNCIATION_REFERENCE_VOICE); return { audio: { uint8Array: fakeAudio, mediaType: 'audio/mpeg' } } } },
  })
  assert.equal((await route.POST(jsonRequest('/reference', { text: refText, voice: 'Gacrux' }))).status, 400)
  const response = await route.POST(jsonRequest('/reference', { text: refText }))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.model, 'elevenlabs/eleven-v4')
  assert.equal(data.provider, 'vercel-ai-gateway')
  assert.equal(data.audio, Buffer.from(fakeAudio).toString('base64'))
  assert.match(data.storageUrl, /^\/api\/speech\/pronunciation\/reference\?id=/)
  assert.match([...stored.keys()][0], new RegExp(`^speech/pronunciation/reference/${crypto.createHash('sha256').update(user).digest('hex')}/`))
  assert.deepEqual(new Uint8Array(await (await route.GET(new NextRequest(`http://localhost${data.storageUrl}`))).arrayBuffer()), fakeAudio)
  user = 'another@example.com'
  assert.equal((await route.GET(new NextRequest(`http://localhost${data.storageUrl}`))).status, 404)
  user = null
  assert.equal((await route.POST(jsonRequest('/reference', { text: refText }))).status, 401)
})

test('history enrichment preserves scores and only permits updating owner pronunciation rows', async () => {
  const db = createClient({ url: ':memory:' })
  let email = 'user@example.com'
  const route = load('src/app/api/speech/history/route.ts', {
    '@/auth': { auth: async () => ({ user: { email } }) }, '@/lib/turso': { getTursoClient: () => db }, '@/lib/axiom': { reportServerEvent: async () => {} },
  })
  try {
    const saved = await route.POST(jsonRequest('/history', { modality: 'pronunciation', title: 'Test', content: refText, metadata: { scores: { pronunciation: 95 }, referenceSource: 'manual' } }))
    assert.equal(saved.status, 200)
    const { item } = await saved.json()
    const patch = (metadataPatch) => route.PATCH(jsonRequest('/history', { id: item.id, metadataPatch }, 'PATCH'))
    assert.equal((await patch({ scores: { pronunciation: 0 } })).status, 400)
    email = 'other@example.com'
    assert.equal((await patch({ coach: { summary: 'Not mine' } })).status, 404)
    email = 'user@example.com'
    assert.equal((await patch({ coach: { model: 'gpt-6.2-sol', summary: 'A useful result' }, coachError: null })).status, 200)
    const data = await (await route.GET(new NextRequest('http://localhost/history?modality=pronunciation'))).json()
    assert.deepEqual(data.items[0].metadata.scores, { pronunciation: 95 })
    assert.equal(data.items[0].metadata.coach.summary, 'A useful result')
  } finally { db.close() }
})

// Opt-in real, synthetic reference -> normalized WAV -> Azure scores -> GPT coaching.
test('live reference and measured coaching pipeline', { skip: !process.env.PRONUNCIATION_AI_LIVE_SMOKE }, async () => {
  const db = createClient({url: ':memory:'})
  const evidenceFiles = new Map()
  const mocks = {
    '@/lib/turso': {getTursoClient:()=>db},
    '@/auth': { auth: async () => ({ user: { email: 'synthetic-test@example.com' } }) },
    '@/lib/secrets': { getSecret: async key => key === 'AI_GATEWAY_API_KEY' ? process.env.VERCEL_API_KEY : process.env[key] },
    '@/lib/speechStorage': { uploadToS3: async (body,key,type) => {evidenceFiles.set(key,{buffer:body,contentType:type});return 's3://fixture/'+key}, downloadFromS3:async key=>evidenceFiles.get(key) }, '@/lib/axiom': { reportServerEvent: async () => {} },
  }
  const tts = await load(refPath, mocks).POST(jsonRequest('/reference', { text: refText }))
  assert.equal(tts.status, 200)
  const generated = await tts.json()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pronunciation-ai-'))
  try {
    const original = path.join(dir, 'reference.mp3'), wav = path.join(dir, 'reference.wav')
    fs.writeFileSync(original, Buffer.from(generated.audio, 'base64'))
    const converted = spawnSync('ffmpeg', ['-v', 'error', '-i', original, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
    assert.equal(converted.status, 0)
    const form = new FormData()
    form.append('audio', new File([fs.readFileSync(wav)], 'pronunciation.wav', { type: 'audio/wav' }))
    form.append('referenceText', refText); form.append('language', 'en-US'); form.append('source', 'reference-voice')
    const azure = await load('src/app/api/speech/pronunciation/route.ts', mocks).POST(new NextRequest('http://localhost/pronunciation', { method: 'POST', body: form }))
    assert.equal(azure.status, 200)
    const data = await azure.json(), best = data.NBest?.[0], a = best.PronunciationAssessment ?? best
    assert.equal(data._audio.sampleRate, 16000)
    assert.equal(data._audio.normalized, true)
    assert.ok(a.PronScore > 0)
    const normalize = w => ({ word: w.Word, accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0, errorType: w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? 'None', offset: w.Offset, duration: w.Duration, phonemes: (w.Phonemes ?? []).map(p => ({ phoneme: p.Phoneme, accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore ?? 0, offset: p.Offset, duration: p.Duration, nBestPhonemes: (p.PronunciationAssessment?.NBestPhonemes ?? p.NBestPhonemes ?? []).map(c => ({ phoneme: c.Phoneme, score: c.Score })) })) })
    const evidence = { ...input, source: 'reference-voice', recognizedText: best.Display ?? data.DisplayText, scores: { pronunciation: a.PronScore, accuracy: a.AccuracyScore, fluency: a.FluencyScore, completeness: a.CompletenessScore, prosody: a.ProsodyScore }, words: best.Words.map(normalize) }
    assert.ok(data._attemptId)
    assert.ok(data._evidenceStored)
    const coach = await load('src/app/api/speech/pronunciation/coach/route.ts', mocks).POST(jsonRequest('/coach', {attemptId:data._attemptId}))
    assert.equal(coach.status, 200)
    const { coach: result } = await coach.json()
    assert.equal(result.model, 'gpt-6.2-sol')
    assert.ok(result.summary)
    console.log('LIVE PIPELINE', { model: generated.model, audioBytes: Buffer.from(generated.audio, 'base64').length, scores: evidence.scores, coach: result.summary, firstPriority: result.priorities[0] })
  } finally { db.close(); fs.rmSync(dir, { force: true, recursive: true }) }
})

test('golden Azure responses preserve measured scores and evidence IDs across 20 synthetic assessment fixtures', () => {
  const folder=path.join(root,'tests/fixtures/pronunciation')
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')))
  const evidenceLib=load('src/lib/pronunciationEvidence.ts')
  assert.equal(manifest.length,20)
  for (const fixture of manifest) {
    const raw=JSON.parse(fs.readFileSync(path.join(folder,fixture.file)))
    const result=evidenceLib.extractAzureEvidence(raw,{referenceText:fixture.referenceText,language:'en-US',source:'reference-voice',referenceSource:'manual'})
    assert.ok(result,fixture.file)
    assert.deepEqual(result.input.scores,{pronunciation:fixture.scores.PronScore,accuracy:fixture.scores.AccuracyScore,fluency:fixture.scores.FluencyScore,completeness:fixture.scores.CompletenessScore,prosody:fixture.scores.ProsodyScore})
    const ledger=coachLib.buildPronunciationEvidence(result.input)
    assert.equal(new Set(ledger.map(e=>e.id)).size,ledger.length)
    assert.equal(ledger.find(e=>e.id==='score.pronunciation').description,'Azure pronunciation: '+fixture.scores.PronScore+'/100')
    assert.ok(evidenceLib.buildAlignment(result.input).phonemes.length>0,fixture.file)
  }
})

test('canonical PCM normalization is bounded, deterministic, and rejects invalid containers',()=>{
  const lib=load('src/lib/pronunciationAudio.ts')
  const original=fs.readFileSync(path.join(root,'src/lib/fixtures/pronunciation-canary.wav'))
  const result=lib.normalizePronunciationWav(original)
  assert.deepEqual(result.wav,lib.normalizePronunciationWav(original).wav)
  const pcm=lib.readMonoPcmWav(result.wav)
  assert.ok(pcm.subarray(0,6400).every(x=>x===0))
  assert.ok(pcm.subarray(-6400).every(x=>x===0))
  assert.ok(result.durationSeconds<30)
  assert.throws(()=>lib.readMonoPcmWav(Buffer.alloc(43)),/Expected/)
})

test('persisted attempts use owner-scoped exact audio, compare only matching quality-approved voices, and exclude weak reference samples',async()=>{
  const db=createClient({url:':memory:'})
  let email='owner@example.com'
  const files=new Map()
  const mocks={'@/auth':{auth:async()=>({user:{email}})},'@/lib/turso':{getTursoClient:()=>db},'@/lib/secrets':{getSecret:async()=> 'fake'},'@/lib/axiom':{reportServerEvent:async()=>{}},'@/lib/speechStorage':{uploadToS3:async(body,key,type)=>{files.set(key,{buffer:body,contentType:type});return 's3://test/'+key},downloadFromS3:async key=>files.get(key)}}
  const cache=new Map()
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/pronunciation/elevenlabs__eleven_v4__Eric__everyday.json')))
  const evidenceLib=load('src/lib/pronunciationEvidence.ts',mocks,fetch,cache)
  const dbLib=load('src/lib/pronunciationDb.ts',mocks,fetch,cache)
  const calibrationLib=load('src/lib/pronunciationCalibration.ts',mocks,fetch,cache)
  const historyRoute=load('src/app/api/speech/history/route.ts',mocks,fetch,cache)
  try {
    const referenceText='The weather is getting warmer, so I think we should walk to the park.'
    const sourceAudio=fs.readFileSync(path.join(root,'src/lib/fixtures/pronunciation-canary.wav'))
    const {wav,durationSeconds,normalizationVersion}=load('src/lib/pronunciationAudio.ts').normalizePronunciationWav(sourceAudio)
    const make=async(source,voice,num,score=95,lang='en-US',text=referenceText)=>{
      const id=crypto.randomUUID()
      const extracted=evidenceLib.extractAzureEvidence(fixture,{referenceText:text,language:lang,source,referenceSource:'manual'})
      extracted.input.scores.pronunciation=score
      extracted.input.words=extracted.input.words.map(w=>({...w,errorType:'None',phonemes:w.phonemes.map(p=>({...p,accuracyScore:Math.max(p.accuracyScore,80)}))}))
      const audio=Buffer.from(wav);audio[100]=num
      const sha=evidenceLib.digest(audio)
      const persisted=await dbLib.persistMeasuredAttempt({email,id,input:extracted.input,historyWords:extracted.historyWords,raw:fixture,audio,originalAudio:sourceAudio,audioMetadata:{sha256:sha,originalSha256:evidenceLib.digest(sourceAudio),durationSeconds,sampleRate:16000,normalized:true,normalizationVersion},fallback:false,voice,model:source==='reference-voice'?'elevenlabs/eleven-v4':undefined})
      assert.equal(persisted.id,id)
      return await dbLib.getAttempt(email,id)
    }
    const learner=await make('recording',null,1,89)
    await make('recording',null,2,90)
    await make('reference-voice',voices.PRONUNCIATION_REFERENCE_VOICES[0].id,3,96)
    await make('reference-voice',voices.PRONUNCIATION_REFERENCE_VOICES[1].id,4,93)
    const weak=await make('reference-voice',voices.PRONUNCIATION_REFERENCE_VOICES[0].id,5,88)
    await make('reference-voice',voices.PRONUNCIATION_REFERENCE_VOICES[1].id,6,99,'en-GB')
    const report=await calibrationLib.getCalibrationReport(learner)
    assert.equal(report.referenceVoiceCount,2)
    const lease=await dbLib.claimAttemptWork(email,learner.id,'delivery')
    assert.ok(lease);assert.equal(await dbLib.claimAttemptWork(email,learner.id,'delivery'),null)
    await dbLib.releaseAttemptWork(email,learner.id,'delivery',lease)
    assert.ok(await dbLib.claimAttemptWork(email,learner.id,'delivery'))
    assert.equal(report.eligibleReferenceCount,2)
    assert.equal(report.scoreRanges.pronunciation.min,93)
    assert.equal(report.scoreRanges.pronunciation.max,96)
    assert.equal(report.referenceSamples.find(r=>r.id===weak.id).accepted,false)
    assert.ok(report.phoneComparisons.length>0)
    assert.ok(report.trends.length>0)
    assert.deepEqual((await dbLib.getAttemptAudio(learner)).buffer,files.get(learner.audioKey).buffer)
    assert.equal(evidenceLib.digest((await dbLib.getAttemptAudio(learner)).buffer),learner.audioSha)
    const history=await (await historyRoute.GET(new NextRequest('http://localhost/history?modality=pronunciation'))).json()
    assert.equal(history.items.length,6)
    const stored=history.items.find(r=>r.id===learner.id)
    assert.ok(stored.metadata.assessmentSourceUrl)
    assert.equal(stored.metadata.scores.pronunciation,89)
    email='other@example.com'
    assert.equal(await dbLib.getAttempt(email,learner.id),null)
    email='owner@example.com'
    assert.equal((await historyRoute.DELETE(jsonRequest('/history',{id:learner.id},'DELETE'))).status,200)
    assert.equal(await dbLib.getAttempt(email,learner.id),null)
    const undo=await historyRoute.POST(jsonRequest('/history',{modality:'pronunciation',title:stored.title,content:stored.content,metadata:stored.metadata}))
    assert.equal(undo.status,200)
    assert.equal((await undo.json()).item.id,learner.id)
    assert.equal((await dbLib.getAttempt(email,learner.id)).id,learner.id)
  } finally {db.close()}
})

// Real provider ensemble + acoustic integration; opt-in to avoid charging CI.
test('live calibrated two-voice ensemble and exact-audio Praat delivery', {skip:!process.env.PRONUNCIATION_ENSEMBLE_LIVE_SMOKE}, async()=>{
  const db=createClient({url:':memory:'})
  const files=new Map()
  const cache=new Map()
  const text='She bought a blue shirt and a brown sweater before driving her car across the river.'
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pronunciation-ensemble-'))
  const mocks={'@/auth':{auth:async()=>({user:{email:'synthetic-ensemble@example.com'}})},'@/lib/turso':{getTursoClient:()=>db},'@/lib/secrets':{getSecret:async key=>key==='AI_GATEWAY_API_KEY'?process.env.VERCEL_API_KEY:process.env[key]},'@/lib/axiom':{reportServerEvent:async()=>{}},'@/lib/speechStorage':{uploadToS3:async(body,key,type)=>{files.set(key,{buffer:body,contentType:type});return 's3://fixture/'+key},downloadFromS3:async key=>files.get(key)},'@/lib/speechService':{requestAcousticAnalysis:async(email,audio,alignment)=>{
    const wav=path.join(dir,'delivery.wav'), align=path.join(dir,'alignment.json')
    fs.writeFileSync(wav,audio);fs.writeFileSync(align,JSON.stringify(alignment))
    const result=spawnSync(process.env.PRONUNCIATION_ACOUSTICS_PYTHON||'python3',[path.join(root,'../speech-tools/scripts/analyze_delivery.py'),'--input',wav,'--alignment',align],{encoding:'utf8'})
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)
  }}}
  const refRoute=load(refPath,mocks,fetch,cache)
  const assessment=load('src/app/api/speech/pronunciation/route.ts',mocks,fetch,cache)
  const deliveryRoute=load('src/app/api/speech/pronunciation/delivery/route.ts',mocks,fetch,cache)
  const calibrationRoute=load('src/app/api/speech/pronunciation/calibration/route.ts',mocks,fetch,cache)
  const coachRoute=load('src/app/api/speech/pronunciation/coach/route.ts',mocks,fetch,cache)
  const dbLib=load('src/lib/pronunciationDb.ts',mocks,fetch,cache)
  const generated=[]
  async function assess(audio,source,voice,storageUrl){
    const form=new FormData()
    form.append('audio',new File([audio],'source.wav',{type:'audio/wav'}));form.append('referenceText',text);form.append('language','en-US');form.append('source',source)
    if(voice)form.append('voice',voice)
    if(storageUrl)form.append('referenceUrl',storageUrl)
    const response=await assessment.POST(new NextRequest('http://localhost/pronunciation',{method:'POST',body:form}))
    assert.equal(response.status,200);const result=await response.json();assert.ok(result._attemptId)
    const deliver=await deliveryRoute.POST(jsonRequest('/delivery',{attemptId:result._attemptId}));assert.equal(deliver.status,200)
    const {delivery}=await deliver.json()
    assert.equal(delivery.version,2);assert.ok(delivery.vowels.length>0);assert.ok(delivery.phrasePitch.length>0)
    return {result,delivery}
  }
  try {
    for(const voice of voices.PRONUNCIATION_REFERENCE_VOICES){
      let accepted=false
      for(let i=0;i<2;i++){
        const res=await refRoute.POST(jsonRequest('/reference',{text,voice:voice.id}));assert.equal(res.status,200)
        const data=await res.json()
        const mp3=path.join(dir,'reference.mp3'),wav=path.join(dir,'reference.wav')
        fs.writeFileSync(mp3,Buffer.from(data.audio,'base64'))
        assert.equal(spawnSync('ffmpeg',['-v','error','-y','-i',mp3,'-ac','1','-ar','16000','-c:a','pcm_s16le',wav]).status,0)
        const audio=fs.readFileSync(wav)
        const measured=await assess(audio,'reference-voice',voice.id,data.storageUrl)
        generated.push({audio,...measured,voice:voice.name})
        if(measured.result._referenceQuality.accepted){accepted=true;break}
      }
      assert.ok(accepted,voice.name+' did not produce a QA-approved take in two generations')
    }
    // A deterministic synthetic control with a longer reading tempo serves as a learner-role fixture.
    const original=path.join(dir,'learner-source.wav'),control=path.join(dir,'learner.wav')
    fs.writeFileSync(original,generated[0].audio)
    assert.equal(spawnSync('ffmpeg',['-v','error','-y','-i',original,'-filter:a','atempo=0.9','-ac','1','-ar','16000','-c:a','pcm_s16le',control]).status,0)
    const learner=await assess(fs.readFileSync(control),'recording')
    const id=learner.result._attemptId
    const reportRes=await calibrationRoute.GET(new NextRequest('http://localhost/calibration?id='+id));assert.equal(reportRes.status,200)
    const {report}=await reportRes.json()
    assert.equal(report.referenceVoiceCount,2);assert.ok(report.phoneComparisons.length>0)
    assert.ok(report.phraseComparisons.length>0)
    const coachRes=await coachRoute.POST(jsonRequest('/coach',{attemptId:id}));assert.equal(coachRes.status,200)
    const cachedRes=await coachRoute.POST(jsonRequest('/coach',{attemptId:id}));assert.equal(cachedRes.status,200);assert.equal((await cachedRes.json()).cached,true)
    const stored=await dbLib.getAttempt('synthetic-ensemble@example.com',id);assert.ok(stored.coach)
    console.log('LIVE ENSEMBLE',{takes:generated.map(t=>({voice:t.voice,accepted:t.result._referenceQuality.accepted,score:t.result.NBest[0].PronScore??t.result.NBest[0].PronunciationAssessment.PronScore,vowels:t.delivery.vowels.length})),scoreRange:report.scoreRanges.pronunciation,learner:report.learnerScores.pronunciation,alignedPhones:report.phoneComparisons.length,alignedPhrases:report.phraseComparisons.length})
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
})

test('live Sol coaching regression across the 20 synthetic provider fixtures',{skip:!process.env.PRONUNCIATION_COACH_REGRESSION},async()=>{
  const folder=path.join(root,'tests/fixtures/pronunciation')
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')))
  const evidenceLib=load('src/lib/pronunciationEvidence.ts')
  const outcomes=[]
  for(let offset=0;offset<manifest.length;offset+=3){
    await Promise.all(manifest.slice(offset,offset+3).map(async fixture=>{
      const raw=JSON.parse(fs.readFileSync(path.join(folder,fixture.file)))
      const extracted=evidenceLib.extractAzureEvidence(raw,{referenceText:fixture.referenceText,language:'en-US',source:'reference-voice',referenceSource:'manual'})
      try{
        const coach=await coachLib.generatePronunciationCoach(extracted.input,process.env.OPENAI_API_KEY)
        assert.match(coach.summary,/synthesi[zs]ed|synthetic|generated|TTS|computer.generated/i)
        const ledger=new Set(coachLib.buildPronunciationEvidence(extracted.input).map(e=>e.id))
        for(const finding of [...coach.priorities,...coach.strengths])assert.ok(finding.evidenceIds.every(id=>ledger.has(id)))
        outcomes.push({file:fixture.file,ok:true,summary:coach.summary})
      }catch(err){outcomes.push({file:fixture.file,ok:false,error:err.message})}
    }))
  }
  const failed=outcomes.filter(r=>!r.ok)
  console.log('LIVE COACH REGRESSION',{passed:outcomes.length-failed.length,total:outcomes.length,failed})
  assert.equal(failed.length,0)
})

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
  const mocks = {
    '@/auth': { auth: async () => ({ user: { email: 'synthetic-test@example.com' } }) },
    '@/lib/secrets': { getSecret: async key => key === 'AI_GATEWAY_API_KEY' ? process.env.VERCEL_API_KEY : process.env[key] },
    '@/lib/speechStorage': { uploadToS3: async () => null }, '@/lib/axiom': { reportServerEvent: async () => {} },
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
    const coach = await load('src/app/api/speech/pronunciation/coach/route.ts', mocks).POST(jsonRequest('/coach', evidence))
    assert.equal(coach.status, 200)
    const { coach: result } = await coach.json()
    assert.equal(result.model, 'gpt-6.2-sol')
    assert.ok(result.summary)
    console.log('LIVE PIPELINE', { model: generated.model, audioBytes: Buffer.from(generated.audio, 'base64').length, scores: evidence.scores, coach: result.summary, firstPriority: result.priorities[0] })
  } finally { fs.rmSync(dir, { force: true, recursive: true }) }
})

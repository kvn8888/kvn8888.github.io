// Exercise the actual route with synthetic auth, storage and provider dependencies.
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const source = ts.transpileModule(readFileSync(path.join(__dirname, '../src/app/api/speech/stt/route.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup({ session = { user: { email: 'test@example.com' } }, secrets = {}, upstream, storedAudio } = {}) {
  const secretReads = []
  const deleted = []
  const mocks = {
    '@/auth': { auth: async () => session },
    '@/lib/secrets': { getSecret: async key => { secretReads.push(key); return secrets[key] } },
    '@/lib/speechStorage': {
      downloadFromS3: async () => ({ buffer: storedAudio ?? Buffer.from('test wav'), contentType: 'audio/wav' }),
      deleteFromS3: async key => { deleted.push(key) },
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', 'console', source)(
    name => mocks[name] || require(name), module, module.exports,
    upstream ?? (() => { throw new Error('Unexpected provider request') }),
    { error: () => {} },
  )
  return { POST: module.exports.POST, secretReads, deleted }
}

function request(model, audio = new File(['wav bytes'], 'reference.wav', { type: 'audio/wav' })) {
  const form = new FormData()
  form.append('audio', audio)
  form.append('model', model)
  return new Request('http://localhost/api/speech/stt', { method: 'POST', body: form })
}
const config = { MAI_TRANSCRIBE_ENDPOINT: 'https://speech.example.invalid/', MAI_TRANSCRIBE_KEY: 'fake-test-key' }

test('MAI-Transcribe-2 sends verbatim multipart request and returns normalized text', async () => {
  const { POST, secretReads } = setup({ secrets: config, upstream: async (url, init) => {
    assert.equal(url, 'https://speech.example.invalid/speechtotext/transcriptions:transcribe?api-version=2025-10-15')
    assert.equal(init.method, 'POST')
    assert.deepEqual(init.headers, { 'Ocp-Apim-Subscription-Key': 'fake-test-key' })
    assert.equal(init.body.get('audio').name, 'reference.wav')
    assert.equal(await init.body.get('audio').text(), 'wav bytes')
    assert.equal(init.body.has('file'), false)
    assert.deepEqual(JSON.parse(init.body.get('definition')), { enhancedMode: { enabled: true, model: 'MAI-Transcribe-2', modelOptions: { transcribeStyle: 'verbatim' } } })
    return Response.json({ combinedPhrases: [{ text: 'Um, hello. ' }, { text: '' }, { text: ' How are you?' }] })
  } })
  const response = await POST(request('mai-transcribe-2'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { text: 'Um, hello. How are you?' })
  assert.deepEqual(secretReads.sort(), ['MAI_TRANSCRIBE_ENDPOINT', 'MAI_TRANSCRIBE_KEY'])
})

test('MAI S3-backed audio uses the same adapter and cleans up the upload', async () => {
  const { POST, deleted } = setup({ secrets: config, storedAudio: Buffer.from('stored wav'), upstream: async (_, init) => {
    assert.equal(await init.body.get('audio').text(), 'stored wav')
    return Response.json({ combinedPhrases: [{ text: 'Hello.' }] })
  } })
  const key = 'speech/stt-upload/example.wav'
  const result = await POST(new Request('http://localhost/api/speech/stt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3Key: key, model: 'mai-transcribe-2', fileName: 'example.wav' }),
  }))
  assert.deepEqual(await result.json(), { text: 'Hello.' })
  assert.deepEqual(deleted, [key])
})

test('MAI authentication, configuration, empty transcript and provider errors', async () => {
  let result = await setup({ session: null }).POST(request('mai-transcribe-2'))
  assert.equal(result.status, 401)
  result = await setup().POST(request('mai-transcribe-2'))
  assert.equal(result.status, 500)
  assert.equal((await result.json()).error, 'MAI-Transcribe-2 is not configured')
  result = await setup({ secrets: config, upstream: async () => Response.json({ combinedPhrases: [] }) }).POST(request('mai-transcribe-2'))
  assert.deepEqual(await result.json(), { text: '' })
  result = await setup({ secrets: config, upstream: async () => new Response('unavailable', { status: 503 }) }).POST(request('mai-transcribe-2'))
  assert.equal(result.status, 503)
  assert.deepEqual(await result.json(), { error: 'Transcription failed' })
})

test('existing Mistral and Azure OpenAI models still use their original contracts', async () => {
  const secrets = { MISTRAL_API_KEY: 'mistral-test', AZURE_OPENAI_ENDPOINT: 'https://openai.example.invalid', AZURE_OPENAI_API_KEY: 'azure-test', AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE: 'old-gpt' }
  const { POST } = setup({ secrets, upstream: async (url, init) => {
    assert.equal(init.body.get('file').name, 'reference.wav')
    assert.equal(init.body.has('audio'), false)
    if (url.includes('mistral')) {
      assert.equal(init.headers.Authorization, 'Bearer mistral-test')
      assert.equal(init.body.get('model'), 'voxtral-mini-latest')
      assert.equal(init.body.get('timestamp_granularities'), 'segment')
    } else {
      assert.equal(init.headers['api-key'], 'azure-test')
      assert.match(url, /\/deployments\/old-gpt\/audio\/transcriptions\?api-version=/)
      assert.equal(init.body.get('response_format'), 'json')
    }
    return Response.json({ text: 'Existing provider.', segments: [] })
  } })
  for (const model of ['voxtral-mini-latest', 'gpt-4o-transcribe']) {
    const response = await POST(request(model))
    assert.deepEqual(await response.json(), { text: 'Existing provider.', segments: [] })
  }
})

// Opt-in smoke test with Doppler-injected credentials and a synthetic audio file.
test('live MAI-Transcribe-2 reference upload', { skip: !process.env.MAI_STT_SMOKE_AUDIO }, async () => {
  const audio = new File([readFileSync(process.env.MAI_STT_SMOKE_AUDIO)], 'reference.wav', { type: 'audio/wav' })
  const { POST } = setup({ secrets: process.env, upstream: fetch })
  const result = await POST(request('mai-transcribe-2', audio))
  assert.equal(result.status, 200)
  const { text } = await result.json()
  assert.equal(typeof text, 'string')
  assert.ok(text.trim())
  if (process.env.MAI_STT_SMOKE_EXPECTED) {
    const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    assert.equal(normalize(text), normalize(process.env.MAI_STT_SMOKE_EXPECTED))
  }
  console.log('Live MAI result:', text)
})

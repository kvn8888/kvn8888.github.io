import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

function loadEnv(envPath) {
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx === -1) continue
    const key = t.slice(0, idx).trim()
    let val = t.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = process.env[key] || val
  }
}

function ok(msg) { console.log(`PASS: ${msg}`) }
function fail(msg) { console.log(`FAIL: ${msg}`) }
function info(msg) { console.log(`INFO: ${msg}`) }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, init, maxAttempts = 4) {
  let lastRes = null
  let lastErr = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      lastRes = res
      if (res.status !== 429) return res

      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * (2 ** (attempt - 1))
      info(`HTTP 429 from provider. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${maxAttempts})`)
      await sleep(waitMs)
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        await sleep(500 * (2 ** (attempt - 1)))
      }
    }
  }

  if (lastRes) return lastRes
  throw lastErr || new Error('network_error')
}

function makeSilenceWav({ sampleRate = 16000, seconds = 1, channels = 1, bitsPerSample = 16 } = {}) {
  const samples = sampleRate * seconds
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = samples * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

async function testGeminiTts() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail('Gemini TTS check skipped (missing GEMINI_API_KEY)')
    return
  }

  try {
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Generate speech audio only. Do not output any text. Speak exactly: Hello from speech endpoint health check.' }] }],
          generationConfig: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: 'Gacrux' },
              },
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const t = await res.text()
      fail(`Gemini TTS failed: HTTP ${res.status}`)
      info(`Gemini response snippet: ${t.slice(0, 180).replace(/\s+/g, ' ')}`)
      return
    }

    const data = await res.json()
    const audio = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!audio) {
      fail('Gemini TTS returned 200 but no audio payload')
      return
    }

    ok(`Gemini TTS reachable and returned audio (${Math.round(audio.length / 1024)} KB base64)`) 
  } catch (err) {
    fail(`Gemini TTS check failed: ${err?.message || 'UnknownError'}`)
  }
}

async function testMistralStt() {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    fail('Mistral STT check skipped (missing MISTRAL_API_KEY)')
    return
  }

  try {
    const wav = makeSilenceWav({ sampleRate: 16000, seconds: 1 })
    const file = new File([wav], 'silence.wav', { type: 'audio/wav' })
    const form = new FormData()
    form.append('file', file)
    form.append('model', 'voxtral-mini-transcribe-2507')
    form.append('timestamp_granularities', 'segment')

    const res = await fetchWithRetry('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!res.ok) {
      const t = await res.text()
      fail(`Mistral STT failed: HTTP ${res.status}`)
      info(`Mistral response snippet: ${t.slice(0, 180).replace(/\s+/g, ' ')}`)
      return
    }

    const data = await res.json()
    const text = (data?.text || '').trim()
    ok(`Mistral STT reachable (transcript length: ${text.length})`)
  } catch (err) {
    fail(`Mistral STT check failed: ${err?.message || 'UnknownError'}`)
  }
}

async function testAzureOpenAiSttIfConfigured() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, '')
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-03-01-preview'

  if (!apiKey || !endpoint) {
    info('Azure OpenAI STT optional check skipped (AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not set)')
    return
  }

  try {
    const wav = makeSilenceWav({ sampleRate: 16000, seconds: 1 })
    const file = new File([wav], 'silence.wav', { type: 'audio/wav' })
    const checks = [
      {
        label: 'Azure OpenAI gpt-4o-transcribe',
        deployment: process.env.AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE || 'gpt-4o-transcribe',
      },
      {
        label: 'Azure OpenAI gpt-4o-transcribe-diarize',
        deployment: process.env.AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE_DIARIZE || 'gpt-4o-transcribe-diarize',
      },
    ]

    for (const check of checks) {
      const form = new FormData()
      form.append('file', file)
      form.append('response_format', 'json')

      const url = `${endpoint}/openai/deployments/${encodeURIComponent(check.deployment)}/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'api-key': apiKey },
        body: form,
      })

      if (!res.ok) {
        const t = await res.text()
        fail(`${check.label} failed: HTTP ${res.status}`)
        info(`Azure OpenAI response snippet: ${t.slice(0, 180).replace(/\s+/g, ' ')}`)
      } else {
        const data = await res.json()
        const text = (data?.text || '').trim()
        ok(`${check.label} reachable (transcript length: ${text.length})`)
      }
    }
  } catch (err) {
    fail(`Azure OpenAI STT check failed: ${err?.message || 'UnknownError'}`)
  }
}

async function testAzurePronunciation() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    fail('Azure pronunciation check skipped (missing AZURE_SPEECH_KEY/AZURE_SPEECH_REGION)')
    return
  }

  try {
    const wav = makeSilenceWav({ sampleRate: 16000, seconds: 1 })
    const pronunciationParams = {
      ReferenceText: 'hello world',
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableProsodyAssessment: 'True',
    }

    const res = await fetchWithRetry(
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav',
          'Pronunciation-Assessment': Buffer.from(JSON.stringify(pronunciationParams)).toString('base64'),
          Accept: 'application/json',
        },
        body: wav,
      }
    )

    if (!res.ok) {
      const t = await res.text()
      fail(`Azure pronunciation failed: HTTP ${res.status}`)
      info(`Azure response snippet: ${t.slice(0, 180).replace(/\s+/g, ' ')}`)
      return
    }

    const data = await res.json()
    const hasAssessment = !!data?.NBest?.[0]?.PronunciationAssessment
    if (hasAssessment) {
      ok('Azure pronunciation reachable and returned assessment payload')
    } else {
      ok('Azure pronunciation reachable (response received, but no detailed assessment in this sample)')
    }
  } catch (err) {
    fail(`Azure pronunciation check failed: ${err?.message || 'UnknownError'}`)
  }
}

function bootstrapEnv() {
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const envPath = path.resolve(__dirname, '..', '.env.local')
    loadEnv(envPath)
  } catch {
    console.log('FAIL: .env.local not found in homepage/')
    process.exit(1)
  }
}

bootstrapEnv()

console.log('--- Speech endpoint checks (Gemini TTS, Mistral STT, Azure OpenAI STT, Azure Pronunciation) ---')
await testGeminiTts()
await testMistralStt()
await testAzureOpenAiSttIfConfigured()
await testAzurePronunciation()
console.log('--- Done ---')

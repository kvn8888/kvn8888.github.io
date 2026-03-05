import { auth } from '@/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { SignJWT, importPKCS8 } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

/* ── helpers ── */

function createWavBuffer(pcmBase64: string, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const pcm = Buffer.from(pcmBase64, 'base64')
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

const MIN_TEXT_LENGTH_FOR_SUMMARY = 40
const MAX_SUMMARY_LENGTH = 120
const GEMINI_TEXT_LIMIT = 4096
const CHIRP3_TEXT_LIMIT_BYTES = 5000

async function summarizeText(apiKey: string, text: string): Promise<string | null> {
  if (text.length < MIN_TEXT_LENGTH_FOR_SUMMARY) return null
  // Truncate to prevent excessive token usage in the summarization call
  const truncated = text.slice(0, 2000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Summarize the following text in one short sentence (max ${MAX_SUMMARY_LENGTH} chars). Return only the summary, no quotes:\n\n${truncated}`,
                },
              ],
            },
          ],
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, MAX_SUMMARY_LENGTH) ?? null
    )
  } catch {
    return null
  }
}

async function uploadToS3(wavBuffer: Buffer, key: string): Promise<string | null> {
  const bucket = process.env.SPEECH_S3_BUCKET
  const region = process.env.AWS_REGION || 'us-east-1'
  if (!bucket) return null

  try {
    const client = new S3Client({ region })
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: wavBuffer,
        ContentType: 'audio/wav',
      })
    )
    return `s3://${bucket}/${key}`
  } catch (err) {
    console.error('S3 upload error:', err)
    return null
  }
}

async function getGcpAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(sa.private_key, 'RS256')

  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error('Failed to get GCP access token for Chirp 3 TTS')
  }
  return tokenData.access_token
}

async function synthesizeChirp3(text: string, voiceName: string): Promise<{ audio: string; mimeType: string }> {
  const saKeyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!saKeyBase64) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY not configured for Chirp 3 TTS')
  }

  const sa: ServiceAccountKey = JSON.parse(Buffer.from(saKeyBase64, 'base64').toString('utf-8'))
  const token = await getGcpAccessToken(sa)

  const ttsRes = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: 'en-US',
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3',
      },
    }),
    cache: 'no-store',
  })

  if (!ttsRes.ok) {
    const errText = await ttsRes.text()
    throw new Error(`Chirp 3 TTS API error: ${ttsRes.status} ${errText}`)
  }

  const ttsData = await ttsRes.json()
  if (!ttsData.audioContent) {
    throw new Error('No audio returned from Chirp 3 TTS API')
  }

  return {
    audio: String(ttsData.audioContent),
    mimeType: 'audio/mpeg',
  }
}

/* ── route ── */

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY
    const { text, voice = 'Gacrux', instructions, provider } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const isChirp3 = provider === 'chirp3' || String(voice).startsWith('chirp3:')
    const normalizedText = String(text)

    if (!isChirp3 && normalizedText.length > GEMINI_TEXT_LIMIT) {
      return NextResponse.json({ error: `Gemini TTS input exceeds ${GEMINI_TEXT_LIMIT} characters` }, { status: 400 })
    }

    if (isChirp3 && Buffer.byteLength(normalizedText, 'utf8') > CHIRP3_TEXT_LIMIT_BYTES) {
      return NextResponse.json({ error: `Chirp 3 input exceeds ${CHIRP3_TEXT_LIMIT_BYTES} bytes` }, { status: 400 })
    }

    if (isChirp3) {
      const chirpVoiceName = String(voice).replace(/^chirp3:/, '')
      const chirp = await synthesizeChirp3(normalizedText, chirpVoiceName)

      // Optional summarization if Gemini key exists; non-fatal if unavailable.
      const summary = apiKey ? await summarizeText(apiKey, normalizedText) : null

      return NextResponse.json({
        audio: chirp.audio,
        mimeType: chirp.mimeType,
        ...(summary ? { summary } : {}),
      })
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    // Force audio-only behavior; Gemini TTS can return 400 if prompt is ambiguous
    // and it attempts text output.
    const promptText = instructions
      ? `Generate speech audio only. Do not output any text.\n\nStyle instructions: ${instructions}\n\nSpeak exactly: ${normalizedText}`
      : `Generate speech audio only. Do not output any text. Speak exactly: ${normalizedText}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: voice },
              },
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini TTS error:', err)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: res.status })
    }

    const data = await res.json()
    const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!audioData) {
      return NextResponse.json({ error: 'No audio in response' }, { status: 500 })
    }

    // Best-effort: summarize + upload in parallel without blocking the response
    const [summary, storageUrl] = await Promise.all([
      summarizeText(apiKey, normalizedText),
      process.env.SPEECH_S3_BUCKET
        ? uploadToS3(
            createWavBuffer(audioData, 24000, 1, 16),
            `speech/tts/${Date.now()}-${voice}.wav`
          )
        : Promise.resolve(null),
    ])

    return NextResponse.json({
      audio: audioData,
      mimeType: 'audio/L16;rate=24000;channels=1',
      ...(summary ? { summary } : {}),
      ...(storageUrl ? { storageUrl } : {}),
    })
  } catch (error) {
    console.error('TTS error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
  }
}

import { auth } from '@/auth'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const GEMINI_SUMMARY_MODEL = 'gemini-3.0-flash-preview-01'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { text, voice = 'Gacrux', instructions } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    // Force audio-only behavior; Gemini TTS can return 400 if prompt is ambiguous
    // and it attempts text output.
    const promptText = instructions
      ? `Generate speech audio only. Do not output any text.\n\nStyle instructions: ${instructions}\n\nSpeak exactly: ${text}`
      : `Generate speech audio only. Do not output any text. Speak exactly: ${text}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
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

    const audioBuffer = Buffer.from(audioData, 'base64')

    const [summary, storage] = await Promise.all([
      summarizeWithGemini(text, apiKey),
      uploadToS3(audioBuffer),
    ])

    // Return base64 PCM audio — client will decode and play
    return NextResponse.json({
      audio: audioData,
      mimeType: 'audio/L16;rate=24000;channels=1',
      summary: summary || null,
      storageUrl: storage?.url || null,
      storageKey: storage?.key || null,
    })
  } catch (error) {
    console.error('TTS error:', error)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
  }
}

async function summarizeWithGemini(text: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SUMMARY_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Summarize this TTS input in 2 concise sentences (<= 60 words). Emphasize intent and keywords.\n\n${text}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 120 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini summary error:', err)
      return null
    }

    const data = await res.json()
    const summaryText = data?.candidates?.[0]?.content?.parts?.[0]?.text
    return typeof summaryText === 'string' ? summaryText.trim() : null
  } catch (err) {
    console.error('Gemini summary failure:', err)
    return null
  }
}

async function uploadToS3(audioPcmBuffer: Buffer) {
  const region = process.env.AWS_REGION
  const bucket = process.env.SPEECH_S3_BUCKET
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null

  const prefix = (process.env.SPEECH_S3_PREFIX || 'speech').replace(/^\/+|\/+$/g, '')
  const key = `${prefix ? `${prefix}/` : ''}${Date.now()}-${crypto.randomUUID()}.wav`

  try {
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buildWavBuffer(audioPcmBuffer),
        ContentType: 'audio/wav',
        CacheControl: 'public, max-age=31536000',
      })
    )

    const baseUrl = process.env.SPEECH_S3_PUBLIC_URL?.replace(/\/+$/, '')
    return {
      key,
      url: baseUrl ? `${baseUrl}/${key}` : null,
    }
  } catch (err) {
    console.error('Speech S3 upload error:', err)
    return null
  }
}

function buildWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const dataLength = pcmBuffer.length
  const header = Buffer.alloc(44)
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)

  return Buffer.concat([header, pcmBuffer])
}

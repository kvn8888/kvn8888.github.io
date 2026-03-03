import { auth } from '@/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'

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

async function summarizeText(apiKey: string, text: string): Promise<string | null> {
  if (text.length < 40) return null // too short to summarize
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
                  text: `Summarize the following text in one short sentence (max 120 chars). Return only the summary, no quotes:\n\n${text}`,
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
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, 200) ?? null
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

/* ── route ── */

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { text, voice = 'Gacrux', instructions } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Force audio-only behavior; Gemini TTS can return 400 if prompt is ambiguous
    // and it attempts text output.
    const promptText = instructions
      ? `Generate speech audio only. Do not output any text.\n\nStyle instructions: ${instructions}\n\nSpeak exactly: ${text}`
      : `Generate speech audio only. Do not output any text. Speak exactly: ${text}`

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
      summarizeText(apiKey, text),
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
    console.error('TTS error:', error)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
  }
}

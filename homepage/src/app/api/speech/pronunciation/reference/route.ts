import { createHash, randomUUID } from 'node:crypto'
import { createGateway } from '@ai-sdk/gateway'
import { generateSpeech } from 'ai'
import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import { uploadToS3, downloadFromS3 } from '@/lib/speechStorage'
import {
  DEFAULT_PRONUNCIATION_REFERENCE_VOICE,
  isPronunciationReferenceVoice,
  PRONUNCIATION_REFERENCE_MODEL,
  PRONUNCIATION_REFERENCE_PROVIDER,
} from '@/lib/pronunciationVoices'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60
const MAX_TEXT_LENGTH = 1500
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function referenceKey(email: string, id: string) {
  const owner = createHash('sha256').update(email.toLowerCase()).digest('hex')
  return `speech/pronunciation/reference/${owner}/${id}.mp3`
}

export async function POST(req: NextRequest) {
  const email = (await auth())?.user?.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const requestId = randomUUID()
  try {
    const { text, voice = DEFAULT_PRONUNCIATION_REFERENCE_VOICE } = await req.json()
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `Reference text must contain 1–${MAX_TEXT_LENGTH} characters.`, requestId }, { status: 400 })
    }
    if (!isPronunciationReferenceVoice(voice)) {
      return NextResponse.json({ error: 'Select an available Eleven v4 reference voice.', requestId }, { status: 400 })
    }
    const key = await getSecret('AI_GATEWAY_API_KEY')
    if (!key) return NextResponse.json({ error: 'Reference speech is not configured.', requestId }, { status: 503 })
    const gateway = createGateway({ apiKey: key })
    const result = await generateSpeech({
      model: gateway.speechModel(PRONUNCIATION_REFERENCE_MODEL),
      text: text.trim(), voice, outputFormat: 'mp3', maxRetries: 0,
      abortSignal: AbortSignal.timeout(45_000),
    })
    const bytes = Buffer.from(result.audio.uint8Array)
    if (!bytes.length) throw new Error('No generated audio')
    const mimeType = result.audio.mediaType || 'audio/mpeg'
    // Persist generated audio under a private, owner-scoped key, not a public S3 URL.
    const stored = await uploadToS3(bytes, referenceKey(email, requestId), mimeType)
    const generation = { id:requestId, model:PRONUNCIATION_REFERENCE_MODEL, provider:PRONUNCIATION_REFERENCE_PROVIDER, voice, settings:{outputFormat:'mp3'}, textSha256:createHash('sha256').update(text.trim()).digest('hex'), audioSha256:createHash('sha256').update(bytes).digest('hex'), generatedAt:Date.now() }
    if (stored) await uploadToS3(Buffer.from(JSON.stringify(generation)),referenceKey(email,requestId).replace(/\.mp3$/,'.json'),'application/json')
    return NextResponse.json({
      audio: bytes.toString('base64'), mimeType, voice, generation,
      provider: PRONUNCIATION_REFERENCE_PROVIDER, model: PRONUNCIATION_REFERENCE_MODEL,
      ...(stored ? { storageUrl: `/api/speech/pronunciation/reference?id=${requestId}` } : {}),
    })
  } catch (error) {
    // Avoid logging provider messages that may contain the utterance or credentials.
    console.error('Reference voice generation failed', { requestId, errorType: error instanceof Error ? error.name : 'Unknown' })
    return NextResponse.json({ error: 'Eleven v4 reference voice generation failed.', requestId, retryable: true }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  const email = (await auth())?.user?.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !idPattern.test(id)) return NextResponse.json({ error: 'Invalid audio ID' }, { status: 400 })
  try {
    const audio = await downloadFromS3(referenceKey(email, id))
    return new Response(new Uint8Array(audio.buffer), {
      headers: { 'Content-Type': audio.contentType || 'audio/mpeg', 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Reference audio is unavailable' }, { status: 404 })
  }
}

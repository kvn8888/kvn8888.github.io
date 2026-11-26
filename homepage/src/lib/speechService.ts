import { createHmac, createHash, randomUUID } from 'node:crypto'

export type SpeechServiceScope = 'analyze-delivery' | 'transcribe' | 'diarize'
export const SPEECH_SERVICE_URL = 'https://speech-tools.onrender.com'

export async function issueSpeechServiceToken(email: string, scope: SpeechServiceScope) {
  const secret = process.env.SPEECH_SERVICE_SECRET
  if (!secret) throw new Error('Speech service is not configured')
  const payload = Buffer.from(JSON.stringify({
    sub: createHash('sha256').update(email.toLowerCase()).digest('hex'),
    scope, exp: Math.floor(Date.now() / 1000) + 300, nonce: randomUUID(),
  })).toString('base64url')
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url')
}

export async function requestAcousticAnalysis(email: string, audio: Buffer, alignment: unknown) {
  const form = new FormData()
  form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'normalized.wav')
  form.append('alignment', JSON.stringify(alignment))
  const token = await issueSpeechServiceToken(email, 'analyze-delivery')
  const response = await fetch(SPEECH_SERVICE_URL + '/analyze-delivery', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form,
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error('Acoustic analysis unavailable (HTTP ' + response.status + ')')
  return response.json()
}

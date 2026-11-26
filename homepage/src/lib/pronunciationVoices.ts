export const PRONUNCIATION_REFERENCE_MODEL = 'elevenlabs/eleven-v4'
export const PRONUNCIATION_REFERENCE_PROVIDER = 'vercel-ai-gateway'

// Current ElevenLabs Infinity voices, verified via AI Gateway.
export const PRONUNCIATION_REFERENCE_VOICES = [
  { id: 'g7LVvkPWALzPxOQbF6OE', name: 'Jade', description: 'Upbeat, natural' },
  { id: 'AaOhDHYJ1XLZk74lXhdE', name: 'Caleb', description: 'Clear, trusted guide' },
] as const

export const DEFAULT_PRONUNCIATION_REFERENCE_VOICE = PRONUNCIATION_REFERENCE_VOICES[0].id

export function isPronunciationReferenceVoice(value: unknown): value is (typeof PRONUNCIATION_REFERENCE_VOICES)[number]['id'] {
  return PRONUNCIATION_REFERENCE_VOICES.some(voice => voice.id === value)
}

export function pronunciationReferenceVoiceLabel(value: string): string {
  return PRONUNCIATION_REFERENCE_VOICES.find(voice => voice.id === value)?.name ?? value
}

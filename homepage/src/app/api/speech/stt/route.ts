import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    // Supported models:
    //   - voxtral-mini-transcribe-2602       (batch, diarization + word timestamps)
    //   - voxtral-mini-transcribe-realtime-2602  (streaming, sub-200ms latency)
    const model = (formData.get('model') as string) || 'voxtral-mini-transcribe-2602'

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    // Forward to Mistral transcription API
    const mistralForm = new FormData()
    mistralForm.append('file', audioFile)
    mistralForm.append('model', model)
    mistralForm.append('timestamp_granularities', 'segment')

    const res = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: mistralForm,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Mistral STT error:', err)
      return NextResponse.json({ error: 'Transcription failed' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('STT error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

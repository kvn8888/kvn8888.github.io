import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const model = (formData.get('model') as string) || 'voxtral-mini-transcribe-2602'

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    const isOpenAiModel = model.startsWith('gpt-4o') || model.startsWith('gpt-realtime')
    const apiKey = isOpenAiModel ? process.env.OPENAI_API_KEY : process.env.MISTRAL_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: isOpenAiModel ? 'OPENAI_API_KEY not configured' : 'MISTRAL_API_KEY not configured' },
        { status: 500 }
      )
    }

    const upstreamForm = new FormData()
    upstreamForm.append('file', audioFile)
    upstreamForm.append('model', model)

    let url = 'https://api.mistral.ai/v1/audio/transcriptions'
    if (isOpenAiModel) {
      url = 'https://api.openai.com/v1/audio/transcriptions'
      upstreamForm.append('response_format', 'verbose_json')
      upstreamForm.append('timestamp_granularities[]', 'segment')
    } else {
      upstreamForm.append('timestamp_granularities', 'segment')
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('STT provider error:', err)
      return NextResponse.json({ error: 'Transcription failed' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('STT error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

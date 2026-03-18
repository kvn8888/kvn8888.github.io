import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    const prompt = (formData.get('prompt') as string | null)?.trim()

    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const interfazeApiKey = await getSecret('INTERFAZE_API_KEY')
    if (!interfazeApiKey) {
      return NextResponse.json({ error: 'INTERFAZE_API_KEY not configured' }, { status: 500 })
    }

    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imageFile.type || 'image/jpeg'
    const dataUri = `data:${mimeType};base64,${base64}`

    const res = await fetch('https://api.interfaze.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${interfazeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'interfaze-beta',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Interfaze vision error:', { status: res.status, body: err, userEmail })
      return NextResponse.json({ error: 'Vision request failed', details: err }, { status: res.status })
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Vision route error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      userEmail,
    })
    return NextResponse.json({ error: 'Vision request failed' }, { status: 500 })
  }
}

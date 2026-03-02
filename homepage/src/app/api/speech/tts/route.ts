import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

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

    // If instructions provided (style, pacing, accent), prepend them to the text prompt
    // Gemini TTS supports natural language prompts for controlling voice style
    const promptText = instructions ? `${instructions}\n\n${text}` : text

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
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

    // Return base64 PCM audio — client will decode and play
    return NextResponse.json({
      audio: audioData,
      mimeType: 'audio/L16;rate=24000;channels=1',
    })
  } catch (error) {
    console.error('TTS error:', error)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
  }
}

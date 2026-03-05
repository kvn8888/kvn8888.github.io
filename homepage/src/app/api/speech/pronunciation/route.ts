import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION
  if (!speechKey || !speechRegion) {
    return NextResponse.json(
      { error: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not configured' },
      { status: 500 }
    )
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const referenceText = formData.get('referenceText') as string | null
    const language = (formData.get('language') as string) || 'en-US'

    if (!audioFile || !referenceText) {
      return NextResponse.json(
        { error: 'Audio file and reference text are required' },
        { status: 400 }
      )
    }

    const pronunciationParams = {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableProsodyAssessment: 'True',
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const contentType = audioFile.type?.trim() || 'audio/wav'
    const requestUrl =
      `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(language)}&format=detailed`

    const res = await fetch(
      requestUrl,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': contentType,
          'Pronunciation-Assessment': Buffer.from(
            JSON.stringify(pronunciationParams)
          ).toString('base64'),
          Accept: 'application/json',
        },
        body: audioBuffer,
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Azure Pronunciation error:', err)
      return NextResponse.json({ error: 'Pronunciation assessment failed' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Pronunciation error:', error)
    return NextResponse.json({ error: 'Pronunciation assessment failed' }, { status: 500 })
  }
}

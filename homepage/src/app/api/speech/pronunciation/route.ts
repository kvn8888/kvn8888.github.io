import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

type PronunciationResponse = {
  RecognitionStatus?: string
  DisplayText?: string
  NBest?: Array<{
    PronunciationAssessment?: Record<string, unknown>
    Words?: Array<Record<string, unknown>>
  }>
  PronunciationAssessment?: Record<string, unknown>
  Words?: Array<Record<string, unknown>>
}

function hasPronunciationAssessment(data: PronunciationResponse): boolean {
  return Boolean(data.NBest?.[0]?.PronunciationAssessment || data.PronunciationAssessment)
}

async function postPronunciationRequest(args: {
  speechKey: string
  requestUrl: string
  contentType: string
  audioBuffer: Buffer
  pronunciationParams: Record<string, string | number | boolean>
}) {
  const { speechKey, requestUrl, contentType, audioBuffer, pronunciationParams } = args
  return fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': contentType,
      'Pronunciation-Assessment': Buffer.from(
        JSON.stringify(pronunciationParams)
      ).toString('base64'),
      Accept: 'application/json',
    },
    body: new Uint8Array(audioBuffer),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const speechKey = await getSecret('AZURE_SPEECH_KEY')
  const speechRegion = await getSecret('AZURE_SPEECH_REGION')
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
      Format: 'Detailed',
      PhonemeAlphabet: 'IPA',
      NBestPhonemeCount: 5,
      EnableProsodyAssessment: 'True',
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const contentType = audioFile.type?.trim() || 'audio/wav'
    const requestUrl =
      `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(language)}&format=detailed`

    const res = await postPronunciationRequest({
      speechKey,
      requestUrl,
      contentType,
      audioBuffer,
      pronunciationParams,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Azure Pronunciation error:', {
        status: res.status,
        statusText: res.statusText,
        language,
        contentType,
        audioSizeBytes: audioBuffer.length,
        referenceTextLength: referenceText.length,
        body: err,
      })
      return NextResponse.json({ error: 'Pronunciation assessment failed' }, { status: res.status })
    }

    const data = (await res.json()) as PronunciationResponse

    if (!hasPronunciationAssessment(data) && data.RecognitionStatus === 'Success') {
      console.warn('Azure Pronunciation returned Success without assessment data; retrying with basic dimension', {
        language,
        contentType,
        audioSizeBytes: audioBuffer.length,
        displayText: data.DisplayText,
        hasNBest: Boolean(data.NBest?.length),
      })

      const fallbackRes = await postPronunciationRequest({
        speechKey,
        requestUrl,
        contentType,
        audioBuffer,
        pronunciationParams: {
          ReferenceText: referenceText,
          GradingSystem: 'HundredMark',
          Granularity: 'Phoneme',
          Dimension: 'Basic',
          Format: 'Detailed',
          PhonemeAlphabet: 'IPA',
          NBestPhonemeCount: 5,
        },
      })

      if (!fallbackRes.ok) {
        const fallbackErr = await fallbackRes.text()
        console.error('Azure Pronunciation fallback request failed:', {
          status: fallbackRes.status,
          statusText: fallbackRes.statusText,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          body: fallbackErr,
        })
      } else {
        const fallbackData = (await fallbackRes.json()) as PronunciationResponse
        const fallbackHasAssessment = hasPronunciationAssessment(fallbackData)
        console.warn('Azure Pronunciation fallback response summary:', {
          recognitionStatus: fallbackData.RecognitionStatus,
          displayText: fallbackData.DisplayText,
          hasAssessment: fallbackHasAssessment,
          hasNBest: Boolean(fallbackData.NBest?.length),
        })

        if (fallbackHasAssessment) {
          return NextResponse.json({
            ...fallbackData,
            _diagnostics: {
              fallbackUsed: true,
              reason: 'Initial response had Success but no pronunciation assessment block',
            },
          })
        }
      }
    }

    if (!hasPronunciationAssessment(data)) {
      console.warn('Azure Pronunciation response missing assessment block after initial request', {
        recognitionStatus: data.RecognitionStatus,
        displayText: data.DisplayText,
        hasNBest: Boolean(data.NBest?.length),
        language,
        contentType,
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Pronunciation route error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Pronunciation assessment failed' }, { status: 500 })
  }
}

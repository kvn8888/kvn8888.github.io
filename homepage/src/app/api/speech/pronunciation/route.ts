import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { reportServerEvent } from '@/lib/axiom'
import { getSecret } from '@/lib/secrets'

type PronunciationResponse = {
  RecognitionStatus?: string
  DisplayText?: string
  NBest?: Array<{
    PronunciationAssessment?: Record<string, unknown>
    AccuracyScore?: number
    PronScore?: number
    Words?: Array<Record<string, unknown>>
  }>
  PronunciationAssessment?: Record<string, unknown>
  Words?: Array<Record<string, unknown>>
}

function hasPronunciationAssessment(data: PronunciationResponse): boolean {
  const nbestTop = data.NBest?.[0]
  return Boolean(
    nbestTop?.PronunciationAssessment ||
    data.PronunciationAssessment ||
    (typeof nbestTop?.AccuracyScore === 'number' && typeof nbestTop?.PronScore === 'number')
  )
}

function pronunciationErrorResponse(error: string, status: number, requestId: string) {
  return NextResponse.json({ error, requestId, retryable: true }, { status })
}

function truncateProviderBody(body: string) {
  return body.slice(0, 2_000)
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
  const requestId = crypto.randomUUID()
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const speechKey = await getSecret('AZURE_SPEECH_KEY')
  const speechRegion = await getSecret('AZURE_SPEECH_REGION')
  if (!speechKey || !speechRegion) {
    await reportServerEvent({
      level: 'error',
      message: 'Pronunciation assessment configuration missing',
      data: { requestId, route: '/api/speech/pronunciation' },
    })
    return pronunciationErrorResponse('Azure Speech is not configured', 500, requestId)
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const referenceText = formData.get('referenceText') as string | null
    const language = (formData.get('language') as string) || 'en-US'
    const source = (formData.get('source') as string) || 'recording'

    if (!audioFile || !referenceText) {
      return NextResponse.json(
        { error: 'Audio file and reference text are required', requestId },
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
      EnableMiscue: 'True',
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
      await reportServerEvent({
        level: 'error',
        message: 'Azure pronunciation provider request failed',
        data: {
          requestId,
          route: '/api/speech/pronunciation',
          provider: 'azure-speech',
          source,
          speechRegion,
          status: res.status,
          statusText: res.statusText,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          referenceTextLength: referenceText.length,
          providerBody: truncateProviderBody(err),
        },
      })
      const message = res.status === 429
        ? 'Azure Speech rate limit reached. Try again shortly.'
        : 'Pronunciation assessment failed'
      return pronunciationErrorResponse(message, res.status, requestId)
    }

    const data = (await res.json()) as PronunciationResponse

    if (!hasPronunciationAssessment(data) && data.RecognitionStatus === 'Success') {
      await reportServerEvent({
        level: 'warn',
        message: 'Azure pronunciation returned success without assessment data; retrying basic dimension',
        data: {
          requestId,
          route: '/api/speech/pronunciation',
          provider: 'azure-speech',
          source,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          hasNBest: Boolean(data.NBest?.length),
        },
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
          EnableMiscue: 'True',
        },
      })

      if (!fallbackRes.ok) {
        const fallbackErr = await fallbackRes.text()
        await reportServerEvent({
          level: 'error',
          message: 'Azure pronunciation basic fallback request failed',
          data: {
            requestId,
            route: '/api/speech/pronunciation',
            provider: 'azure-speech',
            source,
            speechRegion,
            status: fallbackRes.status,
            statusText: fallbackRes.statusText,
            language,
            contentType,
            audioSizeBytes: audioBuffer.length,
            referenceTextLength: referenceText.length,
            providerBody: truncateProviderBody(fallbackErr),
          },
        })
      } else {
        const fallbackData = (await fallbackRes.json()) as PronunciationResponse
        const fallbackHasAssessment = hasPronunciationAssessment(fallbackData)
        await reportServerEvent({
          level: fallbackHasAssessment ? 'info' : 'warn',
          message: 'Azure pronunciation basic fallback response received',
          data: {
            requestId,
            route: '/api/speech/pronunciation',
            provider: 'azure-speech',
            source,
            recognitionStatus: fallbackData.RecognitionStatus,
            hasAssessment: fallbackHasAssessment,
            hasNBest: Boolean(fallbackData.NBest?.length),
          },
        })

        if (fallbackHasAssessment) {
          return NextResponse.json({
            ...fallbackData,
            _diagnostics: {
              fallbackUsed: true,
              reason: 'Initial response had Success but no pronunciation assessment block',
              requestId,
            },
          })
        }
      }
    }

    if (!hasPronunciationAssessment(data)) {
      await reportServerEvent({
        level: 'warn',
        message: 'Azure pronunciation response missing assessment block',
        data: {
          requestId,
          route: '/api/speech/pronunciation',
          provider: 'azure-speech',
          source,
          recognitionStatus: data.RecognitionStatus,
          hasNBest: Boolean(data.NBest?.length),
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
        },
      })
    }

    return NextResponse.json({ ...data, _requestId: requestId })
  } catch (error) {
    await reportServerEvent({
      level: 'error',
      message: 'Pronunciation assessment route failed',
      data: {
        requestId,
        route: '/api/speech/pronunciation',
        error: error instanceof Error ? error.message : String(error),
      },
    })
    return pronunciationErrorResponse('Pronunciation assessment failed', 500, requestId)
  }
}

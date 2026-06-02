import { auth } from '@/auth'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { reportServerEvent } from '@/lib/axiom'
import { getSecret } from '@/lib/secrets'

type PronunciationResponse = {
  Id?: string
  RecognitionStatus?: string
  Offset?: number
  Duration?: number
  DisplayText?: string
  SNR?: number
  NBest?: Array<{
    Confidence?: number
    Display?: string
    Lexical?: string
    PronunciationAssessment?: PronunciationAssessment
    AccuracyScore?: number
    FluencyScore?: number
    CompletenessScore?: number
    ProsodyScore?: number
    PronScore?: number
    Words?: PronunciationWord[]
  }>
  PronunciationAssessment?: PronunciationAssessment
  Words?: PronunciationWord[]
}

type PronunciationAssessment = {
  AccuracyScore?: number
  FluencyScore?: number
  CompletenessScore?: number
  ProsodyScore?: number
  PronScore?: number
  ErrorType?: string
  Feedback?: unknown
}

type PronunciationWord = {
  Word?: string
  Offset?: number
  Duration?: number
  AccuracyScore?: number
  ErrorType?: string
  Feedback?: unknown
  PronunciationAssessment?: PronunciationAssessment
}

const ROUTE = '/api/speech/pronunciation'
const PROVIDER = 'azure-speech'
const SHORT_ASSESSMENT_LIMIT_SECONDS = 30
const MAX_LOGGED_WORD_ISSUES = 200

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

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function countWords(text?: string) {
  return text?.trim() ? text.trim().split(/\s+/).length : 0
}

function roundSeconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

function azureTicksToSeconds(value?: number) {
  return typeof value === 'number' ? roundSeconds(value / 10_000_000) : undefined
}

function parseWavDurationSeconds(buffer: Buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return undefined
  }

  let byteRate: number | undefined
  let dataSize: number | undefined
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    if (chunkId === 'fmt ' && chunkSize >= 16 && chunkStart + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8)
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - chunkStart))
    }
    if (byteRate && typeof dataSize === 'number') break
    offset = chunkStart + chunkSize + (chunkSize % 2)
  }

  return byteRate && typeof dataSize === 'number'
    ? roundSeconds(dataSize / byteRate)
    : undefined
}

function getResponseHeaders(response: Response) {
  return {
    requestId: response.headers.get('x-requestid') ?? undefined,
    microsoftRequestId: response.headers.get('x-ms-request-id') ?? undefined,
    apimRequestId: response.headers.get('apim-request-id') ?? undefined,
    upstreamServiceTime: response.headers.get('x-envoy-upstream-service-time') ?? undefined,
  }
}

function getPronunciationAssessment(data: PronunciationResponse): PronunciationAssessment | undefined {
  const nbestTop = data.NBest?.[0]
  return nbestTop?.PronunciationAssessment ??
    data.PronunciationAssessment ??
    (typeof nbestTop?.AccuracyScore === 'number' && typeof nbestTop?.PronScore === 'number'
      ? {
          AccuracyScore: nbestTop.AccuracyScore,
          FluencyScore: nbestTop.FluencyScore,
          CompletenessScore: nbestTop.CompletenessScore,
          ProsodyScore: nbestTop.ProsodyScore,
          PronScore: nbestTop.PronScore,
        }
      : undefined)
}

function getPronunciationWords(data: PronunciationResponse) {
  return data.NBest?.[0]?.Words ?? data.Words ?? []
}

function buildPronunciationDiagnostics(args: {
  data: PronunciationResponse
  requestId: string
  source: string
  language: string
  contentType: string
  audioSizeBytes: number
  audioDurationSeconds?: number
  audioSha256: string
  referenceText: string
  referenceTextSha256: string
  userEmail?: string | null
  providerLatencyMs: number
  response: Response
}) {
  const {
    data,
    requestId,
    source,
    language,
    contentType,
    audioSizeBytes,
    audioDurationSeconds,
    audioSha256,
    referenceText,
    referenceTextSha256,
    userEmail,
    providerLatencyMs,
    response,
  } = args
  const nbestTop = data.NBest?.[0]
  const assessment = getPronunciationAssessment(data)
  const words = getPronunciationWords(data)
  const wordIssueCounts: Record<string, number> = {}
  const wordIssues = words.flatMap((word, wordIndex) => {
    const wordAssessment = word.PronunciationAssessment
    const accuracyScore = wordAssessment?.AccuracyScore ?? word.AccuracyScore
    const errorType = wordAssessment?.ErrorType ?? word.ErrorType ?? 'None'
    const issueType = errorType !== 'None' ? errorType : accuracyScore === undefined ? 'Unscored' : null
    if (!issueType) return []
    wordIssueCounts[issueType] = (wordIssueCounts[issueType] ?? 0) + 1
    return [{
      wordIndex,
      word: word.Word,
      issueType,
      accuracyScore: accuracyScore ?? null,
      offsetSeconds: azureTicksToSeconds(word.Offset),
      durationSeconds: azureTicksToSeconds(word.Duration),
      feedback: wordAssessment?.Feedback ?? word.Feedback,
    }]
  })
  const tailOmissionCount = [...words]
    .reverse()
    .findIndex((word) => (word.PronunciationAssessment?.ErrorType ?? word.ErrorType) !== 'Omission')

  return {
    requestId,
    route: ROUTE,
    provider: PROVIDER,
    providerAssessmentId: data.Id,
    providerResponseHeaders: getResponseHeaders(response),
    providerLatencyMs,
    source,
    language,
    contentType,
    audioSizeBytes,
    audioDurationSeconds,
    audioSha256,
    overShortAssessmentLimit: typeof audioDurationSeconds === 'number' &&
      audioDurationSeconds > SHORT_ASSESSMENT_LIMIT_SECONDS,
    referenceTextLength: referenceText.length,
    referenceWordCount: countWords(referenceText),
    referenceTextSha256,
    userEmail,
    recognitionStatus: data.RecognitionStatus,
    recognizedText: nbestTop?.Display ?? data.DisplayText,
    lexical: nbestTop?.Lexical,
    recognizedWordCount: countWords(nbestTop?.Lexical ?? nbestTop?.Display ?? data.DisplayText),
    confidence: nbestTop?.Confidence,
    snr: data.SNR,
    providerAudioOffsetSeconds: azureTicksToSeconds(data.Offset),
    providerAudioDurationSeconds: azureTicksToSeconds(data.Duration),
    hasAssessment: Boolean(assessment),
    scores: assessment
      ? {
          pronunciation: assessment.PronScore,
          accuracy: assessment.AccuracyScore,
          fluency: assessment.FluencyScore,
          completeness: assessment.CompletenessScore,
          prosody: assessment.ProsodyScore,
        }
      : undefined,
    providerWordCount: words.length,
    scoredWordCount: words.filter((word) =>
      typeof (word.PronunciationAssessment?.AccuracyScore ?? word.AccuracyScore) === 'number'
    ).length,
    wordIssueCount: wordIssues.length,
    wordIssueCounts,
    tailOmissionCount: tailOmissionCount === -1 ? words.length : tailOmissionCount,
    wordIssues: wordIssues.slice(0, MAX_LOGGED_WORD_ISSUES),
    wordIssuesTruncated: wordIssues.length > MAX_LOGGED_WORD_ISSUES,
  }
}

async function logPronunciationResponse(args: Parameters<typeof buildPronunciationDiagnostics>[0]) {
  const diagnostics = buildPronunciationDiagnostics(args)
  await reportServerEvent({
    event: 'speech.pronunciation.provider.response',
    level: 'info',
    message: 'Azure pronunciation provider response received',
    data: diagnostics,
  })
  if (diagnostics.wordIssueCount > 0) {
    await reportServerEvent({
      event: 'speech.pronunciation.assessment.issues_detected',
      level: 'warn',
      message: 'Azure pronunciation assessment returned word-level issues',
      data: {
        ...diagnostics,
        referenceText: args.referenceText,
        providerResponse: args.data,
      },
    })
  }
  return diagnostics
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
      event: 'speech.pronunciation.configuration.missing',
      level: 'error',
      message: 'Pronunciation assessment configuration missing',
      data: { requestId, route: ROUTE, provider: PROVIDER },
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
      await reportServerEvent({
        event: 'speech.pronunciation.request.invalid',
        level: 'warn',
        message: 'Pronunciation assessment request missing audio or reference text',
        data: { requestId, route: ROUTE, provider: PROVIDER, hasAudio: Boolean(audioFile), hasReferenceText: Boolean(referenceText) },
      })
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
    const audioDurationSeconds = parseWavDurationSeconds(audioBuffer)
    const audioSha256 = sha256(audioBuffer)
    const referenceTextSha256 = sha256(referenceText)
    const requestMetadata = {
      requestId,
      route: ROUTE,
      provider: PROVIDER,
      source,
      speechRegion,
      language,
      contentType,
      audioFileName: audioFile.name,
      audioSizeBytes: audioBuffer.length,
      audioDurationSeconds,
      audioSha256,
      referenceTextLength: referenceText.length,
      referenceWordCount: countWords(referenceText),
      referenceTextSha256,
      referenceTextPreview: referenceText.slice(0, 500),
      userEmail: session.user?.email,
    }
    await reportServerEvent({
      event: 'speech.pronunciation.request.started',
      level: 'info',
      message: 'Pronunciation assessment request started',
      data: requestMetadata,
    })

    if (
      typeof audioDurationSeconds === 'number' &&
      audioDurationSeconds > SHORT_ASSESSMENT_LIMIT_SECONDS
    ) {
      await reportServerEvent({
        event: 'speech.pronunciation.request.rejected.short_audio_limit',
        level: 'warn',
        message: 'Pronunciation assessment rejected because audio exceeds short REST limit',
        data: {
          ...requestMetadata,
          shortAssessmentLimitSeconds: SHORT_ASSESSMENT_LIMIT_SECONDS,
        },
      })
      return pronunciationErrorResponse(
        `Current pronunciation assessment supports recordings up to ${SHORT_ASSESSMENT_LIMIT_SECONDS} seconds. Shorten the recording and try again.`,
        422,
        requestId
      )
    }

    const requestUrl =
      `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(language)}&format=detailed`

    const providerStartedAt = Date.now()
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
        event: 'speech.pronunciation.provider.failed',
        level: 'error',
        message: 'Azure pronunciation provider request failed',
        data: {
          requestId,
          route: ROUTE,
          provider: PROVIDER,
          source,
          speechRegion,
          status: res.status,
          statusText: res.statusText,
          providerResponseHeaders: getResponseHeaders(res),
          providerLatencyMs: Date.now() - providerStartedAt,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          audioDurationSeconds,
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
    await logPronunciationResponse({
      data,
      requestId,
      source,
      language,
      contentType,
      audioSizeBytes: audioBuffer.length,
      audioDurationSeconds,
      audioSha256,
      referenceText,
      referenceTextSha256,
      userEmail: session.user?.email,
      providerLatencyMs: Date.now() - providerStartedAt,
      response: res,
    })

    if (!hasPronunciationAssessment(data) && data.RecognitionStatus === 'Success') {
      await reportServerEvent({
        event: 'speech.pronunciation.assessment.missing.retrying_fallback',
        level: 'warn',
        message: 'Azure pronunciation returned success without assessment data; retrying basic dimension',
        data: {
          requestId,
          route: ROUTE,
          provider: PROVIDER,
          source,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          audioDurationSeconds,
          hasNBest: Boolean(data.NBest?.length),
          providerResponse: data,
        },
      })

      const fallbackStartedAt = Date.now()
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
          event: 'speech.pronunciation.provider.fallback_failed',
          level: 'error',
          message: 'Azure pronunciation basic fallback request failed',
          data: {
            requestId,
            route: ROUTE,
            provider: PROVIDER,
            source,
            speechRegion,
            status: fallbackRes.status,
            statusText: fallbackRes.statusText,
            providerResponseHeaders: getResponseHeaders(fallbackRes),
            providerLatencyMs: Date.now() - fallbackStartedAt,
            language,
            contentType,
            audioSizeBytes: audioBuffer.length,
            audioDurationSeconds,
            referenceTextLength: referenceText.length,
            providerBody: truncateProviderBody(fallbackErr),
          },
        })
      } else {
        const fallbackData = (await fallbackRes.json()) as PronunciationResponse
        const fallbackHasAssessment = hasPronunciationAssessment(fallbackData)
        await logPronunciationResponse({
          data: fallbackData,
          requestId,
          source,
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          audioDurationSeconds,
          audioSha256,
          referenceText,
          referenceTextSha256,
          userEmail: session.user?.email,
          providerLatencyMs: Date.now() - fallbackStartedAt,
          response: fallbackRes,
        })
        await reportServerEvent({
          event: 'speech.pronunciation.provider.fallback_response',
          level: fallbackHasAssessment ? 'info' : 'warn',
          message: 'Azure pronunciation basic fallback response received',
          data: {
            requestId,
            route: ROUTE,
            provider: PROVIDER,
            source,
            recognitionStatus: fallbackData.RecognitionStatus,
            hasAssessment: fallbackHasAssessment,
            hasNBest: Boolean(fallbackData.NBest?.length),
          },
        })

        if (fallbackHasAssessment) {
          return NextResponse.json({
            ...fallbackData,
            _requestId: requestId,
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
        event: 'speech.pronunciation.assessment.missing',
        level: 'warn',
        message: 'Azure pronunciation response missing assessment block',
        data: {
          requestId,
          route: ROUTE,
          provider: PROVIDER,
          source,
          recognitionStatus: data.RecognitionStatus,
          hasNBest: Boolean(data.NBest?.length),
          language,
          contentType,
          audioSizeBytes: audioBuffer.length,
          audioDurationSeconds,
          providerResponse: data,
        },
      })
    }

    return NextResponse.json({ ...data, _requestId: requestId })
  } catch (error) {
    await reportServerEvent({
      event: 'speech.pronunciation.route.failed',
      level: 'error',
      message: 'Pronunciation assessment route failed',
      data: {
        requestId,
        route: ROUTE,
        provider: PROVIDER,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    return pronunciationErrorResponse('Pronunciation assessment failed', 500, requestId)
  }
}

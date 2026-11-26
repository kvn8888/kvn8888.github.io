import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'
import { downloadFromS3, deleteFromS3 } from '@/lib/speechStorage'

const STT_UPLOAD_PREFIX = 'speech/stt-upload/'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

  try {
    let audioFile: File
    let model: string
    let s3Key: string | null = null

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      // S3-backed upload: client uploaded audio to S3, passes the key
      const body = await req.json()
      s3Key = body.s3Key as string
      model = (body.model as string) || 'voxtral-mini-transcribe-2507'
      const fileName = (body.fileName as string) || 'audio.mp3'

      if (!s3Key || !s3Key.startsWith(STT_UPLOAD_PREFIX)) {
        return NextResponse.json({ error: 'Invalid s3Key' }, { status: 400 })
      }

      const { buffer, contentType: s3ContentType } = await downloadFromS3(s3Key)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      audioFile = new File([arrayBuffer], fileName, { type: s3ContentType })
    } else {
      // Direct FormData upload (small files)
      const formData = await req.formData()
      const file = formData.get('audio') as File | null
      model = (formData.get('model') as string) || 'voxtral-mini-transcribe-2507'

      if (!file) {
        return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
      }
      audioFile = file
    }

    const isMaiModel = model === 'mai-transcribe-2'
    const isAzureOpenAiModel = model.startsWith('gpt-4o') || model.startsWith('gpt-realtime')
    const mistralApiKey = isMaiModel ? undefined : await getSecret('MISTRAL_API_KEY')
    const azureOpenAiApiKey = isMaiModel ? undefined : await getSecret('AZURE_OPENAI_API_KEY')
    const azureOpenAiEndpoint = isMaiModel ? undefined : (await getSecret('AZURE_OPENAI_ENDPOINT'))?.replace(/\/+$/, '')
    const azureOpenAiApiVersion = isMaiModel ? undefined : (await getSecret('AZURE_OPENAI_API_VERSION')) || '2025-03-01-preview'

    if (!isMaiModel && !isAzureOpenAiModel && !mistralApiKey) {
      console.error('STT request missing Mistral API key', {
        model,
        userEmail,
        fileType: audioFile.type,
        fileName: audioFile.name,
      })
      return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 })
    }

    if (isAzureOpenAiModel && (!azureOpenAiApiKey || !azureOpenAiEndpoint)) {
      console.error('STT request missing Azure OpenAI config', {
        model,
        userEmail,
        hasAzureOpenAiApiKey: Boolean(azureOpenAiApiKey),
        hasAzureOpenAiEndpoint: Boolean(azureOpenAiEndpoint),
        fileType: audioFile.type,
        fileName: audioFile.name,
      })
      return NextResponse.json(
        { error: 'AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not configured' },
        { status: 500 }
      )
    }

    const upstreamForm = new FormData()
    let url = 'https://api.mistral.ai/v1/audio/transcriptions'

    let headers: Record<string, string> = {}
    if (isMaiModel) {
      const [endpoint, key] = await Promise.all([
        getSecret('MAI_TRANSCRIBE_ENDPOINT'),
        getSecret('MAI_TRANSCRIBE_KEY'),
      ])
      if (!endpoint?.trim() || !key) {
        return NextResponse.json({ error: 'MAI-Transcribe-2 is not configured' }, { status: 500 })
      }

      url = `${endpoint.trim().replace(/\/+$/, '')}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`
      headers = { 'Ocp-Apim-Subscription-Key': key }
      upstreamForm.append('audio', audioFile)
      // Preserve the spoken reference, including disfluencies, for assessment.
      // Omit locales so multilingual recordings can still be auto-detected.
      upstreamForm.append('definition', JSON.stringify({
        enhancedMode: {
          enabled: true,
          model: 'MAI-Transcribe-2',
          modelOptions: { transcribeStyle: 'verbatim' },
        },
      }))
    } else if (isAzureOpenAiModel) {
      upstreamForm.append('file', audioFile)
      const gpt4oTranscribeDeployment =
        (await getSecret('AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE')) || 'gpt-4o-transcribe'
      const gpt4oTranscribeDiarizeDeployment =
        (await getSecret('AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE_DIARIZE')) || 'gpt-4o-transcribe-diarize'
      const gpt4oMiniTranscribeDeployment =
        (await getSecret('AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_MINI_TRANSCRIBE')) || 'gpt-4o-mini-transcribe'

      const deployment =
        model === 'gpt-4o-transcribe'
          ? gpt4oTranscribeDeployment
          : model === 'gpt-4o-transcribe-diarize'
            ? gpt4oTranscribeDiarizeDeployment
            : model === 'gpt-4o-mini-transcribe'
              ? gpt4oMiniTranscribeDeployment
              : model

      url = `${azureOpenAiEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(azureOpenAiApiVersion!)}`
      headers = { 'api-key': azureOpenAiApiKey! }
      upstreamForm.append('response_format', model === 'gpt-4o-transcribe-diarize' ? 'diarized_json' : 'json')
    } else {
      upstreamForm.append('file', audioFile)
      headers = { Authorization: `Bearer ${mistralApiKey!}` }
      upstreamForm.append('model', model)
      upstreamForm.append('timestamp_granularities', 'segment')
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: upstreamForm,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('STT provider error:', {
        model,
        provider: isMaiModel ? 'mai-transcribe-2' : isAzureOpenAiModel ? 'azure-openai' : 'mistral',
        status: res.status,
        statusText: res.statusText,
        fileName: audioFile.name,
        fileType: audioFile.type,
        fileSizeBytes: audioFile.size,
        userEmail,
        body: err,
      })
      if (isAzureOpenAiModel && res.status === 404) {
        return NextResponse.json(
          {
            error: 'Azure OpenAI deployment not found for selected model',
            details: err,
          },
          { status: 404 }
        )
      }
      if (res.status === 413 || err.toLowerCase().includes('too large') || err.toLowerCase().includes('file size') || err.toLowerCase().includes('exceeds')) {
        const fileSizeMB = (audioFile.size / (1024 * 1024)).toFixed(1)
        return NextResponse.json(
          { error: `File too large for provider (${fileSizeMB} MB uploaded)` },
          { status: res.status }
        )
      }
      return NextResponse.json({ error: 'Transcription failed' }, { status: res.status })
    }

    const providerData = await res.json()
    const data = isMaiModel
      ? {
          text: (Array.isArray(providerData?.combinedPhrases) ? providerData.combinedPhrases : [])
            .map((phrase: { text?: unknown }) => typeof phrase?.text === 'string' ? phrase.text.trim() : '')
            .filter(Boolean)
            .join(' '),
        }
      : providerData

    // Clean up S3 object after successful transcription
    if (s3Key) deleteFromS3(s3Key).catch(() => {})

    return NextResponse.json(data)
  } catch (error) {
    console.error('STT route error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userEmail,
    })
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

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
    const audioFile = formData.get('audio') as File | null
    const model = (formData.get('model') as string) || 'voxtral-mini-transcribe-2507'

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    const isAzureOpenAiModel = model.startsWith('gpt-4o') || model.startsWith('gpt-realtime')
    const mistralApiKey = await getSecret('MISTRAL_API_KEY')
    const azureOpenAiApiKey = await getSecret('AZURE_OPENAI_API_KEY')
    const azureOpenAiEndpoint = (await getSecret('AZURE_OPENAI_ENDPOINT'))?.replace(/\/+$/, '')
    const azureOpenAiApiVersion = (await getSecret('AZURE_OPENAI_API_VERSION')) || '2025-03-01-preview'

    if (!isAzureOpenAiModel && !mistralApiKey) {
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
    upstreamForm.append('file', audioFile)

    let url = 'https://api.mistral.ai/v1/audio/transcriptions'

    let headers: Record<string, string> = {}
    if (isAzureOpenAiModel) {
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

      url = `${azureOpenAiEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(azureOpenAiApiVersion)}`
      headers = { 'api-key': azureOpenAiApiKey! }
      upstreamForm.append('response_format', model === 'gpt-4o-transcribe-diarize' ? 'diarized_json' : 'json')
    } else {
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
        provider: isAzureOpenAiModel ? 'azure-openai' : 'mistral',
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
      return NextResponse.json({ error: 'Transcription failed' }, { status: res.status })
    }

    const data = await res.json()
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

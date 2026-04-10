/**
 * /api/speech/stt/stream — Streaming transcription proxy for Azure gpt-4o-transcribe family.
 *
 * WHAT THIS DOES:
 *   Accepts a small audio file (FormData), forwards it to Azure with `stream=true`,
 *   and proxies the raw Server-Sent Events (SSE) stream back to the browser.
 *   The browser sees tokens arriving word-by-word instead of waiting for the full
 *   response to come back all at once.
 *
 * STREAMING FLOW:
 *   1. Client uploads audio via FormData POST
 *   2. This route calls Azure gpt-4o-transcribe with stream=true
 *   3. Azure processes the audio, then streams text tokens as SSE events:
 *        data: {"type":"transcript.text.delta","delta":"Hello"}\n\n
 *        data: {"type":"transcript.text.delta","delta":" world"}\n\n
 *        data: {"type":"transcript.text.done","text":"Hello world"}\n\n
 *        data: [DONE]\n\n
 *   4. This route pipes those bytes directly to the client as text/event-stream
 *
 * LIMITATIONS:
 *   - Small files only (no S3 large file path — large files are better served by Render)
 *   - Only gpt-4o-transcribe and gpt-4o-mini-transcribe (they support stream=true)
 *   - Subject to Vercel function timeout (~60s Hobby, ~300s Pro)
 *     For files that take >60s to process, the stream will be cut off mid-flight on Hobby tier.
 *
 * WHY WE PROXY INSTEAD OF READING THE WHOLE RESPONSE:
 *   If we awaited the full Azure response before sending anything back, we'd lose the benefit
 *   of streaming. By returning a ReadableStream directly, Next.js App Router sends bytes
 *   to the client as soon as Azure emits them — no buffering in the Vercel function.
 */

import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

/** Only these Azure models support stream=true on the transcription REST endpoint */
const STREAMING_MODELS = new Set(['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'])

export async function POST(req: NextRequest) {
  // Auth guard — same as /api/speech/stt
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Parse the multipart upload
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const model = (formData.get('model') as string) || 'gpt-4o-transcribe'

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file required (field: audio)' }, { status: 400 })
    }

    if (!STREAMING_MODELS.has(model)) {
      return NextResponse.json(
        { error: `Model "${model}" does not support streaming. Use gpt-4o-transcribe or gpt-4o-mini-transcribe.` },
        { status: 400 }
      )
    }

    // Resolve Azure credentials — same keys as the main STT route
    const azureApiKey = await getSecret('AZURE_OPENAI_API_KEY')
    const azureEndpoint = (await getSecret('AZURE_OPENAI_ENDPOINT'))?.replace(/\/+$/, '')
    const azureApiVersion = (await getSecret('AZURE_OPENAI_API_VERSION')) || '2025-03-01-preview'

    if (!azureApiKey || !azureEndpoint) {
      return NextResponse.json({ error: 'Azure OpenAI credentials not configured' }, { status: 500 })
    }

    // Pick the deployment name for the selected model
    const deploymentSecretKey =
      model === 'gpt-4o-mini-transcribe'
        ? 'AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_MINI_TRANSCRIBE'
        : 'AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE'
    const deployment = (await getSecret(deploymentSecretKey)) || model

    // Build the upstream Azure URL (deployment in the path, not in the form body)
    const url =
      `${azureEndpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
      `/audio/transcriptions?api-version=${encodeURIComponent(azureApiVersion)}`

    // Build the form — same as the main STT route, plus stream=true
    const upstreamForm = new FormData()
    upstreamForm.append('file', audioFile)
    upstreamForm.append('response_format', 'text') // text + stream=true gives clean delta events
    upstreamForm.append('stream', 'true') // This is the key field that enables SSE streaming

    const azureRes = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': azureApiKey },
      body: upstreamForm,
    })

    // If Azure returns an error, forward it as a normal JSON error (not SSE)
    if (!azureRes.ok || !azureRes.body) {
      const errBody = await azureRes.text().catch(() => '')
      return NextResponse.json(
        { error: `Azure transcription error ${azureRes.status}`, details: errBody },
        { status: azureRes.status }
      )
    }

    // Proxy the Azure SSE stream directly to the client.
    // Next.js App Router supports streaming responses — it will flush bytes as Azure emits them
    // (no internal buffering in the Vercel function).
    return new Response(azureRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Streaming transcription failed' },
      { status: 500 }
    )
  }
}

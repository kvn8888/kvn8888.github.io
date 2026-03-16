import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const endpoint = await getSecret('AZURE_MISTRAL_DOC_AI_ENDPOINT')
  const apiKey = await getSecret('AZURE_MISTRAL_DOC_AI_KEY')

  if (!endpoint || !apiKey) {
    return NextResponse.json(
      { error: 'AZURE_MISTRAL_DOC_AI_ENDPOINT and AZURE_MISTRAL_DOC_AI_KEY are required' },
      { status: 500 }
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB` },
        { status: 400 }
      )
    }

    const isPdf = file.type === 'application/pdf'
    const isImage = SUPPORTED_IMAGE_TYPES.has(file.type)

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: PDF, JPEG, PNG, GIF, WebP, HEIC, BMP, TIFF` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    const documentPayload = isPdf
      ? { type: 'document_url', document_url: dataUrl }
      : { type: 'image_url', image_url: dataUrl }

    const baseUrl = endpoint.replace(/\/+$/, '')
    // Azure AI Foundry endpoints already include the full path (e.g. .../azure/ocr)
    // Native Mistral API base URLs need /v1/ocr appended
    const ocrPath = baseUrl.endsWith('/ocr') ? baseUrl : `${baseUrl}/v1/ocr`
    const ocrUrl = `${ocrPath}?api-version=2024-05-01-preview`

    const res = await fetch(ocrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-2503',
        document: documentPayload,
        include_image_base64: false,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Mistral Document AI error:', {
        status: res.status,
        statusText: res.statusText,
        fileName: file.name,
        fileType: file.type,
        body: errText,
        userEmail: session.user?.email,
      })
      return NextResponse.json(
        { error: `OCR failed: ${res.statusText}`, details: errText },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Combine all pages' markdown into a single string
    const pages: { index: number; markdown: string }[] = data.pages ?? []
    const markdown =
      pages.length > 0
        ? pages.map((p) => p.markdown ?? '').join('\n\n---\n\n')
        : ''

    return NextResponse.json({
      markdown,
      pageCount: pages.length,
      model: data.model ?? 'mistral-ocr-latest',
    })
  } catch (err) {
    console.error('OCR route error:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'OCR processing failed' }, { status: 500 })
  }
}

import { auth } from '@/auth'
import {
  CoverLetterStorageError,
  deleteStoredReferenceResume,
  readStoredReferenceResume,
} from '@/lib/coverLetterStorage'
import { NextRequest, NextResponse } from 'next/server'

function getErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof CoverLetterStorageError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json(
    { error: fallbackMessage, details: String(error) },
    { status: 500 }
  )
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await context.params
    const resume = await readStoredReferenceResume(id)

    return new NextResponse(resume.bytes, {
      headers: {
        'Content-Type': resume.contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(resume.name)}`,
      },
    })
  } catch (error) {
    return getErrorResponse(error, 'Failed to load reference resume')
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await context.params
    await deleteStoredReferenceResume(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return getErrorResponse(error, 'Failed to delete reference resume')
  }
}
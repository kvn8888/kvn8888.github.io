import { auth } from '@/auth'
import {
  CoverLetterStorageError,
  deleteStoredCoverLetter,
  readStoredCoverLetter,
  saveStoredCoverLetter,
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
    const letter = await readStoredCoverLetter(id)
    return NextResponse.json({ letter })
  } catch (error) {
    return getErrorResponse(error, 'Failed to load saved cover letter')
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await context.params
    const body = await request.json()
    const letter = await saveStoredCoverLetter({
      id,
      title: String(body.title ?? ''),
      html: String(body.html ?? ''),
      plainText: String(body.plainText ?? ''),
      jobPosting: String(body.jobPosting ?? ''),
    })

    return NextResponse.json({ letter })
  } catch (error) {
    return getErrorResponse(error, 'Failed to update saved cover letter')
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
    await deleteStoredCoverLetter(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return getErrorResponse(error, 'Failed to delete saved cover letter')
  }
}
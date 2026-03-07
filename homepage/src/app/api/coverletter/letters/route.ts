import { auth } from '@/auth'
import {
  CoverLetterStorageError,
  listStoredCoverLetters,
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

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const letters = await listStoredCoverLetters()
    return NextResponse.json({ letters })
  } catch (error) {
    return getErrorResponse(error, 'Failed to load saved cover letters')
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const letter = await saveStoredCoverLetter({
      title: String(body.title ?? ''),
      html: String(body.html ?? ''),
      plainText: String(body.plainText ?? ''),
      jobPosting: String(body.jobPosting ?? ''),
    })

    return NextResponse.json({ letter }, { status: 201 })
  } catch (error) {
    return getErrorResponse(error, 'Failed to save cover letter')
  }
}
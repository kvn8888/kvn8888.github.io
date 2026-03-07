import { auth } from '@/auth'
import {
  CoverLetterStorageError,
  listStoredReferenceResumes,
  uploadStoredReferenceResume,
} from '@/lib/coverLetterStorage'
import { NextResponse } from 'next/server'

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
    const resumes = await listStoredReferenceResumes()
    return NextResponse.json({ resumes })
  } catch (error) {
    return getErrorResponse(error, 'Failed to load reference resumes')
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'PDF file is required' }, { status: 400 })
    }

    const resume = await uploadStoredReferenceResume(file)
    return NextResponse.json({ resume }, { status: 201 })
  } catch (error) {
    return getErrorResponse(error, 'Failed to upload reference resume')
  }
}
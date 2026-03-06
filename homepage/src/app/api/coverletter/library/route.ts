import { auth } from '@/auth'
import { listCoverLetterLibrary } from '@/lib/coverLetterDb'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const library = await listCoverLetterLibrary()
    return NextResponse.json(library)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load cover letter library', details: String(error) },
      { status: 500 }
    )
  }
}
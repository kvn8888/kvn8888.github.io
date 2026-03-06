import { auth } from '@/auth'
import { createCoverLetterTag, listCoverLetterLibrary } from '@/lib/coverLetterDb'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { tags } = await listCoverLetterLibrary()
    return NextResponse.json({ tags })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load cover letter tags', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const tag = await createCoverLetterTag(String(body.name ?? ''))
    return NextResponse.json({ tag }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || 'Failed to create tag' }, { status: 400 })
  }
}
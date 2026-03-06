import { auth } from '@/auth'
import { createCoverLetterBlock, listCoverLetterLibrary } from '@/lib/coverLetterDb'
import { NextRequest, NextResponse } from 'next/server'

function normalizeTagIds(tagIds: unknown) {
  if (!Array.isArray(tagIds)) return []
  return tagIds.map((value) => String(value))
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { blocks } = await listCoverLetterLibrary()
    return NextResponse.json({ blocks })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load cover letter blocks', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const block = await createCoverLetterBlock({
      category: String(body.category ?? ''),
      text: String(body.text ?? ''),
      tagIds: normalizeTagIds(body.tagIds),
    })
    return NextResponse.json({ block }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: message || 'Failed to create cover letter block' },
      { status: 400 }
    )
  }
}
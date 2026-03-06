import { auth } from '@/auth'
import { deleteCoverLetterTag, updateCoverLetterTag } from '@/lib/coverLetterDb'
import { NextRequest, NextResponse } from 'next/server'

function parseNumericId(id: string) {
  const numericId = Number.parseInt(id, 10)
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const numericId = parseNumericId(id)
  if (!numericId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const body = await req.json()
    const tag = await updateCoverLetterTag(numericId, String(body.name ?? ''))
    return NextResponse.json({ tag })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || 'Failed to update tag' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const numericId = parseNumericId(id)
  if (!numericId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    await deleteCoverLetterTag(numericId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete tag', details: String(error) },
      { status: 500 }
    )
  }
}
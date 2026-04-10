import { auth } from '@/auth'
import { deleteFromS3, createPresignedGetUrl } from '@/lib/speechStorage'
import { NextResponse } from 'next/server'

// The S3 prefix used for recordings — must match speechStorage.ts
const RECORDINGS_PREFIX = 'recordings/'

/**
 * GET /api/speech/recordings/[id]
 * Returns a short-lived presigned URL to download the recording.
 * The client uses this to fetch the audio blob for retry transcription.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const key = `${RECORDINGS_PREFIX}${id}`

  try {
    const url = await createPresignedGetUrl(key)
    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate download URL', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/speech/recordings/[id]
 * Remove a saved recording from S3.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const key = `${RECORDINGS_PREFIX}${id}`

  try {
    await deleteFromS3(key)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete recording', details: String(error) },
      { status: 500 }
    )
  }
}

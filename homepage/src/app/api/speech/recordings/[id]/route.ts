import { auth } from '@/auth'
import { deleteFromS3, downloadFromS3 } from '@/lib/speechStorage'
import { NextResponse } from 'next/server'

// The S3 prefix used for recordings — must match speechStorage.ts
const RECORDINGS_PREFIX = 'recordings/'

/**
 * GET /api/speech/recordings/[id]
 * Proxies the audio bytes from S3 back to the client.
 * Avoids CORS issues with direct S3 presigned URLs.
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
    const { buffer, contentType } = await downloadFromS3(key)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to download recording', details: String(error) },
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

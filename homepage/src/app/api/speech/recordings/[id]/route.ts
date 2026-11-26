import { auth } from '@/auth'
import { removeRecording, downloadRecording } from '@/lib/speechStorage'
import { NextResponse } from 'next/server'


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
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const { buffer, contentType } = await downloadRecording(session.user.email, id)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Recording unavailable' },
      { status: 404 }
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
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await removeRecording(session.user.email, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete recording', details: String(error) },
      { status: 500 }
    )
  }
}

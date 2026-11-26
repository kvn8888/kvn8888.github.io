import { auth } from '@/auth'
import { listRecordings, uploadRecording } from '@/lib/speechStorage'
import { NextResponse } from 'next/server'

/**
 * GET /api/speech/recordings
 * List recent saved recordings owned by the signed-in user.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const recordings = await listRecordings(session.user.email)
    return NextResponse.json({ recordings })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list recordings', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/speech/recordings
 * Upload a new mic recording to S3 (multipart/form-data with "audio" field).
 * Saved recordings are retained until explicitly deleted.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('audio')

    if (!(file instanceof File) || file.size > 4_000_000) {
      return NextResponse.json({ error: 'Audio file up to 4 MB is required' }, { status: 400 })
    }

    // Read the file into a buffer for S3 upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const recording = await uploadRecording(session.user.email, buffer, file.name, file.type || 'audio/webm')
    return NextResponse.json({ recording }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to upload recording', details: String(error) },
      { status: 500 }
    )
  }
}

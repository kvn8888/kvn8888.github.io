import { auth } from '@/auth'
import { listRecordings, uploadRecording } from '@/lib/speechStorage'
import { NextResponse } from 'next/server'

/**
 * GET /api/speech/recordings
 * List all saved recordings (max 3), sorted oldest-first.
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const recordings = await listRecordings()
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
 * Auto-evicts the oldest if already at the 3-recording limit.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('audio')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
    }

    // Read the file into a buffer for S3 upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const recording = await uploadRecording(buffer, file.name, file.type || 'audio/webm')
    return NextResponse.json({ recording }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to upload recording', details: String(error) },
      { status: 500 }
    )
  }
}

import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { createPresignedPutUrl } from '@/lib/speechStorage'

const MAX_SIZE_BYTES = 1024 * 1024 * 1024 // 1 GB (largest provider limit)

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const contentType = searchParams.get('contentType')
  const ext = searchParams.get('ext')
  const sizeStr = searchParams.get('size')

  if (!contentType || !contentType.startsWith('audio/')) {
    return NextResponse.json({ error: 'contentType must start with audio/' }, { status: 400 })
  }
  if (!ext || !/^[a-z0-9]{1,10}$/.test(ext)) {
    return NextResponse.json({ error: 'ext must be a valid file extension' }, { status: 400 })
  }
  const size = Number(sizeStr)
  if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: `size must be a positive integer up to ${MAX_SIZE_BYTES}` }, { status: 400 })
  }

  try {
    const key = `speech/stt-upload/${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { url } = await createPresignedPutUrl(key, contentType)
    return NextResponse.json({ url, key, expiresIn: 600 })
  } catch (err) {
    console.error('Presign error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create upload URL' },
      { status: 500 }
    )
  }
}

import { auth } from '@/auth'
import { issueSpeechServiceToken } from '@/lib/speechService'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const email = (await auth())?.user?.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { scope } = await req.json().catch(() => ({}))
  if (scope !== 'transcribe' && scope !== 'diarize') return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  try {
    return NextResponse.json({ token: await issueSpeechServiceToken(email, scope) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Speech service not configured' }, { status: 503 })
  }
}

import { auth } from '@/auth'
import { getAttempt, getAttemptAudio } from '@/lib/pronunciationDb'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const email = (await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Invalid attempt' }, { status: 400 })
  try {
    const attempt = await getAttempt(email,id)
    if (!attempt) throw new Error('Not found')
    const audio = await getAttemptAudio(attempt,req.nextUrl.searchParams.get('variant')==='source')
    return new Response(new Uint8Array(audio.buffer), { headers: { 'Content-Type':'audio/wav', 'Cache-Control':'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Assessment audio not available' }, { status: 404 }) }
}

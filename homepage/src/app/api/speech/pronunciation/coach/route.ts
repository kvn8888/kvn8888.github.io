import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import { generatePronunciationCoach, pronunciationCoachInputSchema } from '@/lib/pronunciationCoach'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await auth())?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const requestId = crypto.randomUUID()
  try {
    const parsed = pronunciationCoachInputSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid or incomplete pronunciation evidence.', requestId }, { status: 400 })
    const key = await getSecret('OPENAI_API_KEY')
    if (!key) return NextResponse.json({ error: 'AI pronunciation coaching is not configured.', requestId }, { status: 503 })
    const coach = await generatePronunciationCoach(parsed.data, key)
    return NextResponse.json({ coach })
  } catch (error) {
    console.error('Pronunciation coaching failed', { requestId, errorType: error instanceof Error ? error.name : 'Unknown' })
    return NextResponse.json({ error: 'AI coaching unavailable. Your measured assessment is still valid.', requestId, retryable: true }, { status: 502 })
  }
}

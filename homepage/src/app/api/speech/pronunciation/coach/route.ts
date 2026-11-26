import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import { generatePronunciationCoach, pronunciationCoachInputSchema } from '@/lib/pronunciationCoach'
import { enrichCoaching, AttemptNotFound, AttemptBusy } from '@/lib/pronunciationEnrichment'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration=60
export async function POST(req:NextRequest) {
  const email=(await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({error:'Unauthorized'},{status:401})
  const requestId=crypto.randomUUID()
  try {
    const body=await req.json()
    if (typeof body.attemptId==='string') return NextResponse.json(await enrichCoaching(email,body.attemptId))
    // Legacy rows without archived provider evidence can still be coached from saved measurements.
    const parsed=pronunciationCoachInputSchema.safeParse({...body,calibrationEvidence:undefined})
    if (!parsed.success) return NextResponse.json({error:'Invalid or incomplete pronunciation evidence.',requestId},{status:400})
    const key=await getSecret('OPENAI_API_KEY')
    if (!key) return NextResponse.json({error:'AI pronunciation coaching is not configured.',requestId},{status:503})
    return NextResponse.json({coach:await generatePronunciationCoach(parsed.data,key)})
  } catch (err) {
    if (err instanceof AttemptNotFound) return NextResponse.json({error:'Attempt not found'},{status:404})
    if (err instanceof AttemptBusy) return NextResponse.json({pending:true},{status:202,headers:{'Retry-After':'2'}})
    console.error('Pronunciation coaching failed',{requestId,errorType:err instanceof Error?err.name:'Unknown'})
    return NextResponse.json({error:'AI coaching unavailable. Your measured assessment is still valid.',requestId,retryable:true},{status:502})
  }
}

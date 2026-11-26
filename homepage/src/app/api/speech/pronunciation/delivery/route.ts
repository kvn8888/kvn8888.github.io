import { auth } from '@/auth'
import { enrichDelivery, AttemptNotFound, AttemptBusy } from '@/lib/pronunciationEnrichment'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration=60
export async function POST(req:NextRequest) {
  const email=(await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({error:'Unauthorized'},{status:401})
  const {attemptId}=await req.json().catch(()=>({}))
  if (typeof attemptId!=='string') return NextResponse.json({error:'Attempt ID required'},{status:400})
  try { return NextResponse.json({delivery:await enrichDelivery(email,attemptId)}) }
  catch (err) {
    if (err instanceof AttemptNotFound) return NextResponse.json({error:'Attempt not found'},{status:404})
    if (err instanceof AttemptBusy) return NextResponse.json({pending:true},{status:202,headers:{'Retry-After':'2'}})
    return NextResponse.json({error:'Acoustic analysis unavailable. Measured Azure scores are still valid.'},{status:502})
  }
}

import { timingSafeEqual } from 'node:crypto'
import { runPronunciationCanary } from '@/lib/pronunciationCanary'
import { NextResponse } from 'next/server'

export const dynamic='force-dynamic'
export const maxDuration=30
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET
  const supplied=request.headers.get('authorization')??''
  const expected=secret?'Bearer '+secret:''
  if (!expected||supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return NextResponse.json({error:'Unauthorized'},{status:401})
  try { return NextResponse.json({ok:true,...await runPronunciationCanary()}) }
  catch (err) { console.error('Pronunciation canary failed',{errorType:err instanceof Error?err.name:'Unknown'});return NextResponse.json({ok:false,error:'Canary unavailable'},{status:502}) }
}

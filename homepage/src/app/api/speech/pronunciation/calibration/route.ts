import { auth } from '@/auth'
import { getAttempt } from '@/lib/pronunciationDb'
import { getCalibrationReport } from '@/lib/pronunciationCalibration'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req:NextRequest) {
  const email=(await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({error:'Unauthorized'},{status:401})
  const id=req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({error:'Attempt ID required'},{status:400})
  try {
    const attempt=await getAttempt(email,id)
    if (!attempt) return NextResponse.json({error:'Attempt not found'},{status:404})
    return NextResponse.json({report:await getCalibrationReport(attempt)}, {headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'Calibration data unavailable'},{status:503}) }
}

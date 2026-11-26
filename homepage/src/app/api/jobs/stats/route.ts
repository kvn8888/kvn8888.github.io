import { jobStats } from '@/lib/jobStats'
import { getJobsIdentity } from '@/lib/jobsRequestAuth'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const userEmail = await getJobsIdentity(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getJobsDb()
    await ensureJobsSchema(db)
    return NextResponse.json(await jobStats(db), {headers: {'Cache-Control':'no-store'}})
  } catch (err) {
    console.error('GET /api/jobs/stats error:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userEmail,
    })
    return NextResponse.json({ error: 'Failed to fetch stats', details: String(err) }, { status: 500 })
  }
}

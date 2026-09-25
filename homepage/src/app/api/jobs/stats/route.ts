import { jobStats } from '@/lib/jobStats'
import { auth } from '@/auth'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

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

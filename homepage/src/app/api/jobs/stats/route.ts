import { auth } from '@/auth'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { NextResponse } from 'next/server'

function getMondayISO(date: Date): string {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

  try {
    const db = getJobsDb()
    await ensureJobsSchema(db)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    const thisMonday = getMondayISO(now)
    const lastMonday = new Date(now)
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)
    const lastMondayISO = getMondayISO(lastMonday)
    // Last Sunday = one day before this Monday (i.e., the end of last week)
    const lastSunday = new Date(thisMonday)
    lastSunday.setUTCDate(lastSunday.getUTCDate() - 1)
    const lastSundayISO = lastSunday.toISOString().slice(0, 10)

    const monthStart = `${today.slice(0, 7)}-01`

    const [totalRes, todayRes, weekRes, lastWeekRes, monthRes] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) as cnt FROM job_applications', args: [] }),
      db.execute({ sql: `SELECT COUNT(*) as cnt FROM job_applications WHERE date = ?`, args: [today] }),
      db.execute({
        sql: `SELECT COUNT(*) as cnt FROM job_applications WHERE date >= ?`,
        args: [thisMonday],
      }),
      db.execute({
        sql: `SELECT COUNT(*) as cnt FROM job_applications WHERE date >= ? AND date <= ?`,
        args: [lastMondayISO, lastSundayISO],
      }),
      db.execute({
        sql: `SELECT COUNT(*) as cnt FROM job_applications WHERE date >= ?`,
        args: [monthStart],
      }),
    ])

    const total = Number(totalRes.rows[0]?.cnt ?? 0)
    const todayCount = Number(todayRes.rows[0]?.cnt ?? 0)
    const thisWeek = Number(weekRes.rows[0]?.cnt ?? 0)
    const lastWeek = Number(lastWeekRes.rows[0]?.cnt ?? 0)
    const thisMonth = Number(monthRes.rows[0]?.cnt ?? 0)

    // Days elapsed in the current week (Mon=1...Sun=7)
    const dayOfWeek = now.getUTCDay() === 0 ? 7 : now.getUTCDay()
    const avgPerDayWeek = dayOfWeek > 0 ? Math.round((thisWeek / dayOfWeek) * 10) / 10 : 0

    const daysInMonth = now.getUTCDate()
    const avgPerDayMonth = daysInMonth > 0 ? Math.round((thisMonth / daysInMonth) * 10) / 10 : 0

    const diff = thisWeek - lastWeek
    const weekComparison =
      diff === 0
        ? 'Same as last week'
        : diff > 0
        ? `+${diff} more than last week`
        : `${diff} fewer than last week`

    return NextResponse.json({
      total,
      today: todayCount,
      thisWeek,
      lastWeek,
      thisMonth,
      avgPerDayWeek,
      avgPerDayMonth,
      weekComparison,
    })
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

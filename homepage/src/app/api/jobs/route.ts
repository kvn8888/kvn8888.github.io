import { auth } from '@/auth'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { getSecret } from '@/lib/secrets'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  try {
    const db = await getJobsDb()
    await ensureJobsSchema(db)

    const whereClause = q ? `WHERE company LIKE '%' || ? || '%'` : ''
    const params = q ? [q, limit, offset] : [limit, offset]

    const rows = await db.execute({
      sql: `SELECT id, company, role, date, source, type, cover_letter, resume_type, interviewed, description
            FROM job_applications
            ${whereClause}
            ORDER BY date DESC
            LIMIT ? OFFSET ?`,
      args: params,
    })

    const countRows = await db.execute({
      sql: `SELECT COUNT(*) as total FROM job_applications ${whereClause}`,
      args: q ? [q] : [],
    })

    const jobs = rows.rows.map((r) => ({
      id: Number(r.id),
      company: r.company,
      role: r.role,
      date: r.date,
      source: r.source,
      type: r.type,
      cover_letter: r.cover_letter,
      resume_type: r.resume_type,
      interviewed: Boolean(r.interviewed),
      description: r.description,
    }))

    const total = Number(countRows.rows[0]?.total ?? 0)

    return NextResponse.json({ jobs, total })
  } catch (err) {
    console.error('GET /api/jobs error:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      q,
      limit,
      offset,
      userEmail,
    })
    return NextResponse.json({ error: 'Failed to fetch jobs', details: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userEmail = session.user?.email?.toLowerCase() || 'unknown'

  try {
    const body = await req.json()
    const { company, role, description, type, source, cover_letter, resume_type, date } = body

    if (!company || !role) {
      return NextResponse.json({ error: 'company and role are required' }, { status: 400 })
    }

    const jobDate = date || new Date().toISOString().slice(0, 10)

    const db = await getJobsDb()
    await ensureJobsSchema(db)
    const result = await db.execute({
      sql: `INSERT INTO job_applications (company, role, description, date, source, type, cover_letter, resume_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [company, role, description || null, jobDate, source || null, type || null, cover_letter || null, resume_type || null],
    })

    const id = Number(result.lastInsertRowid)

    // Optional Google Sheets webhook dual-write
    const webhookUrl = await getSecret('SHEETS_WEBHOOK_URL')
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, role, description, date: jobDate, source, type, cover_letter, resume_type }),
        })
      } catch (webhookErr) {
        console.warn('Sheets webhook failed (non-fatal):', webhookErr)
      }
    }

    return NextResponse.json({ id, message: 'Created' }, { status: 201 })
  } catch (err) {
    console.error('POST /api/jobs error:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userEmail,
    })
    return NextResponse.json({ error: 'Failed to create job', details: String(err) }, { status: 500 })
  }
}

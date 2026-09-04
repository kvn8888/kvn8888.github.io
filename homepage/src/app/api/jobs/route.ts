import { getJobsIdentity } from '@/lib/jobsRequestAuth'
import { insertJob, validateJobInput, validateIdempotencyKey, JobInputError, JobConflictError } from '@/lib/jobWrites'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { getSecret } from '@/lib/secrets'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const userEmail = await getJobsIdentity(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)
  const offset = Number(searchParams.get('offset') || '0')
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 })
  }

  try {
    const db = await getJobsDb()
    await ensureJobsSchema(db)

    const whereClause = q ? `WHERE company LIKE '%' || ? || '%'` : ''
    const params = q ? [q, limit, offset] : [limit, offset]

    const rows = await db.execute({
      sql: `SELECT id, company, role, date, source, type, cover_letter, resume_type, interviewed, description, location, work_mode
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
      location: r.location,
      work_mode: r.work_mode,
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
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userEmail = await getJobsIdentity(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = validateJobInput(await req.json())
    const key = validateIdempotencyKey(req.headers.get('idempotency-key'))
    if (userEmail === 'tracker-agent' && !key) throw new JobInputError('Idempotency-Key is required for agent inserts')
    const { company, role, description, type, source, cover_letter, resume_type, date, location, work_mode } = body
    const jobDate = date || new Date().toISOString().slice(0, 10)
    const db = await getJobsDb()
    await ensureJobsSchema(db)
    const { id, replayed } = await insertJob(db, body, key)
    if (replayed) return NextResponse.json({ id, message: 'Already created', replayed: true })

    // Optional Google Sheets webhook dual-write
    const webhookUrl = await getSecret('SHEETS_WEBHOOK_URL')
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, role, description, date: jobDate, source, type, cover_letter, resume_type, location, work_mode }),
        })
      } catch (webhookErr) {
        console.warn('Sheets webhook failed (non-fatal):', webhookErr)
      }
    }

    return NextResponse.json({ id, message: 'Created', replayed: false }, { status: 201 })
  } catch (err) {
    if (err instanceof JobInputError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof JobConflictError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('POST /api/jobs error:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userEmail,
    })
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}

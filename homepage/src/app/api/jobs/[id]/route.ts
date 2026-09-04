import { getJobsIdentity } from '@/lib/jobsRequestAuth'
import { validateJobInput, JobInputError } from '@/lib/jobWrites'
import { ensureJobsSchema, getJobsDb } from '@/lib/jobsDb'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userEmail = await getJobsIdentity(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const numericId = Number(id)
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const updates = validateJobInput(await req.json(), true)

    const setClauses = Object.keys(updates).map((f) => `${f} = ?`).join(', ')
    const values: (string | number | boolean | null)[] = [...Object.values(updates) as (string | number | boolean | null)[], numericId]

    const db = await getJobsDb()
    await ensureJobsSchema(db)
    const result = await db.execute({
      sql: `UPDATE job_applications SET ${setClauses} WHERE id = ?`,
      args: values,
    })

    if (!result.rowsAffected) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    return NextResponse.json({ message: 'Updated' })
  } catch (err) {
    if (err instanceof JobInputError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(`PATCH /api/jobs/${id} error:`, {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      id,
      userEmail,
    })
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

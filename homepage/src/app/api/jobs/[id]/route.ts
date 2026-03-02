import { auth } from '@/auth'
import { createClient } from '@libsql/client'
import { NextRequest, NextResponse } from 'next/server'

function getDb() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured')
  }
  return createClient({ url, authToken })
}

const ALLOWED_FIELDS = ['company', 'role', 'type', 'source', 'cover_letter', 'resume_type', 'interviewed', 'description'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const numericId = parseInt(id, 10)
  if (isNaN(numericId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const body = await req.json()

    const updates: Partial<Record<AllowedField, unknown>> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const setClauses = Object.keys(updates).map((f) => `${f} = ?`).join(', ')
    const values: (string | number | boolean | null)[] = [...Object.values(updates) as (string | number | boolean | null)[], numericId]

    const db = getDb()
    await db.execute({
      sql: `UPDATE job_applications SET ${setClauses} WHERE id = ?`,
      args: values,
    })

    return NextResponse.json({ message: 'Updated' })
  } catch (err) {
    console.error(`PATCH /api/jobs/${id} error:`, err)
    return NextResponse.json({ error: 'Failed to update job', details: String(err) }, { status: 500 })
  }
}

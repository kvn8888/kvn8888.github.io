import { auth } from '@/auth'
import { getTursoClient } from '@/lib/turso'
import { NextRequest, NextResponse } from 'next/server'

async function ensureTable() {
  const client = getTursoClient()
  if (!client) return null

  await client.execute(`
    CREATE TABLE IF NOT EXISTS speech_history (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      modality TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  return client
}

export async function GET() {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json(
        { error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' },
        { status: 500 }
      )
    }

    const result = await client.execute({
      sql: `
        SELECT id, modality, title, content, metadata_json, created_at
        FROM speech_history
        WHERE user_email = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      args: [email],
    })

    const items = result.rows.map((row) => ({
      id: String(row.id),
      modality: String(row.modality),
      title: String(row.title),
      content: row.content ? String(row.content) : '',
      metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : null,
      createdAt: Number(row.created_at),
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Speech history GET error:', error)
    return NextResponse.json({ error: 'Failed to load speech history' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json(
        { error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' },
        { status: 500 }
      )
    }

    const { modality, title, content = '', metadata = null } = await req.json()
    if (!modality || !title) {
      return NextResponse.json({ error: 'modality and title are required' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const createdAt = Date.now()

    await client.execute({
      sql: `
        INSERT INTO speech_history (id, user_email, modality, title, content, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        email,
        String(modality),
        String(title).slice(0, 200),
        String(content).slice(0, 5000),
        metadata ? JSON.stringify(metadata).slice(0, 5000) : null,
        createdAt,
      ],
    })

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Speech history POST error:', error)
    return NextResponse.json({ error: 'Failed to save speech history' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json(
        { error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' },
        { status: 500 }
      )
    }

    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await client.execute({
      sql: 'DELETE FROM speech_history WHERE id = ? AND user_email = ?',
      args: [String(id), email],
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Speech history DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete speech history item' }, { status: 500 })
  }
}

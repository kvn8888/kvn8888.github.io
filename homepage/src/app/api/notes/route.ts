import { auth } from '@/auth'
import { getTursoClient } from '@/lib/turso'
import { NextRequest, NextResponse } from 'next/server'

/*
 * Notes API — CRUD for private markdown notes stored in Turso.
 *
 * Schema (created lazily on first request):
 *   CREATE TABLE IF NOT EXISTS notes (
 *     id          TEXT    PRIMARY KEY,          -- UUID v4
 *     user_email  TEXT    NOT NULL,             -- owner (lowercase)
 *     title       TEXT    NOT NULL,             -- plain-text title (max 200 chars)
 *     body        TEXT    NOT NULL DEFAULT '',  -- Markdown content (max 50 000 chars)
 *     archived    INTEGER NOT NULL DEFAULT 0,   -- soft-delete / archive flag
 *     created_at  INTEGER NOT NULL,             -- Unix epoch ms
 *     updated_at  INTEGER NOT NULL              -- Unix epoch ms
 *   )
 *
 * REST endpoints:
 *   GET    /api/notes          → list all notes for current user
 *   POST   /api/notes          → create a new note
 *   PUT    /api/notes          → update an existing note
 *   DELETE /api/notes          → delete a note permanently
 */

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 50_000

async function ensureTable() {
  const client = getTursoClient()
  if (!client) return null

  await client.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT    PRIMARY KEY,
      user_email TEXT    NOT NULL,
      title      TEXT    NOT NULL,
      body       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  return client
}

// ─── GET: list notes ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json({ error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' }, { status: 500 })
    }

    const showArchived = req.nextUrl.searchParams.get('archived') === '1'

    const result = await client.execute({
      sql: `
        SELECT id, title, body, archived, created_at, updated_at
        FROM notes
        WHERE user_email = ? AND archived = ?
        ORDER BY updated_at DESC
        LIMIT 200
      `,
      args: [email, showArchived ? 1 : 0],
    })

    const items = result.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      body: String(row.body),
      archived: Boolean(row.archived),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Notes GET error:', { error, email })
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }
}

// ─── POST: create note ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json({ error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' }, { status: 500 })
    }

    const { title, body = '' } = await req.json()
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    await client.execute({
      sql: `
        INSERT INTO notes (id, user_email, title, body, archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `,
      args: [
        id,
        email,
        String(title).slice(0, MAX_TITLE_LENGTH),
        String(body).slice(0, MAX_BODY_LENGTH),
        now,
        now,
      ],
    })

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Notes POST error:', { error, email })
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}

// ─── PUT: update note ────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json({ error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' }, { status: 500 })
    }

    const { id, title, body, archived } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const now = Date.now()

    // Build update query dynamically based on which fields were provided
    const updates: string[] = ['updated_at = ?']
    const args: (string | number)[] = [now]

    if (title !== undefined) {
      updates.push('title = ?')
      args.push(String(title).slice(0, MAX_TITLE_LENGTH))
    }
    if (body !== undefined) {
      updates.push('body = ?')
      args.push(String(body).slice(0, MAX_BODY_LENGTH))
    }
    if (archived !== undefined) {
      updates.push('archived = ?')
      args.push(archived ? 1 : 0)
    }

    args.push(String(id), email)

    await client.execute({
      sql: `UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`,
      args,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notes PUT error:', { error, email })
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}

// ─── DELETE: permanently delete note ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await ensureTable()
    if (!client) {
      return NextResponse.json({ error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not configured' }, { status: 500 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await client.execute({
      sql: 'DELETE FROM notes WHERE id = ? AND user_email = ?',
      args: [String(id), email],
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notes DELETE error:', { error, email })
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }
}

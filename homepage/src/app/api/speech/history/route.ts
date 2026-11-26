import { auth } from '@/auth'
import { reportServerEvent } from '@/lib/axiom'
import { ensureSpeechTables } from '@/lib/pronunciationDb'
import { getTursoClient } from '@/lib/turso'
import { NextRequest, NextResponse } from 'next/server'

const MAX_TITLE_LENGTH = 200
const MAX_CONTENT_LENGTH = 5000
const MAX_METADATA_LENGTH = 250_000
const MAX_METADATA_STRING_LENGTH = 10_000
const MAX_METADATA_ARRAY_LENGTH = 500
const MAX_METADATA_OBJECT_KEYS = 200
const MAX_METADATA_DEPTH = 8
const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 100
const ROUTE = '/api/speech/history'

const SPEECH_MODALITIES = ['tts', 'stt', 'pronunciation'] as const
type SpeechModality = (typeof SPEECH_MODALITIES)[number]

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface SpeechHistoryItem {
  id: string
  modality: SpeechModality
  title: string
  content: string
  metadata: Record<string, JsonValue> | null
  createdAt: number
}

class MetadataTooLargeError extends Error {
  constructor(length: number) {
    super(`metadata_json exceeds ${MAX_METADATA_LENGTH} chars after sanitization (${length})`)
    this.name = 'MetadataTooLargeError'
  }
}

function isSpeechModality(value: unknown): value is SpeechModality {
  return typeof value === 'string' && SPEECH_MODALITIES.includes(value as SpeechModality)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HISTORY_LIMIT
  return Math.min(Math.floor(parsed), MAX_HISTORY_LIMIT)
}

function parseCursor(cursor: string | null): { createdAt: number; id: string } | null {
  if (!cursor) return null
  const separatorIndex = cursor.indexOf(':')
  if (separatorIndex <= 0) return null
  const createdAt = Number(cursor.slice(0, separatorIndex))
  const id = cursor.slice(separatorIndex + 1)
  if (!Number.isFinite(createdAt) || !id) return null
  return { createdAt, id }
}

function toCursor(item: SpeechHistoryItem) {
  return `${item.createdAt}:${item.id}`
}

function sanitizeMetadataValue(value: unknown, depth = 0): JsonValue {
  if (depth > MAX_METADATA_DEPTH) return '[Max depth]'

  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.slice(0, MAX_METADATA_STRING_LENGTH)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
  }

  if (isRecord(value)) {
    const sanitized: { [key: string]: JsonValue } = {}
    for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_METADATA_OBJECT_KEYS)) {
      sanitized[key.slice(0, 120)] = sanitizeMetadataValue(nestedValue, depth + 1)
    }
    return sanitized
  }

  return String(value).slice(0, MAX_METADATA_STRING_LENGTH)
}

function serializeMetadata(metadata: unknown) {
  if (metadata === null || metadata === undefined) return null
  const sanitized = sanitizeMetadataValue(metadata)
  if (!isRecord(sanitized)) return null

  const serialized = JSON.stringify(sanitized)
  if (serialized.length > MAX_METADATA_LENGTH) {
    throw new MetadataTooLargeError(serialized.length)
  }

  return serialized
}

function parseMetadata(value: unknown): Record<string, JsonValue> | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(String(value))
    return isRecord(parsed) ? (parsed as Record<string, JsonValue>) : null
  } catch {
    return null
  }
}

function mapHistoryRow(row: Record<string, unknown>): SpeechHistoryItem {
  return {
    id: String(row.id),
    modality: String(row.modality) as SpeechModality,
    title: String(row.title),
    content: row.content ? String(row.content) : '',
    metadata: parseMetadata(row.metadata_json),
    createdAt: Number(row.created_at),
  }
}

async function reportHistoryEvent(args: {
  event: string
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}) {
  await reportServerEvent({
    event: args.event,
    level: args.level,
    message: args.message,
    data: {
      route: ROUTE,
      ...(args.data ?? {}),
    },
  })
}

async function ensureTable() {
  const client = getTursoClient()
  if (!client) {
    await reportHistoryEvent({
      event: 'speech.history.configuration.missing',
      level: 'error',
      message: 'Speech history Turso client unavailable',
      data: {
        hasDatabaseUrl: Boolean(process.env.TURSO_DATABASE_URL),
        hasAuthToken: Boolean(process.env.TURSO_AUTH_TOKEN),
      },
    })
    console.error('Speech history Turso client unavailable', {
      hasDatabaseUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasAuthToken: Boolean(process.env.TURSO_AUTH_TOKEN),
    })
    return null
  }

  await ensureSpeechTables(client)

  return client
}

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams
    const modality = searchParams.get('modality')
    const query = searchParams.get('q')?.trim().slice(0, 120)
    const limit = clampLimit(searchParams.get('limit'))
    const cursor = parseCursor(searchParams.get('cursor'))
    const whereClauses = ['user_email = ?']
    const args: Array<string | number> = [email]

    if (modality && modality !== 'all') {
      if (!isSpeechModality(modality)) {
        return NextResponse.json({ error: 'Invalid modality' }, { status: 400 })
      }
      whereClauses.push('modality = ?')
      args.push(modality)
    }

    if (query) {
      whereClauses.push('(title LIKE ? OR content LIKE ?)')
      args.push(`%${query}%`, `%${query}%`)
    }

    if (cursor) {
      whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))')
      args.push(cursor.createdAt, cursor.createdAt, cursor.id)
    }

    const result = await client.execute({
      sql: `
        SELECT id, modality, title, content, metadata_json, created_at
        FROM speech_history
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
      args: [...args, limit + 1],
    })

    const mappedItems = result.rows.map((row) => mapHistoryRow(row as Record<string, unknown>))
    const items = mappedItems.slice(0, limit)
    const nextCursor = mappedItems.length > limit && items.length > 0
      ? toCursor(items[items.length - 1])
      : null

    return NextResponse.json({ items, nextCursor, hasMore: Boolean(nextCursor) })
  } catch (error) {
    await reportHistoryEvent({
      event: 'speech.history.load.failed',
      level: 'error',
      message: 'Speech history GET error',
      data: {
        error: error instanceof Error ? error.message : String(error),
        email,
      },
    })
    console.error('Speech history GET error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email,
    })
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
    if (!isSpeechModality(modality)) {
      return NextResponse.json({ error: 'Invalid modality' }, { status: 400 })
    }

    let id = crypto.randomUUID()
    let createdAt = Date.now()
    // Undo must restore the same canonical attempt, not create an unrelated history row.
    if (modality === 'pronunciation' && isRecord(metadata) && typeof metadata.attemptId === 'string') {
      const original = await client.execute({ sql: 'SELECT id,created_at FROM pronunciation_attempt WHERE id=? AND user_email=?', args: [metadata.attemptId,email] })
      if (original.rows[0]) { id=String(original.rows[0].id); createdAt=Number(original.rows[0].created_at) }
    }
    const normalizedTitle = String(title).slice(0, MAX_TITLE_LENGTH)
    const normalizedContent = String(content).slice(0, MAX_CONTENT_LENGTH)
    const metadataJson = serializeMetadata(metadata)

    await client.execute({
      sql: `
        INSERT INTO speech_history (id, user_email, modality, title, content, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        email,
        modality,
        normalizedTitle,
        normalizedContent,
        metadataJson,
        createdAt,
      ],
    })

    const item: SpeechHistoryItem = {
      id,
      modality,
      title: normalizedTitle,
      content: normalizedContent,
      metadata: parseMetadata(metadataJson),
      createdAt,
    }

    await reportHistoryEvent({
      event: 'speech.history.saved',
      level: 'info',
      message: 'Speech history item saved',
      data: {
        id,
        email,
        modality,
        titleLength: normalizedTitle.length,
        contentLength: normalizedContent.length,
        metadataLength: metadataJson?.length ?? 0,
      },
    })

    return NextResponse.json({ ok: true, item })
  } catch (error) {
    const status = error instanceof MetadataTooLargeError ? 413 : 500
    await reportHistoryEvent({
      event: 'speech.history.save.failed',
      level: 'error',
      message: 'Speech history POST error',
      data: {
        error: error instanceof Error ? error.message : String(error),
        email,
      },
    })
    console.error('Speech history POST error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email,
    })
    return NextResponse.json({ error: 'Failed to save speech history' }, { status })
  }
}

// Enrich an already-saved pronunciation attempt after the acoustic and AI work finishes.
// Only the owning user can update it; other modalities retain their existing contract.
export async function PATCH(req: NextRequest) {
  const email = (await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id, metadataPatch } = await req.json()
    const allowed = new Set(['coach', 'coachError', 'delivery', 'deliveryError', 'recording'])
    if (typeof id !== 'string' || !id || !isRecord(metadataPatch) || Object.keys(metadataPatch).some(key => !allowed.has(key))) {
      return NextResponse.json({ error: 'Invalid pronunciation history update' }, { status: 400 })
    }
    const client = await ensureTable()
    if (!client) return NextResponse.json({ error: 'Speech history is not configured' }, { status: 500 })
    const existing = await client.execute({
      sql: "SELECT metadata_json FROM speech_history WHERE id = ? AND user_email = ? AND modality = 'pronunciation'",
      args: [id, email],
    })
    if (!existing.rows[0]) return NextResponse.json({ error: 'History item not found' }, { status: 404 })
    const metadata = { ...(parseMetadata(existing.rows[0].metadata_json) ?? {}), ...metadataPatch }
    serializeMetadata(metadata) // enforce size before merging
    const updated = await client.execute({
      sql: "UPDATE speech_history SET metadata_json = json_patch(COALESCE(metadata_json,'{}'), ?) WHERE id = ? AND user_email = ? AND modality = 'pronunciation'",
      args: [serializeMetadata(metadataPatch), id, email],
    })
    if (!updated.rowsAffected) return NextResponse.json({ error: 'History item not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pronunciation history' }, { status: error instanceof MetadataTooLargeError ? 413 : 500 })
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

    const result = await client.execute({
      sql: 'DELETE FROM speech_history WHERE id = ? AND user_email = ?',
      args: [String(id), email],
    })

    if (Number(result.rowsAffected ?? 0) === 0) {
      return NextResponse.json({ error: 'History item not found' }, { status: 404 })
    }

    await reportHistoryEvent({
      event: 'speech.history.deleted',
      level: 'info',
      message: 'Speech history item deleted',
      data: { id: String(id), email },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    await reportHistoryEvent({
      event: 'speech.history.delete.failed',
      level: 'error',
      message: 'Speech history DELETE error',
      data: {
        error: error instanceof Error ? error.message : String(error),
        email,
      },
    })
    console.error('Speech history DELETE error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email,
    })
    return NextResponse.json({ error: 'Failed to delete speech history item' }, { status: 500 })
  }
}

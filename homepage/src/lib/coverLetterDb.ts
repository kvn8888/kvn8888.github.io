import { type Client, type Transaction } from '@libsql/client'
import { getJobsDb } from './jobsDb'

// In-process cache: set to true once schema is verified in this container lifetime.
// Warm serverless containers reuse this flag across requests — zero overhead.
// Cold starts reset it, so we fall through to the DB sentinel check below.
let coverLetterSchemaInitialized = false

export interface CoverLetterTagRecord {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface CoverLetterBlockRecord {
  id: string
  category: string
  text: string
  tags: CoverLetterTagRecord[]
  createdAt: string
  updatedAt: string
}

interface CoverLetterBlockInput {
  category: string
  text: string
  tagIds?: readonly string[]
}

type SqlExecutor = Pick<Client, 'execute'>

function normalizeTagName(name: string) {
  return name.replace(/\s+/g, ' ').trim()
}

function slugifyTagName(name: string) {
  return normalizeTagName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTagIds(tagIds: readonly string[] = []) {
  return Array.from(
    new Set(
      tagIds
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  )
}

async function runWriteTransaction<T>(db: Client, work: (tx: Transaction) => Promise<T>) {
  const tx = await db.transaction('write')

  try {
    const result = await work(tx)
    await tx.commit()
    return result
  } catch (error) {
    if (!tx.closed) {
      await tx.rollback().catch(() => undefined)
    }
    throw error
  } finally {
    tx.close()
  }
}

async function syncBlockTags(db: SqlExecutor, blockId: number, tagIds: readonly string[] = []) {
  await db.execute({
    sql: 'DELETE FROM cover_letter_block_tags WHERE block_id = ?',
    args: [blockId],
  })

  const normalizedTagIds = normalizeTagIds(tagIds)
  if (normalizedTagIds.length === 0) return

  const placeholders = normalizedTagIds.map(() => '?').join(', ')
  const tagLookup = await db.execute({
    sql: `SELECT id FROM cover_letter_tags WHERE id IN (${placeholders})`,
    args: normalizedTagIds,
  })

  for (const row of tagLookup.rows) {
    await db.execute({
      sql: `INSERT INTO cover_letter_block_tags (block_id, tag_id)
            VALUES (?, ?)`,
      args: [blockId, Number(row.id)],
    })
  }
}

// Sentinel key stored in _schema_meta to mark that schema has been fully applied.
// Incrementing this version (e.g. 'cover_letter_v2') forces re-initialization on all containers.
const SCHEMA_SENTINEL_KEY = 'cover_letter_v1'

export async function ensureCoverLetterSchema(db: Client) {
  // Hot path: already verified in this warm container — no DB round-trip at all.
  if (coverLetterSchemaInitialized) return

  // Cold-start fast path: check the sentinel row in _schema_meta.
  // A single SELECT replaces ~14 round-trips (DDL + 12 legacy seed inserts).
  // If _schema_meta doesn't exist yet (fresh DB), the query throws — we catch and fall through.
  try {
    const result = await db.execute({
      sql: 'SELECT 1 FROM _schema_meta WHERE key = ?',
      args: [SCHEMA_SENTINEL_KEY],
    })
    if (result.rows.length > 0) {
      coverLetterSchemaInitialized = true
      return
    }
  } catch {
    // _schema_meta table does not exist yet — this is a fresh DB, fall through to full init.
  }

  // Full initialization: create all tables plus the sentinel tracker.
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS cover_letter_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seed_key TEXT UNIQUE,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cover_letter_blocks_category
      ON cover_letter_blocks(category);

    CREATE TABLE IF NOT EXISTS cover_letter_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cover_letter_block_tags (
      block_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (block_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cover_letter_block_tags_tag_id
      ON cover_letter_block_tags(tag_id);

    CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  // Write the sentinel row so future cold starts can skip full init.
  await db.execute({
    sql: 'INSERT INTO _schema_meta (key) VALUES (?) ON CONFLICT DO NOTHING',
    args: [SCHEMA_SENTINEL_KEY],
  })

  coverLetterSchemaInitialized = true
}

export async function getCoverLetterDb() {
  return getJobsDb()
}

export async function listCoverLetterLibrary() {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const [blocksResult, tagsResult, blockTagsResult] = await Promise.all([
    db.execute(`
      SELECT id, category, text, created_at, updated_at
      FROM cover_letter_blocks
      ORDER BY id ASC
    `),
    db.execute(`
      SELECT id, name, slug, created_at, updated_at
      FROM cover_letter_tags
      ORDER BY name COLLATE NOCASE ASC
    `),
    db.execute(`
      SELECT block_id, tag_id
      FROM cover_letter_block_tags
      ORDER BY block_id ASC, tag_id ASC
    `),
  ])

  const tags = tagsResult.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }))

  const tagsById = new Map(tags.map((tag) => [tag.id, tag]))
  const tagIdsByBlockId = new Map<string, string[]>()

  for (const row of blockTagsResult.rows) {
    const blockId = String(row.block_id)
    const existing = tagIdsByBlockId.get(blockId) ?? []
    existing.push(String(row.tag_id))
    tagIdsByBlockId.set(blockId, existing)
  }

  const blocks = blocksResult.rows.map((row) => ({
    id: String(row.id),
    category: String(row.category),
    text: String(row.text),
    tags: (tagIdsByBlockId.get(String(row.id)) ?? [])
      .map((tagId) => tagsById.get(tagId))
      .filter((tag): tag is CoverLetterTagRecord => Boolean(tag)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }))

  return { blocks, tags }
}

export async function createCoverLetterBlock(input: CoverLetterBlockInput) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const category = input.category.trim()
  const text = input.text.trim()
  if (!category || !text) throw new Error('category and text are required')

  const blockId = await runWriteTransaction(db, async (tx) => {
    const result = await tx.execute({
      sql: `INSERT INTO cover_letter_blocks (category, text, updated_at)
            VALUES (?, ?, datetime('now'))`,
      args: [category, text],
    })

    const createdBlockId = Number(result.lastInsertRowid)
    await syncBlockTags(tx, createdBlockId, input.tagIds)
    return createdBlockId
  })

  const { blocks } = await listCoverLetterLibrary()
  const block = blocks.find((entry) => entry.id === String(blockId))
  if (!block) throw new Error('created block could not be loaded')
  return block
}

export async function updateCoverLetterBlock(id: number, input: CoverLetterBlockInput) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const category = input.category.trim()
  const text = input.text.trim()
  if (!category || !text) throw new Error('category and text are required')

  await runWriteTransaction(db, async (tx) => {
    await tx.execute({
      sql: `UPDATE cover_letter_blocks
            SET category = ?, text = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [category, text, id],
    })

    await syncBlockTags(tx, id, input.tagIds)
  })

  const { blocks } = await listCoverLetterLibrary()
  const block = blocks.find((entry) => entry.id === String(id))
  if (!block) throw new Error('updated block could not be loaded')
  return block
}

export async function deleteCoverLetterBlock(id: number) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  await runWriteTransaction(db, async (tx) => {
    await tx.execute({
      sql: 'DELETE FROM cover_letter_block_tags WHERE block_id = ?',
      args: [id],
    })
    await tx.execute({
      sql: 'DELETE FROM cover_letter_blocks WHERE id = ?',
      args: [id],
    })
  })
}

export async function createCoverLetterTag(name: string) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const normalizedName = normalizeTagName(name)
  const slug = slugifyTagName(name)
  if (!normalizedName || !slug) throw new Error('tag name is required')

  try {
    const result = await db.execute({
      sql: `INSERT INTO cover_letter_tags (name, slug, updated_at)
            VALUES (?, ?, datetime('now'))`,
      args: [normalizedName, slug],
    })

    const { tags } = await listCoverLetterLibrary()
    const tag = tags.find((entry) => entry.id === String(result.lastInsertRowid))
    if (!tag) throw new Error('created tag could not be loaded')
    return tag
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('unique')) {
      throw new Error('tag already exists')
    }
    throw error
  }
}

export async function updateCoverLetterTag(id: number, name: string) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const normalizedName = normalizeTagName(name)
  const slug = slugifyTagName(name)
  if (!normalizedName || !slug) throw new Error('tag name is required')

  try {
    await db.execute({
      sql: `UPDATE cover_letter_tags
            SET name = ?, slug = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [normalizedName, slug, id],
    })

    const { tags } = await listCoverLetterLibrary()
    const tag = tags.find((entry) => entry.id === String(id))
    if (!tag) throw new Error('updated tag could not be loaded')
    return tag
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('unique')) {
      throw new Error('tag already exists')
    }
    throw error
  }
}

export async function deleteCoverLetterTag(id: number) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  await runWriteTransaction(db, async (tx) => {
    await tx.execute({
      sql: 'DELETE FROM cover_letter_block_tags WHERE tag_id = ?',
      args: [id],
    })
    await tx.execute({
      sql: 'DELETE FROM cover_letter_tags WHERE id = ?',
      args: [id],
    })
  })
}
import { type Client } from '@libsql/client'
import { getJobsDb } from './jobsDb'

// These are the original hard-coded blocks from the first cover letter tool.
// They now live server-side so we can seed the database once and remove them from the client bundle.
const LEGACY_SEED_BLOCKS = [
  {
    seedKey: 'legacy-1',
    category: 'Client-Facing',
    text: 'As a Customer Application Engineer at Ivalua, I work directly with enterprise clients like T-Mobile on technical implementations, platform upgrades, and production support — bridging the gap between client needs and engineering execution.',
  },
  {
    seedKey: 'legacy-2',
    category: 'Full-Stack',
    text: "I build full-stack applications using Next.js, Node, and React, deploying with Docker on AWS infrastructure managed through Terraform — I'm comfortable owning a feature from database schema to production deployment.",
  },
  {
    seedKey: 'legacy-3',
    category: 'AI/ML',
    text: "I've built practical AI tooling including DepScope, a repository due diligence tool that analyzes codebases for technical risk, and ClaimGraph, an AI-powered fact-checking system with trust graph visualization.",
  },
  {
    seedKey: 'legacy-4',
    category: 'Embedded',
    text: 'My embedded systems experience with STM32 microcontrollers and bare-metal C gives me a strong foundation in resource-constrained programming, hardware-software interfaces, and systems-level thinking.',
  },
  {
    seedKey: 'legacy-5',
    category: 'Hackathons',
    text: "I've placed in multiple competitive hackathons including second place at AWS Builder Loft and the Before the Ballot civic tech hackathon — I thrive under time pressure and ship working software fast.",
  },
  {
    seedKey: 'legacy-6',
    category: 'Soft Skills',
    text: 'Working with enterprise clients has taught me to translate complex technical constraints into language stakeholders understand, and to scope work realistically when requirements are ambiguous.',
  },
  {
    seedKey: 'legacy-7',
    category: 'Closer',
    text: "I'd welcome the chance to discuss how my experience building production tools and working with enterprise clients could contribute to your team. I'm available for a conversation at your convenience.",
  },
  {
    seedKey: 'legacy-8',
    category: 'Full-Stack',
    text: 'I have hands-on experience with the MERN stack, building and maintaining REST APIs, implementing authentication flows, and managing CI/CD pipelines for team projects.',
  },
  {
    seedKey: 'legacy-9',
    category: 'AI/ML',
    text: "I've worked with MCP servers and multi-agent frameworks, and I stay current with developments in transformer architectures and model optimization — I understand both the application layer and the infrastructure underneath.",
  },
  {
    seedKey: 'legacy-10',
    category: 'Hackathons',
    text: 'At hackathons I typically lead the system architecture decisions and own the backend integration work, coordinating a team of 3-4 to deliver a polished demo within 24-48 hours.',
  },
  {
    seedKey: 'legacy-11',
    category: 'Soft Skills',
    text: "I'm drawn to teams that value clean engineering over flashy tooling — I'd rather ship a well-tested feature with clear documentation than a brittle prototype that demos well.",
  },
  {
    seedKey: 'legacy-12',
    category: 'Closer',
    text: "I'm currently based in the Bay Area and available to start immediately. I'd love to learn more about the technical challenges your team is tackling.",
  },
] as const

let schemaInitialized = false

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

async function syncBlockTags(db: Client, blockId: number, tagIds: readonly string[] = []) {
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

async function seedLegacyBlocks(db: Client) {
  for (const block of LEGACY_SEED_BLOCKS) {
    await db.execute({
      sql: `INSERT INTO cover_letter_blocks (seed_key, category, text)
            VALUES (?, ?, ?)
            ON CONFLICT(seed_key) DO NOTHING`,
      args: [block.seedKey, block.category, block.text],
    })
  }
}

export async function ensureCoverLetterSchema(db: Client) {
  if (schemaInitialized) return

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
  `)

  await seedLegacyBlocks(db)
  schemaInitialized = true
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

  const result = await db.execute({
    sql: `INSERT INTO cover_letter_blocks (category, text, updated_at)
          VALUES (?, ?, datetime('now'))`,
    args: [category, text],
  })

  await syncBlockTags(db, Number(result.lastInsertRowid), input.tagIds)

  const { blocks } = await listCoverLetterLibrary()
  const block = blocks.find((entry) => entry.id === String(result.lastInsertRowid))
  if (!block) throw new Error('created block could not be loaded')
  return block
}

export async function updateCoverLetterBlock(id: number, input: CoverLetterBlockInput) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  const category = input.category.trim()
  const text = input.text.trim()
  if (!category || !text) throw new Error('category and text are required')

  await db.execute({
    sql: `UPDATE cover_letter_blocks
          SET category = ?, text = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [category, text, id],
  })

  await syncBlockTags(db, id, input.tagIds)

  const { blocks } = await listCoverLetterLibrary()
  const block = blocks.find((entry) => entry.id === String(id))
  if (!block) throw new Error('updated block could not be loaded')
  return block
}

export async function deleteCoverLetterBlock(id: number) {
  const db = await getCoverLetterDb()
  await ensureCoverLetterSchema(db)

  await db.execute({
    sql: 'DELETE FROM cover_letter_block_tags WHERE block_id = ?',
    args: [id],
  })
  await db.execute({
    sql: 'DELETE FROM cover_letter_blocks WHERE id = ?',
    args: [id],
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

  await db.execute({
    sql: 'DELETE FROM cover_letter_block_tags WHERE tag_id = ?',
    args: [id],
  })
  await db.execute({
    sql: 'DELETE FROM cover_letter_tags WHERE id = ?',
    args: [id],
  })
}
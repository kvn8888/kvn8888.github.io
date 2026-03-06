import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@libsql/client'

// This script loads local env vars so it can talk to the Jobs Turso database
// without requiring secrets on the command line.
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return

  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    process.env[key] = process.env[key] || value
  }
}

// These are the original hard-coded library entries that now belong in Turso.
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
]

// This picks the Jobs database first, then falls back to the default Turso vars.
function getDbConfig() {
  const url = process.env.JOBS_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
  const authToken = process.env.JOBS_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    throw new Error('Missing JOBS_TURSO_DATABASE_URL/JOBS_TURSO_AUTH_TOKEN (or TURSO fallback)')
  }

  return { url, authToken }
}

// This ensures the permanent cover-letter tables exist before we seed data.
async function ensureSchema(db) {
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
}

// This inserts the old local-only blocks one time and leaves existing rows alone.
async function seedLegacyBlocks(db) {
  for (const block of LEGACY_SEED_BLOCKS) {
    await db.execute({
      sql: `INSERT INTO cover_letter_blocks (seed_key, category, text)
            VALUES (?, ?, ?)
            ON CONFLICT(seed_key) DO NOTHING`,
      args: [block.seedKey, block.category, block.text],
    })
  }
}

// This gathers a compact report so the migration result is easy to verify.
async function collectReport(db) {
  const [tablesResult, blockCountResult, tagCountResult, joinCountResult, legacyResult, sampleResult] = await Promise.all([
    db.execute(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'cover_letter_%'
      ORDER BY name ASC
    `),
    db.execute('SELECT COUNT(*) AS count FROM cover_letter_blocks'),
    db.execute('SELECT COUNT(*) AS count FROM cover_letter_tags'),
    db.execute('SELECT COUNT(*) AS count FROM cover_letter_block_tags'),
    db.execute(`
      SELECT seed_key, category
      FROM cover_letter_blocks
      WHERE seed_key LIKE 'legacy-%'
      ORDER BY seed_key ASC
    `),
    db.execute(`
      SELECT id, category, text
      FROM cover_letter_blocks
      ORDER BY id ASC
      LIMIT 3
    `),
  ])

  return {
    tables: tablesResult.rows.map((row) => String(row.name)),
    blockCount: Number(blockCountResult.rows[0]?.count ?? 0),
    tagCount: Number(tagCountResult.rows[0]?.count ?? 0),
    blockTagCount: Number(joinCountResult.rows[0]?.count ?? 0),
    legacySeedCount: legacyResult.rows.length,
    legacySeedKeys: legacyResult.rows.map((row) => String(row.seed_key)),
    sampleBlocks: sampleResult.rows.map((row) => ({
      id: Number(row.id),
      category: String(row.category),
      textPreview: String(row.text).slice(0, 96),
    })),
  }
}

// This rebuilds the block payload shape that the cover-letter match route sends to Gemini.
async function loadBlocksForMatching(db) {
  const [blocksResult, tagsResult, blockTagsResult] = await Promise.all([
    db.execute(`
      SELECT id, category, text
      FROM cover_letter_blocks
      ORDER BY id ASC
    `),
    db.execute(`
      SELECT id, name
      FROM cover_letter_tags
      ORDER BY id ASC
    `),
    db.execute(`
      SELECT block_id, tag_id
      FROM cover_letter_block_tags
      ORDER BY block_id ASC, tag_id ASC
    `),
  ])

  const tagsById = new Map(tagsResult.rows.map((row) => [String(row.id), { id: String(row.id), name: String(row.name) }]))
  const tagIdsByBlockId = new Map()

  for (const row of blockTagsResult.rows) {
    const blockId = String(row.block_id)
    const tagIds = tagIdsByBlockId.get(blockId) || []
    tagIds.push(String(row.tag_id))
    tagIdsByBlockId.set(blockId, tagIds)
  }

  return blocksResult.rows.map((row) => ({
    id: String(row.id),
    category: String(row.category),
    text: String(row.text),
    tags: (tagIdsByBlockId.get(String(row.id)) || [])
      .map((tagId) => tagsById.get(tagId))
      .filter(Boolean),
  }))
}

// This calls Gemini with the same prompt shape as the app route and checks the returned ids.
async function runGeminiCheck(db) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      checked: false,
      ok: false,
      reason: 'GEMINI_API_KEY is not configured',
    }
  }

  const blocks = await loadBlocksForMatching(db)
  const knownIds = new Set(blocks.map((block) => block.id))
  const jobPosting = [
    'We are hiring a full-stack software engineer to build AI-powered product features, work directly with customers, and ship production systems with React, Next.js, and cloud infrastructure.',
    'The role values practical machine-learning experience, strong communication with stakeholders, and the ability to move quickly on ambiguous projects.',
  ].join(' ')

  const blockList = blocks
    .map((block) => {
      const tagSuffix = block.tags.length
        ? ` | tags: ${block.tags.map((tag) => tag.name).join(', ')}`
        : ''
      return `[${block.id}] (${block.category}${tagSuffix}) ${block.text}`
    })
    .join('\n')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are helping match cover letter building blocks to a job posting. Analyze the job posting and identify the 3-4 most relevant blocks that would make the strongest cover letter for this specific role.

For each matched block, provide a brief reason (1 sentence) explaining why it's relevant.

Job Posting:
${jobPosting}

Available blocks:
${blockList}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              matches: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    id: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['id', 'reason'],
                },
              },
            },
            required: ['matches'],
          },
        },
      }),
    }
  )

  if (!response.ok) {
    return {
      checked: true,
      ok: false,
      status: response.status,
      error: (await response.text()).slice(0, 300),
    }
  }

  const payload = await response.json()
  const textResponse = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textResponse) {
    return {
      checked: true,
      ok: false,
      error: 'Gemini returned no text payload',
    }
  }

  const parsed = JSON.parse(textResponse)
  const matches = Array.isArray(parsed?.matches)
    ? parsed.matches.filter(
        (match) =>
          typeof match?.id === 'string' &&
          typeof match?.reason === 'string' &&
          knownIds.has(match.id)
      )
    : []

  return {
    checked: true,
    ok: matches.length > 0,
    returnedMatchCount: matches.length,
    matches,
  }
}

// This creates, updates, and deletes a temporary block/tag pair to prove CRUD works.
async function runCrudSmokeTest(db) {
  const suffix = `${Date.now()}`
  const initialTagName = `Smoke ${suffix}`
  const updatedTagName = `Smoke Updated ${suffix}`
  const initialSlug = `smoke-${suffix}`
  const updatedSlug = `smoke-updated-${suffix}`
  const initialBlockText = `Smoke test block ${suffix}`
  const updatedBlockText = `Smoke test block updated ${suffix}`

  let blockId = null
  let tagId = null

  try {
    const tagInsert = await db.execute({
      sql: `INSERT INTO cover_letter_tags (name, slug, updated_at)
            VALUES (?, ?, datetime('now'))`,
      args: [initialTagName, initialSlug],
    })
    tagId = Number(tagInsert.lastInsertRowid)

    const blockInsert = await db.execute({
      sql: `INSERT INTO cover_letter_blocks (category, text, updated_at)
            VALUES (?, ?, datetime('now'))`,
      args: ['Custom', initialBlockText],
    })
    blockId = Number(blockInsert.lastInsertRowid)

    await db.execute({
      sql: `INSERT INTO cover_letter_block_tags (block_id, tag_id)
            VALUES (?, ?)`,
      args: [blockId, tagId],
    })

    await db.execute({
      sql: `UPDATE cover_letter_tags
            SET name = ?, slug = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [updatedTagName, updatedSlug, tagId],
    })

    await db.execute({
      sql: `UPDATE cover_letter_blocks
            SET category = ?, text = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: ['Soft Skills', updatedBlockText, blockId],
    })

    const [tagResult, blockResult, linkResult] = await Promise.all([
      db.execute({
        sql: 'SELECT name, slug FROM cover_letter_tags WHERE id = ?',
        args: [tagId],
      }),
      db.execute({
        sql: 'SELECT category, text FROM cover_letter_blocks WHERE id = ?',
        args: [blockId],
      }),
      db.execute({
        sql: 'SELECT COUNT(*) AS count FROM cover_letter_block_tags WHERE block_id = ? AND tag_id = ?',
        args: [blockId, tagId],
      }),
    ])

    return {
      checked: true,
      ok:
        String(tagResult.rows[0]?.name ?? '') === updatedTagName &&
        String(tagResult.rows[0]?.slug ?? '') === updatedSlug &&
        String(blockResult.rows[0]?.category ?? '') === 'Soft Skills' &&
        String(blockResult.rows[0]?.text ?? '') === updatedBlockText &&
        Number(linkResult.rows[0]?.count ?? 0) === 1,
      createdTagId: tagId,
      createdBlockId: blockId,
    }
  } catch (error) {
    return {
      checked: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (blockId !== null) {
      await db.execute({
        sql: 'DELETE FROM cover_letter_block_tags WHERE block_id = ?',
        args: [blockId],
      })
      await db.execute({
        sql: 'DELETE FROM cover_letter_blocks WHERE id = ?',
        args: [blockId],
      })
    }

    if (tagId !== null) {
      await db.execute({
        sql: 'DELETE FROM cover_letter_tags WHERE id = ?',
        args: [tagId],
      })
    }
  }
}

// This persists a sanitized verification artifact inside the repo workspace.
function writeReport(reportPath, payload) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

// This is the end-to-end bootstrap entrypoint used for live verification.
async function main() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const appRoot = path.resolve(__dirname, '..')
  const envPath = path.join(appRoot, '.env.local')
  const reportPath = path.join(appRoot, 'tmp', 'coverletter-library-report.json')

  loadEnv(envPath)

  const { url, authToken } = getDbConfig()
  const db = createClient({ url, authToken })

  await ensureSchema(db)
  await seedLegacyBlocks(db)

  const report = await collectReport(db)
  const crud = await runCrudSmokeTest(db)
  const gemini = await runGeminiCheck(db)
  const payload = {
    ok:
      report.legacySeedCount >= LEGACY_SEED_BLOCKS.length &&
      (!crud.checked || crud.ok) &&
      (!gemini.checked || gemini.ok),
    expectedLegacySeedCount: LEGACY_SEED_BLOCKS.length,
    crud,
    gemini,
    ...report,
  }

  writeReport(reportPath, payload)
  console.log(JSON.stringify(payload, null, 2))

  if (!payload.ok) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const reportPath = path.join(path.resolve(__dirname, '..'), 'tmp', 'coverletter-library-report.json')
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }

  writeReport(reportPath, payload)
  console.error(payload.error)
  process.exit(1)
})
import type { Client } from '@libsql/client'

const initialized = new WeakSet<Client>()

export async function ensureCollectionSchema(db: Client) {
  if (initialized.has(db)) return
  await db.executeMultiple(`
CREATE TABLE IF NOT EXISTS job_collection (
  id TEXT PRIMARY KEY NOT NULL,
  identity_key TEXT NOT NULL UNIQUE,
  company TEXT,
  role TEXT,
  description TEXT,
  description_status TEXT NOT NULL DEFAULT 'missing'
    CHECK (description_status IN ('missing', 'partial', 'full')),
  source TEXT NOT NULL,
  source_job_id TEXT,
  source_url TEXT NOT NULL,
  application_url TEXT,
  canonical_url TEXT,
  ats_provider TEXT,
  ats_tenant TEXT,
  ats_job_id TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (resolution_status IN ('unresolved', 'resolved', 'in_board', 'unavailable')),
  type TEXT,
  role_tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(role_tags_json) AND json_type(role_tags_json) = 'array'),
  employment_type TEXT,
  location TEXT,
  locations_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(locations_json) AND json_type(locations_json) = 'array'),
  work_mode TEXT CHECK (work_mode IS NULL OR work_mode IN ('remote', 'hybrid', 'onsite')),
  posted_at TEXT,
  posted_at_raw TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sources_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(sources_json) AND json_type(sources_json) = 'array'),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  archived_at TEXT,
  CHECK (resolution_status <> 'resolved' OR application_url IS NOT NULL),
  CHECK (description_status = 'missing' OR description IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_collection_source_job
  ON job_collection(source, source_job_id) WHERE source_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_collection_destination
  ON job_collection(canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_collection_ats_job
  ON job_collection(ats_provider, ats_tenant, ats_job_id)
  WHERE ats_provider IS NOT NULL AND ats_tenant IS NOT NULL AND ats_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_collection_filters ON job_collection(type, work_mode, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_collection_company ON job_collection(company COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_job_collection_seen ON job_collection(first_seen_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_job_collection_source ON job_collection(source, first_seen_at DESC);


  `)
  const columns = await db.execute('PRAGMA table_info(job_collection)')
  const existing = new Set(columns.rows.map(row => String(row.name)))
  const additions = {
    status: "TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','skipped','blocked','applied','not_applicable'))",
    status_notes: 'TEXT',
    status_updated_at: 'TEXT',
    application_ids_json: "TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(application_ids_json) AND json_type(application_ids_json) = 'array')",
    status_history_json: "TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(status_history_json) AND json_type(status_history_json) = 'array')",
    version: 'INTEGER NOT NULL DEFAULT 1',
  }
  for (const [column, definition] of Object.entries(additions)) {
    if (existing.has(column)) continue
    try { await db.execute(`ALTER TABLE job_collection ADD COLUMN ${column} ${definition}`) }
    catch (error) {
      const current = await db.execute('PRAGMA table_info(job_collection)')
      if (!current.rows.some(row => row.name === column)) throw error
    }
  }
  await db.execute('CREATE INDEX IF NOT EXISTS idx_job_collection_status ON job_collection(status, first_seen_at DESC, id DESC)')
  initialized.add(db)
}

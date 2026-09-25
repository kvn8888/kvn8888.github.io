-- Proposed migration; not applied to Turso.
-- Run after checking the live schema. Abort if job_collection already exists
-- with a different definition; do not silently accept a mismatched table.
BEGIN IMMEDIATE;

CREATE TABLE job_collection (
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

CREATE UNIQUE INDEX idx_job_collection_source_job
  ON job_collection(source, source_job_id) WHERE source_job_id IS NOT NULL;
CREATE UNIQUE INDEX idx_job_collection_destination
  ON job_collection(canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX idx_job_collection_ats_job
  ON job_collection(ats_provider, ats_tenant, ats_job_id)
  WHERE ats_provider IS NOT NULL AND ats_tenant IS NOT NULL AND ats_job_id IS NOT NULL;
CREATE INDEX idx_job_collection_filters ON job_collection(type, work_mode, first_seen_at DESC);
CREATE INDEX idx_job_collection_company ON job_collection(company COLLATE NOCASE);
CREATE INDEX idx_job_collection_seen ON job_collection(first_seen_at DESC, id);
CREATE INDEX idx_job_collection_source ON job_collection(source, first_seen_at DESC);

COMMIT;

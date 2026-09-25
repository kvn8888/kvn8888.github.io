import type { Client } from "@libsql/client";

/** Additive only. The original application rows and IDs are never rewritten. */
export const workflowDDL = `
CREATE TABLE IF NOT EXISTS job_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 collection_id TEXT NOT NULL REFERENCES job_collection(id),
 parent_attempt_id TEXT REFERENCES job_attempts(id),
 actor TEXT NOT NULL, worker_id TEXT, agent_model TEXT,
 state TEXT NOT NULL DEFAULT 'running' CHECK(state IN ('running','finished')),
 outcome TEXT CHECK(outcome IN ('submitted','blocked','skipped','failed','cancelled','abandoned','submission_unknown')),
 reason_code TEXT, notes TEXT,
 stage TEXT NOT NULL DEFAULT 'filling' CHECK(stage IN ('filling','submit_started','receipt_seen')),
 started_at TEXT NOT NULL, ended_at TEXT,
 duration_seconds REAL CHECK(duration_seconds IS NULL OR duration_seconds >= 0), duration_scope TEXT,
 heartbeat_at TEXT NOT NULL, lease_expires_at TEXT NOT NULL, lease_token_hash TEXT NOT NULL,
 application_id INTEGER REFERENCES job_applications(id),
 evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
 metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
 version INTEGER NOT NULL DEFAULT 1,
 completion_hash TEXT, completion_result_json TEXT, outcome_hash TEXT,
 CHECK ((state='running' AND outcome IS NULL) OR (state='finished' AND outcome IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_one_running ON job_attempts(collection_id) WHERE state='running';
CREATE INDEX IF NOT EXISTS idx_attempt_job ON job_attempts(collection_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempt_outcome ON job_attempts(outcome,ended_at DESC);
CREATE TABLE IF NOT EXISTS job_form_captures (
 id TEXT PRIMARY KEY NOT NULL, capture_session_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 collection_id TEXT NOT NULL REFERENCES job_collection(id), attempt_id TEXT REFERENCES job_attempts(id),
 application_id INTEGER REFERENCES job_applications(id), schema_version INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN ('draft','finished','submitted_snapshot','imported')),
 captured_at TEXT NOT NULL, recorded_at TEXT NOT NULL, actor TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json) AND json_type(document_json)='object'), content_hash TEXT NOT NULL,
 UNIQUE(capture_session_id,revision)
);
CREATE INDEX IF NOT EXISTS idx_capture_job ON job_form_captures(collection_id,recorded_at DESC);
CREATE TABLE IF NOT EXISTS job_blockers (
 id TEXT PRIMARY KEY NOT NULL, collection_id TEXT NOT NULL REFERENCES job_collection(id), attempt_id TEXT REFERENCES job_attempts(id),
 reason_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 summary TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
 created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, resolution_kind TEXT,
 resolution_json TEXT CHECK(resolution_json IS NULL OR json_valid(resolution_json)),
 resolution_attempt_id TEXT REFERENCES job_attempts(id), version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_blocker_open ON job_blockers(status,reason_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocker_job ON job_blockers(collection_id,status);
`;

const initialized = new WeakSet<Client>();
export async function ensureWorkflowSchema(db: Client) {
  if (initialized.has(db)) return;
  await db.executeMultiple(workflowDDL);
  const additions: Record<string, string> = {
    collection_id: "TEXT REFERENCES job_collection(id)",
    attempt_id: "TEXT REFERENCES job_attempts(id)",
    capture_id: "TEXT REFERENCES job_form_captures(id)",
    submission_key: "TEXT",
    confirmation_kind: "TEXT",
    confirmed_at: "TEXT",
    confirmed_by: "TEXT",
    confirmation_json: "TEXT",
    version: "INTEGER NOT NULL DEFAULT 1",
  };
  const info = await db.execute("PRAGMA table_info(job_applications)");
  const present = new Set(info.rows.map((r) => String(r.name)));
  for (const [name, type] of Object.entries(additions)) {
    if (present.has(name)) continue;
    try {
      await db.execute(
        `ALTER TABLE job_applications ADD COLUMN ${name} ${type}`,
      );
    } catch (error) {
      const actual = await db.execute("PRAGMA table_info(job_applications)");
      if (!actual.rows.some((r) => r.name === name)) throw error;
    }
  }
  await db.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_application_submission_key ON job_applications(submission_key) WHERE submission_key IS NOT NULL",
  );
  initialized.add(db);
}

import { createClient, type Client } from '@libsql/client'
import { getSecret } from './secrets'

// Module-level singleton: reused across requests within the same warm serverless container.
// Resets automatically on cold start (new Node.js process), which is fine — createClient is cheap.
// Tradeoff: if JOBS_TURSO credentials are rotated via the secrets UI, a redeploy is needed to
// pick up the new client. For a personal tool this is acceptable.
let cachedJobsClient: Client | null = null

let schemaInitialized = false

export async function getJobsDb(): Promise<Client> {
  // Return the cached client if we already created one in this container lifetime.
  if (cachedJobsClient) return cachedJobsClient

  const url =
    (await getSecret('JOBS_TURSO_DATABASE_URL')) ||
    process.env.JOBS_TURSO_DATABASE_URL ||
    process.env.TURSO_DATABASE_URL
  const authToken =
    (await getSecret('JOBS_TURSO_AUTH_TOKEN')) ||
    process.env.JOBS_TURSO_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    console.error('Jobs DB Turso config missing', {
      hasOverrideBackedJobsDatabaseUrl: Boolean(await getSecret('JOBS_TURSO_DATABASE_URL')),
      hasOverrideBackedJobsAuthToken: Boolean(await getSecret('JOBS_TURSO_AUTH_TOKEN')),
      hasJobsDatabaseUrl: Boolean(process.env.JOBS_TURSO_DATABASE_URL),
      hasJobsAuthToken: Boolean(process.env.JOBS_TURSO_AUTH_TOKEN),
      hasDefaultDatabaseUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasDefaultAuthToken: Boolean(process.env.TURSO_AUTH_TOKEN),
      nodeEnv: process.env.NODE_ENV,
    })
    throw new Error('JOBS_TURSO_DATABASE_URL/JOBS_TURSO_AUTH_TOKEN (or TURSO fallback) not configured')
  }

  try {
    const client = createClient({ url, authToken })
    cachedJobsClient = client
    return client
  } catch (error) {
    console.error('Failed to create Jobs DB Turso client', {
      error,
      message: error instanceof Error ? error.message : String(error),
      urlPreview: url.slice(0, 32),
    })
    throw error
  }
}

export async function ensureJobsSchema(db: Client) {
  if (schemaInitialized) return

  try {
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        source TEXT,
        type TEXT,
        cover_letter TEXT,
        resume_type TEXT,
        interviewed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_job_applications_date
        ON job_applications(date DESC);

      CREATE INDEX IF NOT EXISTS idx_job_applications_company
        ON job_applications(company);
    `)
  } catch (error) {
    console.error('Failed to initialize job_applications schema', {
      error,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  schemaInitialized = true
}

import { randomUUID } from 'node:crypto'
import type { Client, InValue, Row } from '@libsql/client'

const initialized = new WeakSet<Client>()
const providers = ['workday', 'greenhouse', 'lever', 'icims', 'taleo', 'successfactors', 'other']
const statuses = ['exists', 'likely_exists', 'needs_creation', 'creation_failed', 'unknown']
const fields = ['provider', 'tenant', 'host', 'employer', 'login_email', 'status', 'credential_ref', 'evidence', 'notes', 'first_seen_at', 'last_verified_at']
const required = ['provider', 'tenant', 'login_email', 'status']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Evidence = { kind: 'email' | 'login' | 'manual'; at: string; ref?: string; note?: string }
type Input = Record<string, string | null | Evidence[]>

export class AtsAccountsError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function ensureAtsAccountsSchema(db: Client) {
  if (initialized.has(db)) return
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS ats_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('workday','greenhouse','lever','icims','taleo','successfactors','other')),
      tenant TEXT NOT NULL,
      host TEXT,
      employer TEXT,
      login_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('exists','likely_exists','needs_creation','creation_failed','unknown')),
      credential_ref TEXT,
      evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json) AND json_type(evidence_json)='array'),
      notes TEXT,
      first_seen_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      UNIQUE(provider, tenant, login_email)
    );
    CREATE INDEX IF NOT EXISTS idx_ats_accounts_provider_tenant ON ats_accounts(provider, tenant);
  `)
  initialized.add(db)
}

function object(body: unknown): Record<string, unknown> {
  // Check every key before validating fields. Never include submitted keys or values in errors.
  const pending = [body]
  const seen = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== 'object') continue
    if (seen.has(value)) throw new AtsAccountsError('Invalid request body')
    seen.add(value)
    for (const [key, child] of Object.entries(value)) {
      if (/pass|secret|token|otp|cookie/i.test(key)) throw new AtsAccountsError('Credential fields are not allowed')
      pending.push(child)
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AtsAccountsError('Expected a JSON object')
  return body as Record<string, unknown>
}

export async function readAtsAccountBody(request: Request) {
  let body: unknown
  try { body = await request.json() }
  catch { throw new AtsAccountsError('Invalid JSON body') }
  return object(body)
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new AtsAccountsError('Text fields must be strings of at most 500 characters')
  return value
}

function timestamp(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
      !Number.isFinite(Date.parse(result)) ||
      new Date(`${result.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== result.slice(0, 10)) {
    throw new AtsAccountsError('Timestamps must be valid ISO strings')
  }
  return result
}

function field(name: string, value: unknown): string | null {
  if (value === null && !required.includes(name)) return null
  const result = text(value)
  if (required.includes(name) && !result.trim()) throw new AtsAccountsError('Required fields must not be empty')
  if (name === 'provider' && !providers.includes(result)) throw new AtsAccountsError('Invalid provider')
  if (name === 'status' && !statuses.includes(result)) throw new AtsAccountsError('Invalid status')
  if (name === 'credential_ref' && !/^[a-z0-9_.-]{1,64}$/.test(result)) throw new AtsAccountsError('Invalid credential reference')
  if (name === 'tenant') {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) throw new AtsAccountsError('Invalid tenant slug')
    return result.toLowerCase()
  }
  if (name === 'login_email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AtsAccountsError('Invalid login email')
    return result.toLowerCase()
  }
  if (name === 'host') {
    if (!result.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) throw new AtsAccountsError('Invalid host')
    return result.toLowerCase()
  }
  if (name === 'first_seen_at' || name === 'last_verified_at') return timestamp(result)
  return result
}

function evidence(value: unknown): Evidence[] {
  if (!Array.isArray(value) || value.length > 50) throw new AtsAccountsError('Evidence must be an array of at most 50 items')
  return value.map(item => {
    const entry = object(item)
    if (Object.keys(entry).some(key => !['kind', 'at', 'ref', 'note'].includes(key))) throw new AtsAccountsError('Unknown evidence field')
    if (!['email', 'login', 'manual'].includes(text(entry.kind))) throw new AtsAccountsError('Invalid evidence kind')
    return {
      kind: entry.kind as Evidence['kind'], at: timestamp(entry.at),
      ...('ref' in entry ? { ref: text(entry.ref) } : {}),
      ...('note' in entry ? { note: text(entry.note) } : {}),
    }
  })
}

function validate(body: unknown, partial = false): Input {
  const input = object(body)
  if (Object.keys(input).some(key => !fields.includes(key) && !(partial && key === 'version'))) throw new AtsAccountsError('Unknown account field')
  if (!partial && required.some(key => !(key in input))) throw new AtsAccountsError('Provider, tenant, login email and status are required')
  const result: Input = {}
  for (const key of fields) {
    if (key in input) result[key] = key === 'evidence' ? evidence(input[key]) : field(key, input[key])
  }
  if (partial && 'version' in input) versionNumber(input.version)
  return result
}

function versionNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new AtsAccountsError('A positive integer version is required')
  return value
}

function accountId(id: string) {
  if (typeof id !== 'string' || !uuid.test(id)) throw new AtsAccountsError('Account id must be a UUID')
  return id
}

function decode(row: Row) {
  const { evidence_json, ...rest } = row
  return { ...rest, evidence: JSON.parse(String(evidence_json)) as Evidence[], version: Number(row.version) }
}

function stored(input: Input, previous: Evidence[] = []): Record<string, InValue> {
  const { evidence: added, ...rest } = input
  const result: Record<string, InValue> = rest as Record<string, string | null>
  if (added !== undefined) {
    const merged = new Map<string, Evidence>()
    for (const item of [...previous, ...added as Evidence[]]) {
      const key = JSON.stringify([item.kind, item.ref ?? null])
      if (!merged.has(key)) merged.set(key, item)
    }
    if (merged.size > 50) throw new AtsAccountsError('An account may have at most 50 evidence items')
    result.evidence_json = JSON.stringify([...merged.values()])
  }
  return result
}

export async function listAtsAccounts(db: Client, filters: { provider?: string; tenant?: string; status?: string }) {
  const clauses: string[] = []
  const args: InValue[] = []
  for (const key of ['provider', 'tenant', 'status'] as const) {
    if (filters[key] !== undefined) {
      clauses.push(`${key} = ?`)
      args.push(field(key, filters[key]))
    }
  }
  await ensureAtsAccountsSchema(db)
  const result = await db.execute({ sql: `SELECT * FROM ats_accounts${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at, id`, args })
  return result.rows.map(decode)
}

export async function getAtsAccount(db: Client, id: string) {
  accountId(id)
  await ensureAtsAccountsSchema(db)
  const result = await db.execute({ sql: 'SELECT * FROM ats_accounts WHERE id = ?', args: [id] })
  return result.rows[0] ? decode(result.rows[0]) : null
}

export async function upsertAtsAccount(db: Client, body: unknown) {
  const input = validate(body)
  await ensureAtsAccountsSchema(db)
  const tx = await db.transaction('write')
  try {
    const existing = await tx.execute({ sql: 'SELECT * FROM ats_accounts WHERE provider = ? AND tenant = ? AND login_email = ?', args: [input.provider, input.tenant, input.login_email] as string[] })
    const current = existing.rows[0]
    const values = stored(input, current ? decode(current).evidence : [])
    values.updated_at = new Date().toISOString()
    let result
    if (current) {
      result = await tx.execute({ sql: `UPDATE ats_accounts SET ${Object.keys(values).map(key => `${key} = ?`).join(', ')}, version = version + 1 WHERE id = ? RETURNING *`, args: [...Object.values(values), current.id] })
    } else {
      values.id = randomUUID()
      values.created_at = values.updated_at
      result = await tx.execute({ sql: `INSERT INTO ats_accounts (${Object.keys(values).join(', ')}) VALUES (${Object.keys(values).map(() => '?').join(', ')}) RETURNING *`, args: Object.values(values) })
    }
    await tx.commit()
    return { row: decode(result.rows[0]), created: !current }
  } finally { tx.close() }
}

export async function patchAtsAccount(db: Client, id: string, version: unknown, body: unknown) {
  const input = validate(body, true)
  accountId(id)
  versionNumber(version)
  await ensureAtsAccountsSchema(db)
  const tx = await db.transaction('write')
  try {
    const current = (await tx.execute({ sql: 'SELECT * FROM ats_accounts WHERE id = ?', args: [id] })).rows[0]
    if (!current) throw new AtsAccountsError('Account not found', 404)
    if (Number(current.version) !== version) throw new AtsAccountsError('Account changed; read it again before updating', 409)
    const values = stored(input, decode(current).evidence)
    values.updated_at = new Date().toISOString()
    const result = await tx.execute({ sql: `UPDATE ats_accounts SET ${Object.keys(values).map(key => `${key} = ?`).join(', ')}, version = version + 1 WHERE id = ? AND version = ? RETURNING *`, args: [...Object.values(values), id, version as number] })
    await tx.commit()
    return decode(result.rows[0])
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new AtsAccountsError('An account with that provider, tenant and email already exists', 409)
    throw error
  } finally { tx.close() }
}

export async function deleteAtsAccount(db: Client, id: string, version: unknown) {
  accountId(id)
  versionNumber(version)
  await ensureAtsAccountsSchema(db)
  const tx = await db.transaction('write')
  try {
    const current = (await tx.execute({ sql: 'SELECT version FROM ats_accounts WHERE id = ?', args: [id] })).rows[0]
    if (!current) throw new AtsAccountsError('Account not found', 404)
    if (Number(current.version) !== version) throw new AtsAccountsError('Account changed; read it again before deleting', 409)
    await tx.execute({ sql: 'DELETE FROM ats_accounts WHERE id = ? AND version = ?', args: [id, version as number] })
    await tx.commit()
  } finally { tx.close() }
}

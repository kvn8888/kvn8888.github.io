import type { Client, InStatement } from '@libsql/client'

export class CollectionError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) { super(message) }
}
export const statuses = ['pending', 'in_progress', 'skipped', 'blocked', 'applied', 'not_applicable']
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const textFields = ['id','identity_key','company','role','description','description_status','source','source_job_id','source_url','application_url','canonical_url','ats_provider','ats_tenant','ats_job_id','resolution_status','type','employment_type','location','work_mode','posted_at','posted_at_raw','first_seen_at','last_seen_at','archived_at','status','status_notes']
const jsonFields = ['role_tags_json','locations_json','sources_json','metadata_json','application_ids_json']
const required = ['id','identity_key','source','source_url']
type Stored = Record<string, string | number | null>
const enums: Record<string,string[]> = {
  status: statuses, description_status: ['missing','partial','full'],
  resolution_status: ['unresolved','resolved','in_board','unavailable'],
  work_mode: ['remote','hybrid','onsite'],
  type: ['full_stack','cloud','ai_ml','backend','frontend','data','mobile','embedded','security','other'],
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
function url(value: unknown) {
  if (typeof value !== 'string' || value.length > 8000) return false
  try { const parsed = new URL(value); return ['http:','https:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
}
function instant(value: string, dateOnly = false): string {
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value) return value
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value.slice(0,10)).toISOString().slice(0,10) !== value.slice(0,10)) throw new CollectionError('Timestamps must be valid ISO 8601 values with a timezone')
  return new Date(value).toISOString()
}
function normalizeStatus(value: string) { return value.trim().toLowerCase() === 'n/a' ? 'not_applicable' : value.trim().toLowerCase() }

/** Accept native JSON or serialized JSON; keep JSON native in API responses. */
function jsonValue(field: string, value: unknown): string {
  let parsed = value
  if (typeof value === 'string') { try { parsed = JSON.parse(value) } catch { throw new CollectionError(`${field} must be valid JSON`) } }
  if (field === 'metadata_json') {
    if (!object(parsed)) throw new CollectionError('metadata_json must be an object')
  } else {
    if (!Array.isArray(parsed) || parsed.length > (field === 'sources_json' ? 100 : 1000)) throw new CollectionError(`${field} must be an array with at most ${field === 'sources_json' ? 100 : 1000} entries`)
    for (const entry of parsed) {
      if (field === 'role_tags_json' && (typeof entry !== 'string' || !entry.trim() || entry.length > 100)) throw new CollectionError('Role tags must be nonempty strings up to 100 characters')
      if (field === 'application_ids_json' && (!Number.isSafeInteger(entry) || entry < 1)) throw new CollectionError('Application IDs must be positive integers')
      if (field === 'locations_json') {
        if (!object(entry) || !Object.keys(entry).length || Object.values(entry).some(v => v !== null && typeof v !== 'string' && !(Array.isArray(v) && v.every(item => typeof item === 'string')))) throw new CollectionError('Locations must be objects containing text, null, or arrays of text')
      }
      if (field === 'sources_json') {
        if (!object(entry) || typeof entry.source !== 'string' || !entry.source.trim() || !url(entry.source_url)) throw new CollectionError('Each source needs a nonempty source and an HTTP(S) source_url')
        for (const name of ['identity_key','source_job_id']) if (entry[name] != null && (typeof entry[name] !== 'string' || !(entry[name] as string).trim())) throw new CollectionError(`Source ${name} must be nonempty text`)
        for (const name of ['first_seen_at','last_seen_at']) if (entry[name] != null) { if (typeof entry[name] !== 'string') throw new CollectionError('Source timestamps must be strings'); instant(entry[name] as string) }
      }
    }
  }
  const pending: { value: unknown; depth: number }[] = [{value: parsed, depth: 0}]
  while (pending.length) {
    const { value: entry, depth } = pending.pop()!
    if (depth > 32) throw new CollectionError(`${field} exceeds maximum JSON nesting depth of 32`)
    if (entry && typeof entry === 'object') for (const child of Object.values(entry)) pending.push({value: child, depth: depth + 1})
  }
  const result = JSON.stringify(parsed)
  if (result.length > (field === 'metadata_json' ? 1000000 : 100000)) throw new CollectionError(`${field} exceeds its size limit`)
  return result
}

export async function readCollectionBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new CollectionError('JSON body required')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new CollectionError('Request exceeds 2 MiB', 413) }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new CollectionError('Invalid JSON body') }
}

export function validateCollection(body: unknown, patch = false): Stored {
  if (!object(body)) throw new CollectionError('Expected a JSON object')
  const result: Stored = {}
  for (const [field, value] of Object.entries(body)) {
    if (jsonFields.includes(field)) { result[field] = jsonValue(field, value); continue }
    if (!textFields.includes(field)) throw new CollectionError(`Unknown or read-only field: ${field}`)
    if (patch && ['id','identity_key','source','first_seen_at'].includes(field)) throw new CollectionError(`${field} is immutable`)
    if (value === null) {
      if (required.includes(field) || ['status','description_status','resolution_status','last_seen_at','first_seen_at'].includes(field)) throw new CollectionError(`${field} cannot be null`)
      result[field] = null; continue
    }
    if (typeof value !== 'string') throw new CollectionError(`${field} must be text or null`)
    const limit = ['description','status_notes'].includes(field) ? 50000 : field.endsWith('_url') ? 8000 : 2000
    if (value.length > limit) throw new CollectionError(`${field} exceeds ${limit} characters`)
    const normalized = field === 'status' ? normalizeStatus(value) : ['description','status_notes'].includes(field) ? value : value.trim()
    if (!normalized && field !== 'description' && field !== 'status_notes') throw new CollectionError(`${field} cannot be empty; use null for unknown optional values`)
    if (enums[field] && !enums[field].includes(normalized)) throw new CollectionError(`Invalid ${field}; allowed: ${enums[field].join(', ')}`)
    if (field === 'id' && !uuidPattern.test(normalized)) throw new CollectionError('id must be a UUID')
    if (field.endsWith('_url') && !url(normalized)) throw new CollectionError(`${field} must be an HTTP(S) URL without credentials`)
    result[field] = field.endsWith('_at') ? instant(normalized, field === 'posted_at') : normalized
  }
  if (!patch) {
    for (const name of required) if (!result[name]) throw new CollectionError(`${name} is required`)
    const now = new Date().toISOString()
    Object.assign(result, { description_status: 'missing', resolution_status: 'unresolved', status: 'pending', first_seen_at: now, last_seen_at: now, role_tags_json: '[]', locations_json: '[]', sources_json: '[]', metadata_json: '{}', application_ids_json: '[]', ...result })
  }
  if (patch && !Object.keys(result).length) throw new CollectionError('No fields to update')
  return result
}

function validateCombined(row: Stored) {
  if (row.description_status !== 'missing' && (typeof row.description !== 'string' || !row.description.trim())) throw new CollectionError('Partial/full description status requires description text')
  if (row.resolution_status === 'resolved' && !row.application_url) throw new CollectionError('Resolved jobs require application_url')
  if (String(row.first_seen_at) > String(row.last_seen_at)) throw new CollectionError('last_seen_at cannot precede first_seen_at')
}

export function decodeCollection(row: Stored): Record<string, unknown> {
  const decoded: Record<string, unknown> = { ...row, version: Number(row.version) }
  for (const field of [...jsonFields,'status_history_json']) if (field in row) decoded[field] = JSON.parse(String(row[field]))
  return decoded
}
export async function getCollection(db: Client, id: string): Promise<Stored | null> {
  const result = await db.execute({ sql: 'SELECT * FROM job_collection WHERE id = ?', args: [id] })
  return (result.rows[0] as Stored | undefined) ?? null
}

async function checkApplicationIds(db: Client, data: Stored) {
  if (!data.application_ids_json) return
  const ids: number[] = JSON.parse(String(data.application_ids_json))
  if (!ids.length) return
  const result = await db.execute({ sql: `SELECT id FROM job_applications WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids })
  if (new Set(result.rows.map(row => Number(row.id))).size !== new Set(ids).size) throw new CollectionError('One or more application IDs do not exist')
}

/** Lookup multiple stable identities, including aliases. Never delete a matching row. */
function matchStatement(data: Stored): { sql: string; args: (string | number | null)[] } {
  const conditions = ['id = ?', 'identity_key = ?']
  const args: (string | number | null)[] = [data.id ?? '', data.identity_key ?? '']
  const identities = [data, ...JSON.parse(String(data.sources_json || '[]')) as Stored[]]
  for (const identity of identities) {
    if (identity.identity_key) { conditions.push("EXISTS (SELECT 1 FROM json_each(sources_json) s WHERE json_extract(s.value,'$.identity_key') = ?)"); args.push(identity.identity_key) }
    if (identity.source && identity.source_job_id) {
      conditions.push("(source = ? AND source_job_id = ?) OR EXISTS (SELECT 1 FROM json_each(sources_json) s WHERE json_extract(s.value,'$.source') = ? AND json_extract(s.value,'$.source_job_id') = ?)")
      args.push(identity.source, identity.source_job_id, identity.source, identity.source_job_id)
    }
    if (identity.source && identity.source_url) {
      conditions.push("(source = ? AND source_url = ?) OR EXISTS (SELECT 1 FROM json_each(sources_json) s WHERE json_extract(s.value,'$.source') = ? AND json_extract(s.value,'$.source_url') = ?)")
      args.push(identity.source, identity.source_url, identity.source, identity.source_url)
    }
  }
  if (data.canonical_url) { conditions.push('canonical_url = ?'); args.push(data.canonical_url) }
  if (data.ats_provider && data.ats_tenant && data.ats_job_id) { conditions.push('(ats_provider = ? AND ats_tenant = ? AND ats_job_id = ?)'); args.push(data.ats_provider, data.ats_tenant, data.ats_job_id) }
  return { sql: `SELECT * FROM job_collection WHERE (${conditions.map(c => `(${c})`).join(' OR ')})`, args }
}
async function findMatches(db: Client, data: Stored): Promise<Stored[]> {
  return (await db.execute(matchStatement(data))).rows as Stored[]
}
function existingMatch(matches: Stored[], input: Stored) {
  if (matches.length > 1) throw new CollectionError('Identities match multiple rows; resolve explicitly. No rows were changed.', 409, { ids: matches.map(row => row.id) })
  if (matches[0]?.id === input.id && matches[0].identity_key !== input.identity_key) throw new CollectionError('UUID is already assigned to another identity', 409)
  return matches[0]
}

export async function createCollection(db: Client, data: Stored, actor: string) {
  validateCombined(data)
  const previous = existingMatch(await findMatches(db, data), data)
  if (previous) return { row: previous, created: false }
  await checkApplicationIds(db, data)
  const now = new Date().toISOString()
  const row = { ...data, updated_at: now, status_updated_at: now, status_history_json: JSON.stringify([{ status: data.status, notes: data.status_notes ?? null, at: now, actor }]) }
  const fields = Object.keys(row)
  const match = matchStatement(data)
  const result = await db.execute({ sql: `INSERT INTO job_collection (${fields.join(',')}) SELECT ${fields.map(() => '?').join(',')} WHERE NOT EXISTS (${match.sql}) ON CONFLICT DO NOTHING RETURNING *`, args: [...Object.values(row), ...match.args] })
  if (result.rows.length) return { row: result.rows[0] as Stored, created: true }
  const winner = existingMatch(await findMatches(db, data), data)
  if (!winner) throw new CollectionError('Concurrent identity conflict; reload and retry', 409)
  return { row: winner, created: false }
}

function mergeJson(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) && Array.isArray(right)) return [...new Map([...left,...right].map(item => [JSON.stringify(item), item])).values()]
  if (object(left) && object(right)) return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => [key, Object.hasOwn(right,key) ? mergeJson(left[key],right[key]) : left[key]]))
  return right
}

export async function patchCollection(db: Client, id: string, patch: Stored, version: number, actor: string) {
  const current = await getCollection(db, id)
  if (!current) throw new CollectionError('Collection job not found', 404)
  if (Number(current.version) !== version) throw new CollectionError('Record changed; GET it again before updating', 412, { version: current.version })
  if (current.description_status === 'full' && ((patch.description_status && patch.description_status !== 'full') || patch.description === null)) throw new CollectionError('Cannot downgrade or erase a full description', 409)
  if (patch.description !== undefined && current.description_status === 'full' && patch.description_status !== 'full') throw new CollectionError('Updating a full description requires description_status: full', 409)
  if (patch.last_seen_at && String(patch.last_seen_at) < String(current.last_seen_at)) throw new CollectionError('Older observation cannot replace last_seen_at', 409)
  for (const field of jsonFields) if (field in patch) patch[field] = jsonValue(field, mergeJson(JSON.parse(String(current[field])),JSON.parse(String(patch[field]))))
  for (const [field,value] of Object.entries(patch)) {
    if (value === null && current[field] != null && !['archived_at','status_notes'].includes(field)) throw new CollectionError(`Cannot erase known ${field} with null; omit unknown enrichment fields`, 409)
  }
  const combined = { ...current, ...patch }
  validateCombined(combined)
  const matches = await findMatches(db, combined)
  if (matches.some(row => row.id !== id)) throw new CollectionError('Identity matches another row; no rows were changed', 409, { ids: matches.map(row => row.id) })
  await checkApplicationIds(db, patch)
  const updates = Object.fromEntries(Object.entries(patch).filter(([field,value]) => current[field] !== value)) as Stored
  if (!Object.keys(updates).length) return current
  const now = new Date().toISOString()
  updates.updated_at = now
  if ('status' in updates || 'status_notes' in updates) {
    updates.status_updated_at = now
    const history = JSON.parse(String(current.status_history_json))
    history.push({ status: combined.status, notes: combined.status_notes ?? null, at: now, actor })
    updates.status_history_json = JSON.stringify(history)
  }
  const match = matchStatement(combined)
  let result
  try {
    result = await db.execute({ sql: `UPDATE job_collection SET ${Object.keys(updates).map(field => `${field} = ?`).join(',')}, version = version + 1 WHERE id = ? AND version = ? AND NOT EXISTS (${match.sql} AND id <> ?) RETURNING *`, args: [...Object.values(updates),id,version,...match.args,id] })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && String(error.code).startsWith('SQLITE_CONSTRAINT')) throw new CollectionError('Concurrent identity conflict; reload and retry', 409)
    throw error
  }
  if (!result.rows.length) throw new CollectionError('Record changed; GET it again before updating', 412)
  return result.rows[0] as Stored
}

const summary = 'id,identity_key,company,role,source,source_job_id,source_url,application_url,canonical_url,type,role_tags_json,employment_type,location,work_mode,description_status,resolution_status,posted_at,first_seen_at,last_seen_at,updated_at,archived_at,status,status_updated_at,application_ids_json,version'
export async function listCollection(db: Client, params: URLSearchParams, urlsOnly = false) {
  const allowed = ['q','company','type','role_type','work_mode','location','source','employment_type','status','collected_since','collected_until','updated_since','archived','cursor','limit']
  for (const key of params.keys()) if (!allowed.includes(key)) throw new CollectionError(`Unknown query parameter: ${key}`)
  const limit = Number(params.get('limit') ?? '20')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new CollectionError('limit must be an integer from 1 to 100')
  const clauses: string[] = []; const args: (string|number|null)[] = []
  for (const field of ['company','location','q']) if (params.get(field)) {
    const value = params.get(field)!
    if (value.length > 2000) throw new CollectionError('Search text too long')
    const escaped = value.replace(/[\\%_]/g, character => `\\${character}`)
    clauses.push(field === 'q' ? "(company LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\')" : `${field} LIKE ? ESCAPE '\\'`)
    args.push(`%${escaped}%`); if (field === 'q') args.push(`%${escaped}%`)
  }
  for (const field of ['type','work_mode','source','employment_type','status']) {
    let value = params.get(field) || (field === 'type' ? params.get('role_type') : null)
    if (!value) continue
    if (field === 'status') value = normalizeStatus(value)
    if (enums[field] && !enums[field].includes(value)) throw new CollectionError(`Invalid ${field}`)
    clauses.push(`${field} = ?`); args.push(value)
  }
  for (const [parameter,column,operator] of [['collected_since','first_seen_at','>='],['collected_until','first_seen_at','<'],['updated_since','updated_at','>=']]) if (params.has(parameter)) {
    let value = instant(params.get(parameter)!, true)
    if (value.length === 10) value += 'T00:00:00.000Z'
    clauses.push(`${column} ${operator} ?`); args.push(value)
  }
  const archived = params.get('archived') ?? 'false'
  if (!['true','false','all'].includes(archived)) throw new CollectionError('archived must be true, false, or all')
  if (archived !== 'all') clauses.push(`archived_at IS ${archived === 'true' ? 'NOT ' : ''}NULL`)
  const where = () => clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const count = await db.execute({sql:`SELECT COUNT(*) AS total FROM job_collection ${where()}`, args})
  const cursor = params.get('cursor')
  if (cursor) {
    if (cursor.length > 1000) throw new CollectionError('Invalid cursor')
    let decoded
    try { decoded = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')) } catch { throw new CollectionError('Invalid cursor') }
    if (!object(decoded) || typeof decoded.id !== 'string' || !uuidPattern.test(decoded.id) || typeof decoded.first_seen_at !== 'string') throw new CollectionError('Invalid cursor')
    const time = instant(decoded.first_seen_at)
    clauses.push('(first_seen_at < ? OR (first_seen_at = ? AND id < ?))'); args.push(time,time,decoded.id)
  }
  const statement: InStatement = { sql: `SELECT ${urlsOnly ? 'id,source_url,application_url,canonical_url,status,first_seen_at,version' : summary} FROM job_collection ${where()} ORDER BY first_seen_at DESC, id DESC LIMIT ?`, args:[...args,limit+1] }
  const result = await db.execute(statement)
  const rows = result.rows.slice(0,limit) as Stored[]
  const last = rows.at(-1)
  return { jobs: rows.map(decodeCollection), total: Number(count.rows[0].total), next_cursor: result.rows.length > limit && last ? Buffer.from(JSON.stringify({first_seen_at:last.first_seen_at,id:last.id})).toString('base64url') : null }
}

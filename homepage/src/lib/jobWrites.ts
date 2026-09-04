import { createHash } from 'node:crypto'
import type { Client } from '@libsql/client'

const textFields = ['company', 'role', 'description', 'date', 'source', 'type', 'cover_letter', 'resume_type', 'location', 'work_mode'] as const
export type JobInput = Partial<Record<typeof textFields[number], string | null>> & { interviewed?: boolean }
export class JobInputError extends Error {}
export class JobConflictError extends Error {}

export function validateJobInput(body: unknown, patch = false): JobInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new JobInputError('Expected a JSON object')
  const input = body as Record<string, unknown>
  const output: JobInput = {}
  const allowed: readonly string[] = patch ? [...textFields, 'interviewed'] : textFields
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw new JobInputError(`Unknown field: ${key}`)
    if (key === 'interviewed') {
      if (typeof value !== 'boolean' && value !== 0 && value !== 1) throw new JobInputError('interviewed must be a boolean or 0/1')
      output.interviewed = Boolean(value)
      continue
    }
    if (value !== null && typeof value !== 'string') throw new JobInputError(`${key} must be a string or null`)
    if (typeof value === 'string' && value.length > (['description', 'cover_letter'].includes(key) ? 50000 : 2000)) throw new JobInputError(`${key} is too long`)
    output[key as typeof textFields[number]] = typeof value === 'string' ? value.trim() : null
  }
  for (const key of ['company', 'role'] as const) {
    if ((!patch || key in output) && !output[key]) throw new JobInputError(`${key} is required`)
  }
  if ('date' in output && (!output.date || !/^\d{4}-\d{2}-\d{2}$/.test(output.date) ||
    !Number.isFinite(Date.parse(output.date)) || new Date(output.date).toISOString().slice(0, 10) !== output.date)) {
    throw new JobInputError('date must be a valid YYYY-MM-DD date')
  }
  if (patch && Object.keys(output).length === 0) throw new JobInputError('No fields to update')
  return output
}

export function validateIdempotencyKey(key: string | null): string | null {
  if (key !== null && !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new JobInputError('Idempotency-Key must be 1–128 letters, numbers, dots, underscores, colons, or hyphens')
  return key
}

/** Store retry metadata in the inserted row so a single atomic INSERT handles concurrency. */
export async function insertJob(db: Client, input: JobInput, key: string | null) {
  // Hash explicit input, not the default date, so retries across midnight still match.
  const canonical = textFields.map(field => [field, input[field] || null])
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  const result = await db.execute({
    sql: `INSERT INTO job_applications (${textFields.join(', ')}, request_key, request_hash)
          VALUES (${textFields.map(() => '?').join(', ')}, ?, ?)
          ON CONFLICT(request_key) DO NOTHING RETURNING id`,
    args: [...textFields.map(field => field === 'date' ? input.date || new Date().toISOString().slice(0, 10) : input[field] || null), key, key ? hash : null],
  })
  if (result.rows.length) return { id: Number(result.rows[0].id), replayed: false }
  const previous = await db.execute({
    sql: 'SELECT id, request_hash FROM job_applications WHERE request_key = ?', args: [key],
  })
  if (!previous.rows.length) throw new Error('Retry record missing')
  if (previous.rows[0].request_hash !== hash) throw new JobConflictError('Idempotency-Key was already used with different data')
  return { id: Number(previous.rows[0].id), replayed: true }
}

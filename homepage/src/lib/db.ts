import { getTursoClient } from './turso'

let schemaInitialized = false

export async function initSchema() {
  if (schemaInitialized) return
  const db = getTursoClient()
  if (!db) return

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'email',
      verification_code TEXT,
      code_verified INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  schemaInitialized = true
}

export async function createLoginAttempt(
  email: string,
  method: 'email' | 'google',
  verificationCode?: string
) {
  const db = getTursoClient()
  if (!db) return null
  await initSchema()

  const result = await db.execute({
    sql: `INSERT INTO login_attempts (email, method, verification_code, status)
          VALUES (?, ?, ?, 'pending')`,
    args: [email.toLowerCase(), method, verificationCode ?? null],
  })
  return result.lastInsertRowid
}

export async function verifyCode(email: string, code: string) {
  const db = getTursoClient()
  if (!db) return { success: false, error: 'Database not configured' }
  await initSchema()

  const result = await db.execute({
    sql: `SELECT id, verification_code, code_verified, status
          FROM login_attempts
          WHERE email = ? AND method = 'email'
          ORDER BY created_at DESC LIMIT 1`,
    args: [email.toLowerCase()],
  })

  if (result.rows.length === 0) {
    return { success: false, error: 'No verification request found' }
  }

  const row = result.rows[0]
  if (row.code_verified) {
    return { success: false, error: 'Code already used' }
  }
  if (row.verification_code !== code) {
    return { success: false, error: 'Invalid code' }
  }

  await db.execute({
    sql: `UPDATE login_attempts SET code_verified = 1, updated_at = datetime('now')
          WHERE id = ?`,
    args: [row.id],
  })

  return { success: true }
}

export async function getLoginAttempts() {
  const db = getTursoClient()
  if (!db) return []
  await initSchema()

  const result = await db.execute(
    `SELECT id, email, method, status, code_verified, created_at, updated_at
     FROM login_attempts
     ORDER BY created_at DESC`
  )
  return result.rows
}

export async function updateAttemptStatus(id: number, status: 'approved' | 'rejected') {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  await db.execute({
    sql: `UPDATE login_attempts SET status = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [status, id],
  })
  return true
}

export async function isEmailApproved(email: string): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  const result = await db.execute({
    sql: `SELECT id FROM login_attempts
          WHERE email = ? AND status = 'approved' LIMIT 1`,
    args: [email.toLowerCase()],
  })
  return result.rows.length > 0
}

export async function addWhitelistEmail(email: string) {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  // Check if already exists and approved
  const existing = await db.execute({
    sql: `SELECT id, status FROM login_attempts
          WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
    args: [email.toLowerCase()],
  })

  if (existing.rows.length > 0 && existing.rows[0].status === 'approved') {
    return true // Already approved
  }

  if (existing.rows.length > 0) {
    // Update existing to approved
    await db.execute({
      sql: `UPDATE login_attempts SET status = 'approved', updated_at = datetime('now')
            WHERE id = ?`,
      args: [existing.rows[0].id],
    })
  } else {
    // Create new approved entry
    await db.execute({
      sql: `INSERT INTO login_attempts (email, method, status, code_verified)
            VALUES (?, 'manual', 'approved', 1)`,
      args: [email.toLowerCase()],
    })
  }
  return true
}

export function generateVerificationCode(): string {
  const chars = '0123456789'
  let code = ''
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % 10]
  }
  return code
}

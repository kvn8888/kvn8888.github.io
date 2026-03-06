import { canAccessPath, normalizeAccessGrantKeys, type AccessGrantKey } from './accessGrants'
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

    CREATE TABLE IF NOT EXISTS login_access_grants (
      email TEXT NOT NULL,
      grant_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (email, grant_key)
    );

    CREATE INDEX IF NOT EXISTS idx_login_access_grants_email
      ON login_access_grants (email);
  `)
  schemaInitialized = true
}

async function listAccessGrantKeysForEmails(emails: readonly string[]) {
  const db = getTursoClient()
  const normalizedEmails = Array.from(new Set(emails.map((email) => email.toLowerCase())))

  if (!db || normalizedEmails.length === 0) {
    return new Map<string, AccessGrantKey[]>()
  }

  await initSchema()

  const placeholders = normalizedEmails.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `SELECT email, grant_key
          FROM login_access_grants
          WHERE email IN (${placeholders})
          ORDER BY email ASC, grant_key ASC`,
    args: normalizedEmails,
  })

  const grantsByEmail = new Map<string, AccessGrantKey[]>()

  for (const row of result.rows) {
    const email = String(row.email).toLowerCase()
    const grantKey = String(row.grant_key)
    const existing = grantsByEmail.get(email) ?? []

    grantsByEmail.set(email, normalizeAccessGrantKeys([...existing, grantKey]))
  }

  return grantsByEmail
}

async function clearEmailAccessGrantKeys(email: string) {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  await db.execute({
    sql: `DELETE FROM login_access_grants WHERE email = ?`,
    args: [email.toLowerCase()],
  })

  return true
}

export async function setEmailAccessGrantKeys(
  email: string,
  grantKeys: readonly AccessGrantKey[]
) {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  const normalizedEmail = email.toLowerCase()
  const normalizedGrantKeys = normalizeAccessGrantKeys(grantKeys)

  await clearEmailAccessGrantKeys(normalizedEmail)

  for (const grantKey of normalizedGrantKeys) {
    await db.execute({
      sql: `INSERT INTO login_access_grants (email, grant_key)
            VALUES (?, ?)`,
      args: [normalizedEmail, grantKey],
    })
  }

  return true
}

export async function getEmailAccessGrantKeys(email: string): Promise<AccessGrantKey[]> {
  const grantsByEmail = await listAccessGrantKeysForEmails([email])
  return grantsByEmail.get(email.toLowerCase()) ?? []
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

  const emails = result.rows.map((row) => String(row.email).toLowerCase())
  const grantsByEmail = await listAccessGrantKeysForEmails(emails)

  return result.rows.map((row) => {
    const email = String(row.email).toLowerCase()

    return {
      ...row,
      grants: grantsByEmail.get(email) ?? [],
    }
  })
}

export async function updateAttemptStatus(
  id: number,
  status: 'approved' | 'rejected',
  grantKeys?: readonly AccessGrantKey[]
) {
  const db = getTursoClient()
  if (!db) return false
  await initSchema()

  const attempt = await db.execute({
    sql: `SELECT email, status FROM login_attempts WHERE id = ? LIMIT 1`,
    args: [id],
  })

  if (attempt.rows.length === 0) return false

  const email = String(attempt.rows[0].email).toLowerCase()
  const currentStatus = String(attempt.rows[0].status)

  if (status === 'approved') {
    await db.execute({
      sql: `UPDATE login_attempts
            SET status = 'approved', updated_at = datetime('now')
            WHERE email = ?`,
      args: [email],
    })

    if (grantKeys) {
      await setEmailAccessGrantKeys(email, grantKeys)
    }

    return true
  }

  if (currentStatus === 'approved') {
    await db.execute({
      sql: `UPDATE login_attempts
            SET status = 'rejected', updated_at = datetime('now')
            WHERE email = ? AND status = 'approved'`,
      args: [email],
    })
    await clearEmailAccessGrantKeys(email)
    return true
  }

  await db.execute({
    sql: `UPDATE login_attempts SET status = 'rejected', updated_at = datetime('now')
          WHERE id = ?`,
    args: [id],
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

export async function addWhitelistEmail(
  email: string,
  grantKeys?: readonly AccessGrantKey[]
) {
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
    if (grantKeys) {
      await setEmailAccessGrantKeys(email, grantKeys)
    }
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

  if (grantKeys) {
    await setEmailAccessGrantKeys(email, grantKeys)
  }

  return true
}

export async function canEmailAccessPath(email: string, pathname: string) {
  const approved = await isEmailApproved(email)
  if (!approved) return false

  const grantKeys = await getEmailAccessGrantKeys(email)
  return canAccessPath(grantKeys, pathname)
}

export function generateVerificationCode(): string {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => String(byte % 10)).join('')
}

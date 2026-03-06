import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { getTursoClient } from './turso'

let schemaInitialized = false

async function initSecretsSchema() {
  if (schemaInitialized) return
  const db = getTursoClient()
  if (!db) return

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS secret_overrides (
      key TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      user_email TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  schemaInitialized = true
}

function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET must be set to use runtime secrets encryption')
  return createHash('sha256').update(secret + ':secrets').digest()
}

function encryptSecret(value: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptSecret(encryptedValue: string): string | null {
  try {
    const parts = encryptedValue.split(':')
    if (parts.length !== 3) return null
    const [ivHex, authTagHex, ciphertextHex] = parts
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

/**
 * Resolve a secret: checks Turso DB for a runtime override first,
 * then falls back to the process.env value. This means secrets set
 * via the /tools/secrets page override Vercel env vars at runtime
 * without requiring a redeploy.
 */
export async function getSecret(key: string): Promise<string | undefined> {
  const db = getTursoClient()
  if (db) {
    try {
      await initSecretsSchema()
      const result = await db.execute({
        sql: 'SELECT encrypted_value FROM secret_overrides WHERE key = ? LIMIT 1',
        args: [key],
      })
      if (result.rows.length > 0) {
        const decrypted = decryptSecret(String(result.rows[0].encrypted_value))
        if (decrypted !== null) return decrypted
      }
    } catch {
      // Fall through to env var on any DB error
    }
  }
  return process.env[key]
}

export async function setSecretOverride(
  key: string,
  value: string,
  userEmail: string
): Promise<void> {
  const db = getTursoClient()
  if (!db) throw new Error('Database not configured')
  await initSecretsSchema()

  const encrypted = encryptSecret(value)
  await db.execute({
    sql: `INSERT INTO secret_overrides (key, encrypted_value, user_email, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET
            encrypted_value = excluded.encrypted_value,
            user_email = excluded.user_email,
            updated_at = datetime('now')`,
    args: [key, encrypted, userEmail],
  })
}

export async function deleteSecretOverride(key: string): Promise<void> {
  const db = getTursoClient()
  if (!db) throw new Error('Database not configured')
  await initSecretsSchema()

  await db.execute({
    sql: 'DELETE FROM secret_overrides WHERE key = ?',
    args: [key],
  })
}

export interface SecretOverrideMeta {
  key: string
  userEmail: string
  updatedAt: string
}

export async function listSecretOverrides(): Promise<SecretOverrideMeta[]> {
  const db = getTursoClient()
  if (!db) return []
  try {
    await initSecretsSchema()
    const result = await db.execute(
      'SELECT key, user_email, updated_at FROM secret_overrides ORDER BY updated_at DESC'
    )
    return result.rows.map((row) => ({
      key: String(row.key),
      userEmail: String(row.user_email),
      updatedAt: String(row.updated_at),
    }))
  } catch {
    return []
  }
}

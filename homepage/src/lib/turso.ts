import { createClient } from '@libsql/client'

let cachedClient: ReturnType<typeof createClient> | null = null

export function getTursoClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    return null
  }

  if (!cachedClient) {
    cachedClient = createClient({ url, authToken })
  }

  return cachedClient
}

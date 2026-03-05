import { createClient } from '@libsql/client'

let cachedClient: ReturnType<typeof createClient> | null = null

export function getTursoClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    console.error('Turso client not configured', {
      hasDatabaseUrl: Boolean(url),
      hasAuthToken: Boolean(authToken),
      nodeEnv: process.env.NODE_ENV,
    })
    return null
  }

  if (!cachedClient) {
    try {
      cachedClient = createClient({ url, authToken })
    } catch (error) {
      console.error('Failed to initialize Turso client', {
        error,
        message: error instanceof Error ? error.message : String(error),
        urlPreview: url.slice(0, 32),
      })
      throw error
    }
  }

  return cachedClient
}

import { getSecret } from '@/lib/secrets'

type ServerEventLevel = 'info' | 'warn' | 'error'

interface ServerEvent {
  level: ServerEventLevel
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_AXIOM_URL = 'https://api.axiom.co'
const AXIOM_TIMEOUT_MS = 2_500

function writeConsoleEvent(event: ServerEvent) {
  const payload = event.data ?? {}
  if (event.level === 'error') {
    console.error(event.message, payload)
  } else if (event.level === 'warn') {
    console.warn(event.message, payload)
  } else {
    console.info(event.message, payload)
  }
}

/**
 * Send one structured server event to Axiom without making observability a
 * dependency for the application path. Vercel console logs remain the fallback.
 */
export async function reportServerEvent(event: ServerEvent): Promise<void> {
  const payload = {
    _time: new Date().toISOString(),
    service: 'kevinc-homepage',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    ...event,
    data: event.data ?? {},
  }

  writeConsoleEvent(event)

  try {
    const [token, dataset, configuredUrl] = await Promise.all([
      getSecret('AXIOM_TOKEN'),
      getSecret('AXIOM_DATASET'),
      getSecret('AXIOM_URL'),
    ])

    if (!token || !dataset) return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AXIOM_TIMEOUT_MS)
    try {
      const response = await fetch(
        `${(configuredUrl || DEFAULT_AXIOM_URL).replace(/\/+$/, '')}/v1/datasets/${encodeURIComponent(dataset)}/ingest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([payload]),
          cache: 'no-store',
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        console.warn('Axiom ingest failed', { status: response.status })
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.warn('Axiom reporting failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}


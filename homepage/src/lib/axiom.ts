import { getSecret } from '@/lib/secrets'

type ServerEventLevel = 'info' | 'warn' | 'error'

interface ServerEvent {
  event?: string
  level: ServerEventLevel
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_AXIOM_URL = 'https://api.axiom.co'
const AXIOM_TIMEOUT_MS = 2_500

function writeConsoleEvent(event: ServerEvent) {
  const payload = {
    event: event.event ?? 'server.event',
    ...(event.data ?? {}),
  }
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
  const data = event.data ?? {}
  const payload = {
    _time: new Date().toISOString(),
    service: 'kevinc-homepage',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    event: event.event ?? 'server.event',
    level: event.level,
    message: event.message,
    requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
    route: typeof data.route === 'string' ? data.route : undefined,
    provider: typeof data.provider === 'string' ? data.provider : undefined,
    data,
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

export class AxiomQueryError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AxiomQueryError'
    this.status = status
  }
}

/**
 * Query Axiom with a read-capable token. A dedicated AXIOM_QUERY_TOKEN is
 * preferred so the runtime ingest token can remain least-privilege.
 */
export async function queryServerEvents(args: {
  buildApl: (dataset: string) => string
  startTime?: string
  endTime?: string
}): Promise<{ apl: string; result: unknown }> {
  const [queryToken, ingestToken, dataset, configuredUrl] = await Promise.all([
    getSecret('AXIOM_QUERY_TOKEN'),
    getSecret('AXIOM_TOKEN'),
    getSecret('AXIOM_DATASET'),
    getSecret('AXIOM_URL'),
  ])
  const token = queryToken || ingestToken

  if (!token || !dataset) {
    throw new AxiomQueryError('Axiom query credentials are not configured')
  }

  const apl = args.buildApl(dataset)
  const response = await fetch(
    `${(configuredUrl || DEFAULT_AXIOM_URL).replace(/\/+$/, '')}/v1/query/_apl?format=legacy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apl,
        startTime: args.startTime ?? 'now-24h',
        ...(args.endTime ? { endTime: args.endTime } : {}),
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new AxiomQueryError(`Axiom query failed: ${body.slice(0, 500)}`, response.status)
  }

  return { apl, result: await response.json() }
}

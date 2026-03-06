import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import {
  MANAGED_SECRET_FIELDS,
  getManagedSecretField,
  type ManagedSecretStrategy,
} from '@/lib/managedSecrets'
import {
  getSecret,
  listSecretOverrides,
  setSecretOverride,
  deleteSecretOverride,
} from '@/lib/secrets'

// Allowlist of keys that can be managed via this API.
// Only uppercase env-var-style names are accepted (1-64 chars).
const ALLOWED_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/

interface VercelSyncResult {
  status: 'ok' | 'skipped' | 'failed'
  message: string
}

interface VercelProjectContext {
  token: string
  idOrName: string
  teamId?: string
  teamSlug?: string
}

async function getVercelProjectContext(): Promise<VercelProjectContext | null> {
  const token = await getSecret('VERCEL_API_TOKEN')
  const idOrName =
    (await getSecret('VERCEL_PROJECT_ID')) ??
    (await getSecret('VERCEL_PROJECT_NAME'))

  if (!token || !idOrName) {
    return null
  }

  const teamId = await getSecret('VERCEL_TEAM_ID')
  const teamSlug = await getSecret('VERCEL_TEAM_SLUG')

  return { token, idOrName, teamId, teamSlug }
}

async function listVercelEnvKeys(): Promise<Set<string> | null> {
  const context = await getVercelProjectContext()
  if (!context) return null

  const params = new URLSearchParams({ decrypt: 'false' })
  if (context.teamId) params.set('teamId', context.teamId)
  else if (context.teamSlug) params.set('slug', context.teamSlug)

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(context.idOrName)}/env?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${context.token}`,
        },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const envRecords = Array.isArray(data)
      ? data
      : Array.isArray(data?.envs)
        ? data.envs
        : Array.isArray(data?.projectEnv)
          ? data.projectEnv
          : []

    return new Set(
      envRecords.flatMap((record: { key?: unknown }) =>
        typeof record?.key === 'string' ? [record.key] : []
      )
    )
  } catch {
    return null
  }
}

async function syncSecretToVercel(key: string, value: string): Promise<VercelSyncResult> {
  const context = await getVercelProjectContext()
  if (!context) {
    return {
      status: 'skipped',
      message: 'VERCEL_API_TOKEN and VERCEL_PROJECT_ID or VERCEL_PROJECT_NAME are required for Vercel sync',
    }
  }
  const params = new URLSearchParams({ upsert: 'true' })

  if (context.teamId) params.set('teamId', context.teamId)
  else if (context.teamSlug) params.set('slug', context.teamSlug)

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(context.idOrName)}/env?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value,
          type: 'sensitive',
          target: ['production', 'preview'],
          comment: 'Synced from /tools/secrets',
        }),
        cache: 'no-store',
      }
    )

    if (response.ok) {
      return {
        status: 'ok',
        message: 'Synced to Vercel preview/production envs',
      }
    }

    let message = `Vercel sync failed with ${response.status}`
    try {
      const data = await response.json()
      const failureMessage = data?.failed?.[0]?.error?.message
      const errorMessage = data?.error?.message
      if (typeof failureMessage === 'string' && failureMessage) message = failureMessage
      else if (typeof errorMessage === 'string' && errorMessage) message = errorMessage
    } catch {
      // Keep the HTTP status fallback message.
    }

    return { status: 'failed', message }
  } catch {
    return {
      status: 'failed',
      message: 'Could not reach the Vercel API',
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const overrides = await listSecretOverrides()
  const vercelEnvKeys = await listVercelEnvKeys()
  const statuses = Object.fromEntries(
    MANAGED_SECRET_FIELDS.map((field) => [
      field.key,
      {
        envSet: vercelEnvKeys ? vercelEnvKeys.has(field.key) : Boolean(process.env[field.key]),
        envStatusSource: vercelEnvKeys ? 'vercel' : 'runtime',
        strategy: field.strategy ?? 'runtime-override',
      },
    ])
  )

  return NextResponse.json({ overrides, statuses })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { key, value } = body as Record<string, unknown>
  if (typeof key !== 'string' || !key || typeof value !== 'string' || !value) {
    return NextResponse.json({ error: 'key and value are required strings' }, { status: 400 })
  }

  if (!ALLOWED_KEY_PATTERN.test(key)) {
    return NextResponse.json(
      { error: 'Invalid key format — use uppercase letters, digits, and underscores' },
      { status: 400 }
    )
  }

  const field = getManagedSecretField(key)
  const strategy: ManagedSecretStrategy = field?.strategy ?? 'runtime-override'

  try {
    const vercelSync = await syncSecretToVercel(key, value)

    if (strategy === 'runtime-override') {
      await setSecretOverride(key, value, session.user.email)
      return NextResponse.json({ success: true, vercelSync, strategy })
    }

    if (vercelSync.status !== 'ok') {
      return NextResponse.json(
        { error: vercelSync.message, vercelSync, strategy },
        { status: vercelSync.status === 'skipped' ? 400 : 502 }
      )
    }

    return NextResponse.json({ success: true, vercelSync, strategy })
  } catch {
    return NextResponse.json({ error: 'Failed to save secret' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) {
    return NextResponse.json({ error: 'key query param is required' }, { status: 400 })
  }

  try {
    await deleteSecretOverride(key)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete secret' }, { status: 500 })
  }
}

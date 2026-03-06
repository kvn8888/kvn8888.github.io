import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
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

async function syncSecretToVercel(key: string, value: string): Promise<VercelSyncResult> {
  const token = await getSecret('VERCEL_API_TOKEN')
  if (!token) {
    return {
      status: 'skipped',
      message: 'VERCEL_API_TOKEN not configured for Vercel sync',
    }
  }

  const idOrName =
    (await getSecret('VERCEL_PROJECT_ID')) ??
    (await getSecret('VERCEL_PROJECT_NAME'))

  if (!idOrName) {
    return {
      status: 'skipped',
      message: 'VERCEL_PROJECT_ID or VERCEL_PROJECT_NAME not configured',
    }
  }

  const teamId = await getSecret('VERCEL_TEAM_ID')
  const teamSlug = await getSecret('VERCEL_TEAM_SLUG')
  const params = new URLSearchParams({ upsert: 'true' })

  if (teamId) params.set('teamId', teamId)
  else if (teamSlug) params.set('slug', teamSlug)

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(idOrName)}/env?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
  return NextResponse.json({ overrides })
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

  try {
    await setSecretOverride(key, value, session.user.email)
    const vercelSync = await syncSecretToVercel(key, value)
    return NextResponse.json({ success: true, vercelSync })
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

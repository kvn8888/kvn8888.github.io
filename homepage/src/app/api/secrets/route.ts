import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import {
  listSecretOverrides,
  setSecretOverride,
  deleteSecretOverride,
} from '@/lib/secrets'

// Allowlist of keys that can be managed via this API.
// Only uppercase env-var-style names are accepted.
const ALLOWED_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/

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
    return NextResponse.json({ success: true })
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

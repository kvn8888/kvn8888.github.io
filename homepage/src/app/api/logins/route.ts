import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAccessGrantKey, normalizeAccessGrantKeys } from '@/lib/accessGrants'
import { getLoginAttempts, addWhitelistEmail } from '@/lib/db'

function parseGrantKeys(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null
  }

  if (!value.every((item) => isAccessGrantKey(item))) {
    return null
  }

  return normalizeAccessGrantKeys(value)
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const attempts = await getLoginAttempts()
  return NextResponse.json({ attempts })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { email, grantKeys } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const parsedGrantKeys = parseGrantKeys(grantKeys)
    if (parsedGrantKeys === null) {
      return NextResponse.json(
        { error: 'grantKeys must be a valid list of access grant keys' },
        { status: 400 }
      )
    }

    const success = await addWhitelistEmail(email, parsedGrantKeys)
    if (!success) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

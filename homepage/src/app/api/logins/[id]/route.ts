import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAccessGrantKey, normalizeAccessGrantKeys } from '@/lib/accessGrants'
import { updateAttemptStatus } from '@/lib/db'

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const { status, grantKeys } = await request.json()
    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json(
        { error: 'Status must be "approved" or "rejected"' },
        { status: 400 }
      )
    }

    const parsedGrantKeys = parseGrantKeys(grantKeys)
    if (parsedGrantKeys === null) {
      return NextResponse.json(
        { error: 'grantKeys must be a valid list of access grant keys' },
        { status: 400 }
      )
    }

    const success = await updateAttemptStatus(id, status, parsedGrantKeys)
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

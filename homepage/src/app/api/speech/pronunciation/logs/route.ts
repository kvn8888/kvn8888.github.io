import { auth } from '@/auth'
import { AxiomQueryError, queryServerEvents } from '@/lib/axiom'
import { NextRequest, NextResponse } from 'next/server'

const ROUTE = '/api/speech/pronunciation'
const MAX_RESULTS = 100

function isOwnerEmail(email: string) {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}

function aplString(value: string) {
  return JSON.stringify(value)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isOwnerEmail(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requestId = req.nextUrl.searchParams.get('requestId')?.trim()
  const event = req.nextUrl.searchParams.get('event')?.trim()
  const level = req.nextUrl.searchParams.get('level')?.trim()
  const startTime = req.nextUrl.searchParams.get('startTime')?.trim() || 'now-24h'
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_RESULTS)
    : 50

  try {
    const query = await queryServerEvents({
      startTime,
      buildApl: (dataset) => {
        const filters = [
          `service == ${aplString('kevinc-homepage')}`,
          `route == ${aplString(ROUTE)}`,
        ]
        if (requestId) filters.push(`requestId == ${aplString(requestId)}`)
        if (event) filters.push(`event == ${aplString(event)}`)
        if (level) filters.push(`level == ${aplString(level)}`)
        return `[${aplString(dataset)}] | where ${filters.join(' and ')} | sort by _time desc | limit ${limit}`
      },
    })
    return NextResponse.json(query)
  } catch (error) {
    const status = error instanceof AxiomQueryError && !error.status ? 503 : 502
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Axiom query failed' },
      { status }
    )
  }
}

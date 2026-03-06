import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = await getSecret('ODDS_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'ODDS_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Lightweight call — /v4/sports returns usage info in headers
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`,
      { cache: 'no-store' }
    )

    const requestsUsed = parseInt(res.headers.get('x-requests-used') || '0', 10)
    const requestsRemaining = parseInt(res.headers.get('x-requests-remaining') || '0', 10)

    return NextResponse.json({
      requestsUsed,
      requestsRemaining,
      requestsLimit: requestsUsed + requestsRemaining,
      dashboardUrl: 'https://the-odds-api.com/account/',
    })
  } catch (error) {
    console.error('Odds API error:', error)
    return NextResponse.json({ error: 'Failed to fetch Odds API usage' }, { status: 500 })
  }
}

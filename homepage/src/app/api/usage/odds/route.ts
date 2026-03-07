import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import {
  collectOddsUsage,
  getUsageCollectorErrorResponse,
  persistUsageSnapshots,
} from '@/lib/usageCollectors'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await collectOddsUsage()

    try {
      await persistUsageSnapshots(result.snapshots)
    } catch {
      // Snapshot failures should not block the live usage response.
    }

    return NextResponse.json(result.payload)
  } catch (error) {
    console.error('Odds API error:', error)
    const response = getUsageCollectorErrorResponse(error, 'Failed to fetch Odds API usage')
    return NextResponse.json(response.body, { status: response.status })
  }
}

import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getMonthlyPeriodKey, listUsageMetricSnapshots } from '@/lib/usageSnapshots'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const periodKey = getMonthlyPeriodKey()
    const snapshots = await listUsageMetricSnapshots(periodKey)

    return NextResponse.json({
      periodKey,
      snapshots,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch usage history', details: String(error) },
      { status: 500 }
    )
  }
}
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import {
  getMonthlyPeriodKey,
  getUtcSnapshotDate,
  getUtcSnapshotDateOffset,
  listUsageMetricSnapshotsInRange,
  type UsageMetricSnapshot,
} from '@/lib/usageSnapshots'

interface ActiveUsageCycle {
  cycleKey: string
  cycleStart: string
  cycleEnd: string | null
  windowSource: UsageMetricSnapshot['windowSource']
}

function getMetricHistoryKey(service: string, metric: string) {
  return `${service}:${metric}`
}

function getActiveUsageCycles(snapshots: UsageMetricSnapshot[], today: string) {
  const snapshotsByMetric = new Map<string, UsageMetricSnapshot[]>()

  for (const snapshot of snapshots) {
    const key = getMetricHistoryKey(snapshot.service, snapshot.metric)
    const existing = snapshotsByMetric.get(key) ?? []
    existing.push(snapshot)
    snapshotsByMetric.set(key, existing)
  }

  return Object.fromEntries(
    [...snapshotsByMetric.entries()].map(([key, metricSnapshots]) => {
      const activeSnapshot =
        [...metricSnapshots]
          .reverse()
          .find(
            (snapshot) =>
              snapshot.cycleStart <= today &&
              (snapshot.cycleEnd === null || snapshot.cycleEnd >= today),
          ) ?? metricSnapshots[metricSnapshots.length - 1]

      const activeCycle: ActiveUsageCycle = {
        cycleKey: activeSnapshot.cycleKey,
        cycleStart: activeSnapshot.cycleStart,
        cycleEnd: activeSnapshot.cycleEnd,
        windowSource: activeSnapshot.windowSource,
      }

      return [key, activeCycle]
    }),
  )
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const requestedDays = Number.parseInt(url.searchParams.get('days') || '120', 10)
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 30), 366)
      : 120

    const rangeEnd = getUtcSnapshotDate()
    const rangeStart = getUtcSnapshotDateOffset(-(days - 1))
    const periodKey = getMonthlyPeriodKey()
    const snapshots = await listUsageMetricSnapshotsInRange({
      startDate: rangeStart,
      endDate: rangeEnd,
    })
    const activeCycles = getActiveUsageCycles(snapshots, rangeEnd)

    return NextResponse.json({
      periodKey,
      rangeStart,
      rangeEnd,
      days,
      activeCycles,
      snapshots,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch usage history', details: String(error) },
      { status: 500 }
    )
  }
}
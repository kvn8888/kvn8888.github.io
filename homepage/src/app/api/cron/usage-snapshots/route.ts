import { NextResponse } from 'next/server'
import { persistUsageSnapshots, usageSnapshotCollectors } from '@/lib/usageCollectors'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request) {
  const configured = process.env.CRON_SECRET || ''
  if (!configured) {
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = request.headers.get('authorization') || ''
  if (authHeader === `Bearer ${configured}`) {
    return true
  }

  try {
    const url = new URL(request.url)
    return url.searchParams.get('secret') === configured
  } catch {
    return false
  }
}

async function runCollectors() {
  return Promise.all(
    usageSnapshotCollectors.map(async (collector) => {
      const startedAt = Date.now()

      try {
        const result = await collector.collect()
        await persistUsageSnapshots(result.snapshots)

        return {
          collector: collector.id,
          status: 'ok' as const,
          snapshotsWritten: result.snapshots.length,
          durationMs: Date.now() - startedAt,
          metrics: result.snapshots.map((snapshot) => `${snapshot.service}:${snapshot.metric}`),
        }
      } catch (error) {
        return {
          collector: collector.id,
          status: 'error' as const,
          snapshotsWritten: 0,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
}

async function handleCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results = await runCollectors()
  const failures = results.filter((result) => result.status === 'error')

  return NextResponse.json(
    {
      ok: failures.length === 0,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      collectors: results,
    },
    { status: failures.length === 0 ? 200 : 500 },
  )
}

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}
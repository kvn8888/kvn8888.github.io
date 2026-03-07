import { auth } from "@/auth"
import { NextResponse } from "next/server"
import {
  collectTursoUsage,
  getUsageCollectorErrorResponse,
  persistUsageSnapshots,
} from '@/lib/usageCollectors'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await collectTursoUsage()

    try {
      await persistUsageSnapshots(result.snapshots)
    } catch {
      // Snapshot failures should not block the live usage response.
    }

    return NextResponse.json(result.payload)
  } catch (err) {
    console.error('Failed to fetch Turso usage', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userEmail: session.user.email?.toLowerCase() || 'unknown',
    })
    const response = getUsageCollectorErrorResponse(err, 'Failed to fetch Turso usage')
    return NextResponse.json(response.body, { status: response.status })
  }
}

import { auth } from "@/auth"
import { NextResponse } from "next/server"
import {
  collectTavilyUsage,
  getUsageCollectorErrorResponse,
  persistUsageSnapshots,
} from '@/lib/usageCollectors'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await collectTavilyUsage()

    try {
      await persistUsageSnapshots(result.snapshots)
    } catch {
      // Snapshot failures should not block the live usage response.
    }

    return NextResponse.json(result.payload)
  } catch (error) {
    const response = getUsageCollectorErrorResponse(error, 'Failed to fetch Tavily usage')
    return NextResponse.json(response.body, { status: response.status })
  }
}

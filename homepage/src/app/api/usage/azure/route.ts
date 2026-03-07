import { auth } from "@/auth"
import { NextResponse } from "next/server"
import {
  collectAzureUsage,
  getUsageCollectorErrorResponse,
  persistUsageSnapshots,
} from '@/lib/usageCollectors'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await collectAzureUsage()

    try {
      await persistUsageSnapshots(result.snapshots)
    } catch {
      // Snapshot failures should not block the live usage response.
    }

    return NextResponse.json(result.payload)
  } catch (err) {
    const response = getUsageCollectorErrorResponse(err, 'Failed to fetch Azure data')
    return NextResponse.json(response.body, { status: response.status })
  }
}

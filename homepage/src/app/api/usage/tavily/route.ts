import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { recordUsageMetricSnapshot } from "@/lib/usageSnapshots"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = await getSecret("TAVILY_API_KEY")
  if (!apiKey) {
    return NextResponse.json({ error: "TAVILY_API_KEY not configured" }, { status: 500 })
  }

  try {
    const res = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Tavily API error" }, { status: res.status })
    }

    const data = await res.json()

    try {
      await recordUsageMetricSnapshot({
        service: "tavily",
        metric: "plan_usage",
        totalValue: Number(data?.account?.plan_usage ?? 0),
      })
    } catch {
      // Snapshot failures should not block the live usage response.
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch Tavily usage" }, { status: 500 })
  }
}

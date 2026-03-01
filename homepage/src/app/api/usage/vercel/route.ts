import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = process.env.VERCEL_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: "VERCEL_API_TOKEN not configured" }, { status: 500 })
  }

  try {
    // Fetch current billing period charges
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const to = now.toISOString()

    const res = await fetch(
      `https://api.vercel.com/v1/billing/charges?from=${from}&to=${to}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 }, // cache for 5 min
      }
    )

    if (!res.ok) {
      // For hobby plans, billing API may return empty or error
      // Fall back to showing known limits
      return NextResponse.json({
        plan: "hobby",
        limits: {
          edge_requests: { limit: 1_000_000, unit: "requests" },
          fast_data_transfer: { limit: 100, unit: "GB" },
          function_invocations: { limit: 1_000_000, unit: "invocations" },
          function_duration: { limit: 100, unit: "GB-hours" },
          build_execution: { limit: 6_000, unit: "minutes" },
          image_optimization: { limit: 1_000, unit: "images" },
        },
        note: "Usage data unavailable for Hobby plan via API. Check dashboard.",
        dashboardUrl: "https://vercel.com/kvn8888s-projects/~/usage",
      })
    }

    const data = await res.text()
    // FOCUS format returns JSONL (newline-delimited JSON)
    const charges = data
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line))

    return NextResponse.json({ plan: "hobby", charges, dashboardUrl: "https://vercel.com/kvn8888s-projects/~/usage" })
  } catch {
    return NextResponse.json({
      plan: "hobby",
      limits: {
        edge_requests: { limit: 1_000_000, unit: "requests" },
        fast_data_transfer: { limit: 100, unit: "GB" },
        function_invocations: { limit: 1_000_000, unit: "invocations" },
        function_duration: { limit: 100, unit: "GB-hours" },
        build_execution: { limit: 6_000, unit: "minutes" },
        image_optimization: { limit: 1_000, unit: "images" },
      },
      note: "Usage data unavailable. Check dashboard.",
      dashboardUrl: "https://vercel.com/kvn8888s-projects/~/usage",
    })
  }
}

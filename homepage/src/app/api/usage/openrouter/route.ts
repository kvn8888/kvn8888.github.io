import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 })
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ error: "OpenRouter API error" }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({
      total_credits: data.data.total_credits,
      total_usage: data.data.total_usage,
      remaining: data.data.total_credits - data.data.total_usage,
      dashboardUrl: "https://openrouter.ai/activity",
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch OpenRouter usage" }, { status: 500 })
  }
}

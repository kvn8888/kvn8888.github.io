import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.TAVILY_API_KEY
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
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch Tavily usage" }, { status: 500 })
  }
}

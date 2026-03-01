import { auth } from "@/auth"
import { NextResponse } from "next/server"

interface RenderService {
  id: string
  name: string
  type: string
  serviceDetails?: {
    url?: string
    plan?: string
    region?: string
  }
  suspended?: string
  suspenders?: string[]
  createdAt: string
  updatedAt: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.RENDER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "RENDER_API_KEY not configured" }, { status: 500 })
  }

  try {
    // Fetch services list
    const res = await fetch("https://api.render.com/v1/services?limit=20", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Render API error" }, { status: res.status })
    }

    const data = await res.json()

    const services = data.map((item: { service: RenderService }) => ({
      id: item.service.id,
      name: item.service.name,
      type: item.service.type,
      plan: item.service.serviceDetails?.plan || "unknown",
      url: item.service.serviceDetails?.url,
      region: item.service.serviceDetails?.region,
      suspended: item.service.suspended,
      updatedAt: item.service.updatedAt,
    }))

    return NextResponse.json({
      services,
      limits: {
        instance_hours: { limit: 750, unit: "hours/mo" },
        outbound_bandwidth: { limit: 100, unit: "GB/mo" },
        build_minutes: { limit: 500, unit: "min/mo" },
      },
      dashboardUrl: "https://dashboard.render.com/",
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch Render data" }, { status: 500 })
  }
}

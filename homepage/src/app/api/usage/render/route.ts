import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

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

interface BandwidthPoint {
  timestamp: string
  value: number
}

interface BandwidthSeries {
  labels: Array<{ field: string; value: string }>
  values: BandwidthPoint[]
  unit: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = await getSecret("RENDER_API_KEY")
  if (!apiKey) {
    return NextResponse.json({ error: "RENDER_API_KEY not configured" }, { status: 500 })
  }

  try {
    // Fetch services list
    const res = await fetch("https://api.render.com/v1/services?limit=20", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
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

    // Fetch bandwidth metrics for current calendar month via the real metrics API.
    // Endpoint: GET /v1/metrics/bandwidth
    // Returns hourly GB time-series per service; summing gives month-to-date total.
    const serviceIds: string[] = services.map((s: { id: string }) => s.id)
    let totalBandwidthGB: number | null = null
    let bandwidthByService: Record<string, number> | null = null
    let bandwidthError: string | null = null

    if (serviceIds.length > 0) {
      try {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const params = new URLSearchParams({
          startTime: Math.floor(monthStart.getTime() / 1000).toString(),
          endTime: Math.floor(now.getTime() / 1000).toString(),
        })
        serviceIds.forEach((id) => params.append("resource", id))

        const bwRes = await fetch(
          `https://api.render.com/v1/metrics/bandwidth?${params}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
          }
        )

        if (bwRes.ok) {
          const bwData: BandwidthSeries[] = await bwRes.json()
          bandwidthByService = {}
          for (const series of bwData) {
            const serviceLabel = series.labels.find((l) => l.field === "service")
            if (serviceLabel) {
              const seriesTotal = series.values.reduce((sum, v) => sum + v.value, 0)
              bandwidthByService[serviceLabel.value] =
                (bandwidthByService[serviceLabel.value] ?? 0) + seriesTotal
            }
          }
          totalBandwidthGB =
            Math.round(
              Object.values(bandwidthByService).reduce((a, b) => a + b, 0) * 100
            ) / 100
        } else {
          bandwidthError = `metrics API returned ${bwRes.status}`
        }
      } catch {
        bandwidthError = "metrics API unreachable"
      }
    }

    return NextResponse.json({
      services,
      bandwidth: {
        totalGB: totalBandwidthGB,
        byService: bandwidthByService,
        unit: "GB",
        period: "current month",
        ...(bandwidthError ? { error: bandwidthError } : {}),
      },
      // Render API does not expose subscription plan, build-minute usage, or
      // invoice data — those are only visible in the Dashboard Billing page.
      limits: {
        outbound_bandwidth: {
          limit: 100,
          unit: "GB/mo",
          note: "100 GB included; overage billed at $0.10/GB",
        },
        build_minutes: {
          limit: null,
          unit: "min/mo",
          note: "Usage only visible in Dashboard > Billing",
        },
      },
      dashboardUrl: "https://dashboard.render.com/billing",
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch Render data" }, { status: 500 })
  }
}

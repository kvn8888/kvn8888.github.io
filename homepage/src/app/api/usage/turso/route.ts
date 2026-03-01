import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiToken = process.env.TURSO_API_TOKEN
  const orgSlug = process.env.TURSO_ORG_SLUG
  if (!apiToken || !orgSlug) {
    return NextResponse.json({ error: "TURSO_API_TOKEN or TURSO_ORG_SLUG not configured" }, { status: 500 })
  }

  try {
    const res = await fetch(
      `https://api.turso.tech/v1/organizations/${orgSlug}/usage`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        cache: "no-store",
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: "Turso API error", details: errText }, { status: res.status })
    }

    const data = await res.json()
    const usage = data.organization?.usage || {}
    const databases = data.organization?.databases || []

    // Turso Starter (free) plan limits
    const limits = {
      rows_read: 1_000_000_000,
      rows_written: 25_000_000,
      storage_bytes: 9_000_000_000,
      databases: 500,
      groups: 6,
      locations: 3,
    }

    return NextResponse.json({
      usage: {
        rows_read: usage.rows_read || 0,
        rows_written: usage.rows_written || 0,
        storage_bytes: usage.storage_bytes || 0,
        databases: usage.databases || databases.length,
        groups: usage.groups || 0,
        locations: usage.locations || 0,
        bytes_synced: usage.bytes_synced || 0,
      },
      limits,
      databases: databases.map((db: { uuid: string; total: { rows_read: number; rows_written: number; storage_bytes: number } }) => ({
        uuid: db.uuid,
        rows_read: db.total?.rows_read || 0,
        rows_written: db.total?.rows_written || 0,
        storage_bytes: db.total?.storage_bytes || 0,
      })),
      dashboardUrl: "https://turso.tech/app",
    })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch Turso usage", details: String(err) },
      { status: 500 }
    )
  }
}

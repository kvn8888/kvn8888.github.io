import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

// ── Student plan allocation constants ──────────────────────────────────────────
// These are hardcoded because GitHub doesn't return plan limits via the API.
// The GitHub Student Developer Pack includes these Codespaces allowances per month:
//   180 core hours  (= 180 × 60 = 10,800 minutes on a 1-core machine)
//   20 GB storage   (for prebuilds and inactive codespace disk images)
const INCLUDED_MINUTES = 10800 // 180 core hours × 60 min/hr
const INCLUDED_STORAGE_GB = 20

// Shape of a single line item in the billing/usage response
interface BillingLineItem {
  date?: string
  product?: string
  sku?: string
  quantity?: number
  unitType?: string
  pricePerUnit?: number
  grossAmount?: number
  discountAmount?: number
  netAmount?: number
  organizationName?: string
  repositoryName?: string
}

// Shape of a single entry in the premium_request/usage response.
// The exact schema isn't fully public, so we accept loose types and default gracefully.
interface PremiumRequestItem {
  model?: string
  sku?: string
  quantity?: number
  totalAmount?: number
  grossAmount?: number
  netAmount?: number
}

export async function GET() {
  // Verify the user is signed in before touching any secrets or external APIs
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch both secrets up front so we fail fast if they're missing
  const pat = await getSecret("GITHUB_PAT")
  const username = await getSecret("GITHUB_USERNAME")

  if (!pat || !username) {
    return NextResponse.json(
      { error: "GITHUB_PAT or GITHUB_USERNAME not configured" },
      { status: 500 },
    )
  }

  // Headers required by every GitHub REST API call
  const headers = {
    Authorization: `Bearer ${pat}`,
    "X-GitHub-Api-Version": "2022-11-28",
    Accept: "application/vnd.github+json",
  }

  // ── Fetch both endpoints concurrently ────────────────────────────────────────
  // Using Promise.allSettled means if one endpoint fails, we still return the other.
  const [billingResult, copilotResult] = await Promise.allSettled([
    fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/usage`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`,
      { headers, cache: "no-store" },
    ),
  ])

  // ── Codespaces usage ──────────────────────────────────────────────────────────
  // The billing/usage endpoint returns line items for ALL GitHub products combined.
  // We filter to only "Codespaces" items, then separate compute (minutes) from storage (GB).
  let codespaces: {
    totalMinutes: number
    storageGB: number
    skuBreakdown: Record<string, number>
    includedMinutes: number
    includedStorageGB: number
  } | null = null

  if (billingResult.status === "fulfilled" && billingResult.value.ok) {
    try {
      const data = await billingResult.value.json()

      // The response wraps items under `usageItems`; fall back to empty array if absent.
      const lineItems: BillingLineItem[] = Array.isArray(data)
        ? data
        : (data.usageItems ?? [])

      // Accumulate compute minutes grouped by SKU (e.g. "Codespaces Linux 2 core")
      // so the card can show a breakdown of which machine type was used.
      const minutesBySku: Record<string, number> = {}
      let storageGB = 0

      for (const item of lineItems) {
        if (item.product !== "Codespaces") continue

        if (item.unitType === "minutes") {
          const sku = item.sku ?? "Unknown"
          minutesBySku[sku] = (minutesBySku[sku] ?? 0) + (item.quantity ?? 0)
        } else if (item.unitType === "GB" || item.unitType === "GB-month") {
          // Codespaces storage is reported in GB (or GB-month on some plans)
          storageGB += item.quantity ?? 0
        }
      }

      const totalMinutes = Object.values(minutesBySku).reduce(
        (sum, m) => sum + m,
        0,
      )

      codespaces = {
        totalMinutes,
        storageGB,
        skuBreakdown: minutesBySku,
        includedMinutes: INCLUDED_MINUTES,
        includedStorageGB: INCLUDED_STORAGE_GB,
      }
    } catch {
      // Parsing failed — leave codespaces as null so the card shows graceful fallback
    }
  }

  // ── Copilot Premium Requests ──────────────────────────────────────────────────
  // This endpoint returns per-model premium request counts for the current billing cycle.
  // "Premium requests" are interactions with expensive models (e.g. Claude, o1) that
  // consume from a monthly allowance separate from standard Copilot completions.
  let copilot: {
    items: { model: string; sku: string; quantity: number; cost: number }[]
  } | null = null

  if (copilotResult.status === "fulfilled" && copilotResult.value.ok) {
    try {
      const data = await copilotResult.value.json()

      // The endpoint may return a bare array or wrap items under `usageItems`
      const rawItems: PremiumRequestItem[] = Array.isArray(data)
        ? data
        : (data.usageItems ?? data.items ?? [])

      copilot = {
        items: rawItems.map((item) => ({
          model: item.model ?? item.sku ?? "Unknown",
          sku: item.sku ?? "",
          quantity: item.quantity ?? 0,
          // Prefer netAmount (what the user actually pays), fall back to gross
          cost: item.netAmount ?? item.totalAmount ?? item.grossAmount ?? 0,
        })),
      }
    } catch {
      // Parsing failed — leave copilot as null
    }
  }

  return NextResponse.json({
    codespaces,
    copilot,
    dashboardUrl: "https://github.com/settings/billing/summary",
  })
}

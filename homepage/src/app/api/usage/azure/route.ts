import { auth } from "@/auth"
import { NextResponse } from "next/server"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let cachedAzurePayload: Record<string, unknown> | null = null
let cachedAzureAt = 0

function rememberAzurePayload(payload: Record<string, unknown>) {
  cachedAzurePayload = payload
  cachedAzureAt = Date.now()
}

function staleAzurePayload() {
  if (!cachedAzurePayload) return null
  return {
    ...cachedAzurePayload,
    stale: true,
    warning: "Azure API throttled; showing cached data",
    cachedAt: new Date(cachedAzureAt).toISOString(),
  }
}

async function fetchAzureWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 4
): Promise<Response> {
  let lastRes: Response | null = null
  let lastErr: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      lastRes = res

      if (res.status !== 429) return res

      const retryAfter = Number(res.headers.get("retry-after"))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * (2 ** (attempt - 1))
      await sleep(waitMs)
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        await sleep(500 * (2 ** (attempt - 1)))
      }
    }
  }

  if (lastRes) return lastRes
  throw lastErr ?? new Error("Azure request failed")
}

async function getAzureAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://management.azure.com/.default",
      }),
    }
  )

  const data = await res.json()
  if (!data.access_token) throw new Error(`Azure auth failed: ${data.error_description || data.error}`)
  return data.access_token
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID
  const billingAccountId = process.env.AZURE_BILLING_ACCOUNT_ID
  const billingProfileId = process.env.AZURE_BILLING_PROFILE_ID

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.json({ error: "Azure credentials not configured" }, { status: 500 })
  }

  try {
    const token = await getAzureAccessToken(tenantId, clientId, clientSecret)
    const headers = { Authorization: `Bearer ${token}` }

    // Try Credits API first (works for MCA/Student accounts with billing profile)
    if (billingAccountId && billingProfileId) {
      const creditsRes = await fetchAzureWithRetry(
        `https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${billingAccountId}/billingProfiles/${billingProfileId}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2024-08-01`,
        { headers, cache: "no-store" }
      )

      if (creditsRes.ok) {
        const credits = await creditsRes.json()
        const props = credits.properties
        const payload = {
          type: "credits",
          currentBalance: props?.balanceSummary?.currentBalance?.value ?? null,
          estimatedBalance: props?.balanceSummary?.estimatedBalance?.value ?? null,
          currency: props?.creditCurrency || props?.billingCurrency || "USD",
          expiredCredit: props?.expiredCredit?.value ?? 0,
          pendingCharges: props?.pendingEligibleCharges?.value ?? 0,
          dashboardUrl: "https://portal.azure.com/#view/Microsoft_Azure_Billing/BillingMenuBlade/~/Credits",
        }
        rememberAzurePayload(payload)
        return NextResponse.json(payload)
      }

      if (creditsRes.status === 429) {
        const stale = staleAzurePayload()
        if (stale) return NextResponse.json(stale)
      }
    }

    // Fallback: use Cost Management query to get total spend this month
    if (subscriptionId) {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0]
      const today = now.toISOString().split("T")[0]

      const costRes = await fetchAzureWithRetry(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ActualCost",
            timeframe: "Custom",
            timePeriod: { from: startOfMonth, to: today },
            dataset: {
              granularity: "None",
              aggregation: {
                totalCost: { name: "Cost", function: "Sum" },
              },
            },
          }),
          cache: "no-store",
        }
      )

      if (costRes.ok) {
        const costData = await costRes.json()
        const rows = costData.properties?.rows || []
        const totalCost = rows.length > 0 ? rows[0][0] : 0
        const currency = rows.length > 0 ? rows[0][1] : "USD"

        // Azure for Students gives $100 credit
        const studentCredit = 100

        const payload = {
          type: "cost_query",
          totalSpend: totalCost,
          currency,
          studentCredit,
          remaining: studentCredit - totalCost,
          period: `${startOfMonth} to ${today}`,
          dashboardUrl: `https://portal.azure.com/#view/Microsoft_Azure_CostManagement/Menu/~/costanalysis/openedBy/AzurePortal/scope/subscriptions%2F${subscriptionId}`,
        }
        rememberAzurePayload(payload)
        return NextResponse.json(payload)
      }

      if (costRes.status === 429) {
        const stale = staleAzurePayload()
        if (stale) return NextResponse.json(stale)
      }

      const errText = await costRes.text()
      return NextResponse.json({
        error: "Azure Cost Management API error",
        details: errText,
        status: costRes.status,
      }, { status: costRes.status })
    }

    return NextResponse.json({
      error: "No AZURE_SUBSCRIPTION_ID or AZURE_BILLING_ACCOUNT_ID configured",
    }, { status: 500 })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch Azure data", details: String(err) },
      { status: 500 }
    )
  }
}

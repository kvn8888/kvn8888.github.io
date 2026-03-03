import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { SignJWT, importPKCS8 } from "jose"

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

async function runBigQueryQuery(
  token: string,
  projectId: string,
  query: string
): Promise<{ rows?: Array<{ f: Array<{ v: string | null }> }> }> {
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
      }),
      cache: "no-store",
    }
  )

  if (!res.ok) {
    throw new Error(`BigQuery API error: ${res.status}`)
  }

  return res.json()
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(sa.private_key, "RS256")

  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-billing.readonly https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(key)

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error("Failed to get GCP access token")
  return data.access_token
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const saKeyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!saKeyBase64) {
    return NextResponse.json({ error: "GCP_SERVICE_ACCOUNT_KEY not configured" }, { status: 500 })
  }

  try {
    const sa: ServiceAccountKey = JSON.parse(
      Buffer.from(saKeyBase64, "base64").toString("utf-8")
    )
    const token = await getAccessToken(sa)

    // List billing accounts
    const billingRes = await fetch(
      "https://cloudbilling.googleapis.com/v1/billingAccounts",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    )

    if (!billingRes.ok) {
      const errText = await billingRes.text()
      return NextResponse.json({ error: "GCP Billing API error", details: errText }, { status: billingRes.status })
    }

    const billingData = await billingRes.json()
    const accounts = (billingData.billingAccounts || []).map(
      (a: { name: string; displayName: string; open: boolean; masterBillingAccount?: string }) => ({
        id: a.name,
        displayName: a.displayName,
        open: a.open,
        master: a.masterBillingAccount,
      })
    )

    // List projects for each billing account
    const accountsWithProjects = await Promise.all(
      accounts.map(async (account: { id: string; displayName: string; open: boolean }) => {
        const projRes = await fetch(
          `https://cloudbilling.googleapis.com/v1/${account.id}/projects`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        )
        const projData = projRes.ok ? await projRes.json() : {}
        return {
          ...account,
          projects: (projData.projectBillingInfo || []).map(
            (p: { projectId: string; billingEnabled: boolean }) => ({
              id: p.projectId,
              billingEnabled: p.billingEnabled,
            })
          ),
        }
      })
    )

    let costSummary: {
      totalCost: number
      currency: string
      projectId: string
      dataset: string
      table: string
      periodStart: string
    } | null = null
    let costStatus: "ok" | "missing_dataset_or_table" | "unavailable" = "unavailable"

    const exportProject = process.env.GCP_BILLING_EXPORT_PROJECT_ID || sa.project_id
    const exportDataset = process.env.GCP_BILLING_EXPORT_DATASET || "billing_export"

    try {
      const tableLookupQuery = `
        SELECT table_name
        FROM \`${exportProject}.${exportDataset}.INFORMATION_SCHEMA.TABLES\`
        WHERE table_name LIKE 'gcp_billing_export_v1_%'
        ORDER BY creation_time DESC
        LIMIT 1
      `
      const tableLookup = await runBigQueryQuery(token, exportProject, tableLookupQuery)
      const tableName = tableLookup.rows?.[0]?.f?.[0]?.v || null

      if (tableName) {
        const costQuery = `
          SELECT
            IFNULL(SUM(cost), 0) AS total_cost,
            IFNULL(ANY_VALUE(currency), 'USD') AS currency
          FROM \`${exportProject}.${exportDataset}.${tableName}\`
          WHERE usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
        `
        const costData = await runBigQueryQuery(token, exportProject, costQuery)
        const totalCost = Number(costData.rows?.[0]?.f?.[0]?.v || 0)
        const currency = String(costData.rows?.[0]?.f?.[1]?.v || "USD")

        costSummary = {
          totalCost,
          currency,
          projectId: exportProject,
          dataset: exportDataset,
          table: String(tableName),
          periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString()
            .split("T")[0],
        }
        costStatus = "ok"
      } else {
        costStatus = "missing_dataset_or_table"
      }
    } catch {
      costStatus = "missing_dataset_or_table"
    }

    return NextResponse.json({
      accounts: accountsWithProjects,
      projectId: sa.project_id,
      cost: costSummary,
      costStatus,
      dashboardUrl: "https://console.cloud.google.com/billing",
    })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch GCP billing", details: String(err) },
      { status: 500 }
    )
  }
}

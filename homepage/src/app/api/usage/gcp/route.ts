import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { SignJWT, importPKCS8 } from "jose"

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(sa.private_key, "RS256")

  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-billing.readonly",
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

    return NextResponse.json({
      accounts: accountsWithProjects,
      projectId: sa.project_id,
      dashboardUrl: "https://console.cloud.google.com/billing",
    })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch GCP billing", details: String(err) },
      { status: 500 }
    )
  }
}

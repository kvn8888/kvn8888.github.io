import { SignJWT, importPKCS8 } from 'jose'
import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

async function runBigQueryQuery(token: string, projectId: string, query: string): Promise<{ rows?: Array<{ f: Array<{ v: string | null }> }> }> {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      useLegacySql: false,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new UsageCollectorError(response.status, 'BigQuery API error')
  }

  return response.json()
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(serviceAccount.private_key, 'RS256')

  const jwt = await new SignJWT({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-billing.readonly https://www.googleapis.com/auth/bigquery.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await response.json()
  if (!data.access_token) {
    throw new UsageCollectorError(500, 'Failed to get GCP access token')
  }

  return data.access_token
}

export async function collectGcpUsage(): Promise<UsageCollectionResult<{
  accounts: Array<{
    id: string
    displayName: string
    open: boolean
    master?: string
    projects: Array<{ id: string; billingEnabled: boolean }>
  }>
  projectId: string
  cost: {
    totalCost: number
    currency: string
    projectId: string
    dataset: string
    table: string
    periodStart: string
  } | null
  costStatus: 'ok' | 'missing_dataset_or_table' | 'unavailable'
  dashboardUrl: string
}>> {
  const saKeyBase64 = await getSecret('GCP_SERVICE_ACCOUNT_KEY')
  if (!saKeyBase64) {
    throw new UsageCollectorError(500, 'GCP_SERVICE_ACCOUNT_KEY not configured')
  }

  try {
    const serviceAccount: ServiceAccountKey = JSON.parse(Buffer.from(saKeyBase64, 'base64').toString('utf-8'))
    const token = await getAccessToken(serviceAccount)

    const billingResponse = await fetch('https://cloudbilling.googleapis.com/v1/billingAccounts', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!billingResponse.ok) {
      const details = await billingResponse.text()
      throw new UsageCollectorError(billingResponse.status, 'GCP Billing API error', details)
    }

    const billingData = await billingResponse.json()
    const accounts = (billingData.billingAccounts || []).map(
      (account: { name: string; displayName: string; open: boolean; masterBillingAccount?: string }) => ({
        id: account.name,
        displayName: account.displayName,
        open: account.open,
        master: account.masterBillingAccount,
      }),
    )

    const accountsWithProjects = await Promise.all(
      accounts.map(async (account: { id: string; displayName: string; open: boolean; master?: string }) => {
        const projectsResponse = await fetch(`https://cloudbilling.googleapis.com/v1/${account.id}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const projectsData = projectsResponse.ok ? await projectsResponse.json() : {}
        return {
          ...account,
          projects: (projectsData.projectBillingInfo || []).map(
            (project: { projectId: string; billingEnabled: boolean }) => ({
              id: project.projectId,
              billingEnabled: project.billingEnabled,
            }),
          ),
        }
      }),
    )

    let costSummary: {
      totalCost: number
      currency: string
      projectId: string
      dataset: string
      table: string
      periodStart: string
    } | null = null
    let costStatus: 'ok' | 'missing_dataset_or_table' | 'unavailable' = 'unavailable'

    const exportProject = (await getSecret('GCP_BILLING_EXPORT_PROJECT_ID')) || serviceAccount.project_id
    const exportDataset = (await getSecret('GCP_BILLING_EXPORT_DATASET')) || 'billing_export'

    try {
      const tableLookup = await runBigQueryQuery(
        token,
        exportProject,
        `
          SELECT table_name
          FROM \`${exportProject}.${exportDataset}.INFORMATION_SCHEMA.TABLES\`
          WHERE table_name LIKE 'gcp_billing_export_v1_%'
          ORDER BY creation_time DESC
          LIMIT 1
        `,
      )

      const tableName = tableLookup.rows?.[0]?.f?.[0]?.v || null
      if (tableName) {
        const costData = await runBigQueryQuery(
          token,
          exportProject,
          `
            SELECT
              IFNULL(SUM(cost), 0) AS total_cost,
              IFNULL(ANY_VALUE(currency), 'USD') AS currency
            FROM \`${exportProject}.${exportDataset}.${tableName}\`
            WHERE usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
          `,
        )

        const totalCost = Number(costData.rows?.[0]?.f?.[0]?.v || 0)
        const currency = String(costData.rows?.[0]?.f?.[1]?.v || 'USD')
        costSummary = {
          totalCost,
          currency,
          projectId: exportProject,
          dataset: exportDataset,
          table: String(tableName),
          periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        }
        costStatus = 'ok'
      } else {
        costStatus = 'missing_dataset_or_table'
      }
    } catch {
      costStatus = 'missing_dataset_or_table'
    }

    return {
      payload: {
        accounts: accountsWithProjects,
        projectId: serviceAccount.project_id,
        cost: costSummary,
        costStatus,
        dashboardUrl: 'https://console.cloud.google.com/billing',
      },
      snapshots: costSummary
        ? [
            {
              service: 'gcp',
              metric: 'month_spend_usd',
              totalValue: costSummary.totalCost,
            },
          ]
        : [],
    }
  } catch (error) {
    if (error instanceof UsageCollectorError) throw error
    throw new UsageCollectorError(500, 'Failed to fetch GCP billing', String(error))
  }
}
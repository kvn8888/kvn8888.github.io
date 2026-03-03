import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

function loadEnv(path) {
  const raw = fs.readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx === -1) continue
    const key = t.slice(0, idx).trim()
    let val = t.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = process.env[key] || val
  }
}

function ok(msg) { console.log(`PASS: ${msg}`) }
function fail(msg) { console.log(`FAIL: ${msg}`) }
function info(msg) { console.log(`INFO: ${msg}`) }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, init, maxAttempts = 4) {
  let lastRes = null
  let lastErr = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      lastRes = res
      if (res.status !== 429) return res

      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * (2 ** (attempt - 1))
      info(`Received HTTP 429. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${maxAttempts})`)
      await sleep(waitMs)
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        await sleep(500 * (2 ** (attempt - 1)))
      }
    }
  }

  if (lastRes) return lastRes
  throw lastErr || new Error('network_error')
}

try {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const envPath = path.resolve(__dirname, '..', '.env.local')
  loadEnv(envPath)
} catch {
  console.log('FAIL: .env.local not found in homepage/')
  process.exit(1)
}

async function testS3() {
  const region = process.env.AWS_REGION
  const bucket = process.env.RESUME_S3_BUCKET
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    fail('S3 check skipped (missing AWS_REGION/RESUME_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)')
    return
  }

  try {
    let S3Client, HeadBucketCommand
    try {
      const awsSdk = await import('@aws-sdk/client-s3')
      S3Client = awsSdk.S3Client
      HeadBucketCommand = awsSdk.HeadBucketCommand
    } catch {
      fail('S3 check skipped (missing package @aws-sdk/client-s3). Run: npm install')
      return
    }

    const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    ok(`S3 bucket access confirmed for ${bucket}`)
  } catch (e) {
    fail(`S3 bucket access failed: ${e?.name || 'UnknownError'}`)
    if (e?.name === 'EndpointError') {
      info('Check AWS_REGION and RESUME_S3_BUCKET values (bucket name only, no https:// or s3://).')
    }
    if (e?.message) {
      info(`S3 error details: ${String(e.message).slice(0, 160)}`)
    }
  }
}

async function getGcpToken(sa) {
  let SignJWT, importPKCS8
  try {
    const jose = await import('jose')
    SignJWT = jose.SignJWT
    importPKCS8 = jose.importPKCS8
  } catch {
    throw new Error('missing_jose_package')
  }

  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(sa.private_key, 'RS256')
  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-billing.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error || 'no_access_token')
  return data.access_token
}

async function testGcpBilling() {
  const saKeyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!saKeyBase64) {
    fail('GCP billing check skipped (missing GCP_SERVICE_ACCOUNT_KEY)')
    return
  }

  try {
    const sa = JSON.parse(Buffer.from(saKeyBase64, 'base64').toString('utf8'))
    const token = await getGcpToken(sa)
    const res = await fetch('https://cloudbilling.googleapis.com/v1/billingAccounts', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const t = await res.text()
      fail(`GCP billing API failed: HTTP ${res.status}`)
      info(`GCP response snippet: ${t.slice(0, 150).replace(/\s+/g, ' ')}`)
      return
    }

    const data = await res.json()
    const count = Array.isArray(data.billingAccounts) ? data.billingAccounts.length : 0
    ok(`GCP billing API access confirmed (${count} billing account(s) visible)`)
  } catch (e) {
    if (e?.message === 'missing_jose_package') {
      fail('GCP billing check skipped (missing package jose). Run: npm install')
      return
    }
    fail(`GCP billing check failed: ${e?.message || 'UnknownError'}`)
  }
}

async function getAzureToken() {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) return null

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://management.azure.com/.default',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error_description || data.error || 'azure_auth_failed')
  return data.access_token
}

async function testAzureBilling() {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    fail('Azure billing check skipped (missing AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET)')
    return
  }

  try {
    const token = await getAzureToken()
    const headers = { Authorization: `Bearer ${token}` }

    const billingAccountId = process.env.AZURE_BILLING_ACCOUNT_ID
    const billingProfileId = process.env.AZURE_BILLING_PROFILE_ID
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID

    if (billingAccountId && billingProfileId) {
      const creditsRes = await fetchWithRetry(
        `https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${billingAccountId}/billingProfiles/${billingProfileId}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2024-08-01`,
        { headers }
      )

      if (creditsRes.ok) {
        ok('Azure billing credits API access confirmed (account-level)')
        return
      }

      info(`Azure credits API returned HTTP ${creditsRes.status}; trying subscription cost API fallback`)
    }

    if (subscriptionId) {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]

      const costRes = await fetchWithRetry(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: startOfMonth, to: today },
            dataset: {
              granularity: 'None',
              aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
            },
          }),
        }
      )

      if (costRes.ok) {
        ok('Azure cost management API access confirmed (subscription-level)')
        return
      }

      const t = await costRes.text()
      fail(`Azure billing/cost API failed: HTTP ${costRes.status}`)
      info(`Azure response snippet: ${t.slice(0, 150).replace(/\s+/g, ' ')}`)
      return
    }

    fail('Azure check incomplete: token OK, but no AZURE_BILLING_ACCOUNT_ID+AZURE_BILLING_PROFILE_ID or AZURE_SUBSCRIPTION_ID configured')
  } catch (e) {
    fail(`Azure billing check failed: ${e?.message || 'UnknownError'}`)
  }
}

console.log('--- Connectivity checks (S3, GCP billing, Azure billing) ---')
await testS3()
await testGcpBilling()
await testAzureBilling()
console.log('--- Done ---')

'use client'

import { useState, useEffect, useCallback } from 'react'

interface TavilyUsage {
  key: {
    usage: number
    limit: number | null
    search_usage: number
    extract_usage: number
    crawl_usage: number
    map_usage: number
    research_usage: number
  }
  account: {
    current_plan: string
    plan_usage: number
    plan_limit: number
    search_usage: number
    extract_usage: number
    crawl_usage: number
    map_usage: number
    research_usage: number
    paygo_usage: number
    paygo_limit: number | null
  }
}

interface VercelUsage {
  plan: string
  limits?: Record<string, { limit: number; unit: string }>
  charges?: Record<string, unknown>[]
  note?: string
  dashboardUrl?: string
}

interface RenderService {
  id: string
  name: string
  type: string
  plan: string
  url?: string
  region?: string
  suspended?: string
  updatedAt: string
}

interface RenderUsage {
  services: RenderService[]
  limits: Record<string, { limit: number; unit: string }>
  dashboardUrl: string
}

interface OpenRouterUsage {
  total_credits: number
  total_usage: number
  remaining: number
  dashboardUrl: string
}

interface GCPAccount {
  id: string
  displayName: string
  open: boolean
  projects: { id: string; billingEnabled: boolean }[]
}

interface GCPUsage {
  accounts: GCPAccount[]
  projectId: string
  dashboardUrl: string
}

interface AzureUsage {
  type: 'credits' | 'cost_query'
  currentBalance?: number
  estimatedBalance?: number
  totalSpend?: number
  studentCredit?: number
  remaining?: number
  currency: string
  expiredCredit?: number
  pendingCharges?: number
  period?: string
  dashboardUrl: string
}

interface TursoUsage {
  usage: {
    rows_read: number
    rows_written: number
    storage_bytes: number
    databases: number
    groups: number
    locations: number
    bytes_synced: number
  }
  limits: Record<string, number>
  databases: { uuid: string; rows_read: number; rows_written: number; storage_bytes: number }[]
  dashboardUrl: string
}

interface OddsUsage {
  requestsUsed: number
  requestsRemaining: number
  requestsLimit: number
  dashboardUrl: string
}

interface VeniceUsage {
  connected?: boolean
  modelsAvailable?: number
  note?: string
  dashboardUrl: string
  [key: string]: unknown
}

function UsageMeter({
  label,
  used,
  limit,
  unit,
}: {
  label: string
  used: number
  limit: number | null
  unit?: string
}) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0
  const color =
    pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground/70">{label}</span>
        <span className="text-xs tabular-nums text-foreground/50">
          {used.toLocaleString()}
          {limit ? ` / ${limit.toLocaleString()}` : ''}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      {limit ? (
        <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
          <div
            className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
          <div className="h-full rounded-full bg-blue-400 w-full opacity-30" />
        </div>
      )}
    </div>
  )
}

function ServiceCard({
  title,
  icon,
  plan,
  children,
  status,
  dashboardUrl,
}: {
  title: string
  icon: string
  plan?: string
  children: React.ReactNode
  status: 'loading' | 'ok' | 'error'
  dashboardUrl?: string
}) {
  return (
    <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-foreground/5 overflow-hidden">
      <div className="px-6 py-4 border-b border-foreground/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-foreground/50 text-xl">
            {icon}
          </span>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {plan && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-foreground/5 text-foreground/50 font-medium">
              {plan}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'loading' && (
            <span className="text-xs text-foreground/40 animate-pulse">
              Loading…
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-red-500">Error</span>
          )}
          {dashboardUrl && (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              Dashboard ↗
            </a>
          )}
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  )
}

export default function UsagePage() {
  const [tavily, setTavily] = useState<TavilyUsage | null>(null)
  const [vercel, setVercel] = useState<VercelUsage | null>(null)
  const [render, setRender] = useState<RenderUsage | null>(null)
  const [openRouter, setOpenRouter] = useState<OpenRouterUsage | null>(null)
  const [gcp, setGcp] = useState<GCPUsage | null>(null)
  const [azure, setAzure] = useState<AzureUsage | null>(null)
  const [turso, setTurso] = useState<TursoUsage | null>(null)
  const [tavilyStatus, setTavilyStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [vercelStatus, setVercelStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [renderStatus, setRenderStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [openRouterStatus, setOpenRouterStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [gcpStatus, setGcpStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [azureStatus, setAzureStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [tursoStatus, setTursoStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [odds, setOdds] = useState<OddsUsage | null>(null)
  const [oddsStatus, setOddsStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [venice, setVenice] = useState<VeniceUsage | null>(null)
  const [veniceStatus, setVeniceStatus] = useState<
    'loading' | 'ok' | 'error'
  >('loading')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setTavilyStatus('loading')
    setVercelStatus('loading')
    setRenderStatus('loading')
    setOpenRouterStatus('loading')
    setGcpStatus('loading')
    setAzureStatus('loading')
    setTursoStatus('loading')
    setOddsStatus('loading')
    setVeniceStatus('loading')

    try {
      const res = await fetch('/api/usage/tavily')
      if (res.ok) {
        setTavily(await res.json())
        setTavilyStatus('ok')
      } else {
        setTavilyStatus('error')
      }
    } catch {
      setTavilyStatus('error')
    }

    try {
      const res = await fetch('/api/usage/vercel')
      if (res.ok) {
        setVercel(await res.json())
        setVercelStatus('ok')
      } else {
        setVercelStatus('error')
      }
    } catch {
      setVercelStatus('error')
    }

    try {
      const res = await fetch('/api/usage/render')
      if (res.ok) {
        setRender(await res.json())
        setRenderStatus('ok')
      } else {
        setRenderStatus('error')
      }
    } catch {
      setRenderStatus('error')
    }

    try {
      const res = await fetch('/api/usage/openrouter')
      if (res.ok) {
        setOpenRouter(await res.json())
        setOpenRouterStatus('ok')
      } else {
        setOpenRouterStatus('error')
      }
    } catch {
      setOpenRouterStatus('error')
    }

    try {
      const res = await fetch('/api/usage/gcp')
      if (res.ok) {
        setGcp(await res.json())
        setGcpStatus('ok')
      } else {
        setGcpStatus('error')
      }
    } catch {
      setGcpStatus('error')
    }

    try {
      const res = await fetch('/api/usage/azure')
      if (res.ok) {
        setAzure(await res.json())
        setAzureStatus('ok')
      } else {
        setAzureStatus('error')
      }
    } catch {
      setAzureStatus('error')
    }

    try {
      const res = await fetch('/api/usage/turso')
      if (res.ok) {
        setTurso(await res.json())
        setTursoStatus('ok')
      } else {
        setTursoStatus('error')
      }
    } catch {
      setTursoStatus('error')
    }

    try {
      const res = await fetch('/api/usage/odds')
      if (res.ok) {
        setOdds(await res.json())
        setOddsStatus('ok')
      } else {
        setOddsStatus('error')
      }
    } catch {
      setOddsStatus('error')
    }

    try {
      const res = await fetch('/api/usage/venice')
      if (res.ok) {
        setVenice(await res.json())
        setVeniceStatus('ok')
      } else {
        setVeniceStatus('error')
      }
    } catch {
      setVeniceStatus('error')
    }

    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="blur-reveal space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Usage</h1>
          <p className="text-sm text-foreground/50 mt-1">
            Credits burned, limits, and burn rate across services.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground/30 tabular-nums">
            {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
          </span>
          <button
            onClick={fetchData}
            className="text-sm px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-foreground/60 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ServiceCard
        title="Tavily"
        icon="search"
        plan={tavily?.account.current_plan}
        status={tavilyStatus}
        dashboardUrl="https://app.tavily.com/home"
      >
        {tavily ? (
          <>
            <UsageMeter
              label="Total Credits"
              used={tavily.account.plan_usage}
              limit={tavily.account.plan_limit}
              unit="credits"
            />

            {/* Breakdown by type */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { label: 'Search', value: tavily.account.search_usage },
                { label: 'Extract', value: tavily.account.extract_usage },
                { label: 'Crawl', value: tavily.account.crawl_usage },
                { label: 'Map', value: tavily.account.map_usage },
                { label: 'Research', value: tavily.account.research_usage },
              ]
                .filter((s) => s.value > 0)
                .map((s) => (
                  <div
                    key={s.label}
                    className="flex items-baseline justify-between text-sm"
                  >
                    <span className="text-foreground/50">{s.label}</span>
                    <span className="tabular-nums font-medium text-foreground/70">
                      {s.value.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>

            {/* Burn rate estimate */}
            {tavily.account.plan_limit > 0 && (() => {
              const now = new Date()
              const dayOfMonth = now.getDate()
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
              const daysRemaining = daysInMonth - dayOfMonth
              const dailyRate = dayOfMonth > 0 ? tavily.account.plan_usage / dayOfMonth : 0
              const projected = tavily.account.plan_usage + dailyRate * daysRemaining
              const remaining = tavily.account.plan_limit - tavily.account.plan_usage
              const willBurnOut = projected > tavily.account.plan_limit
              const burnOutDay = dailyRate > 0
                ? Math.ceil(remaining / dailyRate) + dayOfMonth
                : null
              const burnOutDate = burnOutDay && burnOutDay <= daysInMonth
                ? new Date(now.getFullYear(), now.getMonth(), burnOutDay)
                : null

              return (
                <div className="pt-2 border-t border-foreground/5 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Remaining</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {remaining.toLocaleString()} credits
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Daily Burn Rate</span>
                    <span className="tabular-nums text-foreground/60">
                      ~{Math.round(dailyRate).toLocaleString()} credits/day
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Projected This Month</span>
                    <span className={`tabular-nums font-medium ${willBurnOut ? 'text-red-600' : 'text-foreground/60'}`}>
                      {Math.round(projected).toLocaleString()} / {tavily.account.plan_limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Usage</span>
                    <span className="tabular-nums text-foreground/60">
                      {((tavily.account.plan_usage / tavily.account.plan_limit) * 100).toFixed(1)}%
                    </span>
                  </div>
                  {willBurnOut && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                      <span className="text-sm text-red-700">
                        At current pace, credits will run out
                        {burnOutDate
                          ? ` on ${burnOutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : ' before month end'}
                        . {daysRemaining} days remaining.
                      </span>
                    </div>
                  )}
                  {!willBurnOut && daysRemaining > 0 && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                      <span className="text-sm text-emerald-700">
                        On track — projected to use {((projected / tavily.account.plan_limit) * 100).toFixed(0)}% by month end.
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Key-level usage if different from account */}
            {tavily.key.limit && (
              <div className="pt-2 border-t border-foreground/5">
                <UsageMeter
                  label="API Key Limit"
                  used={tavily.key.usage}
                  limit={tavily.key.limit}
                  unit="credits"
                />
              </div>
            )}
          </>
        ) : tavilyStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Tavily usage. Check TAVILY_API_KEY in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Vercel */}
      <ServiceCard
        title="Vercel"
        icon="cloud"
        plan={vercel?.plan}
        status={vercelStatus}
        dashboardUrl={vercel?.dashboardUrl || 'https://vercel.com/kvn8888s-projects/~/usage'}
      >
        {vercel ? (
          <>
            {vercel.limits && (
              <div className="space-y-3">
                <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">
                  Monthly Limits (Hobby Plan)
                </p>
                {Object.entries(vercel.limits).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between text-sm"
                  >
                    <span className="text-foreground/50">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="tabular-nums font-medium text-foreground/70">
                      {val.limit.toLocaleString()} {val.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {vercel.charges && vercel.charges.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-foreground/5">
                <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">
                  Charges This Period
                </p>
                {vercel.charges.slice(0, 10).map((charge, i) => (
                  <div
                    key={i}
                    className="text-sm text-foreground/60"
                  >
                    {JSON.stringify(charge)}
                  </div>
                ))}
              </div>
            )}

            {vercel.note && (
              <p className="text-xs text-foreground/40 italic">{vercel.note}</p>
            )}
          </>
        ) : vercelStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Vercel usage. Check VERCEL_API_TOKEN in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Render */}
      <ServiceCard
        title="Render"
        icon="dns"
        plan="Free"
        status={renderStatus}
        dashboardUrl={render?.dashboardUrl || 'https://dashboard.render.com/'}
      >
        {render ? (
          <>
            {/* Services list */}
            {render.services.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">
                  Services ({render.services.length})
                </p>
                {render.services.map((svc) => (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          svc.suspended === 'suspended'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                      <span className="text-foreground/70 font-medium">
                        {svc.name}
                      </span>
                      <span className="text-xs text-foreground/30">
                        {svc.type}
                      </span>
                    </div>
                    <span className="text-xs text-foreground/40">{svc.plan}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Known limits */}
            {render.limits && (
              <div className="space-y-2 pt-2 border-t border-foreground/5">
                <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">
                  Monthly Limits (Free Tier)
                </p>
                {Object.entries(render.limits).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between text-sm"
                  >
                    <span className="text-foreground/50">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="tabular-nums font-medium text-foreground/70">
                      {val.limit.toLocaleString()} {val.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : renderStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Render data. Check RENDER_API_KEY in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* OpenRouter */}
      <ServiceCard
        title="OpenRouter"
        icon="route"
        status={openRouterStatus}
        dashboardUrl={openRouter?.dashboardUrl || 'https://openrouter.ai/activity'}
      >
        {openRouter ? (
          <>
            <UsageMeter
              label="Credits"
              used={openRouter.total_usage}
              limit={openRouter.total_credits}
              unit="USD"
            />
            <div className="pt-2 border-t border-foreground/5 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/50">Total Purchased</span>
                <span className="tabular-nums font-medium text-foreground/70">
                  ${openRouter.total_credits.toFixed(2)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/50">Total Used</span>
                <span className="tabular-nums text-foreground/60">
                  ${openRouter.total_usage.toFixed(2)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/50">Remaining</span>
                <span className="tabular-nums font-semibold text-foreground">
                  ${openRouter.remaining.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        ) : openRouterStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch OpenRouter data. Check OPENROUTER_API_KEY in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Google Cloud */}
      <ServiceCard
        title="Google Cloud"
        icon="cloud_circle"
        status={gcpStatus}
        dashboardUrl={gcp?.dashboardUrl || 'https://console.cloud.google.com/billing'}
      >
        {gcp ? (
          <>
            {gcp.accounts.length > 0 ? (
              <div className="space-y-4">
                {gcp.accounts.map((account) => (
                  <div key={account.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground/70">
                        {account.displayName}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          account.open
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {account.open ? 'Active' : 'Closed'}
                      </span>
                    </div>
                    {account.projects.length > 0 && (
                      <div className="space-y-1 pl-2">
                        {account.projects.map((proj) => (
                          <div
                            key={proj.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  proj.billingEnabled
                                    ? 'bg-emerald-400'
                                    : 'bg-gray-300'
                                }`}
                              />
                              <span className="text-foreground/60">
                                {proj.id}
                              </span>
                            </div>
                            <span className="text-xs text-foreground/40">
                              {proj.billingEnabled ? 'Billing on' : 'Billing off'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/40">
                No billing accounts found.
              </p>
            )}
            <p className="text-xs text-foreground/30 italic pt-2 border-t border-foreground/5">
              Cost data requires BigQuery export setup. Shows billing accounts and projects.
            </p>
          </>
        ) : gcpStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch GCP data. Check GCP_SERVICE_ACCOUNT_KEY in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Azure */}
      <ServiceCard
        title="Azure"
        icon="cloud_sync"
        plan={azure?.type === 'cost_query' ? 'Student' : undefined}
        status={azureStatus}
        dashboardUrl={azure?.dashboardUrl || 'https://portal.azure.com/#view/Microsoft_Azure_Billing/BillingMenuBlade/~/Credits'}
      >
        {azure ? (
          <>
            {azure.type === 'credits' && azure.currentBalance != null && (
              <>
                <UsageMeter
                  label="Credit Balance"
                  used={Math.max(0, (azure.estimatedBalance ?? 0) - azure.currentBalance)}
                  limit={azure.estimatedBalance ?? azure.currentBalance}
                  unit={azure.currency}
                />
                <div className="pt-2 border-t border-foreground/5 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Current Balance</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      ${azure.currentBalance.toFixed(2)} {azure.currency}
                    </span>
                  </div>
                  {azure.pendingCharges != null && azure.pendingCharges > 0 && (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-foreground/50">Pending Charges</span>
                      <span className="tabular-nums text-amber-600">
                        ${azure.pendingCharges.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {azure.expiredCredit != null && azure.expiredCredit > 0 && (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-foreground/50">Expired Credit</span>
                      <span className="tabular-nums text-foreground/40">
                        ${azure.expiredCredit.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Burn rate projection */}
                {(() => {
                  const now = new Date()
                  const dayOfMonth = now.getDate()
                  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                  const daysRemaining = daysInMonth - dayOfMonth
                  const total = azure.estimatedBalance ?? azure.currentBalance
                  const used = Math.max(0, total - azure.currentBalance)
                  if (dayOfMonth === 0 || total === 0) return null
                  const dailyRate = used / dayOfMonth
                  const projected = used + dailyRate * daysRemaining
                  const willBurnOut = projected > total

                  return (
                    <div className="pt-2 border-t border-foreground/5 space-y-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground/50">Daily Burn Rate</span>
                        <span className="tabular-nums text-foreground/60">
                          ~${dailyRate.toFixed(2)}/day
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground/50">Projected This Month</span>
                        <span className={`tabular-nums font-medium ${willBurnOut ? 'text-red-600' : 'text-foreground/60'}`}>
                          ${projected.toFixed(2)} / ${total.toFixed(2)}
                        </span>
                      </div>
                      {willBurnOut && (
                        <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                          <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                          <span className="text-sm text-red-700">
                            Credits projected to run out this month. {daysRemaining} days remaining.
                          </span>
                        </div>
                      )}
                      {!willBurnOut && daysRemaining > 0 && (
                        <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                          <span className="text-sm text-emerald-700">
                            On track — projected to use {((projected / total) * 100).toFixed(0)}% by month end.
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}

            {azure.type === 'cost_query' && azure.totalSpend != null && (
              <>
                <UsageMeter
                  label="Student Credits"
                  used={azure.totalSpend}
                  limit={azure.studentCredit ?? 100}
                  unit={azure.currency}
                />
                <div className="pt-2 border-t border-foreground/5 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Total Spend</span>
                    <span className="tabular-nums text-foreground/60">
                      ${azure.totalSpend.toFixed(2)} {azure.currency}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Remaining</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      ${(azure.remaining ?? 0).toFixed(2)} {azure.currency}
                    </span>
                  </div>
                  {azure.period && (
                    <p className="text-xs text-foreground/30 italic">
                      Period: {azure.period}
                    </p>
                  )}
                </div>

                {/* Burn rate projection */}
                {(() => {
                  const now = new Date()
                  const dayOfMonth = now.getDate()
                  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                  const daysRemaining = daysInMonth - dayOfMonth
                  const limit = azure.studentCredit ?? 100
                  const used = azure.totalSpend
                  if (dayOfMonth === 0) return null
                  const dailyRate = used / dayOfMonth
                  const projected = used + dailyRate * daysRemaining
                  const willBurnOut = projected > limit

                  return (
                    <div className="pt-2 border-t border-foreground/5 space-y-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground/50">Daily Burn Rate</span>
                        <span className="tabular-nums text-foreground/60">
                          ~${dailyRate.toFixed(2)}/day
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground/50">Projected This Month</span>
                        <span className={`tabular-nums font-medium ${willBurnOut ? 'text-red-600' : 'text-foreground/60'}`}>
                          ${projected.toFixed(2)} / ${limit.toFixed(2)}
                        </span>
                      </div>
                      {willBurnOut && (
                        <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                          <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                          <span className="text-sm text-red-700">
                            Credits projected to run out this month. {daysRemaining} days remaining.
                          </span>
                        </div>
                      )}
                      {!willBurnOut && daysRemaining > 0 && (
                        <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                          <span className="text-sm text-emerald-700">
                            On track — projected to use {((projected / limit) * 100).toFixed(0)}% by month end.
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </>
        ) : azureStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Azure data. Check AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Turso */}
      <ServiceCard
        title="Turso"
        icon="database"
        plan="Starter"
        status={tursoStatus}
        dashboardUrl={turso?.dashboardUrl || 'https://turso.tech/app'}
      >
        {turso ? (
          <>
            <UsageMeter
              label="Rows Read"
              used={turso.usage.rows_read}
              limit={turso.limits.rows_read}
            />
            <UsageMeter
              label="Rows Written"
              used={turso.usage.rows_written}
              limit={turso.limits.rows_written}
            />
            <UsageMeter
              label="Storage"
              used={Math.round(turso.usage.storage_bytes / 1_000_000)}
              limit={Math.round(turso.limits.storage_bytes / 1_000_000)}
              unit="MB"
            />

            <div className="pt-2 border-t border-foreground/5 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/50">Databases</span>
                <span className="tabular-nums text-foreground/60">
                  {turso.usage.databases} / {turso.limits.databases}
                </span>
              </div>
              {turso.usage.bytes_synced > 0 && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground/50">Bytes Synced</span>
                  <span className="tabular-nums text-foreground/60">
                    {(turso.usage.bytes_synced / 1_000_000).toFixed(1)} MB
                  </span>
                </div>
              )}
            </div>

            {/* Burn rate projection (rows read) */}
            {(() => {
              const now = new Date()
              const dayOfMonth = now.getDate()
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
              const daysRemaining = daysInMonth - dayOfMonth
              const used = turso.usage.rows_read
              const limit = turso.limits.rows_read
              if (!limit || dayOfMonth === 0) return null
              const dailyRate = used / dayOfMonth
              const projected = used + dailyRate * daysRemaining
              const remaining = limit - used
              const willBurnOut = projected > limit

              return (
                <div className="pt-2 border-t border-foreground/5 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Rows Read Remaining</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {remaining.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Daily Burn Rate</span>
                    <span className="tabular-nums text-foreground/60">
                      ~{Math.round(dailyRate).toLocaleString()} rows/day
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Projected This Month</span>
                    <span className={`tabular-nums font-medium ${willBurnOut ? 'text-red-600' : 'text-foreground/60'}`}>
                      {Math.round(projected).toLocaleString()} / {limit.toLocaleString()}
                    </span>
                  </div>
                  {willBurnOut && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                      <span className="text-sm text-red-700">
                        Row reads projected to exceed limit. {daysRemaining} days remaining.
                      </span>
                    </div>
                  )}
                  {!willBurnOut && daysRemaining > 0 && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                      <span className="text-sm text-emerald-700">
                        On track — projected to use {((projected / limit) * 100).toFixed(0)}% by month end.
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        ) : tursoStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Turso data. Check TURSO_API_TOKEN and TURSO_ORG_SLUG in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* The Odds API */}
      <ServiceCard
        title="The Odds API"
        icon="sports_soccer"
        plan="Free"
        status={oddsStatus}
        dashboardUrl={odds?.dashboardUrl || 'https://the-odds-api.com/account/'}
      >
        {odds ? (
          <>
            <UsageMeter
              label="Requests"
              used={odds.requestsUsed}
              limit={odds.requestsLimit}
            />
            <div className="pt-2 border-t border-foreground/5 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/50">Remaining</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {odds.requestsRemaining.toLocaleString()} requests
                </span>
              </div>
            </div>

            {/* Burn rate projection */}
            {(() => {
              const now = new Date()
              const dayOfMonth = now.getDate()
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
              const daysRemaining = daysInMonth - dayOfMonth
              if (dayOfMonth === 0) return null
              const dailyRate = odds.requestsUsed / dayOfMonth
              const projected = odds.requestsUsed + dailyRate * daysRemaining
              const willBurnOut = projected > odds.requestsLimit

              return (
                <div className="pt-2 border-t border-foreground/5 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Daily Burn Rate</span>
                    <span className="tabular-nums text-foreground/60">
                      ~{Math.round(dailyRate).toLocaleString()} req/day
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Projected This Month</span>
                    <span className={`tabular-nums font-medium ${willBurnOut ? 'text-red-600' : 'text-foreground/60'}`}>
                      {Math.round(projected).toLocaleString()} / {odds.requestsLimit.toLocaleString()}
                    </span>
                  </div>
                  {willBurnOut && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                      <span className="text-sm text-red-700">
                        Requests projected to exceed limit. {daysRemaining} days remaining.
                      </span>
                    </div>
                  )}
                  {!willBurnOut && daysRemaining > 0 && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                      <span className="text-sm text-emerald-700">
                        On track — projected to use {((projected / odds.requestsLimit) * 100).toFixed(0)}% by month end.
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        ) : oddsStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Odds API data. Check ODDS_API_KEY in env.
          </p>
        ) : null}
      </ServiceCard>

      {/* Venice AI */}
      <ServiceCard
        title="Venice AI"
        icon="smart_toy"
        status={veniceStatus}
        dashboardUrl={venice?.dashboardUrl || 'https://venice.ai/settings/api'}
      >
        {venice ? (
          <>
            {venice.connected && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground/50">Status</span>
                  <span className="text-emerald-600 font-medium">Connected</span>
                </div>
                {venice.modelsAvailable != null && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground/50">Models Available</span>
                    <span className="tabular-nums text-foreground/60">
                      {venice.modelsAvailable}
                    </span>
                  </div>
                )}
                {venice.note && (
                  <p className="text-xs text-foreground/30 italic pt-2 border-t border-foreground/5">
                    {venice.note}
                  </p>
                )}
              </div>
            )}
            {!venice.connected && (
              <p className="text-sm text-foreground/50">
                Venice AI data loaded. Check dashboard for usage details.
              </p>
            )}
          </>
        ) : veniceStatus === 'error' ? (
          <p className="text-sm text-foreground/40">
            Could not fetch Venice AI data. Check VENICE_API_KEY in env.
          </p>
        ) : null}
      </ServiceCard>
      </div>
    </div>
  )
}

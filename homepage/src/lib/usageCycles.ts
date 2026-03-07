export type UsageWindowSource =
  | 'provider-reported'
  | 'configured-anchor-day'
  | 'calendar-month-fallback'

export interface UsageCycleOverride {
  cycleKey?: string
  cycleStart?: string
  cycleEnd?: string | null
  windowSource?: UsageWindowSource
}

interface UsageMetricCycleDefinition {
  service: string
  metric: string
  strategy: 'calendar-month' | 'anchor-day'
  anchorDay?: number
}

export interface ResolvedUsageCycle {
  cycleKey: string
  cycleStart: string
  cycleEnd: string | null
  windowSource: UsageWindowSource
}

const USAGE_METRIC_CYCLE_DEFINITIONS: UsageMetricCycleDefinition[] = [
  { service: 'tavily', metric: 'plan_usage', strategy: 'calendar-month' },
  { service: 'github', metric: 'codespaces_minutes', strategy: 'calendar-month' },
  { service: 'github', metric: 'copilot_premium_requests', strategy: 'calendar-month' },
  { service: 'azure', metric: 'student_credit_used_usd', strategy: 'calendar-month' },
  { service: 'gcp', metric: 'month_spend_usd', strategy: 'calendar-month' },
  { service: 'turso', metric: 'rows_read', strategy: 'calendar-month' },
  { service: 'odds', metric: 'requests_used', strategy: 'calendar-month' },
  { service: 'venice', metric: 'diem_used', strategy: 'calendar-month' },
]

const USAGE_METRIC_CYCLE_DEFINITIONS_BY_KEY = new Map(
  USAGE_METRIC_CYCLE_DEFINITIONS.map((definition) => [
    `${definition.service}:${definition.metric}`,
    definition,
  ] as const),
)

function asUtcDate(input?: string | Date) {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  }

  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00.000Z`)
  }

  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function formatUtcDate(date: Date) {
  return date.toISOString().split('T')[0]
}

function getMonthlyCycle(date: Date): ResolvedUsageCycle {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return {
    cycleKey: `month:${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    cycleStart: formatUtcDate(start),
    cycleEnd: formatUtcDate(end),
    windowSource: 'calendar-month-fallback',
  }
}

function getAnchorDayCycle(date: Date, anchorDay: number): ResolvedUsageCycle {
  const normalizedAnchorDay = Math.min(Math.max(anchorDay, 1), 28)
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), normalizedAnchorDay))

  if (date.getUTCDate() < normalizedAnchorDay) {
    start.setUTCMonth(start.getUTCMonth() - 1)
  }

  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(end.getUTCDate() - 1)

  return {
    cycleKey: `anchor:${normalizedAnchorDay}:${formatUtcDate(start)}`,
    cycleStart: formatUtcDate(start),
    cycleEnd: formatUtcDate(end),
    windowSource: 'configured-anchor-day',
  }
}

export function getUsageMetricCycleDefinition(service: string, metric: string) {
  return USAGE_METRIC_CYCLE_DEFINITIONS_BY_KEY.get(`${service}:${metric}`)
}

export function resolveUsageMetricCycle({
  service,
  metric,
  snapshotDate,
  cycle,
}: {
  service: string
  metric: string
  snapshotDate?: string | Date
  cycle?: UsageCycleOverride
}): ResolvedUsageCycle {
  if (cycle?.cycleKey && cycle?.cycleStart && cycle?.windowSource) {
    return {
      cycleKey: cycle.cycleKey,
      cycleStart: cycle.cycleStart,
      cycleEnd: cycle.cycleEnd ?? null,
      windowSource: cycle.windowSource,
    }
  }

  const date = asUtcDate(snapshotDate)
  const definition = getUsageMetricCycleDefinition(service, metric)

  if (definition?.strategy === 'anchor-day' && definition.anchorDay) {
    return getAnchorDayCycle(date, definition.anchorDay)
  }

  return getMonthlyCycle(date)
}
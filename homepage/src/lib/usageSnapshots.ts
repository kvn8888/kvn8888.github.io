import { getTursoClient } from './turso'
import {
  resolveUsageMetricCycle,
  type UsageCycleOverride,
  type UsageWindowSource,
} from './usageCycles'

let usageSnapshotSchemaInitialized = false

export interface UsageMetricSnapshot {
  service: string
  metric: string
  snapshotDate: string
  periodKey: string
  cycleKey: string
  cycleStart: string
  cycleEnd: string | null
  windowSource: UsageWindowSource
  totalValue: number
  capturedAt: number
  updatedAt: number
}

export function getUtcSnapshotDate(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

export function getUtcSnapshotDateOffset(days: number, baseDate = new Date()): string {
  const shifted = new Date(baseDate)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return getUtcSnapshotDate(shifted)
}

export function getMonthlyPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

async function ensureUsageSnapshotColumns() {
  const db = getTursoClient()
  if (!db) return

  const result = await db.execute('PRAGMA table_info(usage_metric_snapshots)')
  const existingColumns = new Set(result.rows.map((row) => String(row.name)))
  const missingColumns: Array<{ name: string; sql: string }> = [
    { name: 'cycle_key', sql: 'ALTER TABLE usage_metric_snapshots ADD COLUMN cycle_key TEXT' },
    { name: 'cycle_start', sql: 'ALTER TABLE usage_metric_snapshots ADD COLUMN cycle_start TEXT' },
    { name: 'cycle_end', sql: 'ALTER TABLE usage_metric_snapshots ADD COLUMN cycle_end TEXT' },
    { name: 'window_source', sql: 'ALTER TABLE usage_metric_snapshots ADD COLUMN window_source TEXT' },
  ].filter((column) => !existingColumns.has(column.name))

  for (const column of missingColumns) {
    await db.execute(column.sql)
  }

  if (missingColumns.length > 0) {
    await db.execute(`
      UPDATE usage_metric_snapshots
      SET
        cycle_key = COALESCE(cycle_key, period_key),
        cycle_start = COALESCE(
          cycle_start,
          CASE
            WHEN length(period_key) = 7 THEN period_key || '-01'
            ELSE snapshot_date
          END
        ),
        cycle_end = COALESCE(
          cycle_end,
          CASE
            WHEN length(period_key) = 7 THEN date(period_key || '-01', '+1 month', '-1 day')
            ELSE NULL
          END
        ),
        window_source = COALESCE(window_source, 'calendar-month-fallback')
    `)
  }
}

async function initUsageSnapshotSchema() {
  if (usageSnapshotSchemaInitialized) return
  const db = getTursoClient()
  if (!db) return

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS usage_metric_snapshots (
      service TEXT NOT NULL,
      metric TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      period_key TEXT NOT NULL,
      cycle_key TEXT,
      cycle_start TEXT,
      cycle_end TEXT,
      window_source TEXT,
      total_value REAL NOT NULL,
      captured_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (service, metric, snapshot_date, period_key)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_metric_snapshots_period
      ON usage_metric_snapshots (period_key, service, metric, snapshot_date DESC);
  `)

  await ensureUsageSnapshotColumns()

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_usage_metric_snapshots_cycle
      ON usage_metric_snapshots (cycle_key, service, metric, snapshot_date DESC)
  `)

  usageSnapshotSchemaInitialized = true
}

export async function recordUsageMetricSnapshot({
  service,
  metric,
  totalValue,
  snapshotDate = getUtcSnapshotDate(),
  periodKey = getMonthlyPeriodKey(),
  cycleKey,
  cycleStart,
  cycleEnd,
  windowSource,
  capturedAt = Date.now(),
}: {
  service: string
  metric: string
  totalValue: number
  snapshotDate?: string
  periodKey?: string
  cycleKey?: string
  cycleStart?: string
  cycleEnd?: string | null
  windowSource?: UsageWindowSource
  capturedAt?: number
}): Promise<void> {
  const db = getTursoClient()
  if (!db) return

  await initUsageSnapshotSchema()

  const resolvedCycle = resolveUsageMetricCycle({
    service,
    metric,
    snapshotDate,
    cycle: { cycleKey, cycleStart, cycleEnd, windowSource } satisfies UsageCycleOverride,
  })

  await db.execute({
    sql: `INSERT INTO usage_metric_snapshots (
            service,
            metric,
            snapshot_date,
            period_key,
            cycle_key,
            cycle_start,
            cycle_end,
            window_source,
            total_value,
            captured_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(service, metric, snapshot_date, period_key) DO UPDATE SET
            cycle_key = excluded.cycle_key,
            cycle_start = excluded.cycle_start,
            cycle_end = excluded.cycle_end,
            window_source = excluded.window_source,
            total_value = excluded.total_value,
            captured_at = excluded.captured_at,
            updated_at = excluded.updated_at`,
    args: [
      service,
      metric,
      snapshotDate,
      periodKey,
      resolvedCycle.cycleKey,
      resolvedCycle.cycleStart,
      resolvedCycle.cycleEnd,
      resolvedCycle.windowSource,
      totalValue,
      capturedAt,
      Date.now(),
    ],
  })
}

export async function listUsageMetricSnapshots(periodKey = getMonthlyPeriodKey()): Promise<UsageMetricSnapshot[]> {
  const db = getTursoClient()
  if (!db) return []

  await initUsageSnapshotSchema()

  const result = await db.execute({
    sql: `SELECT service, metric, snapshot_date, period_key, cycle_key, cycle_start, cycle_end, window_source, total_value, captured_at, updated_at
          FROM usage_metric_snapshots
          WHERE period_key = ?
          ORDER BY service ASC, metric ASC, snapshot_date ASC`,
    args: [periodKey],
  })

  return result.rows.map((row) => ({
    service: String(row.service),
    metric: String(row.metric),
    snapshotDate: String(row.snapshot_date),
    periodKey: String(row.period_key),
    cycleKey: String(row.cycle_key ?? row.period_key),
    cycleStart: String(row.cycle_start ?? row.snapshot_date),
    cycleEnd: row.cycle_end ? String(row.cycle_end) : null,
    windowSource: String(row.window_source ?? 'calendar-month-fallback') as UsageWindowSource,
    totalValue: Number(row.total_value),
    capturedAt: Number(row.captured_at),
    updatedAt: Number(row.updated_at),
  }))
}

export async function listUsageMetricSnapshotsInRange({
  startDate,
  endDate,
}: {
  startDate: string
  endDate: string
}): Promise<UsageMetricSnapshot[]> {
  const db = getTursoClient()
  if (!db) return []

  await initUsageSnapshotSchema()

  const result = await db.execute({
    sql: `SELECT service, metric, snapshot_date, period_key, cycle_key, cycle_start, cycle_end, window_source, total_value, captured_at, updated_at
          FROM usage_metric_snapshots
          WHERE snapshot_date BETWEEN ? AND ?
          ORDER BY service ASC, metric ASC, snapshot_date ASC`,
    args: [startDate, endDate],
  })

  return result.rows.map((row) => ({
    service: String(row.service),
    metric: String(row.metric),
    snapshotDate: String(row.snapshot_date),
    periodKey: String(row.period_key),
    cycleKey: String(row.cycle_key ?? row.period_key),
    cycleStart: String(row.cycle_start ?? row.snapshot_date),
    cycleEnd: row.cycle_end ? String(row.cycle_end) : null,
    windowSource: String(row.window_source ?? 'calendar-month-fallback') as UsageWindowSource,
    totalValue: Number(row.total_value),
    capturedAt: Number(row.captured_at),
    updatedAt: Number(row.updated_at),
  }))
}
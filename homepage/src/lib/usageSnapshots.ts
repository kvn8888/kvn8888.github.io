import { getTursoClient } from './turso'

let usageSnapshotSchemaInitialized = false

export interface UsageMetricSnapshot {
  service: string
  metric: string
  snapshotDate: string
  periodKey: string
  totalValue: number
  capturedAt: number
  updatedAt: number
}

export function getUtcSnapshotDate(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

export function getMonthlyPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
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
      total_value REAL NOT NULL,
      captured_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (service, metric, snapshot_date, period_key)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_metric_snapshots_period
      ON usage_metric_snapshots (period_key, service, metric, snapshot_date DESC);
  `)

  usageSnapshotSchemaInitialized = true
}

export async function recordUsageMetricSnapshot({
  service,
  metric,
  totalValue,
  snapshotDate = getUtcSnapshotDate(),
  periodKey = getMonthlyPeriodKey(),
  capturedAt = Date.now(),
}: {
  service: string
  metric: string
  totalValue: number
  snapshotDate?: string
  periodKey?: string
  capturedAt?: number
}): Promise<void> {
  const db = getTursoClient()
  if (!db) return

  await initUsageSnapshotSchema()

  await db.execute({
    sql: `INSERT INTO usage_metric_snapshots (
            service,
            metric,
            snapshot_date,
            period_key,
            total_value,
            captured_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(service, metric, snapshot_date, period_key) DO UPDATE SET
            total_value = excluded.total_value,
            captured_at = excluded.captured_at,
            updated_at = excluded.updated_at`,
    args: [service, metric, snapshotDate, periodKey, totalValue, capturedAt, Date.now()],
  })
}

export async function listUsageMetricSnapshots(periodKey = getMonthlyPeriodKey()): Promise<UsageMetricSnapshot[]> {
  const db = getTursoClient()
  if (!db) return []

  await initUsageSnapshotSchema()

  const result = await db.execute({
    sql: `SELECT service, metric, snapshot_date, period_key, total_value, captured_at, updated_at
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
    totalValue: Number(row.total_value),
    capturedAt: Number(row.captured_at),
    updatedAt: Number(row.updated_at),
  }))
}
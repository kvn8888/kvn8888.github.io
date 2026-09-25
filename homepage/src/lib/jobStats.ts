import type { Client } from "@libsql/client";
import { appliedJobsPredicate } from "./appliedJobs";

export function statsFromRows(
  rows: { date: unknown; submitted_at: unknown }[],
  now = new Date(),
) {
  const localDate = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = localDate(now),
    anchor = new Date(today + "T12:00:00Z"),
    weekday = anchor.getUTCDay() || 7;
  const shift = (n: number) => {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const monday = shift(1 - weekday),
    lastMonday = shift(-6 - weekday),
    lastSunday = shift(-weekday),
    lastWeekToday = shift(-7),
    month = today.slice(0, 7) + "-01";
  const dates = rows.map((r) =>
    r.submitted_at && Number.isFinite(Date.parse(String(r.submitted_at)))
      ? localDate(new Date(String(r.submitted_at)))
      : String(r.date || ""),
  );
  const count = (from: string, to = today) =>
    dates.filter((d) => d >= from && d <= to).length;
  const thisWeek = count(monday),
    lastWeek = count(lastMonday, lastSunday),
    thisMonth = count(month),
    diff = thisWeek - count(lastMonday, lastWeekToday);
  return {
    total: rows.length,
    today: count(today),
    thisWeek,
    lastWeek,
    thisMonth,
    avgPerDayWeek: Math.round((thisWeek / weekday) * 10) / 10,
    avgPerDayMonth: Math.round((thisMonth / anchor.getUTCDate()) * 10) / 10,
    weekComparison:
      diff === 0
        ? "Same as this point last week"
        : `${diff > 0 ? "+" : ""}${diff} versus this point last week`,
    timezone: "America/New_York",
  };
}
export async function jobStats(db: Client) {
  const r = await db.execute(
    `SELECT date,submitted_at FROM job_applications WHERE ${appliedJobsPredicate}`,
  );
  return statsFromRows(
    r.rows.map((r) => ({ date: r.date, submitted_at: r.submitted_at })),
  );
}

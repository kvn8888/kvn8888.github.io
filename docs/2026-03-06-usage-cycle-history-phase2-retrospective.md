# Usage History Stopped Pretending Every Service Resets on the First

Phase 1 solved cadence.

It made sure usage snapshots were captured daily instead of only when someone opened the dashboard. That mattered, but it did not fix the deeper modeling problem: the dashboard still behaved as if every provider lived inside a clean `YYYY-MM` bucket.

That assumption is cheap to implement and expensive to believe.

## The Problem Was the Shape of the Data

The original snapshot table stored exactly what the first version needed:

- `service`
- `metric`
- `snapshot_date`
- `period_key`
- `total_value`

That works for a month-to-date estimate. It does not work for cycle-aware history.

The fix in this phase was not to throw the table away. It was to extend it so it could carry the facts the dashboard actually needs:

- `cycle_key`
- `cycle_start`
- `cycle_end`
- `window_source`

That let the write path stay compatible with the old rows while giving new snapshots enough structure to answer a better question than “what month is it?”

## A Registry Was Better Than Ad Hoc Logic

The cycle boundary rules now live in `src/lib/usageCycles.ts`.

That file does two useful things:

1. it gives each tracked metric a single place to declare how its cycle should be resolved
2. it separates provider truth from dashboard math

Right now the registry still defaults the tracked metrics to calendar-month fallback. That is intentional.

The point of this step was to create the seam where real provider windows and configured anchor days can plug in later without rewriting the persistence layer again.

## The History API Needed to Stop Returning One Bucket

`/api/usage/history` used to return only the current period key and the rows inside that bucket.

That made it impossible for an active cycle to span a month boundary.

The route now returns:

- a recent snapshot range
- the raw snapshots with cycle metadata
- an `activeCycles` map keyed by `service:metric`

That map is the important bridge to the UI. It lets the page keep consuming a flat snapshot array while still knowing which cycle is currently active for each metric.

## The Dashboard Math Is Better Even Before Every Provider Is Smarter

The dashboard in `src/app/projects/usage/page.tsx` now does three things differently:

1. it filters each metric to its active cycle before projecting burn
2. it computes fallback daily rate against cycle start instead of blindly using day-of-month
3. it shows `Last 7d vs prev 7d` in the main burn panels

That third change matters more than it looks.

A whole-cycle average tells you whether the month is trending toward the limit.
The 7-day comparison tells you whether usage is accelerating right now.

Those are different questions, and the dashboard needs both.

## The UI Had to Stop Lying Too

As soon as the math stopped assuming month boundaries, the text had to stop saying “Projected This Month” and “by month end.”

That sounds cosmetic, but it is not.

Once the data model becomes cycle-aware, month-specific copy becomes a bug in the explanation layer.

So the Phase 3 pass changed the main burn panels to talk about the active cycle instead of the calendar month.

## What This Phase Did Not Finish

This still is not the final state.

The important unfinished comparisons are:

- today vs yesterday
- current cycle vs previous cycle
- provider-specific non-month windows that come from real API metadata or configured anchor days

But the structure is finally good enough to support those features without another persistence rewrite.

That is the real milestone here.

The code stopped pretending the storage model was temporary and started acting like historical analytics was a real product requirement.
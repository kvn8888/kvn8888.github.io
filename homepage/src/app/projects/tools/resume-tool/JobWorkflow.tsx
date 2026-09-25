"use client";

import { useCallback, useEffect, useState, useRef } from "react";

type Row = Record<string, any>;
const base = "/api/job-workflow";
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || `Request failed (${r.status})`);
  return data;
}
const button =
  "rounded-full px-4 py-2 text-sm border border-glass-border hover:bg-foreground/5 disabled:opacity-40 cursor-pointer";
const input =
  "w-full rounded-lg border border-glass-border bg-background/60 px-3 py-2 text-sm";
function stamp(s: string | null) {
  return s ? new Date(s).toLocaleString() : "Unknown";
}
function renderAnswer(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export default function JobWorkflow({
  attention = false,
}: {
  attention?: boolean;
}) {
  const [items, setItems] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [reason, setReason] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(false);
  const [notes, setNotes] = useState(""),
    [company, setCompany] = useState(""),
    [role, setRole] = useState(""),
    [submittedAt, setSubmittedAt] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [existingId, setExistingId] = useState(""),
    [resolveIds, setResolveIds] = useState<string[]>([]);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      if (attention) {
        const p = new URLSearchParams({
          status: "open",
          offset: String(offset),
        });
        if (reason) p.set("reason_code", reason);
        const d = await api(`${base}/blockers?${p}`);
        if (sequence === loadSequence.current) {
          setItems(d.items);
          setTotal(d.total);
        }
      } else {
        const p = new URLSearchParams({ limit: "20" });
        if (q) p.set("q", q);
        if (status) p.set("status", status);
        if (cursor) p.set("cursor", cursor);
        const d = await api(`/api/job-collection?${p}`);
        if (sequence === loadSequence.current) {
          setItems(d.jobs);
          setTotal(d.total);
          setNext(d.next_cursor);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [attention, offset, reason, q, status, cursor]);
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    void load();
  }, [load]);
  const open = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      setDetail(await api(`${base}/jobs/${id}`));
      setManual(false);
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refreshDetail = async () => {
    if (detail) setDetail(await api(`${base}/jobs/${detail.job.id}`));
    await load();
  };
  async function resolve(b: Row, action: string) {
    setBusy(true);
    setError("");
    try {
      await api(`${base}/blockers/${b.id}/resolve`, {
        version: b.version,
        action,
        notes: notes.trim() || "Reviewed in the Job Tracker portal",
      });
      await refreshDetail();
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startManual() {
    if (!detail) return;
    setManual(true);
    setConfirmed(false);
    setCompany(detail.job.company || "");
    setRole(detail.job.role || "");
    setSubmittedAt(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
    setResolveIds(
      detail.blockers
        .filter((b: Row) => b.status === "open")
        .map((b: Row) => b.id),
    );
  }
  async function complete() {
    if (!detail || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const storageKey = `job-manual:${detail.job.id}`;
      let pending: Row;
      try {
        pending = JSON.parse(localStorage.getItem(storageKey) || "null");
      } catch {
        pending = null as any;
      }
      if (!pending) {
        pending = {
          id: crypto.randomUUID(),
          claim_token: crypto.randomUUID() + crypto.randomUUID(),
        };
        localStorage.setItem(storageKey, JSON.stringify(pending));
      }
      const latest = await api(`/api/job-collection/${detail.job.id}`);
      await api(`${base}/attempts`, {
        id: pending.id,
        collection_id: detail.job.id,
        version: latest.job.version,
        claim_token: pending.claim_token,
        manual: true,
        worker_id: "manual-portal",
        ...(detail.attempts.find((a: Row) => a.state === "finished")
          ? {
              parent_attempt_id: detail.attempts.find(
                (a: Row) => a.state === "finished",
              ).id,
            }
          : {}),
      });
      if (!pending.completion) {
        pending.completion = {
          claim_token: pending.claim_token,
          confirmed: true,
          confirmation_kind: "user_confirmed",
          submitted_at: new Date(submittedAt).toISOString(),
          job: { company, role },
          resolve_blocker_ids: resolveIds,
          evidence: notes ? [{ kind: "user_note", text: notes }] : [],
          ...(existingId
            ? { existing_application_id: Number(existingId) }
            : {}),
          ...(detail.captures[0] ? { capture_id: detail.captures[0].id } : {}),
        };
        localStorage.setItem(storageKey, JSON.stringify(pending));
      }
      const result = await api(
        `${base}/attempts/${pending.id}/complete`,
        pending.completion,
      );
      await api(`/api/jobs/${result.application_id}`);
      localStorage.removeItem(storageKey);
      setManual(false);
      setConfirmed(false);
      await refreshDetail();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">
            {detail
              ? "Opportunity history"
              : attention
                ? "Needs attention"
                : "Opportunities"}
          </h2>
          <p className="text-sm text-foreground/50">
            {attention
              ? "Resolve obstacles or record a submission you finished yourself."
              : "Collected jobs and their agent-processing history."}
          </p>
        </div>
        <button
          className={button}
          onClick={() =>
            detail ? refreshDetail().catch((e) => setError(e.message)) : load()
          }
          disabled={busy || loading}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 text-red-700 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {detail ? (
        <>
          <button
            className={button}
            onClick={() => {
              setDetail(null);
              setManual(false);
            }}
          >
            ← Back to list
          </button>
          <div className="rounded-xl border border-glass-border p-4 space-y-2">
            <p className="text-sm text-foreground/50">
              {detail.job.company || "Company unknown"}
            </p>
            <h3 className="text-xl font-medium">
              {detail.job.role || "Untitled job"}
            </h3>
            <p className="text-sm">
              {detail.job.location || "Location unknown"} ·{" "}
              {detail.job.work_mode || "Work mode unknown"}
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs rounded-full bg-foreground/5 px-3 py-1">
                {detail.job.status}
              </span>
              <a
                className={button}
                href={detail.job.application_url || detail.job.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Open application ↗
              </a>
              {detail.job.status !== "applied" && (
                <button className={button} onClick={startManual}>
                  I submitted it manually
                </button>
              )}
            </div>
            <details>
              <summary className="cursor-pointer text-sm">
                Job description
              </summary>
              <p className="whitespace-pre-wrap text-sm mt-3">
                {detail.job.description || "No description captured."}
              </p>
            </details>
          </div>
          {manual && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void complete();
              }}
              className="rounded-xl border border-emerald-600/30 p-4 space-y-3"
            >
              <h3 className="font-medium">Record your submission</h3>
              <p className="text-sm text-foreground/50">
                This saves to your tracker. It does not submit to the employer.
              </p>
              <label className="block text-sm">
                Company
                <input
                  className={input}
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Role
                <input
                  className={input}
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Submitted at
                <input
                  type="datetime-local"
                  className={input}
                  required
                  value={submittedAt}
                  onChange={(e) => setSubmittedAt(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Existing tracker ID (if already recorded)
                <input
                  type="number"
                  min="1"
                  className={input}
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                />
              </label>
              {detail.blockers
                .filter((b: Row) => b.status === "open")
                .map((b: Row) => (
                  <label className="flex gap-2 text-sm" key={b.id}>
                    <input
                      type="checkbox"
                      checked={resolveIds.includes(b.id)}
                      onChange={(e) =>
                        setResolveIds((v) =>
                          e.target.checked
                            ? [...v, b.id]
                            : v.filter((id) => id !== b.id),
                        )
                      }
                    />
                    Resolve: {b.reason_code} — {b.summary}
                  </label>
                ))}
              <label className="block text-sm">
                Receipt or resolution notes
                <textarea
                  className={input}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I submitted this application and reviewed the job and date.
              </label>
              <button
                className={button + " bg-foreground text-background"}
                disabled={busy || !confirmed}
              >
                Save submitted application
              </button>
            </form>
          )}
          <section className="space-y-3">
            <h3 className="font-medium">Blockers and resolutions</h3>
            {!detail.blockers.length && (
              <p className="text-sm text-foreground/50">
                No blockers recorded.
              </p>
            )}
            {detail.blockers.map((b: Row) => (
              <div
                key={b.id}
                className="border border-glass-border rounded-xl p-3 space-y-2"
              >
                <div className="flex justify-between gap-3 text-sm">
                  <strong>{b.reason_code}</strong>
                  <span>{b.status}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{b.summary}</p>
                <details>
                  <summary className="text-xs cursor-pointer">
                    Blocker details / questions
                  </summary>
                  <pre className="text-xs whitespace-pre-wrap break-words">
                    {JSON.stringify(JSON.parse(b.details_json), null, 2)}
                  </pre>
                </details>
                <p className="text-xs text-foreground/50">
                  {stamp(b.created_at)}
                  {b.resolved_at ? ` · Resolved ${stamp(b.resolved_at)}` : ""}
                </p>
                {b.resolution_json && (
                  <pre className="text-xs whitespace-pre-wrap break-words">
                    {JSON.stringify(JSON.parse(b.resolution_json), null, 2)}
                  </pre>
                )}
                {b.status === "open" && !manual && (
                  <>
                    <label className="block text-sm">
                      What changed?
                      <textarea
                        className={input}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="For example: I completed the CAPTCHA in the browser."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={button}
                        disabled={busy || !notes.trim()}
                        onClick={() => resolve(b, "retry")}
                      >
                        Resolve & retry
                      </button>
                      <button
                        className={button}
                        disabled={busy || !notes.trim()}
                        onClick={() => resolve(b, "resolved")}
                      >
                        Resolve only
                      </button>
                      <button
                        className={button}
                        disabled={busy || !notes.trim()}
                        onClick={() => resolve(b, "dismiss")}
                      >
                        Dismiss opportunity
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Attempts</h3>
            {!detail.attempts.length && (
              <p className="text-sm text-foreground/50">
                No attempts recorded yet.
              </p>
            )}
            {detail.attempts.map((a: Row) => (
              <div
                key={a.id}
                className="border-l-2 border-glass-border pl-3 space-y-1"
              >
                <p className="text-sm font-medium">
                  {a.outcome || "In progress"} · {a.worker_id || a.actor}
                </p>
                <p className="text-xs text-foreground/50">
                  {stamp(a.started_at)} ·{" "}
                  {a.agent_model || "Model not recorded"}
                </p>
                {a.notes && (
                  <p className="text-sm whitespace-pre-wrap">{a.notes}</p>
                )}
                {a.state === "running" &&
                  a.lease_expires_at < new Date().toISOString() && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(`${base}/attempts/${a.id}/recover`, {
                            version: a.version,
                          });
                          await refreshDetail();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Recover expired attempt
                    </button>
                  )}
                {a.application_id && (
                  <p className="text-sm text-emerald-700">
                    Tracker record #{a.application_id}
                  </p>
                )}
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Captured answers</h3>
            {!detail.captures.length && (
              <p className="text-sm text-foreground/50">
                No answer captures have been synced.
              </p>
            )}
            {detail.captures.map((c: Row) => {
              const document = c.document_json
                ? JSON.parse(c.document_json)
                : null;
              return (
                <details
                  onToggle={async (e) => {
                    if (e.currentTarget.open && !c.document_json) {
                      try {
                        const r = await api(`${base}/captures/${c.id}`);
                        setDetail((previous) =>
                          previous
                            ? {
                                ...previous,
                                captures: previous.captures.map((v: Row) =>
                                  v.id === c.id ? r.capture : v,
                                ),
                              }
                            : previous,
                        );
                      } catch (error) {
                        setError((error as Error).message);
                      }
                    }
                  }}
                  key={c.id}
                  className="border border-glass-border rounded-xl p-3"
                >
                  <summary className="cursor-pointer text-sm">
                    Revision {c.revision} · {c.state} · {stamp(c.captured_at)}
                  </summary>
                  {document && Array.isArray(document.pages) ? (
                    document.pages.map((p: Row, i: number) => (
                      <div key={p.page_id || i} className="mt-4">
                        <h4 className="font-medium text-sm">
                          {p.title || "Section"}
                        </h4>
                        {(Array.isArray(p.fields) ? p.fields : []).map(
                          (f: Row, n: number) => (
                            <div
                              key={f.field_id || n}
                              className="mt-2 border-l-2 pl-3 border-glass-border"
                            >
                              <p className="text-sm">{f.label}</p>
                              <pre className="text-sm whitespace-pre-wrap break-words text-foreground/60">
                                {renderAnswer(f.answer)}
                              </pre>
                            </div>
                          ),
                        )}
                      </div>
                    ))
                  ) : (
                    <pre className="mt-3 text-xs whitespace-pre-wrap break-words">
                      {document
                        ? JSON.stringify(document, null, 2)
                        : "Loading capture…"}
                    </pre>
                  )}
                </details>
              );
            })}
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {attention ? (
              <label className="text-sm">
                Reason
                <select
                  className={input}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setOffset(0);
                  }}
                >
                  {[
                    "",
                    "captcha",
                    "mfa",
                    "unanswered_question",
                    "submission_unknown",
                    "site_error",
                    "rate_limited",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s || "All reasons"}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="flex-1 text-sm">
                  Company or role
                  <input
                    className={input}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setCursor(null);
                    }}
                    placeholder="Search opportunities"
                  />
                </label>
                <label className="text-sm">
                  Status
                  <select
                    className={input}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setCursor(null);
                    }}
                  >
                    {[
                      "",
                      "pending",
                      "in_progress",
                      "blocked",
                      "skipped",
                      "applied",
                      "not_applicable",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s || "All statuses"}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <p className="text-xs text-foreground/50">
            {loading
              ? "Loading…"
              : `${total} ${attention ? "open blockers" : "opportunities"}`}
          </p>
          {!loading && !items.length && (
            <div className="py-10 text-center text-foreground/50">
              <p>
                {attention
                  ? "No open blockers."
                  : "No opportunities match these filters."}
              </p>
              <p className="text-sm mt-2">
                Jobs and agent outcomes appear here after they are synced
                through the shared API.
              </p>
            </div>
          )}
          <div className="divide-y divide-glass-border">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => open(attention ? item.collection_id : item.id)}
                className="w-full text-left py-4 hover:bg-foreground/[0.02] cursor-pointer"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-xs text-foreground/50">
                      {item.company || "Company unknown"}
                    </p>
                    <p className="font-medium">{item.role || "Untitled job"}</p>
                  </div>
                  <span className="text-xs">
                    {attention ? item.reason_code : item.status}
                  </span>
                </div>
                {item.summary && (
                  <p className="text-sm text-foreground/60 mt-1">
                    {item.summary}
                  </p>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(cursor || offset > 0) && (
              <button
                className={button}
                onClick={() => {
                  setCursor(null);
                  setOffset(0);
                }}
              >
                First page
              </button>
            )}
            {(attention ? offset + items.length < total : next) && (
              <button
                className={button}
                onClick={() =>
                  attention ? setOffset(offset + 50) : setCursor(next)
                }
              >
                Next page
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function JobActivity() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  const load = () =>
    api(base + "/metrics")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="p-5 space-y-4 border-t border-glass-border">
      <div className="flex justify-between">
        <h2 className="font-medium">Submission activity</h2>
        <button className={button} onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <>
          <p className="text-xs text-foreground/50">
            Last 14 days · America/New_York · Confirmed applications, not
            attempts
          </p>
          <div
            className="flex items-end gap-1 h-32"
            aria-label="Daily submissions"
          >
            {data.daily.map((d: Row) => (
              <div
                key={d.date}
                className="flex-1 h-full flex flex-col justify-end items-center gap-1"
                title={`${d.date}: ${d.count}`}
              >
                <span className="text-xs">{d.count}</span>
                <div
                  className="w-full rounded-t bg-emerald-600/65"
                  style={{
                    height: Math.max(
                      2,
                      (80 * d.count) /
                        Math.max(1, ...data.daily.map((x: Row) => x.count)),
                    ),
                  }}
                />
                <span className="text-[9px] text-foreground/50">
                  {d.date.slice(8)}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-sm font-medium">Attempt outcomes</h3>
              {data.outcomes.map((r: Row) => (
                <p
                  key={r.outcome || "running"}
                  className="text-sm text-foreground/60"
                >
                  {r.outcome || "running"}: {r.count}
                </p>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-medium">Open blockers</h3>
              {data.open_blockers.map((r: Row) => (
                <p key={r.reason_code} className="text-sm text-foreground/60">
                  {r.reason_code}: {r.count}
                </p>
              ))}
            </div>
          </div>
          <p className="text-xs text-foreground/40">
            Older applications without exact timestamps use their recorded date.
            Imports and retries do not count as new submissions.
          </p>
        </>
      ) : (
        <p>Loading activity…</p>
      )}
    </section>
  );
}

'use client'

import { useEffect, useState } from 'react'

type Job = {
  id: number; company: string; role: string; date: string; interviewed: boolean
  source: string | null; type: string | null; resume_type: string | null
  location: string | null; work_mode: string | null; description: string | null
  cover_letter: string | null; status: string | null; application_url: string | null
  external_id: string | null; agent_model: string | null; started_at: string | null
  completed_at: string | null; submitted_at: string | null; duration_seconds: number | null
  blocker: string | null; evidence_refs?: string | null; other_details?: string | null
}

const PAGE_SIZE = 20
const control = 'inline-flex min-h-9 min-w-8 sm:min-w-9 items-center justify-center rounded-lg px-1 sm:px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-30 disabled:cursor-not-allowed'

function pageNumbers(current: number, last: number): (number | string)[] {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1)
  const start = current <= 4 ? 2 : current >= last - 3 ? last - 4 : current - 1
  const end = current <= 4 ? 5 : current >= last - 3 ? last - 1 : current + 1
  return [1, ...(start > 2 ? ['before'] : []), ...Array.from({ length: end - start + 1 }, (_, index) => start + index), ...(end < last - 1 ? ['after'] : []), last]
}

function timestamp(value: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function TextSection({ title, value, mono = false }: { title: string; value: string | null | undefined; mono?: boolean }) {
  return <section className="min-w-0 space-y-2">
    <h4 className="text-xs font-medium text-foreground/50">{title}</h4>
    {value ? <div tabIndex={0} role="region" aria-label={title} className={`max-h-80 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl border border-glass-border bg-background/40 p-3 text-sm leading-relaxed text-foreground/75 focus-visible:outline-2 focus-visible:outline-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
      : <p className="text-sm text-foreground/35">Not recorded</p>}
  </section>
}

function JobDetails({ id, onInterviewedChange }: { id: number; onInterviewedChange: (id: number, value: boolean) => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/jobs/${id}`, { signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load details')
      if (!controller.signal.aborted) setJob(data.job)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [id, retry])

  async function toggleInterviewed() {
    if (!job || saving) return
    setSaving(true)
    setSaveError(null)
    const next = !job.interviewed
    try {
      const response = await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interviewed: next }) })
      if (!response.ok) throw new Error('Could not update interview status. Please try again.')
      setJob({ ...job, interviewed: next })
      onInterviewedChange(id, next)
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Update failed') }
    finally { setSaving(false) }
  }

  if (error) return <div role="alert" className="p-5 text-sm text-foreground/70">{error} <button className="ml-2 underline" onClick={() => { setError(null); setRetry(value => value + 1) }}>Retry details</button></div>
  if (!job) return <p role="status" className="p-5 text-sm text-foreground/50">Loading full application…</p>
  const metadata = [
    ['Status', job.status || 'Not recorded'], ['Application date', job.date],
    ['Source', job.source], ['Job type', job.type], ['Resume used', job.resume_type],
    ['Location', job.location], ['Work mode', job.work_mode], ['Model', job.agent_model],
    ['External record ID', job.external_id], ['Tracker ID', String(job.id)],
    ['Started', timestamp(job.started_at)], ['Completed', timestamp(job.completed_at)],
    ['Submitted', timestamp(job.submitted_at)],
    ['Measured duration', job.duration_seconds == null ? 'Not recorded' : `${job.duration_seconds.toLocaleString()} seconds`],
  ]
  const safeUrl = job.application_url && /^https?:\/\//i.test(job.application_url) ? job.application_url : null

  return <div className="space-y-6 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-medium text-foreground">Application details</h3>
      <button onClick={toggleInterviewed} disabled={saving} className={`${control} border border-glass-border bg-foreground/5 text-xs text-foreground/70 hover:bg-foreground/10`}>
        {saving ? 'Saving…' : job.interviewed ? 'Mark as not interviewed' : 'Mark as interviewed'}
      </button>
    </div>
    {saveError && <p role="alert" className="text-sm text-red-500">{saveError}</p>}
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
      {metadata.map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="mb-1 text-xs text-foreground/45">{label}</dt>
        <dd className="text-sm text-foreground/80 [overflow-wrap:anywhere]">{value || <span className="text-foreground/35">Not recorded</span>}</dd>
      </div>)}
      <div className="col-span-2 min-w-0 sm:col-span-3">
        <dt className="mb-1 text-xs text-foreground/45">Application URL</dt>
        <dd className="text-sm [overflow-wrap:anywhere]">{safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">{job.application_url}</a> : <span className="text-foreground/45">{job.application_url || 'Not recorded'}</span>}</dd>
      </div>
    </dl>
    <div className="space-y-5 border-t border-glass-border pt-5">
      <TextSection title="Blocker" value={job.blocker} />
      <TextSection title="Job description" value={job.description} />
      <TextSection title="Cover letter" value={job.cover_letter === 'no' ? 'No cover letter' : job.cover_letter} />
      <TextSection title="Evidence references" value={job.evidence_refs} mono />
      <TextSection title="Other details" value={job.other_details} />
    </div>
  </div>
}

export default function JobBrowser() {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState({ query: '', page: 1 })
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const searching = query !== selection.query
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (selection.query !== query) { setLoading(true); setSelection({ query, page: 1 }) }
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, selection.query])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ view: 'applied', limit: String(PAGE_SIZE), offset: String((selection.page - 1) * PAGE_SIZE), q: selection.query })
    fetch(`/api/jobs?${params}`, { signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load applications')
      if (controller.signal.aborted) return
      const maxPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
      if (selection.page > maxPage) { setSelection({ ...selection, page: maxPage }); return }
      setJobs(data.jobs)
      setTotal(data.total)
      setLoading(false)
    }).catch(error => {
      if (!controller.signal.aborted) { setError(error.message); setLoading(false) }
    })
    return () => controller.abort()
  }, [selection, retry])

  function changePage(page: number) {
    setLoading(true); setError(null); setExpandedId(null)
    setSelection({ ...selection, page })
  }

  return <div className="space-y-4 p-4 sm:p-5">
    <div className="relative">
      <span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-foreground/35">search</span>
      <input aria-label="Search applications by company" value={query} onChange={event => { setQuery(event.target.value); setError(null); setExpandedId(null) }} placeholder="Search by company…" className="w-full rounded-xl border border-glass-border bg-foreground/5 py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/35 focus-visible:outline-2 focus-visible:outline-foreground" />
    </div>
    {error ? <div role="alert" className="rounded-xl border border-glass-border p-4 text-sm text-foreground/70">{error} <button className="ml-2 underline" onClick={() => { setLoading(true); setError(null); setRetry(value => value + 1) }}>Retry applications</button></div>
      : loading || searching ? <p role="status" className="py-10 text-center text-sm text-foreground/50">Loading applications…</p>
      : !jobs.length ? <p role="status" className="py-10 text-center text-sm text-foreground/50">No applications found.</p>
      : <div className="space-y-2">
        <p role="status" className="text-xs text-foreground/45">Showing {(selection.page - 1) * PAGE_SIZE + 1}–{(selection.page - 1) * PAGE_SIZE + jobs.length} of {total} applications</p>
        {jobs.map(job => <article key={job.id} className="overflow-hidden rounded-xl border border-glass-border bg-foreground/[0.02]">
          <button type="button" aria-expanded={expandedId === job.id} aria-controls={`job-details-${job.id}`} onClick={() => setExpandedId(expandedId === job.id ? null : job.id)} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{job.company}</span>
                {job.status && <span title={job.status} className="max-w-40 truncate rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/60">{job.status}</span>}
                {job.interviewed && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Interviewed</span>}
              </span>
              <span className="mt-1 block truncate text-xs text-foreground/50">{[job.role, job.type, job.location].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="shrink-0 text-xs text-foreground/45">{job.date}</span>
            <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-lg text-foreground/30">{expandedId === job.id ? 'expand_less' : 'expand_more'}</span>
          </button>
          {expandedId === job.id && <div id={`job-details-${job.id}`} className="border-t border-glass-border bg-foreground/[0.01]">
            <JobDetails id={job.id} onInterviewedChange={(id, value) => setJobs(previous => previous.map(item => item.id === id ? { ...item, interviewed: value } : item))} />
          </div>}
        </article>)}
      </div>}
    {total > 0 && <nav aria-label="Application pages" className="flex flex-wrap items-center justify-center gap-1 border-t border-glass-border pt-4">
      <button aria-label="Previous page" disabled={loading || searching || selection.page === 1} onClick={() => changePage(selection.page - 1)} className={`${control} text-foreground/60 hover:bg-foreground/5`}><span aria-hidden="true" className="material-symbols-outlined text-lg">chevron_left</span></button>
      {pageNumbers(selection.page, lastPage).map(page => typeof page === 'string' ? <span key={page} className="px-1 text-foreground/35" aria-hidden="true">…</span> : <button key={page} aria-label={`Page ${page}`} aria-current={page === selection.page ? 'page' : undefined} disabled={loading || searching} onClick={() => { if (page !== selection.page) changePage(page) }} className={`${control} ${page === selection.page ? 'bg-foreground text-background' : 'text-foreground/60 hover:bg-foreground/5'}`}>{page}</button>)}
      <button aria-label="Next page" disabled={loading || searching || selection.page === lastPage} onClick={() => changePage(selection.page + 1)} className={`${control} text-foreground/60 hover:bg-foreground/5`}><span aria-hidden="true" className="material-symbols-outlined text-lg">chevron_right</span></button>
    </nav>}
  </div>
}

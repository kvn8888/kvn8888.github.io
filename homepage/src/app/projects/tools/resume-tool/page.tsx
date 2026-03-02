'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type Tab = 'add' | 'browse' | 'stats'

const SOURCE_OPTIONS = [
  'Jobright.ai',
  'Handshake',
  'RIT Career Connect',
  'LinkedIn',
  'Indeed',
  'Company Website',
  'Other',
]

const RESUME_TYPE_OPTIONS = [
  'AI Engineering',
  'General',
  'Frontend',
  'Backend',
  'Cloud',
  'Full Stack',
  'Embedded',
  'IoT',
  'DevOps',
  'Other',
]

interface ParsedJob {
  company: string
  role: string
  type: string
  description: string
}

interface JobApplication {
  id: number
  company: string
  role: string
  date: string
  source: string | null
  type: string | null
  cover_letter: string | null
  resume_type: string | null
  interviewed: boolean
  description: string | null
}

interface Stats {
  total: number
  today: number
  thisWeek: number
  lastWeek: number
  thisMonth: number
  avgPerDayWeek: number
  avgPerDayMonth: number
  weekComparison: string
}

// ─── Add Tab ──────────────────────────────────────────────────────────────────

function AddTab() {
  const [source, setSource] = useState(SOURCE_OPTIONS[0])
  const [coverLetter, setCoverLetter] = useState<'no' | 'yes'>('no')
  const [coverLetterText, setCoverLetterText] = useState('')
  const [resumeType, setResumeType] = useState(RESUME_TYPE_OPTIONS[0])
  const [pasteText, setPasteText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedJob | null>(null)
  const [editField, setEditField] = useState<keyof ParsedJob | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleParse = async () => {
    if (!pasteText.trim()) return
    setIsParsing(true)
    setParseError(null)
    setParsed(null)
    try {
      const res = await fetch('/api/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      setParsed(data)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse failed')
    } finally {
      setIsParsing(false)
    }
  }

  const startEdit = (field: keyof ParsedJob) => {
    setEditField(field)
    setEditValue(parsed?.[field] ?? '')
  }

  const commitEdit = () => {
    if (!parsed || !editField) return
    setParsed({ ...parsed, [editField]: editValue })
    setEditField(null)
  }

  const handleSubmit = async () => {
    if (!parsed) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: parsed.company,
          role: parsed.role,
          description: parsed.description,
          type: parsed.type,
          source,
          cover_letter: coverLetter === 'yes' ? (coverLetterText || '') : 'no',
          resume_type: resumeType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submit failed')
      setSuccessMsg(`Added: ${parsed.company} — ${parsed.role}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reset = () => {
    setSource(SOURCE_OPTIONS[0])
    setCoverLetter('no')
    setCoverLetterText('')
    setResumeType(RESUME_TYPE_OPTIONS[0])
    setPasteText('')
    setParsed(null)
    setParseError(null)
    setSubmitError(null)
    setSuccessMsg(null)
    setEditField(null)
  }

  if (successMsg) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 text-center">
        <span className="material-symbols-outlined text-5xl text-emerald-600">check_circle</span>
        <p className="text-base font-medium text-foreground">{successMsg}</p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add another
        </button>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      {/* Pre-parse controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-foreground/50">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full appearance-none bg-foreground/5 border border-glass-border rounded-xl px-4 py-3 text-foreground text-sm focus:border-glass-border-hover focus:outline-none"
          >
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground/50">Cover letter</label>
          <div className="flex gap-2">
            {(['no', 'yes'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCoverLetter(v)}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                  coverLetter === v
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-foreground/5 border-glass-border text-foreground/60 hover:text-foreground/80'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground/50">Resume type</label>
          <select
            value={resumeType}
            onChange={(e) => setResumeType(e.target.value)}
            className="w-full appearance-none bg-foreground/5 border border-glass-border rounded-xl px-4 py-3 text-foreground text-sm focus:border-glass-border-hover focus:outline-none"
          >
            {RESUME_TYPE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {coverLetter === 'yes' && (
        <textarea
          value={coverLetterText}
          onChange={(e) => setCoverLetterText(e.target.value)}
          placeholder="Paste cover letter text..."
          rows={4}
          className="w-full bg-foreground/5 border border-glass-border rounded-xl px-4 py-3 text-foreground placeholder:text-foreground/30 focus:border-glass-border-hover focus:outline-none text-sm resize-none"
        />
      )}

      {/* Job description textarea */}
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder="Paste job description..."
        rows={8}
        className="w-full bg-foreground/5 border border-glass-border rounded-xl px-4 py-3 text-foreground placeholder:text-foreground/30 focus:border-glass-border-hover focus:outline-none text-sm resize-none"
      />

      <button
        onClick={handleParse}
        disabled={isParsing || !pasteText.trim()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
      >
        <span className="material-symbols-outlined text-lg">
          {isParsing ? 'progress_activity' : 'auto_awesome'}
        </span>
        {isParsing ? 'Parsing…' : 'Parse with Gemini'}
      </button>

      {parseError && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <span className="material-symbols-outlined text-base">error</span>
          {parseError}
        </div>
      )}

      {/* Parsed preview */}
      {parsed && (
        <div className="rounded-2xl border border-glass-border bg-foreground/[0.02] p-4 space-y-3">
          <p className="text-xs text-foreground/40">Parsed — click any field to edit</p>
          {(['company', 'role', 'type', 'description'] as const).map((field) => (
            <div key={field}>
              <p className="text-xs text-foreground/40 mb-0.5 capitalize">{field}</p>
              {editField === field ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditField(null)
                    }}
                    className="flex-1 bg-foreground/5 border border-glass-border-hover rounded-xl px-3 py-1.5 text-sm text-foreground focus:outline-none"
                  />
                  <button
                    onClick={commitEdit}
                    className="px-3 py-1.5 rounded-xl bg-foreground text-background text-sm cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <p
                  onClick={() => startEdit(field)}
                  className="text-sm text-foreground cursor-pointer hover:bg-foreground/5 rounded-lg px-2 py-1 -mx-2 transition-colors truncate"
                  title={parsed[field]}
                >
                  {field === 'description' && parsed[field]?.length > 120
                    ? parsed[field].slice(0, 120) + '…'
                    : parsed[field]}
                </p>
              )}
            </div>
          ))}

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <span className="material-symbols-outlined text-base">error</span>
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">
              {isSubmitting ? 'progress_activity' : 'save'}
            </span>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function BrowseTab() {
  const [query, setQuery] = useState('')
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LIMIT = 20

  const fetchJobs = useCallback(async (q: string, off: number, replace: boolean) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) })
      if (q) params.set('q', q)
      const res = await fetch(`/api/jobs?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      setJobs((prev) => (replace ? data.jobs : [...prev, ...data.jobs]))
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs('', 0, true)
  }, [fetchJobs])

  const handleSearch = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setOffset(0)
      fetchJobs(q, 0, true)
    }, 300)
  }

  const loadMore = () => {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    fetchJobs(query, newOffset, false)
  }

  const toggleInterviewed = async (job: JobApplication) => {
    const newVal = !job.interviewed
    // Optimistic update
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, interviewed: newVal } : j)))
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewed: newVal ? 1 : 0 }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, interviewed: job.interviewed } : j)))
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30 text-lg pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by company…"
          className="w-full bg-foreground/5 border border-glass-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-foreground/30 focus:border-glass-border-hover focus:outline-none text-sm"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* Results */}
      {jobs.length === 0 && !isLoading ? (
        <div className="text-center py-10 space-y-2">
          <span className="material-symbols-outlined text-4xl text-foreground/20">work_off</span>
          <p className="text-sm text-foreground/40">No applications found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-glass-border bg-foreground/[0.02] overflow-hidden"
            >
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-foreground/5 transition-colors"
                onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{job.company}</span>
                    {job.interviewed && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">
                        <span className="material-symbols-outlined text-xs">check</span>
                        Interviewed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/50 mt-0.5 truncate">
                    {job.role}
                    {job.type ? ` · ${job.type}` : ''}
                    {job.resume_type ? ` · ${job.resume_type}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground/40">{job.date}</p>
                  {job.source && <p className="text-xs text-foreground/30">{job.source}</p>}
                </div>
                <span className="material-symbols-outlined text-foreground/20 text-lg shrink-0">
                  {expandedId === job.id ? 'expand_less' : 'expand_more'}
                </span>
              </div>

              {expandedId === job.id && (
                <div className="border-t border-glass-border p-3 space-y-3 bg-foreground/[0.01]">
                  {job.description && (
                    <p className="text-xs text-foreground/60 whitespace-pre-wrap">{job.description}</p>
                  )}
                  {job.cover_letter && job.cover_letter !== 'no' && job.cover_letter !== '' && (
                    <div>
                      <p className="text-xs text-foreground/40 mb-1">Cover letter</p>
                      <p className="text-xs text-foreground/60 whitespace-pre-wrap">
                        {job.cover_letter === 'yes' ? 'Yes' : job.cover_letter}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => toggleInterviewed(job)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                      job.interviewed
                        ? 'bg-foreground/5 text-foreground/60 border-glass-border hover:bg-foreground/10'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {job.interviewed ? 'remove_circle' : 'check_circle'}
                    </span>
                    {job.interviewed ? 'Mark as not interviewed' : 'Mark as interviewed'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-4">
          <span className="material-symbols-outlined text-foreground/30 animate-spin">progress_activity</span>
        </div>
      )}

      {!isLoading && jobs.length > 0 && jobs.length < total && (
        <button
          onClick={loadMore}
          className="w-full py-2.5 rounded-xl bg-foreground/5 border border-glass-border text-sm text-foreground/60 hover:bg-foreground/10 transition-colors cursor-pointer"
        >
          Load more ({total - jobs.length} remaining)
        </button>
      )}

      {!isLoading && jobs.length > 0 && (
        <p className="text-center text-xs text-foreground/30">
          Showing {jobs.length} of {total}
        </p>
      )}
    </div>
  )
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jobs/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setStats(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <span className="material-symbols-outlined text-foreground/30 animate-spin">progress_activity</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-red-500">
        <span className="material-symbols-outlined text-base">error</span>
        {error}
      </div>
    )
  }

  if (!stats) return null

  const diff = stats.thisWeek - stats.lastWeek
  const diffColor = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-foreground/40'

  const metricCards = [
    {
      label: 'Total all-time',
      value: stats.total,
      icon: 'work',
      sub: null,
    },
    {
      label: 'This week',
      value: stats.thisWeek,
      icon: 'calendar_today',
      sub: (
        <span className={`text-xs font-medium ${diffColor}`}>
          {diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff} vs last week
        </span>
      ),
    },
    {
      label: 'This month',
      value: stats.thisMonth,
      icon: 'calendar_month',
      sub: null,
    },
    {
      label: 'Avg / day this week',
      value: stats.avgPerDayWeek,
      icon: 'trending_up',
      sub: <span className="text-xs text-foreground/40">{stats.avgPerDayMonth}/day this month</span>,
    },
  ]

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-glass-border bg-foreground/[0.02] p-4 space-y-1"
          >
            <div className="flex items-center gap-1.5 text-foreground/40">
              <span className="material-symbols-outlined text-base">{card.icon}</span>
              <span className="text-xs">{card.label}</span>
            </div>
            <p className="text-3xl font-medium text-foreground">{card.value}</p>
            {card.sub && <div>{card.sub}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-glass-border bg-foreground/[0.02] p-4 space-y-1">
        <p className="text-xs text-foreground/40">Today</p>
        <p className="text-2xl font-medium text-foreground">{stats.today}</p>
        <p className="text-xs text-foreground/40">{stats.weekComparison}</p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const tabs: { id: Tab; label: string }[] = [
  { id: 'add', label: 'Add' },
  { id: 'browse', label: 'Browse' },
  { id: 'stats', label: 'Stats' },
]

export default function ResumeTool() {
  const [activeTab, setActiveTab] = useState<Tab>('add')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className={`text-2xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Job Tracker
        </h1>
        <p className={`text-sm text-foreground/50 mt-1 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Add, browse, and track job applications.
        </p>
      </div>

      {/* Tab bar */}
      <div className={`flex justify-center gap-2 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden ${mounted ? 'blur-reveal-3' : 'opacity-0'}`}>
        {activeTab === 'add' && <AddTab />}
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  )
}

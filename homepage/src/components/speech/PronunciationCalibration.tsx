'use client'

import { useId, useState, type ReactNode } from 'react'
import type {
  CalibrationReport,
  MetricRange,
  PhoneComparison,
  PhonemeTrend,
  PhraseComparison,
  ReferenceSample,
  ScoreMetric,
} from '@/lib/pronunciationCalibrationTypes'
import { pronunciationReferenceVoiceLabel } from '@/lib/pronunciationVoices'

export interface PronunciationCalibrationProps {
  report: CalibrationReport | null
  loading: boolean
  error: string | null
  building: boolean
  progress: string | null
  onBuild: () => void
  onRefresh: () => void
  compact?: boolean
}

// A range needs at least this much behind it before anything is called inside or outside it.
const MIN_VOICES = 2
const MIN_SAMPLES = 2

const SCORE_METRICS: { key: ScoreMetric; label: string }[] = [
  { key: 'pronunciation', label: 'Overall' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'prosody', label: 'Prosody' },
]

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50'
const secondaryButton = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-4 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`
const primaryButton = `inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-xs font-medium text-background transition-opacity hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-background`
const cardClass = 'rounded-xl border border-foreground/10 bg-foreground/[0.02]'

// Blue is the assessed audio, orange is the synthetic reference. The pair also differs in shape and line style.
const learnerText = 'text-[#2a78d6] [.dark_&]:text-[#3987e5]'
const learnerFill = 'bg-[#2a78d6] [.dark_&]:bg-[#3987e5]'
const referenceText = 'text-[#d95f22] [.dark_&]:text-[#d95926]'
const referenceBand = 'border border-dashed border-[#d95f22] bg-[#d95f22]/15 [.dark_&]:border-[#d95926]'
const referenceTick = 'bg-[#d95f22] [.dark_&]:bg-[#d95926]'

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '—'
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`
}

function formatSeconds(value: number): string {
  return `${formatNumber(value, 2)} s`
}

function formatHz(value: number): string {
  return `${Math.round(value)} Hz`
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function hasReferenceSpread(report: CalibrationReport): boolean {
  return report.eligibleReferenceCount >= MIN_SAMPLES && report.referenceVoiceCount >= MIN_VOICES
}

// Branded so that a failed check doesn't narrow an ordinary range to `never`.
type SpanRange = MetricRange & { readonly __span: true }

function isComparable(ready: boolean, range: MetricRange | null | undefined): range is SpanRange {
  return Boolean(ready && range && range.sampleCount >= MIN_SAMPLES)
}

type Position = 'below' | 'within' | 'above'

function positionIn(value: number, range: MetricRange): Position {
  if (value < range.min) return 'below'
  if (value > range.max) return 'above'
  return 'within'
}

function describePosition(value: number, range: MetricRange, format: (n: number) => string): string {
  const position = positionIn(value, range)
  if (position === 'within') return 'Within span'
  const gap = Math.abs(position === 'below' ? range.min - value : value - range.max)
  return `${format(gap)} ${position} span`
}

function isPhoneOutside(phone: PhoneComparison, ready: boolean): boolean {
  return isComparable(ready, phone.referenceScore) && positionIn(phone.score, phone.referenceScore) === 'below'
}

function Disclosure({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <details className={`group/section ${cardClass}`}>
      <summary className={`flex min-h-12 cursor-pointer select-none list-none items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-foreground/[0.03] [&::-webkit-details-marker]:hidden ${focusRing} focus-visible:ring-inset`}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block break-words text-xs text-foreground/60">{meta}</span>
        </span>
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-foreground/60 transition-transform group-open/section:rotate-180 motion-reduce:transition-none" aria-hidden="true">
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-foreground/10 p-3">{children}</div>
    </details>
  )
}

function Legend({ subject }: { subject: string }) {
  return (
    <ul aria-label="Chart legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${learnerFill}`} />
        {subject}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2.5 w-5 rounded-sm ${referenceBand}`} />
        Synthetic reference span (min–max)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-3 w-0.5 ${referenceTick}`} />
        Reference mean
      </li>
    </ul>
  )
}

/** One measure on one axis: the assessed value against the observed synthetic span. */
function RangeRow({
  label,
  subject,
  value,
  range,
  ready,
  format,
  domain,
}: {
  label: string
  subject: string
  value: number | null
  range: MetricRange | null | undefined
  ready: boolean
  format: (n: number) => string
  domain?: [number, number]
}) {
  const comparable = isComparable(ready, range)
  const known = [value, range?.min, range?.max].filter((n): n is number => n != null && Number.isFinite(n))
  const [low, high] = domain ?? [Math.min(0, ...known), Math.max(1, ...known) * 1.15]
  const percent = (n: number) => Math.min(100, Math.max(0, ((n - low) / (high - low || 1)) * 100))
  const verdict = value != null && comparable ? describePosition(value, range, format) : null

  const referenceSummary = !range
    ? 'No matching reference measurement'
    : comparable
      ? `Reference ${format(range.min)} to ${format(range.max)}, mean ${format(range.mean)}, from ${plural(range.sampleCount, 'measurement')}`
      : `Too little reference data for a span. Mean ${format(range.mean)} from ${plural(range.sampleCount, 'measurement')}`

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-xs font-medium text-foreground/80">{label}</p>
        <p className="text-xs tabular-nums text-foreground/70">
          <span className="sr-only">{subject}: </span>
          <span className="text-sm font-medium text-foreground">{value == null ? 'Not measured' : format(value)}</span>
          {verdict && <span> · {verdict}</span>}
        </p>
      </div>
      <div aria-hidden="true" className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/10" />
        {comparable && (
          <div
            className={`absolute inset-y-0.5 min-w-1.5 rounded ${referenceBand}`}
            style={{ left: `${percent(range.min)}%`, width: `${percent(range.max) - percent(range.min)}%` }}
          />
        )}
        {range && <div className={`absolute inset-y-0 w-0.5 -translate-x-1/2 ${referenceTick}`} style={{ left: `${percent(range.mean)}%` }} />}
        {value != null && (
          <div
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${learnerFill}`}
            style={{ left: `${percent(value)}%` }}
          />
        )}
      </div>
      <p className="text-[11px] leading-snug tabular-nums text-foreground/60">{referenceSummary}</p>
    </div>
  )
}

function ScoreOverview({ report, subject, ready }: { report: CalibrationReport; subject: string; ready: boolean }) {
  const rows = SCORE_METRICS.filter(({ key }) => report.learnerScores[key] != null || report.scoreRanges[key])
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={`${cardClass} space-y-3 p-3`}>
      <div>
        <h4 id={headingId} className="text-sm font-medium text-foreground">{ready ? 'Same phrase, compared with synthetic takes' : 'Scores for this phrase'}</h4>
        <p className="text-xs text-foreground/60">Azure scores out of 100. A reference span is what these takes scored, not a target or a pass mark.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-foreground/60">No scores are available for this attempt.</p>
      ) : (
        <>
          <Legend subject={subject} />
          <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
            {rows.map(({ key, label }) => (
              <RangeRow
                key={key}
                label={label}
                subject={subject}
                value={report.learnerScores[key] ?? null}
                range={report.scoreRanges[key]}
                ready={ready}
                format={formatNumber}
                domain={[0, 100]}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function ReferenceVoices({ samples }: { samples: ReferenceSample[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const groupName = useId()
  const accepted = samples.filter((sample) => sample.accepted)
  const excluded = samples.filter((sample) => !sample.accepted)
  const playable = [...accepted, ...excluded].filter((sample) => sample.audioUrl)
  const selected = playable.find((sample) => sample.id === selectedId) ?? playable[0]

  // Take numbers follow creation order within each voice, so repeated voices stay distinguishable.
  const names = new Map<string, string>()
  const takes = new Map<string, number>()
  for (const sample of [...samples].sort((a, b) => a.createdAt - b.createdAt)) {
    const take = (takes.get(sample.voice) ?? 0) + 1
    takes.set(sample.voice, take)
    names.set(sample.id, `${pronunciationReferenceVoiceLabel(sample.voice)}, take ${take}`)
  }

  const renderSample = (sample: ReferenceSample) => {
    const checked = selected?.id === sample.id
    return (
      <li key={sample.id}>
        <label className={`flex min-h-12 items-start gap-2.5 rounded-lg border p-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground/50 ${checked ? 'border-foreground/40 bg-foreground/5' : 'border-foreground/10'} ${sample.audioUrl ? 'cursor-pointer hover:bg-foreground/5' : ''}`}>
          <input
            type="radio"
            name={groupName}
            className="mt-0.5 h-4 w-4 shrink-0 accent-current disabled:opacity-30"
            checked={checked}
            disabled={!sample.audioUrl}
            onChange={() => setSelectedId(sample.id)}
          />
          <span className="min-w-0 flex-1 break-words">
            <span className="block text-xs font-medium text-foreground">{names.get(sample.id)}</span>
            <span className="block text-[11px] text-foreground/60">
              {sample.accepted ? 'Used in spans' : 'Excluded from spans'}
              {sample.score != null ? ` · scored ${formatNumber(sample.score)}` : ' · no score'}
              {!sample.audioUrl ? ' · no audio' : ''}
            </span>
            {sample.reason && <span className="block text-[11px] text-foreground/70">{sample.accepted ? 'Quality note' : 'Reason'}: {sample.reason}</span>}
          </span>
        </label>
      </li>
    )
  }

  if (samples.length === 0) {
    return <p className="text-sm text-foreground/60">No reference takes have been generated for this phrase.</p>
  }

  return (
    <>
      {selected?.audioUrl ? (
        <div className="space-y-2 rounded-lg border border-dashed border-foreground/25 p-3">
          <p className="break-words text-xs text-foreground/80">
            <span className="font-medium text-foreground">Synthetic voice, not your speech:</span> {names.get(selected.id)}
            {selected.accepted ? '' : ' (excluded by quality checks)'}
          </p>
          <audio
            key={selected.audioUrl}
            controls
            preload="none"
            src={selected.audioUrl}
            aria-label={`Synthetic reference audio: ${names.get(selected.id)}`}
            onError={() => setFailedUrl(selected.audioUrl ?? null)}
            className="w-full"
          />
          {failedUrl === selected.audioUrl && <p role="alert" className="text-xs text-foreground/80">This audio couldn’t be played. The link may have expired. Refresh the comparison and try again.</p>}
          <p className="text-[11px] text-foreground/60">
            {selected.model} · <time dateTime={Number.isFinite(selected.createdAt) ? new Date(selected.createdAt).toISOString() : undefined}>{new Date(selected.createdAt).toLocaleDateString()}</time>
          </p>
        </div>
      ) : (
        <p className="text-xs text-foreground/60">No reference audio is available to play.</p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs text-foreground/60">Choose which take to play. This does not change the spans.</legend>
        {accepted.length > 0 ? (
          <ul className="grid gap-2 @xl:grid-cols-2">{accepted.map(renderSample)}</ul>
        ) : (
          <p className="text-xs text-foreground/70">No take passed the quality checks.</p>
        )}
        {excluded.length > 0 && (
          <details>
            <summary className={`min-h-10 cursor-pointer select-none rounded py-2.5 text-xs text-foreground/70 hover:text-foreground ${focusRing}`}>Excluded by quality checks ({excluded.length})</summary>
            <ul className="grid gap-2 pt-1 @xl:grid-cols-2">{excluded.map(renderSample)}</ul>
          </details>
        )}
      </fieldset>
    </>
  )
}

function FilterButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`min-h-9 rounded-full px-3 text-xs cursor-pointer transition-colors ${focusRing} ${pressed ? 'bg-foreground text-background' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}`}>
      {children}
    </button>
  )
}

function VowelDetail({ vowel, ready }: { vowel: NonNullable<PhoneComparison['vowel']>; ready: boolean }) {
  const formants = [
    { label: 'F1', hz: vowel.f1Hz, z: vowel.f1Z, range: vowel.referenceF1Z },
    { label: 'F2', hz: vowel.f2Hz, z: vowel.f2Z, range: vowel.referenceF2Z },
  ]
  return (
    <details>
      <summary className={`min-h-10 cursor-pointer select-none rounded py-2.5 text-xs font-medium text-foreground/80 hover:text-foreground ${focusRing}`}>Vowel formants (exploratory)</summary>
      <div className="space-y-2 pt-1">
        <dl className="grid gap-2 @sm:grid-cols-2">
          {formants.map(({ label, hz, z, range }) => (
            <div key={label} className="rounded-lg border border-foreground/10 p-2.5 text-xs">
              <dt className="font-medium text-foreground">{label} · {formatHz(hz)}</dt>
              <dd className="mt-1 space-y-0.5 tabular-nums text-foreground/70">
                {z == null ? (
                  <p>No z-score: this clip has too few usable or varied vowels.</p>
                ) : (
                  <>
                    <p>Within-clip z-score: {formatSigned(z)}</p>
                    {isComparable(ready, range) ? (
                      <p>
                        Reference z: {formatSigned(range.min)} to {formatSigned(range.max)} (n={range.sampleCount}).{' '}
                        {{ below: 'This value is lower than that span.', within: 'This value falls within that span.', above: 'This value is higher than that span.' }[positionIn(z, range)]}
                      </p>
                    ) : (
                      <p>Not enough reference z-scores to compare.</p>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-relaxed text-foreground/60">
          Raw Hz depends on the speaker’s voice and isn’t compared. A z-score places this vowel among the vowels in its own clip, so it also shifts with which vowels the phrase contains. A difference does not show which way to move your tongue or that the vowel was wrong.
        </p>
      </div>
    </details>
  )
}

function SoundComparison({ phones, subject, ready }: { phones: PhoneComparison[]; subject: string; ready: boolean }) {
  const outside = phones.filter((phone) => isPhoneOutside(phone, ready))
  const [filter, setFilter] = useState<'below' | 'all'>(() => (outside.length > 0 ? 'below' : 'all'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailId = useId()
  const visible = filter === 'below' && outside.length > 0 ? outside : phones
  const selected = visible.find((phone) => phone.id === selectedId) ?? visible[0]

  if (!selected) {
    return <p className="text-sm text-foreground/60">No sounds could be matched between this attempt and the reference takes.</p>
  }

  return (
    <>
      {outside.length > 0 && outside.length < phones.length && (
        <div role="group" aria-label="Sounds shown" className="flex flex-wrap gap-1.5">
          <FilterButton pressed={filter === 'below'} onClick={() => setFilter('below')}>Below span ({outside.length})</FilterButton>
          <FilterButton pressed={filter === 'all'} onClick={() => setFilter('all')}>All matched ({phones.length})</FilterButton>
        </div>
      )}
      <ul aria-label="Matched sounds" className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto overscroll-contain p-0.5">
        {visible.map((phone) => {
          const pressed = phone.id === selected.id
          const below = isPhoneOutside(phone, ready)
          return (
            <li key={phone.id}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-controls={detailId}
                onClick={() => setSelectedId(phone.id)}
                className={`min-h-10 rounded-lg border px-2.5 py-1 text-left cursor-pointer transition-colors ${focusRing} ${pressed ? 'border-foreground/60 bg-foreground/10' : 'border-foreground/10 hover:bg-foreground/5'}`}
              >
                <span className="font-mono text-sm text-foreground">/{phone.phoneme}/</span>{' '}
                <span className="text-xs text-foreground/70">in “{phone.word}”</span>{' '}
                <span className="text-xs tabular-nums text-foreground">{formatNumber(phone.score, 0)}</span>
                {below && <><span aria-hidden="true" className="text-xs text-foreground/70"> ↓</span><span className="sr-only">, below reference span</span></>}
              </button>
            </li>
          )
        })}
      </ul>
      <div id={detailId} role="region" aria-label={`Detail for /${selected.phoneme}/ in ${selected.word}`} className="space-y-4 rounded-lg border border-foreground/10 bg-background/40 p-3">
        <div>
          <p className="break-words text-sm font-medium text-foreground"><span className="font-mono">/{selected.phoneme}/</span> in “{selected.word}”</p>
          <p className="text-xs text-foreground/60">One occurrence in one attempt. On its own it doesn’t show a habit.</p>
        </div>
        <RangeRow label="Azure accuracy estimate" subject={subject} value={selected.score} range={selected.referenceScore} ready={ready} format={formatNumber} domain={[0, 100]} />
        <RangeRow label="Aligned duration" subject={subject} value={selected.durationMs} range={selected.referenceDurationMs} ready={ready} format={formatMs} />
        <p className="text-[11px] text-foreground/60">Durations come from automatic alignment, so boundaries are approximate. Longer or shorter isn’t better by itself.</p>
        {selected.vowel && <VowelDetail key={selected.id} vowel={selected.vowel} ready={ready} />}
      </div>
    </>
  )
}

const CHART = { width: 320, height: 150, left: 34, right: 10, top: 10, bottom: 10 }

/** Splits a series at gaps so unvoiced stretches are never drawn as measured pitch. */
function contiguousRuns<T>(values: (T | null)[]): { index: number; value: T }[][] {
  const runs: { index: number; value: T }[][] = []
  let run: { index: number; value: T }[] = []
  values.forEach((value, index) => {
    if (value != null) {
      run.push({ index, value })
    } else if (run.length) {
      runs.push(run)
      run = []
    }
  })
  if (run.length) runs.push(run)
  return runs
}

function PitchChart({ phrase, subject, ready }: { phrase: PhraseComparison; subject: string; ready: boolean }) {
  const [activeBin, setActiveBin] = useState<number | null>(null)
  const count = Math.max(phrase.learnerContour.length, phrase.referenceContour.length)
  const bins = Array.from({ length: count }, (_, index) => ({
    learner: phrase.learnerContour[index] ?? null,
    reference: phrase.referenceContour[index] ?? null,
  }))
  const all = bins.flatMap(({ learner, reference }) => [learner, reference?.min, reference?.max, reference?.mean]).filter((n): n is number => n != null && Number.isFinite(n))

  if (all.length === 0) {
    return <p className="text-sm text-foreground/60">There wasn’t enough voiced audio to draw a pitch contour for this phrase.</p>
  }

  // Keep at least ±3 semitones so tiny variations don't look dramatic.
  const high = Math.ceil(Math.max(3, ...all))
  const low = Math.floor(Math.min(-3, ...all))
  const slot = (CHART.width - CHART.left - CHART.right) / count
  const x = (index: number) => CHART.left + slot * (index + 0.5)
  const y = (value: number) => CHART.top + ((high - value) / (high - low)) * (CHART.height - CHART.top - CHART.bottom)
  const spanRuns = contiguousRuns(bins.map(({ reference }) => (isComparable(ready, reference) ? reference : null)))
  const meanRuns = contiguousRuns(bins.map(({ reference }) => reference))
  const learnerRuns = contiguousRuns(bins.map(({ learner }) => learner))

  const describeBin = (index: number) => {
    const { learner, reference } = bins[index]
    const own = learner == null ? 'not measured' : `${formatSigned(learner)} st`
    const other = !reference
      ? 'no reference value'
      : isComparable(ready, reference)
        ? `reference ${formatSigned(reference.min)} to ${formatSigned(reference.max)} st`
        : `reference mean ${formatSigned(reference.mean)} st (no span)`
    return `Part ${index + 1} of ${count}: ${subject.toLowerCase()} ${own}; ${other}.`
  }

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-foreground/60">Pitch shape in semitones from each clip’s own median pitch (0), over equal parts of the phrase.</figcaption>
      <div className="mx-auto max-w-xl">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Pitch contour of ${subject.toLowerCase()} against the synthetic reference. Values are in the table below.`}
          onPointerLeave={() => setActiveBin(null)}
        >
          {[high, 0, low].map((tick) => (
            <g key={tick}>
              <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y(tick)} y2={y(tick)} className="stroke-foreground/10" strokeWidth="1" />
              <text x={CHART.left - 6} y={y(tick) + 3} textAnchor="end" fontSize="9" className="fill-foreground/60">{formatSigned(tick)}</text>
            </g>
          ))}
          {activeBin != null && <rect x={x(activeBin) - slot / 2} y={CHART.top} width={slot} height={CHART.height - CHART.top - CHART.bottom} className="fill-foreground/5" />}
          <g className={referenceText}>
            {spanRuns.map((run) => run.length === 1 ? (
              <rect key={run[0].index} x={x(run[0].index) - 6} y={y(run[0].value.max)} width="12" height={Math.max(3, y(run[0].value.min) - y(run[0].value.max))} rx="2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeDasharray="3 2" />
            ) : (
              <polygon
                key={run[0].index}
                points={[
                  ...run.map(({ index, value }) => `${x(index)},${y(value.max)}`),
                  ...[...run].reverse().map(({ index, value }) => `${x(index)},${y(value.min)}`),
                ].join(' ')}
                fill="currentColor"
                fillOpacity="0.18"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            ))}
            {meanRuns.map((run) => (
              <g key={run[0].index}>
                {run.length > 1 && <polyline points={run.map(({ index, value }) => `${x(index)},${y(value.mean)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 3" />}
                {run.map(({ index, value }) => <rect key={index} x={x(index) - 1} y={y(value.mean) - 4} width="2" height="8" fill="currentColor" />)}
              </g>
            ))}
          </g>
          <g className={learnerText}>
            {learnerRuns.map((run) => (
              <g key={run[0].index}>
                {run.length > 1 && <polyline points={run.map(({ index, value }) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                {run.map(({ index, value }) => <circle key={index} cx={x(index)} cy={y(value)} r="4" fill="currentColor" className="stroke-background" strokeWidth="1.5" />)}
              </g>
            ))}
          </g>
          {bins.map((_, index) => (
            <rect key={index} x={x(index) - slot / 2} y={0} width={slot} height={CHART.height} fill="transparent" onPointerEnter={() => setActiveBin(index)} onPointerDown={() => setActiveBin(index)}>
              <title>{describeBin(index)}</title>
            </rect>
          ))}
        </svg>
        <div aria-hidden="true" className="flex justify-between pl-[10%] text-[11px] text-foreground/60">
          <span>Phrase start</span><span>Phrase end</span>
        </div>
      </div>
      <p aria-hidden="true" className="min-h-8 text-[11px] tabular-nums text-foreground/70">{activeBin != null && activeBin < count ? describeBin(activeBin) : 'Point to or tap a part of the chart for its values. Gaps mean pitch wasn’t measured.'}</p>
      <details>
        <summary className={`min-h-10 cursor-pointer select-none rounded py-2.5 text-xs text-foreground/70 hover:text-foreground ${focusRing}`}>Show pitch values as a table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">Pitch in semitones from clip median, by part of phrase</caption>
            <thead className="text-foreground/60">
              <tr><th scope="col" className="py-1 pr-3 font-medium">Part</th><th scope="col" className="py-1 pr-3 font-medium">{subject}</th><th scope="col" className="py-1 font-medium">Synthetic reference</th></tr>
            </thead>
            <tbody className="text-foreground/80">
              {bins.map(({ learner, reference }, index) => (
                <tr key={index} className="border-t border-foreground/10">
                  <th scope="row" className="py-1.5 pr-3 font-normal">{index + 1}</th>
                  <td className="py-1.5 pr-3">{learner == null ? 'Not measured' : formatSigned(learner)}</td>
                  <td className="py-1.5">{!reference ? 'Not available' : isComparable(ready, reference) ? `${formatSigned(reference.min)} to ${formatSigned(reference.max)}` : `${formatSigned(reference.mean)} (mean only)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

function PitchAndTiming({ report, subject, ready }: { report: CalibrationReport; subject: string; ready: boolean }) {
  const [phraseId, setPhraseId] = useState<string | null>(null)
  const selectId = useId()
  const phrases = report.phraseComparisons
  const phrase = phrases.find((candidate) => candidate.id === phraseId) ?? phrases[0]

  if (!phrase && !report.pauseComparison && !report.pauseLocations?.length) {
    return <p className="text-sm text-foreground/60">No phrase pitch or pause measurements are available for this attempt.</p>
  }

  return (
    <>
      {phrases.length > 1 && (
        <div className="space-y-1">
          <label htmlFor={selectId} className="block text-xs font-medium text-foreground/80">Phrase ({phrases.length})</label>
          <select id={selectId} value={phrase?.id} onChange={(event) => setPhraseId(event.target.value)} className={`min-h-10 w-full min-w-0 rounded-lg border border-foreground/15 bg-background px-2.5 text-sm text-foreground ${focusRing}`}>
            {phrases.map((candidate, index) => <option key={candidate.id} value={candidate.id}>{index + 1}. {candidate.text}</option>)}
          </select>
        </div>
      )}
      {phrase && (
        <>
          <p className="break-words text-sm text-foreground">“{phrase.text}”</p>
          <Legend subject={subject} />
          <PitchChart key={phrase.id} phrase={phrase} subject={subject} ready={ready} />
          <RangeRow label="Phrase duration" subject={subject} value={phrase.learnerDurationMs / 1000} range={phrase.referenceDurationMs && toSeconds(phrase.referenceDurationMs)} ready={ready} format={formatSeconds} />
        </>
      )}
      {!!report.pauseLocations?.length && (
        <details className="rounded-lg border border-foreground/10 p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground/80">Matched word-boundary pauses ({report.pauseLocations.length})</summary>
          <div className="mt-3 space-y-3">
            {report.pauseLocations.map(p => <RangeRow key={p.id} label={`After “${p.afterWord}”, before “${p.beforeWord}”`} subject={subject} value={p.learnerSeconds} range={p.referenceSeconds} ready={ready} format={formatSeconds} />)}
          </div>
        </details>
      )}
      {report.pauseComparison ? (
        <div className="space-y-1 border-t border-foreground/10 pt-3">
          <RangeRow label="Pause time, whole attempt" subject={subject} value={report.pauseComparison.learnerSeconds} range={report.pauseComparison.referenceSeconds} ready={ready} format={formatSeconds} />
        </div>
      ) : (
        <p className="text-xs text-foreground/60">No pause comparison is available.</p>
      )}
      <p className="text-[11px] leading-relaxed text-foreground/60">Natural speakers vary in melody, pace and pausing. These show differences from a few synthetic readings, not errors.</p>
    </>
  )
}

function toSeconds(range: MetricRange): MetricRange {
  return { ...range, min: range.min / 1000, max: range.max / 1000, mean: range.mean / 1000 }
}

type TrendState = 'recurring' | 'thin' | 'quiet'

/** "Recurring" needs repeats across attempts, tokens and words; counts alone can't prove a habit. */
function trendState(trend: PhonemeTrend): TrendState {
  if (trend.attemptCount < 2 || trend.tokenCount < 3 || trend.distinctWords < 2) return 'thin'
  return trend.suspectedLowCount >= 2 && trend.lowAttemptCount >= 2 && trend.lowDistinctWords >= 2 ? 'recurring' : 'quiet'
}

const TREND_LABEL: Record<TrendState, string> = {
  recurring: 'Worth practising',
  quiet: 'No repeated low estimates',
  thin: 'Too little evidence',
}
const TREND_ORDER: Record<TrendState, number> = { recurring: 0, quiet: 1, thin: 2 }
const TREND_PREVIEW = 4

function Patterns({ trends }: { trends: PhonemeTrend[] }) {
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const sorted = [...trends].sort((a, b) => TREND_ORDER[trendState(a)] - TREND_ORDER[trendState(b)] || b.suspectedLowCount - a.suspectedLowCount || a.meanScore - b.meanScore)
  const visible = showAll ? sorted : sorted.slice(0, TREND_PREVIEW)

  if (trends.length === 0) {
    return <p className="text-sm text-foreground/60">No cross-attempt sound history yet. Patterns need the same sound across more than one saved attempt.</p>
  }

  return (
    <>
      <p className="text-xs leading-relaxed text-foreground/60">
        From saved attempt history, not only this attempt. A sound is marked “Worth practising” only with at least 3 occurrences, with low estimates in 2 different recordings and 2 different words. It is a prompt to listen again, not a diagnosis.
      </p>
      <ul id={listId} className="grid gap-2 @xl:grid-cols-2">
        {visible.map((trend) => {
          const state = trendState(trend)
          return (
            <li key={trend.phoneme} className={`space-y-1 rounded-lg border p-2.5 ${state === 'recurring' ? 'border-foreground/30 bg-foreground/[0.04]' : 'border-foreground/10'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-foreground">/{trend.phoneme}/</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${state === 'recurring' ? 'border-amber-200 bg-amber-50 font-medium text-amber-700' : 'border-foreground/10 text-foreground/70'}`}>{TREND_LABEL[state]}</span>
              </div>
              <p className="text-xs tabular-nums text-foreground/80">{trend.suspectedLowCount} low of {plural(trend.tokenCount, 'occurrence')} · {plural(trend.attemptCount, 'attempt')} · {plural(trend.distinctWords, 'word')}{trend.lowAttemptCount > 0 ? ` · low in ${plural(trend.lowAttemptCount,'recording')}` : ''}</p>
              {state !== 'thin' && (
                <p className="text-xs tabular-nums text-foreground/60">
                  Average {formatNumber(trend.meanScore)}. Earlier {formatNumber(trend.previousMean)}, latest {formatNumber(trend.latestMean)}.
                </p>
              )}
              {trend.words.length > 0 && <p className="break-words text-[11px] text-foreground/60">Words: {trend.words.slice(0, 6).join(', ')}{trend.words.length > 6 ? `, +${trend.words.length - 6} more` : ''}</p>}
            </li>
          )
        })}
      </ul>
      {sorted.length > TREND_PREVIEW && (
        <button type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((value) => !value)} className={secondaryButton}>
          {showAll ? 'Show fewer sounds' : `Show all ${sorted.length} sounds`}
        </button>
      )}
      <p className="text-[11px] text-foreground/60">Earlier and latest averages can differ just because you practised different words.</p>
    </>
  )
}

function ReportView({ report, subject, compact }: { report: CalibrationReport; subject: string; compact: boolean }) {
  const ready = hasReferenceSpread(report)
  const excludedCount = report.referenceSamples.filter((sample) => !sample.accepted).length
  const belowCount = report.phoneComparisons.filter((phone) => isPhoneOutside(phone, ready)).length
  const recurringCount = report.trends.filter((trend) => trendState(trend) === 'recurring').length

  return (
    <div className="space-y-2">
      {report.source === 'reference-voice' && (
        <p className="rounded-xl border border-dashed border-foreground/30 px-3 py-2 text-xs text-foreground/80">
          <span className="font-medium text-foreground">The assessed audio is computer-generated.</span> Nothing in this attempt’s comparison measures your pronunciation.
        </p>
      )}

      {!ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <p className="font-medium">Not enough reference takes to form a span yet</p>
          <p className="mt-0.5">
            {plural(report.eligibleReferenceCount, 'usable take')} from {plural(report.referenceVoiceCount, 'voice')}. At least {MIN_SAMPLES} usable takes across {MIN_VOICES} voices are needed, so nothing is marked inside or outside a span.
          </p>
        </div>
      )}

      <ScoreOverview report={report} subject={subject} ready={ready} />

      <Disclosure
        title="Reference voices and audio"
        meta={`${plural(report.eligibleReferenceCount, 'usable take')} · ${plural(report.referenceVoiceCount, 'voice')}${excludedCount ? ` · ${excludedCount} excluded` : ''}`}
      >
        <ReferenceVoices samples={report.referenceSamples} />
      </Disclosure>

      <Disclosure
        title="Sound by sound"
        meta={report.phoneComparisons.length === 0
          ? 'No matched sounds'
          : `${plural(report.phoneComparisons.length, 'matched sound')}${ready ? ` · ${belowCount} below span in this attempt` : ' · no spans yet'}`}
      >
        <SoundComparison phones={report.phoneComparisons} subject={subject} ready={ready} />
      </Disclosure>

      <Disclosure
        title="Pitch and timing"
        meta={`${plural(report.phraseComparisons.length, 'matched phrase')}${report.pauseComparison ? ' · pause comparison' : ''}`}
      >
        <PitchAndTiming report={report} subject={subject} ready={ready} />
      </Disclosure>

      <Disclosure
        title="Patterns across attempts"
        meta={report.trends.length === 0 ? 'No history yet' : recurringCount ? `${plural(recurringCount, 'sound')} worth practising` : 'No repeated pattern has enough evidence'}
      >
        <Patterns trends={report.trends} />
      </Disclosure>

      <div className="space-y-1 px-1 pt-1 text-[11px] leading-relaxed text-foreground/60">
        {report.caveat && <p className="break-words">{report.caveat}</p>}
        {!compact && <p>Synthetic takes show how an automated scorer treats this exact phrase. They don’t represent every accent or natural way of saying it, and a score above, below or inside their span doesn’t certify pronunciation quality.</p>}
        <p className="break-all">Audio normalization: {report.normalizationVersion}</p>
      </div>
    </div>
  )
}

export default function PronunciationCalibration({
  report,
  loading,
  error,
  building,
  progress,
  onBuild,
  onRefresh,
  compact = false,
}: PronunciationCalibrationProps) {
  const headingId = useId()
  const buildHintId = useId()
  const ready = report ? hasReferenceSpread(report) : false
  const subject = report?.source === 'reference-voice' ? 'Assessed synthetic voice' : 'Your recording'
  const status = building
    ? progress ?? 'Generating and quality-checking reference voices…'
    : loading
      ? report ? 'Refreshing the comparison…' : 'Loading the comparison…'
      : progress

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={loading || building}
      className={`@container min-w-0 rounded-2xl border border-glass-border bg-glass text-left backdrop-blur-sm ${compact ? 'space-y-2 p-3' : 'space-y-3 p-3 sm:p-5'}`}
    >
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className="min-w-0">
          <h3 id={headingId} className={`${compact ? 'text-sm' : 'text-base'} font-medium text-foreground`}>Matching-phrase reference</h3>
          {!compact && <p className="text-xs leading-relaxed text-foreground/60">See how synthetic voices score and sound on the same words, next to this attempt.</p>}
          {report && (
            <p className="mt-0.5 text-xs text-foreground/70">
              {ready ? `Span from ${plural(report.eligibleReferenceCount, 'usable synthetic take')} across ${plural(report.referenceVoiceCount, 'voice')}. A small sample.` : 'Reference span not ready.'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={loading || building} className={secondaryButton}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={onBuild} disabled={loading || building} aria-describedby={buildHintId} className={`${ready ? secondaryButton : primaryButton} flex-1 @lg:flex-none`}>
            {building && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
            {building ? 'Building…' : ready ? 'Rebuild reference range' : 'Build reference range'}
          </button>
        </div>
      </div>

      <p id={buildHintId} className={compact || ready ? 'sr-only' : 'text-xs text-foreground/60'}>
        Building generates two Eleven v4 synthetic voices, checks their quality and retries takes that fail. It can take a little while.
      </p>

      {/* Kept mounted so screen readers hear status changes. */}
      <p role="status" className={status ? 'break-words rounded-lg bg-foreground/5 px-3 py-2 text-xs text-foreground/80' : 'sr-only'}>{status}</p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="min-w-0 flex-1 basis-48 break-words">{error}{report ? ' Showing the last loaded comparison.' : ''}</p>
          <button type="button" onClick={onRefresh} disabled={loading || building} className={secondaryButton}>Try loading again</button>
        </div>
      )}

      {report ? (
        <ReportView key={`${report.exerciseId}:${report.attemptId}`} report={report} subject={subject} compact={compact} />
      ) : loading ? (
        <div aria-hidden="true" className="space-y-2">
          <div className="h-24 animate-pulse rounded-xl bg-foreground/5 motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-foreground/5 motion-reduce:animate-none" />
        </div>
      ) : !error && !building ? (
        <p className={`${cardClass} px-3 py-4 text-center text-sm text-foreground/60`}>No comparison for this attempt yet. Build a reference range to compare matching words, sounds and timing.</p>
      ) : null}
    </section>
  )
}

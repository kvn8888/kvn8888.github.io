'use client'

import { useState, useEffect, useCallback, useRef, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { buildTtsBatches, textSize, createIntlSegmenter } from '@/lib/tts/sentenceSplitter'
import { DEFAULT_PRONUNCIATION_REFERENCE_VOICE, PRONUNCIATION_REFERENCE_VOICES, PRONUNCIATION_REFERENCE_MODEL, PRONUNCIATION_REFERENCE_PROVIDER, isPronunciationReferenceVoice, pronunciationReferenceVoiceLabel } from '@/lib/pronunciationVoices'
import PronunciationCalibration from '@/components/speech/PronunciationCalibration'
import type { CalibrationReport } from '@/lib/pronunciationCalibrationTypes'
import type { PronunciationCoach, PronunciationCoachInput } from '@/lib/pronunciationCoach'

// The segmenter instance is created once at module load time (browser-safe).
// To swap to wink-nlp: import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
// and pass it as the third argument to buildTtsBatches().
const _intlSegmenter = createIntlSegmenter()

type Tab = 'tts' | 'stt' | 'pronunciation'
type SpeechModality = Tab | 'all'
type SttModel = 'voxtral-mini-transcribe-2507' | 'voxtral-mini-latest' | 'gpt-4o-transcribe' | 'gpt-4o-transcribe-diarize'

interface HistoryItem {
  id: string
  modality: Tab
  title: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: number
}

interface HistoryActionRequest {
  requestId: string
  action: 'restore' | 'rerun'
  item: HistoryItem
}

interface SavedRecording {
  id: string
  key: string
  sizeBytes: number
  createdAt: string
}

const tabs: { id: Tab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'tts', label: 'Text to Speech', shortLabel: 'TTS', icon: 'record_voice_over' },
  { id: 'stt', label: 'Transcription', shortLabel: 'STT', icon: 'mic' },
  { id: 'pronunciation', label: 'Pronunciation', shortLabel: 'Pron', icon: 'spellcheck' },
]
const modalityLabels: Record<Tab, string> = {
  tts: 'Text to Speech',
  stt: 'Transcription',
  pronunciation: 'Pronunciation',
}
const HISTORY_PAGE_SIZE = 25

export default function SpeechLabPage({ hidePronunciation }: { hidePronunciation?: boolean } = {}) {
  const visibleTabs = hidePronunciation ? tabs.filter((t) => t.id !== 'pronunciation') : tabs
  const [activeTab, setActiveTab] = useState<Tab>('tts')

  useEffect(() => {
    const saved = localStorage.getItem('speech-lab-tab')
    if (saved && ['tts', 'stt', 'pronunciation'].includes(saved)) {
      const savedTab = saved as Tab
      setActiveTab(hidePronunciation && savedTab === 'pronunciation' ? 'tts' : savedTab)
    }
  }, [hidePronunciation])

  // Persist active tab to localStorage
  useEffect(() => { localStorage.setItem('speech-lab-tab', activeTab) }, [activeTab])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyNotice, setHistoryNotice] = useState<{ message: string; undoItem?: HistoryItem } | null>(null)
  const [historyFilter, setHistoryFilter] = useState<SpeechModality>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null)
  const [historyActionRequest, setHistoryActionRequest] = useState<HistoryActionRequest | null>(null)
  // Safari animation fix — only add blur-reveal classes after mount
  // so Safari doesn't cache the final state on refresh
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const loadHistory = useCallback(async (options: { append?: boolean; cursor?: string | null } = {}) => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(HISTORY_PAGE_SIZE),
      })
      if (historyFilter !== 'all') params.set('modality', historyFilter)
      if (historySearch.trim()) params.set('q', historySearch.trim())
      if (options.cursor) params.set('cursor', options.cursor)

      const res = await fetch(`/api/speech/history?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        setHistoryError('Unable to load history right now.')
        return
      }
      const data = await res.json()
      const items = (data.items || []) as HistoryItem[]
      setHistory((prev) => options.append ? [...prev, ...items] : items)
      setHistoryCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null)
      setHistoryHasMore(Boolean(data.hasMore))
      setHistoryError(null)
    } catch {
      setHistoryError('Unable to load history right now.')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFilter, historySearch])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory()
    }, historySearch.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [loadHistory, historySearch])

  const deleteHistory = async (item: HistoryItem) => {
    try {
      const res = await fetch('/api/speech/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (res.ok) {
        setHistory((prev) => prev.filter((candidate) => candidate.id !== item.id))
        setSelectedHistoryItem((current) => current?.id === item.id ? null : current)
        setHistoryNotice({ message: 'History item deleted.', undoItem: item })
        setHistoryError(null)
      } else {
        setHistoryError('Unable to delete history item.')
      }
    } catch {
      setHistoryError('Unable to delete history item.')
    }
  }

  const undoDeleteHistory = async (item: HistoryItem) => {
    try {
      const saved = await saveSpeechHistory({
        modality: item.modality,
        title: item.title,
        content: item.content,
        metadata: item.metadata ?? undefined,
      })
      if (saved) {
        setHistoryNotice({ message: 'History item restored.' })
        await loadHistory()
      }
    } catch {
      setHistoryError('Unable to restore deleted history item.')
    }
  }

  const requestHistoryAction = (item: HistoryItem, action: HistoryActionRequest['action']) => {
    setActiveTab(item.modality)
    setHistoryActionRequest({
      requestId: `${Date.now()}-${item.id}-${action}`,
      action,
      item,
    })
    setSelectedHistoryItem(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className={`text-2xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Speech Lab
        </h1>
        <p className={`text-sm text-foreground/50 mt-1 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Text-to-speech, transcription, and pronunciation tools.
        </p>
      </div>

      {/* Tab bar — DESIGN DIVERGENCE: using pill-style tabs instead of underline tabs.
          Reason: pills match the glassmorphism card aesthetic better than underline tabs
          and provide a larger click target on mobile. */}
      <div className={`flex flex-wrap justify-center gap-2 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden ${mounted ? 'blur-reveal-3' : 'opacity-0'}`}>
        {activeTab === 'tts' && (
          <TtsPanel
            onHistorySaved={() => loadHistory()}
            historyActionRequest={historyActionRequest?.item.modality === 'tts' ? historyActionRequest : null}
          />
        )}
        {activeTab === 'stt' && (
          <SttPanel
            onHistorySaved={() => loadHistory()}
            historyActionRequest={historyActionRequest?.item.modality === 'stt' ? historyActionRequest : null}
          />
        )}
        {activeTab === 'pronunciation' && !hidePronunciation && (
          <PronunciationPanel
            onHistorySaved={() => loadHistory()}
            historyActionRequest={historyActionRequest?.item.modality === 'pronunciation' ? historyActionRequest : null}
          />
        )}
      </div>

      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-5 space-y-3 ${mounted ? 'blur-reveal-4' : 'opacity-0'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-foreground">History</h3>
            <p className="text-xs text-foreground/40">Searchable Turso records with restore and diagnostics</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
              className="w-40 sm:w-56 rounded-xl bg-foreground/[0.03] border border-foreground/10 px-3 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/15"
            />
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as SpeechModality)}
              aria-label="Filter history by modality"
              className="rounded-xl bg-foreground/[0.03] border border-foreground/10 px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All</option>
              <option value="tts">Text to Speech</option>
              <option value="stt">Transcription</option>
              {!hidePronunciation && <option value="pronunciation">Pronunciation</option>}
            </select>
            <button
              onClick={() => loadHistory()}
              disabled={historyLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 text-foreground/60 text-xs hover:bg-foreground/10 transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-sm ${historyLoading ? 'animate-spin' : ''}`}>
                {historyLoading ? 'progress_activity' : 'refresh'}
              </span>
              {historyLoading ? 'Loading' : 'Refresh'}
            </button>
          </div>
        </div>

        {historyError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{historyError}</span>
            <button
              type="button"
              onClick={() => loadHistory()}
              disabled={historyLoading}
              className="rounded-full border border-red-200 px-3 py-1 font-medium hover:bg-red-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reload history
            </button>
          </div>
        )}
        {historyNotice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-xs text-foreground/50">
            <span>{historyNotice.message}</span>
            {historyNotice.undoItem && (
              <button
                type="button"
                onClick={() => undoDeleteHistory(historyNotice.undoItem!)}
                className="rounded-full bg-foreground/5 px-3 py-1 font-medium text-foreground/60 hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer"
              >
                Undo
              </button>
            )}
          </div>
        )}

        <div className={`space-y-2 overflow-y-auto pr-1 ${history.some((item) => item.modality === 'pronunciation') ? 'max-h-[32rem]' : 'max-h-96'}`}>
          {history.map((item) => {
            if (item.modality === 'pronunciation') {
              return (
                <PronunciationHistoryRow
                  key={item.id}
                  item={item}
                  onOpen={() => setSelectedHistoryItem(item)}
                  onRestore={() => requestHistoryAction(item, 'restore')}
                  onDelete={() => deleteHistory(item)}
                />
              )
            }
            const summary = getHistoryItemSummary(item)
            return (
              <div key={item.id} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryItem(item)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <p className="text-sm text-foreground">{item.title}</p>
                    <p className="text-xs text-foreground/40">
                      {modalityLabels[item.modality]} · {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => requestHistoryAction(item, 'restore')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-foreground/5 text-foreground/60 text-xs border border-foreground/10 hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">restore</span>
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryItem(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-foreground/5 text-foreground/60 text-xs border border-foreground/10 hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_full</span>
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteHistory(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Delete
                    </button>
                  </div>
                </div>
                {summary && <p className="text-xs text-foreground/45 mt-2">{summary}</p>}
                {item.content && (
                  <p className="text-xs text-foreground/60 mt-2 whitespace-pre-wrap break-words">{item.content}</p>
                )}
              </div>
            )
          })}
          {history.length === 0 && historyLoading && (
            <p role="status" className="text-sm text-foreground/60 py-2">Loading history…</p>
          )}
          {history.length === 0 && !historyLoading && !historyError && (
            <p className="text-sm text-foreground/60 py-2">
              {historySearch.trim()
                ? 'No matching history items.'
                : historyFilter === 'pronunciation'
                  ? 'No pronunciation attempts yet. Assess a phrase and it will appear here with its score.'
                  : 'No history yet.'}
            </p>
          )}
          {historyHasMore && (
            <button
              type="button"
              onClick={() => loadHistory({ append: true, cursor: historyCursor })}
              disabled={historyLoading}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-xs font-medium text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground/70 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {historyLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>

      {selectedHistoryItem && (
        <HistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
          onRestore={() => requestHistoryAction(selectedHistoryItem, 'restore')}
          onRerun={() => requestHistoryAction(selectedHistoryItem, 'rerun')}
          onDelete={() => deleteHistory(selectedHistoryItem)}
        />
      )}

      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-5 ${mounted ? 'blur-reveal-5' : 'opacity-0'}`}>
        <p className="text-xs text-foreground/40 mb-2">Reference Docs</p>
        <ul className="space-y-1.5 text-sm text-foreground/70">
          <li><a href="https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment" target="_blank" rel="noreferrer" className="hover:text-foreground">Azure Speech: Pronunciation Assessment API</a></li>
          <li><a href="https://docs.mistral.ai/capabilities/speech_to_text/" target="_blank" rel="noreferrer" className="hover:text-foreground">Mistral Voxtral Speech-to-Text</a></li>
          <li><a href="https://ai.google.dev/gemini-api/docs/speech-generation" target="_blank" rel="noreferrer" className="hover:text-foreground">Google Gemini Speech Generation</a></li>
          <li><a href="https://platform.openai.com/docs/guides/speech-to-text" target="_blank" rel="noreferrer" className="hover:text-foreground">OpenAI Speech-to-Text (GPT-4o audio)</a></li>
          <li><a href="https://platform.openai.com/docs/guides/realtime" target="_blank" rel="noreferrer" className="hover:text-foreground">OpenAI Realtime API</a></li>
        </ul>
      </div>
    </div>
  )
}

/* Gemini 2.5 Flash TTS voice options — 30 prebuilt voices */
const geminiVoices = [
  { name: 'Gacrux', style: 'Mature' },
  { name: 'Zephyr', style: 'Bright' },
  { name: 'Puck', style: 'Upbeat' },
  { name: 'Charon', style: 'Informative' },
  { name: 'Kore', style: 'Firm' },
  { name: 'Fenrir', style: 'Excitable' },
  { name: 'Leda', style: 'Youthful' },
  { name: 'Orus', style: 'Firm' },
  { name: 'Aoede', style: 'Breezy' },
  { name: 'Callirrhoe', style: 'Easy-going' },
  { name: 'Autonoe', style: 'Bright' },
  { name: 'Enceladus', style: 'Breathy' },
  { name: 'Iapetus', style: 'Clear' },
  { name: 'Umbriel', style: 'Easy-going' },
  { name: 'Algieba', style: 'Smooth' },
  { name: 'Despina', style: 'Smooth' },
  { name: 'Erinome', style: 'Clear' },
  { name: 'Algenib', style: 'Gravelly' },
  { name: 'Rasalgethi', style: 'Informative' },
  { name: 'Laomedeia', style: 'Upbeat' },
  { name: 'Achernar', style: 'Soft' },
  { name: 'Alnilam', style: 'Firm' },
  { name: 'Schedar', style: 'Even' },
  { name: 'Pulcherrima', style: 'Forward' },
  { name: 'Achird', style: 'Friendly' },
  { name: 'Zubenelgenubi', style: 'Casual' },
  { name: 'Vindemiatrix', style: 'Gentle' },
  { name: 'Sadachbia', style: 'Lively' },
  { name: 'Sadaltager', style: 'Knowledgeable' },
  { name: 'Sulafat', style: 'Warm' },
]

const chirp3Voices = [
  { name: 'en-US-Chirp3-HD-Aoede', style: 'Natural (US)' },
  { name: 'en-US-Chirp3-HD-Charon', style: 'Warm (US)' },
  { name: 'en-US-Chirp3-HD-Fenrir', style: 'Energetic (US)' },
  { name: 'en-US-Chirp3-HD-Kore', style: 'Firm (US)' },
  { name: 'en-US-Chirp3-HD-Leda', style: 'Youthful (US)' },
  { name: 'en-US-Chirp3-HD-Orus', style: 'Clear (US)' },
  { name: 'en-US-Chirp3-HD-Puck', style: 'Upbeat (US)' },
  { name: 'en-US-Chirp3-HD-Zephyr', style: 'Bright (US)' },
]

const GEMINI_TEXT_LIMIT = 4096
const CHIRP3_TEXT_LIMIT_BYTES = 5000

// buildTtsBatches, textSize, and SentenceSegmenter now live in
// @/lib/tts/sentenceSplitter — imported at the top of this file.
// To swap in wink-nlp: pass createWinkSegmenter() as the third arg to buildTtsBatches().

async function saveSpeechHistory(payload: { modality: Tab; title: string; content?: string; metadata?: Record<string, unknown> }): Promise<HistoryItem | null> {
  const res = await fetch('/api/speech/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save speech history')
  }

  const data = await res.json()
  return (data.item ?? null) as HistoryItem | null
}

async function patchPronunciationHistory(id: string, metadataPatch: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/speech/history', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, metadataPatch }) })
  if (!res.ok) throw new Error('Failed to update pronunciation history')
}

async function uploadSpeechRecording(audioBlob: Blob, filename: string): Promise<SavedRecording | null> {
  try {
    const formData = new FormData()
    formData.append('audio', audioBlob, filename)
    const res = await fetch('/api/speech/recordings', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = await res.json()
    return (data.recording ?? null) as SavedRecording | null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getHistoryMetadata(item: HistoryItem): Record<string, unknown> {
  return item.metadata && isRecord(item.metadata) ? item.metadata : {}
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' ? value : null
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getNestedRecord(metadata: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = metadata[key]
  return isRecord(value) ? value : null
}

function getHistoryRecording(metadata: Record<string, unknown>): SavedRecording | null {
  const recording = getNestedRecord(metadata, 'recording')
  if (!recording) return null
  const id = getMetadataString(recording, 'id')
  const key = getMetadataString(recording, 'key')
  const createdAt = getMetadataString(recording, 'createdAt')
  const sizeBytes = getMetadataNumber(recording, 'sizeBytes')
  if (!id || !key || !createdAt || sizeBytes == null) return null
  return { id, key, createdAt, sizeBytes }
}

function getHistoryItemSummary(item: HistoryItem): string | null {
  const metadata = getHistoryMetadata(item)
  if (item.modality === 'tts') {
    const provider = getMetadataString(metadata, 'provider')
    const voice = getMetadataString(metadata, 'voice')
    const batchCount = getMetadataNumber(metadata, 'batchCount')
    return [
      provider ? provider.toUpperCase() : null,
      voice ? `Voice ${getTtsVoiceLabel(voice)}` : null,
      batchCount && batchCount > 1 ? `${batchCount} batches` : null,
    ].filter(Boolean).join(' · ') || null
  }

  if (item.modality === 'stt') {
    const model = getMetadataString(metadata, 'model')
    const segments = getMetadataNumber(metadata, 'segments')
    const speakers = getMetadataNumber(metadata, 'speakers')
    return [
      model,
      segments != null ? `${segments} segments` : null,
      speakers != null ? `${speakers} speakers` : null,
      getHistoryRecording(metadata) ? 'audio saved' : null,
    ].filter(Boolean).join(' · ') || null
  }

  return null
}

function copyHistoryText(item: HistoryItem) {
  const metadata = getHistoryMetadata(item)
  const recognized = getMetadataString(metadata, 'displayText')
  const text = item.modality === 'pronunciation' && recognized
    ? `Reference: ${item.content}\nRecognized: ${recognized}`
    : item.content
  void navigator.clipboard.writeText(text || item.title)
}

function getHistoryPronunciationScores(metadata: Record<string, unknown>) {
  const scores = getNestedRecord(metadata, 'scores')
  return {
    pronScore: getMetadataNumber(scores ?? metadata, scores ? 'pronunciation' : 'pronScore'),
    accuracyScore: getMetadataNumber(scores ?? metadata, scores ? 'accuracy' : 'accuracyScore'),
    fluencyScore: getMetadataNumber(scores ?? metadata, scores ? 'fluency' : 'fluencyScore'),
    completenessScore: getMetadataNumber(scores ?? metadata, scores ? 'completeness' : 'completenessScore'),
    prosodyScore: getMetadataNumber(scores ?? metadata, scores ? 'prosody' : 'prosodyScore'),
  }
}

function isPronWordLike(value: unknown): value is PronWord {
  if (!isRecord(value)) return false
  return typeof value.word === 'string' &&
    typeof value.accuracyScore === 'number' &&
    typeof value.errorType === 'string' &&
    Array.isArray(value.syllables) &&
    Array.isArray(value.phonemes)
}

function getHistoryPronunciationWords(metadata: Record<string, unknown>): PronWord[] {
  const words = metadata.words
  if (!Array.isArray(words)) return []
  // Older rows can be partial; fill the nested arrays that the word and prosody views read.
  return words.filter(isPronWordLike).map((word) => ({
    ...word,
    syllables: word.syllables.filter((syllable) => isRecord(syllable)),
    phonemes: word.phonemes
      .filter((phoneme) => isRecord(phoneme))
      .map((phoneme) => ({
        ...phoneme,
        nBestPhonemes: Array.isArray(phoneme.nBestPhonemes) ? phoneme.nBestPhonemes.filter((candidate) => isRecord(candidate)) : [],
      })),
    prosody: isRecord(word.prosody)
      ? {
          ...word.prosody,
          breakErrorTypes: Array.isArray(word.prosody.breakErrorTypes) ? word.prosody.breakErrorTypes : [],
          intonationErrorTypes: Array.isArray(word.prosody.intonationErrorTypes) ? word.prosody.intonationErrorTypes : [],
        }
      : undefined,
  }))
}

function getHistoryDeliveryAnalysis(metadata: Record<string, unknown>): DeliveryAnalysis | undefined {
  const delivery = metadata.delivery
  if (!isRecord(delivery)) return undefined
  const summary = delivery.summary
  const pitch = delivery.pitch
  const intensity = delivery.intensity
  if (!isRecord(summary) || !isRecord(pitch) || !isRecord(intensity)) return undefined
  if (![delivery.insights, delivery.phrases, delivery.pauses, pitch.series, intensity.series].every(Array.isArray)) return undefined
  return delivery as unknown as DeliveryAnalysis
}

function canRerunHistoryItem(item: HistoryItem): boolean {
  const metadata = getHistoryMetadata(item)
  if (item.modality === 'tts') return Boolean(item.content.trim())
  if (item.modality === 'stt') return Boolean(getHistoryRecording(metadata))
  if (item.modality === 'pronunciation') {
    const source = getMetadataString(metadata, 'source')
    return source === 'reference-voice' || Boolean(getHistoryRecording(metadata) || getMetadataString(metadata,'assessmentSourceUrl'))
  }
  return false
}

function HistoryDetailModal({
  item,
  onClose,
  onRestore,
  onRerun,
  onDelete,
}: {
  item: HistoryItem
  onClose: () => void
  onRestore: () => void
  onRerun: () => void
  onDelete: () => void
}) {
  const [selectedWord, setSelectedWord] = useState<PronWord | null>(null)
  const metadata = getHistoryMetadata(item)
  const recording = getHistoryRecording(metadata)
  const canRerun = canRerunHistoryItem(item)
  const isPronunciation = item.modality === 'pronunciation'
  const rootRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const wordTriggerRef = useRef<HTMLElement | null>(null)
  const headingId = useId()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      // While a word is open, Escape belongs to the word dialog only.
      if (event.key === 'Escape' && !selectedWord) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, selectedWord])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!selectedWord) return
    const historyDialog = dialogRef.current
    const dialogs = rootRef.current?.querySelectorAll<HTMLElement>('[role="dialog"]')
    dialogs?.[dialogs.length - 1]?.querySelector('button')?.focus()
    return () => {
      const trigger = wordTriggerRef.current
      if (trigger?.isConnected && historyDialog?.contains(trigger)) trigger.focus({ preventScroll: true })
      else historyDialog?.focus({ preventScroll: true })
    }
  }, [selectedWord])

  const openWord = (word: PronWord) => {
    wordTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedWord(word)
  }

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const dialogs = event.currentTarget.querySelectorAll<HTMLElement>('[role="dialog"]')
    const scope = dialogs[dialogs.length - 1]
    if (!scope) return
    const focusable = Array.from(
      scope.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary, audio[controls]')
    ).filter((element) => element.tagName === 'SUMMARY' || !element.closest('details:not([open])'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === scope)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div ref={rootRef} onKeyDown={trapFocus} className="fixed inset-0 z-[100] flex items-center justify-center px-3 sm:px-4">
      <button type="button" aria-label="Close history details" className="absolute inset-0 bg-background/60 backdrop-blur-xl cursor-default" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={isPronunciation ? undefined : `${item.title} history details`}
        aria-labelledby={isPronunciation ? headingId : undefined}
        inert={selectedWord !== null}
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto overscroll-contain rounded-2xl bg-glass backdrop-blur-xl border border-glass-border shadow-xl p-4 sm:p-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/40 uppercase tracking-wider">{isPronunciation ? 'Pronunciation attempt' : 'History Details'}</p>
            <h3 id={headingId} className="text-xl font-medium text-foreground mt-0.5 break-words">
              {isPronunciation ? formatHistoryDate(item.createdAt, 'long') : item.title}
            </h3>
            <p className={`text-xs mt-1 ${isPronunciation ? 'text-foreground/60' : 'text-foreground/40'}`}>
              {isPronunciation
                ? [getHistoryLanguageLabel(metadata), getHistorySourceLabel(metadata)].filter(Boolean).join(' · ')
                : `${modalityLabels[item.modality]} · ${new Date(item.createdAt).toLocaleString()}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-foreground/5 hover:bg-foreground/10 p-2 text-foreground/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40" aria-label="Close">
            <span className="material-symbols-outlined text-lg block" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">restore</span>
            Restore
          </button>
          <button
            type="button"
            onClick={onRerun}
            disabled={!canRerun}
            title={canRerun ? undefined : 'No saved audio or runnable text is available for this item.'}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.03] px-4 py-2 text-xs font-medium text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">replay</span>
            Rerun
          </button>
          <button
            type="button"
            onClick={() => copyHistoryText(item)}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.03] px-4 py-2 text-xs font-medium text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">content_copy</span>
            Copy
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            Delete
          </button>
        </div>

        {isPronunciation && (!canRerun || isSynthesizedReference(metadata)) && (
          <p className="mt-2 text-xs text-foreground/60">
            {canRerun
              ? 'Rerun synthesizes this reference voice again, then scores the new audio.'
              : 'Rerun is unavailable because no recording was saved with this attempt.'}
          </p>
        )}

        <div className="mt-5 space-y-4">
          {item.content && (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
              <p className="text-xs text-foreground/60 uppercase tracking-wider font-medium mb-1">
                {isPronunciation ? 'Practice phrase' : 'Saved Content'}
              </p>
              <p className={`leading-relaxed whitespace-pre-wrap break-words ${isPronunciation ? 'text-base text-foreground max-h-48 overflow-y-auto' : 'text-sm text-foreground/70'}`}>{item.content}</p>
            </div>
          )}

          {item.modality === 'tts' && <HistoryTtsDetails metadata={metadata} />}
          {item.modality === 'stt' && <HistorySttDetails metadata={metadata} recording={recording} />}
          {item.modality === 'pronunciation' && (
            <HistoryPronunciationDetails metadata={metadata} referenceText={item.content} onSelectWord={openWord} />
          )}
        </div>
      </div>

      {selectedWord && <PronunciationWordModal word={selectedWord} onClose={() => setSelectedWord(null)} />}
    </div>
  )
}

function HistoryTtsDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const storageUrl = getMetadataString(metadata, 'storageUrl')
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <DeliveryMetric label="Provider" value={getMetadataString(metadata, 'provider') ?? 'n/a'} />
      <DeliveryMetric label="Voice" value={getMetadataString(metadata, 'voice') ? getTtsVoiceLabel(getMetadataString(metadata, 'voice')!) : 'n/a'} />
      <DeliveryMetric label="Batches" value={String(getMetadataNumber(metadata, 'batchCount') ?? 1)} />
      <DeliveryMetric label="MIME" value={getMetadataString(metadata, 'mimeType') ?? 'n/a'} />
      {storageUrl && (
        <a href={storageUrl} target="_blank" rel="noreferrer" className="sm:col-span-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-xs text-foreground/50 hover:text-foreground transition-colors">
          Open stored audio
        </a>
      )}
    </div>
  )
}

function HistorySttDetails({ metadata, recording }: { metadata: Record<string, unknown>; recording: SavedRecording | null }) {
  const segmentsData = metadata.segmentsData
  const segments = Array.isArray(segmentsData)
    ? segmentsData.filter((segment): segment is { start: number; end: number; text: string } =>
        isRecord(segment) &&
        typeof segment.start === 'number' &&
        typeof segment.end === 'number' &&
        typeof segment.text === 'string'
      )
    : []

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <DeliveryMetric label="Model" value={getMetadataString(metadata, 'model') ?? 'n/a'} />
        <DeliveryMetric label="Segments" value={String(getMetadataNumber(metadata, 'segments') ?? (segments.length || 'n/a'))} />
        <DeliveryMetric label="Speakers" value={String(getMetadataNumber(metadata, 'speakers') ?? 'n/a')} />
        <DeliveryMetric label="Audio" value={recording ? formatBytes(recording.sizeBytes) : 'not saved'} />
      </div>
      {segments.length > 0 && (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 space-y-1.5">
          <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Segments</p>
          {segments.slice(0, 40).map((segment, index) => (
            <p key={`${segment.start}-${index}`} className="text-xs text-foreground/60">
              <span className="tabular-nums text-foreground/35">{segment.start.toFixed(1)}s-{segment.end.toFixed(1)}s</span>{' '}
              {segment.text}
            </p>
          ))}
          {segments.length > 40 && <p className="text-xs text-foreground/35">Showing first 40 of {segments.length} segments.</p>}
        </div>
      )}
    </div>
  )
}

/* ─── Pronunciation history ─── */
interface HistoryCoach {
  model: string | null
  summary: string | null
  reasoningEffort?: string | null
  promptVersion?: string | null
  strengths: Array<{ title: string; evidence: string }>
  priorities: Array<{ category: string; title: string; evidence: string; practice: string; confidence?: string }>
}

const historyLanguageLabels: Record<string, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
  'zh-CN': 'Chinese (Mandarin)',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
}

function formatHistoryDate(timestamp: number, style: 'short' | 'long' = 'short'): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  const showYear = style === 'long' || date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleString(undefined, {
    weekday: style,
    month: style,
    day: 'numeric',
    ...(showYear ? { year: 'numeric' as const } : {}),
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getHistoryLanguageLabel(metadata: Record<string, unknown>): string | null {
  const language = getMetadataString(metadata, 'language')
  return language ? historyLanguageLabels[language] ?? language : null
}

function isSynthesizedReference(metadata: Record<string, unknown>): boolean {
  return getMetadataString(metadata, 'source') === 'reference-voice'
}

function getHistorySourceLabel(metadata: Record<string, unknown>): string {
  if (isSynthesizedReference(metadata)) return 'Synthesized reference'
  if (getMetadataString(metadata, 'source') === 'recording') return 'Your recording'
  return getHistoryRecording(metadata) ? 'Saved recording' : 'Source not recorded'
}

/** Voice, provider and model for a synthesized reference. Missing parts are omitted. */
function getHistoryReferenceVoiceLabel(metadata: Record<string, unknown>): string | null {
  const voice = getMetadataString(metadata, 'voice')
  // Rows saved before referenceProvider existed encode the provider in the voice id.
  const provider = getMetadataString(metadata, 'referenceProvider')
    || (voice ? (voice.startsWith('chirp3:') ? 'chirp3' : 'gemini') : null)
  const providerLabel = provider === 'chirp3' ? 'Chirp 3 HD' : provider === 'gemini' ? 'Gemini' : provider === PRONUNCIATION_REFERENCE_PROVIDER ? 'Vercel AI Gateway' : provider
  return [voice ? getTtsVoiceLabel(voice) : null, providerLabel, getMetadataString(metadata, 'referenceModel')]
    .filter(Boolean)
    .join(' · ') || null
}

/** Only web URLs can be played by the browser; stored s3:// locations cannot. */
function getHistoryPlayableUrl(metadata: Record<string, unknown>): string | null {
  const url = getMetadataString(metadata, 'assessmentAudioUrl') || getMetadataString(metadata, 'storageUrl')
  return url && (/^https?:\/\//i.test(url) || /^\/api\/speech\/pronunciation\/(?:reference|audio)\?id=[0-9a-f-]{36}$/i.test(url)) ? url : null
}

function getHistoryCoach(metadata: Record<string, unknown>): HistoryCoach | null {
  const coach = getNestedRecord(metadata, 'coach')
  if (!coach) return null
  const text = (record: Record<string, unknown>, key: string) => getMetadataString(record, key)?.trim() ?? ''
  const records = (value: unknown) => Array.isArray(value) ? value.filter(isRecord) : []
  const summary = text(coach, 'summary') || null
  const strengths = records(coach.strengths)
    .map((entry) => ({ title: text(entry, 'title'), evidence: text(entry, 'evidence') }))
    .filter((entry) => entry.title || entry.evidence)
  const priorities = records(coach.priorities)
    .map((entry) => ({
      category: text(entry, 'category'),
      title: text(entry, 'title'),
      evidence: text(entry, 'evidence'),
      practice: text(entry, 'practice'),
      confidence: text(entry, 'confidence'),
    }))
    .filter((entry) => entry.title || entry.evidence || entry.practice)
  if (!summary && strengths.length === 0 && priorities.length === 0) return null
  return { model: text(coach, 'model') || null, reasoningEffort: text(coach, 'reasoningEffort') || null, promptVersion: text(coach, 'promptVersion') || null, summary, strengths, priorities }
}

function getHistoryScoreBand(score: number) {
  if (score >= SCORE_EXCELLENT) return { label: 'Strong', style: 'bg-emerald-50 border-emerald-200 text-emerald-700', bar: 'bg-emerald-500' }
  if (score >= SCORE_GOOD) return { label: 'Developing', style: 'bg-amber-50 border-amber-200 text-amber-700', bar: 'bg-amber-500' }
  return { label: 'Needs practice', style: 'bg-red-50 border-red-200 text-red-700', bar: 'bg-red-500' }
}

function isHistoryWordForReview(word: PronWord): boolean {
  return word.errorType !== 'None' || word.accuracyScore < SCORE_EXCELLENT || getProsodyBreakIssues(word).length > 0
}

const historyActionClass = 'inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1.5 text-xs text-foreground/70 hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40'
const historySectionClass = 'rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3'
const historySummaryClass = 'cursor-pointer select-none rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/40'

/** Loads on mount through fetch so a missing or expired recording gets a readable error. */
function HistoryRecordingPlayer({ recordingId, label, autoPlay = false }: { recordingId: string; label: string; autoPlay?: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const [audio, setAudio] = useState<{ url: string | null; error: string | null }>({ url: null, error: null })
  const [playbackFailed, setPlaybackFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    void (async () => {
      try {
        const res = await fetch(`/api/speech/recordings/${encodeURIComponent(recordingId)}`, { signal: controller.signal })
        if (!res.ok) {
          throw new Error(res.status === 401
            ? 'Sign in again to play this recording.'
            : 'This recording couldn’t be loaded. It may have been removed: The original file may have been deleted or removed under the former retention policy.')
        }
        const blob = await res.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setAudio({ url: objectUrl, error: null })
      } catch (error) {
        if (controller.signal.aborted) return
        // fetch and blob() reject with TypeError on network failures.
        const message = error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : 'This recording couldn’t be loaded. Check your connection and try again.'
        setAudio({ url: null, error: message })
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [recordingId, attempt])

  const retry = () => {
    setPlaybackFailed(false)
    setAudio({ url: null, error: null })
    setAttempt((value) => value + 1)
  }

  if (audio.error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <p className="min-w-0 flex-1 basis-48">{audio.error}</p>
        <button type="button" onClick={retry} className={historyActionClass}>Try again</button>
      </div>
    )
  }

  if (!audio.url) {
    return <p role="status" className="py-2 text-xs text-foreground/60">Loading recording…</p>
  }

  return (
    <div className="space-y-1.5">
      <audio controls autoPlay={autoPlay} src={audio.url} aria-label={label} onError={() => setPlaybackFailed(true)} className="w-full" />
      {playbackFailed && (
        <p role="alert" className="text-xs text-foreground/70">
          This browser can’t play the saved format.{' '}
          <a href={audio.url} download={recordingId} className="underline underline-offset-2">Download the recording</a>
        </p>
      )}
    </div>
  )
}

function PronunciationHistoryRow({
  item,
  onOpen,
  onRestore,
  onDelete,
}: {
  item: HistoryItem
  onOpen: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const [listening, setListening] = useState(false)
  const playerId = useId()
  const metadata = getHistoryMetadata(item)
  const { pronScore } = getHistoryPronunciationScores(metadata)
  const synthesized = isSynthesizedReference(metadata)
  const recording = getHistoryRecording(metadata)
  const playableUrl = getHistoryPlayableUrl(metadata)
  const voiceLabel = synthesized ? getHistoryReferenceVoiceLabel(metadata) : null
  const coach = getHistoryCoach(metadata)
  const coachFailed = !coach && Boolean(getMetadataString(metadata, 'coachError'))
  const focus = coach?.priorities.find((priority) => priority.title)?.title
  const phrase = item.content || getMetadataString(metadata, 'displayText') || item.title
  const date = formatHistoryDate(item.createdAt)
  // Reference scores stay neutral so they don't read as the learner's own progress.
  const scoreStyle = pronScore == null || synthesized
    ? `${synthesized ? 'border-dashed ' : ''}border-foreground/20 bg-foreground/[0.03] text-foreground/70`
    : getHistoryScoreBand(pronScore).style
  const chipClass = 'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]'

  return (
    <article className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-lg text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
        <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border ${scoreStyle}`}>
          <span className="text-xl font-medium leading-none tabular-nums">
            {pronScore != null ? Math.round(pronScore) : <><span aria-hidden="true">–</span><span className="sr-only">Not available</span></>}
          </span>
          <span className="mt-1 text-[10px] leading-none">{synthesized ? 'Ref score' : 'Score'}</span>
        </span>
        <span className="block min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-sm font-medium text-foreground">{phrase}</span>
          <span className="mt-0.5 block text-xs text-foreground/60">
            {date}{getHistoryLanguageLabel(metadata) ? ` · ${getHistoryLanguageLabel(metadata)}` : ''}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`${chipClass} ${synthesized ? 'border-dashed border-foreground/25 text-foreground/70' : 'border-foreground/10 bg-foreground/5 text-foreground/70'}`}>
              <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">{synthesized ? 'record_voice_over' : 'mic'}</span>
              {getHistorySourceLabel(metadata)}
            </span>
            {voiceLabel && <span className={`${chipClass} border-foreground/10 text-foreground/60`}><span className="truncate">{voiceLabel}</span></span>}
            {coach && (
              <span className={`${chipClass} border-foreground/10 text-foreground/60`}>
                <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">auto_awesome</span>
                <span className="truncate">{coach.model ? `Coaching · ${coach.model}` : 'Coaching saved'}</span>
              </span>
            )}
            {coachFailed && <span className={`${chipClass} border-amber-200 bg-amber-50 text-amber-700`}>Coaching unavailable</span>}
          </span>
          {focus && <span className="mt-1.5 block truncate text-xs text-foreground/70"><span className="font-medium">Practice next:</span> {focus}</span>}
        </span>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onOpen} aria-label={`Review attempt from ${date}`} className={historyActionClass}>
          <span className="material-symbols-outlined !text-sm" aria-hidden="true">open_in_full</span>
          Review
        </button>
        {(recording || playableUrl) && (
          <button type="button" onClick={() => setListening((value) => !value)} aria-expanded={listening} aria-controls={listening ? playerId : undefined} className={historyActionClass}>
            <span className="material-symbols-outlined !text-sm" aria-hidden="true">{listening ? 'close' : 'play_arrow'}</span>
            {listening ? 'Hide audio' : 'Listen'}
          </button>
        )}
        <button type="button" onClick={onRestore} aria-label={`Restore attempt from ${date}`} className={historyActionClass}>
          <span className="material-symbols-outlined !text-sm" aria-hidden="true">restore</span>
          Restore
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete attempt from ${date}`} className="ml-auto inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
          <span className="material-symbols-outlined !text-sm" aria-hidden="true">delete</span>
          Delete
        </button>
      </div>

      {listening && (recording || playableUrl) && (
        <div id={playerId} className="mt-2">
          {playableUrl
            ? <audio controls autoPlay preload="none" src={playableUrl} aria-label={`${getHistorySourceLabel(metadata)} from ${date}`} className="w-full" />
            : <HistoryRecordingPlayer recordingId={recording!.id} label={`${getHistorySourceLabel(metadata)} from ${date}`} autoPlay />}
        </div>
      )}
    </article>
  )
}

function HistoryPronunciationAudio({ metadata }: { metadata: Record<string, unknown> }) {
  const synthesized = isSynthesizedReference(metadata)
  const recording = getHistoryRecording(metadata)
  const playableUrl = getHistoryPlayableUrl(metadata)
  const voiceLabel = synthesized ? getHistoryReferenceVoiceLabel(metadata) : null
  const sourceLabel = getHistorySourceLabel(metadata)

  return (
    <section aria-label={`${sourceLabel} audio`} className={`${historySectionClass} space-y-2 ${synthesized ? 'border-dashed' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined !text-lg text-foreground/60" aria-hidden="true">{synthesized ? 'record_voice_over' : 'mic'}</span>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground">{sourceLabel}</h4>
          {synthesized && (
            <p className="break-words text-xs text-foreground/60">
              Computer-generated speech, not your voice. {voiceLabel ?? 'Voice details were not saved.'}
            </p>
          )}
        </div>
      </div>
      {playableUrl ? (
        <audio controls preload="none" src={playableUrl} aria-label={`${sourceLabel} assessed audio playback`} className="w-full" />
      ) : recording ? (
        <HistoryRecordingPlayer recordingId={recording.id} label={`${sourceLabel} playback`} />
      ) : (
        <p className="text-xs text-foreground/60">
          {synthesized
            ? 'The generated audio can’t be played from history. Use Rerun to synthesize and assess it again.'
            : 'No audio was saved with this attempt.'}
        </p>
      )}
    </section>
  )
}

function HistoryScoreSummary({ metadata, referenceText }: { metadata: Record<string, unknown>; referenceText: string }) {
  const scores = getHistoryPronunciationScores(metadata)
  const synthesized = isSynthesizedReference(metadata)
  const heard = getMetadataString(metadata, 'displayText')
  const comparable = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const heardDiffers = Boolean(heard && referenceText && comparable(heard) !== comparable(referenceText))
  const subScores = [
    { label: 'Accuracy', score: scores.accuracyScore, meaning: 'how closely the sounds matched what was expected' },
    { label: 'Fluency', score: scores.fluencyScore, meaning: 'how naturally the pacing and flow came across' },
    { label: 'Completeness', score: scores.completenessScore, meaning: 'how much of the phrase was spoken and recognized' },
    { label: 'Prosody', score: scores.prosodyScore, meaning: 'intonation, stress and naturalness' },
  ].filter((entry): entry is { label: string; score: number; meaning: string } => entry.score != null)
  const hasScores = scores.pronScore != null || subScores.length > 0
  const band = scores.pronScore != null ? getHistoryScoreBand(scores.pronScore) : null

  return (
    <section aria-label={synthesized ? 'Reference voice scores' : 'Pronunciation scores'} className={historySectionClass}>
      {!hasScores ? (
        <p className="text-sm text-foreground/60">No scores were saved with this attempt.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {scores.pronScore != null && band && (
            <div className={`shrink-0 rounded-xl border px-4 py-3 text-center sm:w-36 ${synthesized ? 'border-dashed border-foreground/20 text-foreground/70' : band.style}`}>
              <p className="text-xs">{synthesized ? 'Reference score' : 'Overall score'}</p>
              <p className="text-4xl font-medium tabular-nums">{Math.round(scores.pronScore)}<span className="text-sm font-normal"> / 100</span></p>
              <p className="text-xs font-medium">{band.label}</p>
            </div>
          )}
          {subScores.length > 0 && (
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
              {subScores.map(({ label, score }) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-xs text-foreground/60">{label}</dt>
                    <dd className="text-sm font-medium tabular-nums text-foreground">{Math.round(score)}</dd>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                    <div className={`h-full rounded-full ${synthesized ? 'bg-foreground/40' : getHistoryScoreBand(score).bar}`} style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {heardDiffers && (
        <p className="mt-3 break-words text-sm text-foreground/70"><span className="font-medium text-foreground">Azure heard:</span> {heard}</p>
      )}
      {subScores.length > 0 && (
        <details className="mt-2 text-xs text-foreground/60">
          <summary className="cursor-pointer select-none rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">What these scores measure</summary>
          <ul className="mt-1.5 space-y-1">
            {subScores.map(({ label, meaning }) => <li key={label}><span className="font-medium">{label}:</span> {meaning}.</li>)}
          </ul>
        </details>
      )}
    </section>
  )
}

function HistoryCoachSection({ metadata, live = false, loading = false, onRetry }: { metadata: Record<string, unknown>; live?: boolean; loading?: boolean; onRetry?: () => void }) {
  const coach = getHistoryCoach(metadata)
  const coachError = getMetadataString(metadata, 'coachError')
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={`${historySectionClass} space-y-3`}>
      <div>
        <h4 id={headingId} className="text-sm font-medium text-foreground">AI pronunciation coaching</h4>
        <p className="break-words text-xs text-foreground/60">{coach?.model ?? (live ? 'GPT-6.2 Sol' : 'No model recorded')}{coach?.reasoningEffort ? ` · ${coach.reasoningEffort} reasoning` : live ? ' · medium reasoning' : ''} · Interprets measured evidence, not an independent acoustic score.</p>
      </div>

      {loading && <p role="status" className="text-sm text-foreground/60">Analyzing pronunciation evidence and preparing practice suggestions…</p>}
      {coachError && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <p className="font-medium">{coach ? 'Coaching reported a problem.' : 'Coaching wasn’t generated for this attempt.'}</p>
          <p className="mt-0.5 break-words">{coachError}</p>
        </div>
      )}
      {!coach && !coachError && !loading && <p className="text-sm text-foreground/60">{live ? 'No AI coaching is available for this assessment.' : 'No coaching was saved with this attempt.'}</p>}
      {live && !loading && onRetry && (!coach || coachError) && <button type="button" onClick={onRetry} className={historyActionClass}>Retry coaching</button>}

      {coach?.summary && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">{coach.summary}</p>}

      {coach && coach.priorities.length > 0 && (
        <div>
          <h5 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-foreground/60">Practice next</h5>
          <ol className="space-y-2">
            {coach.priorities.map((priority, index) => (
              <li key={`${priority.title}-${index}`} className="flex gap-2.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">{index + 1}</span>
                <div className="min-w-0 space-y-1 break-words">
                  <p className="text-sm font-medium text-foreground">{priority.title || priority.category || 'Practice priority'}</p>
                  {priority.category && priority.title && <p className="text-[11px] uppercase tracking-wider text-foreground/60">{priority.category}{priority.confidence ? ` · ${priority.confidence} confidence` : ''}</p>}
                  {priority.evidence && <p className="text-xs leading-relaxed text-foreground/60">{priority.evidence}</p>}
                  {priority.practice && <p className="text-sm leading-relaxed text-foreground/80"><span className="font-medium text-foreground">Try:</span> {priority.practice}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {coach && coach.strengths.length > 0 && (
        <div>
          <h5 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-foreground/60">What went well</h5>
          <ul className="space-y-2">
            {coach.strengths.map((strength, index) => (
              <li key={`${strength.title}-${index}`} className="flex gap-2">
                <span className="material-symbols-outlined !text-lg text-emerald-600" aria-hidden="true">check_circle</span>
                <div className="min-w-0 break-words">
                  {strength.title && <p className="text-sm font-medium text-foreground">{strength.title}</p>}
                  {strength.evidence && <p className="text-xs leading-relaxed text-foreground/60">{strength.evidence}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function HistoryWordReview({
  words,
  truncated,
  onSelectWord,
}: {
  words: PronWord[]
  truncated: boolean
  onSelectWord: (word: PronWord) => void
}) {
  const reviewCount = words.filter(isHistoryWordForReview).length
  const [showAll, setShowAll] = useState(false)
  const canFilter = reviewCount > 0 && reviewCount < words.length
  const visibleWords = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => !canFilter || showAll || isHistoryWordForReview(word))
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={`${historySectionClass} space-y-2.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id={headingId} className="text-sm font-medium text-foreground">Words and sounds</h4>
          {words.length > 0 && <p className="text-xs text-foreground/60">Select a word for syllable and phoneme scores.</p>}
        </div>
        {canFilter && (
          <div role="group" aria-label="Words shown" className="flex gap-1">
            {[
              { all: false, label: `To review (${reviewCount})` },
              { all: true, label: `All (${words.length})` },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={showAll === option.all}
                onClick={() => setShowAll(option.all)}
                className={`rounded-full px-3 py-1 text-xs cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${showAll === option.all ? 'bg-foreground text-background' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {words.length === 0 ? (
        <p className="text-sm text-foreground/60">Word and phoneme detail wasn’t saved with this attempt.</p>
      ) : (
        <>
          {reviewCount === 0 && <p className="text-xs text-foreground/60">No saved words were flagged for review.</p>}
          <div className="flex flex-wrap gap-2">
            {visibleWords.map(({ word, index }) => (
              <PronunciationWordChip key={`${word.word}-${index}`} word={word} onClick={() => onSelectWord(word)} />
            ))}
          </div>
        </>
      )}
      {words.some(isOmittedPronunciationWord) && (
        <p className="text-xs text-foreground/60">Words marked omitted weren’t matched to the audio, so they have no pronunciation score.</p>
      )}
      {truncated && <p className="text-xs text-foreground/60">This attempt stores detail for the first saved words only.</p>}
    </section>
  )
}

function HistoryPronunciationDetails({
  metadata,
  referenceText,
  onSelectWord,
}: {
  metadata: Record<string, unknown>
  referenceText: string
  onSelectWord: (word: PronWord) => void
}) {
  const words = getHistoryPronunciationWords(metadata)
  const delivery = getHistoryDeliveryAnalysis(metadata)
  const deliveryError = getMetadataString(metadata, 'deliveryError')
  const issueCounts = getNestedRecord(metadata, 'issueCounts')
  const issues = issueCounts
    ? [
        ['Omissions', 'omissionCount'],
        ['Mispronounced', 'mispronunciationCount'],
        ['Missing pauses', 'missingBreakCount'],
        ['Unexpected pauses', 'unexpectedBreakCount'],
        ['Monotone', 'monotoneCount'],
      ]
        .map(([label, key]) => ({ label, count: getMetadataNumber(issueCounts, key) ?? 0 }))
        .filter((issue) => issue.count > 0)
    : []
  const confidence = getMetadataNumber(metadata, 'confidence')
  const snr = getMetadataNumber(metadata, 'snr')
  const technicalDetails = [
    ['Azure heard', getMetadataString(metadata, 'displayText')],
    ['Lexical form', getMetadataString(metadata, 'lexical')],
    ['Recognition status', getMetadataString(metadata, 'recognitionStatus')],
    ['Confidence', confidence != null ? confidence.toFixed(3) : null],
    ['Signal-to-noise (SNR)', snr != null ? snr.toFixed(1) : null],
    ['Tracking ID', getMetadataString(metadata, 'requestId')],
    ['Assessment profile',getMetadataString(metadata,'providerProfile')],
    ['Exercise ID',getMetadataString(metadata,'exerciseId')],
    // Synthesized attempts already show these next to the audio.
    ['Reference source', getMetadataString(metadata, 'referenceSource') === 'transcription' ? 'Automatic transcription' : getMetadataString(metadata, 'referenceSource') === 'manual' ? 'Fixed script' : null],
    ['Reference transcription', getMetadataString(metadata, 'referenceTranscriptionModel')],
    ['Reference provider', isSynthesizedReference(metadata) ? null : getMetadataString(metadata, 'referenceProvider')],
    ['Reference model', isSynthesizedReference(metadata) ? null : getMetadataString(metadata, 'referenceModel')],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  return (
    <div className="space-y-4">
      <HistoryPronunciationAudio metadata={metadata} />
      <HistoryScoreSummary metadata={metadata} referenceText={referenceText} />
      <HistoryCoachSection metadata={metadata} />
      <HistoryWordReview words={words} truncated={metadata.wordsTruncated === true} onSelectWord={onSelectWord} />

      <details className="rounded-xl border border-foreground/10 bg-foreground/[0.02]">
        <summary className={historySummaryClass}>
          Delivery and pacing
          {issues.length > 0 && <span className="font-normal text-foreground/60"> · {issues.reduce((total, issue) => total + issue.count, 0)} labeled issues</span>}
          {!delivery && <span className="font-normal text-foreground/60"> · measurements unavailable</span>}
        </summary>
        <div className="space-y-3 px-3 pb-3">
          {issues.length > 0 && (
            <ul aria-label="Labeled issues" className="flex flex-wrap gap-1.5">
              {issues.map((issue) => (
                <li key={issue.label} className="rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-foreground/70">{issue.label}: {issue.count}</li>
              ))}
            </ul>
          )}
          <ProsodyFeedback words={words} />
          {delivery ? (
            <DeliveryAnalysisPanel analysis={delivery} loading={false} error={deliveryError} />
          ) : (
            <p className="break-words text-xs text-foreground/60">
              {deliveryError ? `Delivery measurements couldn’t be captured: ${deliveryError}` : 'Delivery measurements weren’t saved with this attempt.'}
            </p>
          )}
        </div>
      </details>

      <details className="rounded-xl border border-foreground/10 bg-foreground/[0.02]">
        <summary className={historySummaryClass}>Recognition and technical details</summary>
        <div className="px-3 pb-3">
          {technicalDetails.length === 0 ? (
            <p className="text-xs text-foreground/60">No recognition details were saved with this attempt.</p>
          ) : (
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {technicalDetails.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-foreground/60">{label}</dt>
                  <dd className="break-words text-xs text-foreground/80">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </details>
    </div>
  )
}

function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const samples = audioBuffer.length
  const bytesPerSample = 2
  const dataSize = samples * numChannels * bytesPerSample
  const wavBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wavBuffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index))
  let offset = 44
  for (let i = 0; i < samples; i += 1) {
    // Mix down to mono to align with common REST STT expectations.
    const mono = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length
    const clamped = Math.max(-1, Math.min(1, mono))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += bytesPerSample
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

async function convertRecordedBlobToWav(audioBlob: Blob): Promise<Blob> {
  if (audioBlob.type.includes('wav')) {
    return audioBlob
  }

  const audioContext = new AudioContext()
  try {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    return audioBufferToWavBlob(decoded)
  } finally {
    await audioContext.close()
  }
}

function base64ToBytes(audio: string): Uint8Array<ArrayBuffer> {
  const raw = atob(audio)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Wraps raw PCM bytes in a WAV header.
 * Gemini TTS returns L16 PCM while Azure pronunciation assessment expects a
 * standard audio container.
 */
function wrapPcmInWav(pcmBytes: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array<ArrayBuffer> {
  const header = new DataView(createWavHeader(pcmBytes.length, sampleRate, channels, bitsPerSample))
  const out = new Uint8Array(new ArrayBuffer(44 + pcmBytes.length))
  for (let i = 0; i < 44; i++) out[i] = header.getUint8(i)
  out.set(pcmBytes, 44)
  return out
}

function ttsPayloadToBlob(audio: string, mimeType: string): Blob {
  const bytes = base64ToBytes(audio)
  if (mimeType.includes('L16')) {
    return new Blob([wrapPcmInWav(bytes)], { type: 'audio/wav' })
  }
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' })
}

class SpeechLabRequestError extends Error {
  requestId?: string

  constructor(message: string, requestId?: string) {
    super(message)
    this.name = 'SpeechLabRequestError'
    this.requestId = requestId
  }
}

function speechLabRequestError(data: unknown, fallbackMessage: string): SpeechLabRequestError {
  const payload = data as { error?: unknown; requestId?: unknown }
  return new SpeechLabRequestError(
    typeof payload?.error === 'string' ? payload.error : fallbackMessage,
    typeof payload?.requestId === 'string' ? payload.requestId : undefined
  )
}

function getSpeechLabRequestId(error: unknown): string | null {
  return error instanceof SpeechLabRequestError ? error.requestId ?? null : null
}

/* ─── TTS Panel ─── */
function TtsPanel({
  onHistorySaved,
  historyActionRequest,
}: {
  onHistorySaved: () => Promise<void> | void
  historyActionRequest?: HistoryActionRequest | null
}) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Gacrux')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const isChirp3Voice = voice.startsWith('chirp3:')
  const maxChars = isChirp3Voice ? CHIRP3_TEXT_LIMIT_BYTES : GEMINI_TEXT_LIMIT

  /**
   * Fetches a single TTS batch from the API and returns the raw audio Uint8Array
   * plus MIME type.  Throws on API errors so the caller can catch and surface them.
   */
  const fetchTtsBatch = async (
    batchText: string,
    selectedVoice: string,
    selectedInstructions: string
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; summary?: string; storageUrl?: string }> => {
    const useChirp3 = selectedVoice.startsWith('chirp3:')
    const res = await fetch('/api/speech/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: batchText,
        voice: selectedVoice,
        provider: useChirp3 ? 'chirp3' : 'gemini',
        ...(!useChirp3 && selectedInstructions.trim() ? { instructions: selectedInstructions.trim() } : {}),
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw speechLabRequestError(data, 'TTS generation failed')
    }

    const { audio, mimeType, summary, storageUrl } = await res.json()
    return { bytes: base64ToBytes(audio), mimeType, summary, storageUrl }
  }

  const generateSpeech = async (
    inputText = text,
    selectedVoice = voice,
    selectedInstructions = instructions
  ) => {
    const trimmedText = inputText.trim()
    if (!trimmedText) return

    setLoading(true)
    setError(null)
    setErrorRequestId(null)
    setAudioUrl(null)
    setBatchProgress(null)

    try {
      const useChirp3 = selectedVoice.startsWith('chirp3:')
      const limit = useChirp3 ? CHIRP3_TEXT_LIMIT_BYTES : GEMINI_TEXT_LIMIT
      // NLP sentence splitter: pack sentences into batches that maximise usage
      // while staying under the API limit.  Full DSA docs in @/lib/tts/sentenceSplitter.ts
      const batches = buildTtsBatches(trimmedText, { limit, isChirp3: useChirp3 }, _intlSegmenter)
      const isSingleBatch = batches.length === 1

      if (!isSingleBatch) {
        setBatchProgress({ current: 0, total: batches.length })
      }

      // Process each batch sequentially to respect rate limits
      // (Gemini TTS: 10 req/min personal quota; Chirp 3: 200 req/min for HD voices)
      const allChunks: Uint8Array<ArrayBuffer>[] = []
      let overallMimeType = 'audio/wav'
      let firstSummary: string | undefined
      let firstStorageUrl: string | undefined

      for (let i = 0; i < batches.length; i++) {
        if (!isSingleBatch) setBatchProgress({ current: i + 1, total: batches.length })

        const { bytes, mimeType, summary, storageUrl } = await fetchTtsBatch(batches[i], selectedVoice, selectedInstructions)

        // Normalize all chunks to WAV PCM so they can be concatenated.
        // L16 raw PCM → wrap in WAV header.
        // MP3 (Chirp 3) → keep as-is if only one batch; multi-batch MP3
        // concatenation requires demuxing, so we just return the last chunk.
        if (mimeType?.includes('L16')) {
          allChunks.push(wrapPcmInWav(bytes))
          overallMimeType = 'audio/wav'
        } else {
          // Chirp 3 / MP3: direct byte payload
          allChunks.push(bytes)
          overallMimeType = mimeType || 'audio/mpeg'
        }

        if (i === 0) {
          firstSummary = summary
          firstStorageUrl = storageUrl
        }
      }

      // Concatenate WAV chunks: strip header from all but the first chunk,
      // then rebuild a single WAV with the combined PCM data.
      let finalBlob: Blob
      if (overallMimeType === 'audio/wav' && allChunks.length > 1) {
        const HEADER_SIZE = 44
        // Sum PCM data across all chunks (skip 44-byte WAV header per chunk)
        const totalPcm = allChunks.reduce((acc, chunk) => acc + Math.max(0, chunk.length - HEADER_SIZE), 0)
        const combined = new Uint8Array(new ArrayBuffer(HEADER_SIZE + totalPcm))
        // Copy the first chunk's header (sample rate, channels, etc. are identical)
        combined.set(allChunks[0].slice(0, HEADER_SIZE), 0)
        // Patch the data-chunk size field at offset 40 (little-endian uint32)
        const dataView = new DataView(combined.buffer)
        dataView.setUint32(4, 36 + totalPcm, true)  // RIFF chunk size
        dataView.setUint32(40, totalPcm, true)        // data sub-chunk size
        let writeOffset = HEADER_SIZE
        for (const chunk of allChunks) {
          const pcm = chunk.slice(HEADER_SIZE)
          combined.set(pcm, writeOffset)
          writeOffset += pcm.length
        }
        finalBlob = new Blob([combined], { type: 'audio/wav' })
      } else if (allChunks.length === 1) {
        finalBlob = new Blob(allChunks, { type: overallMimeType })
      } else {
        // Multi-chunk non-WAV (e.g. MP3 from Chirp3): concatenate raw bytes.
        // Many MP3 decoders handle stream-level concatenation correctly.
        finalBlob = new Blob(allChunks, { type: overallMimeType })
      }

      const url = URL.createObjectURL(finalBlob)
      setAudioUrl(url)
      setBatchProgress(null)

      try {
        const saved = await saveSpeechHistory({
          modality: 'tts',
          title: firstSummary || `TTS · ${selectedVoice}`,
          content: trimmedText,
          metadata: {
            voice: selectedVoice,
            provider: useChirp3 ? 'chirp3' : 'gemini',
            ...(selectedInstructions.trim() ? { instructions: selectedInstructions.trim() } : {}),
            mimeType: overallMimeType,
            batchCount: batches.length,
            ...(firstStorageUrl ? { storageUrl: firstStorageUrl } : {}),
          },
        })
        if (saved) await onHistorySaved()
      } catch (historyError) {
        console.warn('Failed to save TTS history', historyError)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setErrorRequestId(getSpeechLabRequestId(err))
      setBatchProgress(null)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    await generateSpeech()
  }

  useEffect(() => {
    if (!historyActionRequest) return
    const item = historyActionRequest.item
    const metadata = getHistoryMetadata(item)
    const restoredVoice = getMetadataString(metadata, 'voice') ?? voice
    const restoredInstructions = getMetadataString(metadata, 'instructions') ?? ''

    setText(item.content)
    setVoice(restoredVoice)
    setInstructions(restoredInstructions)
    setAudioUrl(null)
    setError(null)
    setErrorRequestId(null)

    if (historyActionRequest.action === 'rerun') {
      void generateSpeech(item.content, restoredVoice, restoredInstructions)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyActionRequest?.requestId])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">record_voice_over</span>
        <div>
          <h3 className="font-medium text-foreground">Google TTS Lab</h3>
          <p className="text-xs text-foreground/40">Gemini 2.5 Flash voices + Chirp 3 HD voices</p>
        </div>
      </div>

      {/* Text input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleGenerate()
            }
          }}
          placeholder="Enter text to speak…"
          rows={4}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none transition-all"
        />
        {(() => {
          const trimmed = text.trim()
          const size = isChirp3Voice ? textSize(text, true) : text.length
          const batches = trimmed ? buildTtsBatches(trimmed, { limit: maxChars, isChirp3: isChirp3Voice }, _intlSegmenter) : []
          const overLimit = size > maxChars
          return (
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-foreground/30">
                {batches.length > 1 ? (
                  <span className="text-amber-600">
                    Long text — will split into {batches.length} batches via NLP sentence splitter
                  </span>
                ) : (
                  <span>⌘/Ctrl+Enter to generate</span>
                )}
              </span>
              <span className={overLimit && batches.length === 1 ? 'text-red-500' : 'text-foreground/30'}>
                {size.toLocaleString()} / {maxChars.toLocaleString()} {isChirp3Voice ? 'bytes' : 'chars'}
              </span>
            </div>
          )
        })()}
      </div>

      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Voice</label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
        >
          <optgroup label="Gemini 2.5 Flash Voices">
            {geminiVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} — {v.style}
              </option>
            ))}
          </optgroup>
          <optgroup label="Chirp 3 HD Voices">
            {chirp3Voices.map((v) => (
              <option key={v.name} value={`chirp3:${v.name}`}>
                {v.name.replace('en-US-Chirp3-HD-', '')} — {v.style}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Style instructions — DESIGN DIVERGENCE: collapsible advanced section 
          Reason: keeps the interface clean for simple use while exposing power-user 
          controls (style, pacing, accent) that Gemini TTS supports via natural language */}
      <details className="group">
        <summary className="text-sm text-foreground/40 cursor-pointer hover:text-foreground/60 transition-colors select-none">
          Advanced: Style Instructions
        </summary>
        <div className="mt-2">
          {isChirp3Voice && (
            <p className="text-xs text-foreground/40 mb-2">
              Style instructions are currently applied to Gemini voices. Chirp 3 uses standard TTS prosody settings.
            </p>
          )}
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Speak in a warm, conversational tone with a slight British accent..."
            rows={2}
            disabled={isChirp3Voice}
            className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none transition-all"
          />
        </div>
      </details>

      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={loading || !text.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
        {loading ? (
          <>
            <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
            {batchProgress
              ? `Batch ${batchProgress.current}/${batchProgress.total}…`
              : 'Generating…'}
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg">play_arrow</span>
            Generate Speech
          </>
        )}
        </button>
      </div>

      {/* Batch progress bar (multi-batch only) */}
      {batchProgress && batchProgress.total > 1 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-foreground/40">
            <span>Processing batch {batchProgress.current} of {batchProgress.total}</span>
            <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground/40 transition-all duration-500"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-foreground/30">
            Gemini TTS: 10 req/min limit — batching sequentially to stay within quota
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
            <div>
              <p>{error}</p>
              {errorRequestId && <p className="text-xs opacity-70 mt-0.5">Tracking ID: {errorRequestId}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Try Again
          </button>
        </div>
      )}

      {/* Audio player */}
      {audioUrl && (
        <div className="pt-2">
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      {/* Service Limits */}
      <details className="group">
        <summary className="text-xs text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors select-none">
          API Limits &amp; NLP Batching Info
        </summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-foreground/40">
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">Gemini 2.5 Flash TTS (PAYG)</p>
            <p>Per-request limit: 4,096 chars · style instructions supported</p>
            <p>Rate limits: 10 req/min · 10k tokens/min · 100 req/day</p>
            <p>Output: PCM 24kHz 16-bit mono (wrapped in WAV)</p>
          </div>
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">Chirp 3 HD (PAYG)</p>
            <p>Per-request limit: 5,000 UTF-8 bytes</p>
            <p>Rate limit: 200 req/min · Free tier: 1M chars/mo then $0.00003/char</p>
            <p>Output: MP3 via Google Cloud Text-to-Speech API</p>
          </div>
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5 sm:col-span-2">
            <p className="font-medium text-foreground/50 mb-1">NLP Sentence Splitter (auto batching)</p>
            <p className="mb-1">
              Uses <code>Intl.Segmenter</code> (Unicode Annex #29) to split text at true sentence
              boundaries — correctly handles abbreviations (U.S., Dr.), decimal numbers (1.2 CAD),
              and quoted speech. Sentences are then greedily packed into batches via a sequential
              first-fit algorithm (O(n)) that maximises chars per batch while staying under the
              API limit. Batches are processed sequentially to respect rate limits.
            </p>
            <p>
              DSA: This is a bounded bin-packing variant with an ordering constraint, solved
              in O(n) time with O(n) space — near-optimal when sentence lengths are uniform.
            </p>
          </div>
        </div>
      </details>
    </div>
  )
}

/** Create a minimal WAV header for raw PCM data */
function createWavHeader(dataLength: number, sampleRate: number, channels: number, bitsPerSample: number): ArrayBuffer {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')

  // fmt subchunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)            // subchunk size
  view.setUint16(20, 1, true)             // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data subchunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  return header
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/* ─── STT Panel ─── */

const ACCEPTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/mp4a-latm',
  'audio/aiff',
  'audio/x-aiff',
  'audio/x-caf',
]
const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-m4v',
]
const ACCEPTED_AUDIO_EXTENSIONS = ['wav', 'webm', 'mp3', 'mpeg', 'mpga', 'ogg', 'flac', 'm4a', 'aac', 'mp4', 'aif', 'aiff', 'caf']
const ACCEPTED_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'ogv']
const MISTRAL_COMPATIBLE_AUDIO_EXTENSIONS = ['wav', 'webm', 'mp3', 'mpeg', 'mpga', 'ogg', 'flac']
const MISTRAL_COMPATIBLE_AUDIO_TYPES = ['audio/wav', 'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/flac']
// Per-provider audio file size limits for STT APIs
// Voxtral: 1 GB (Mistral docs), GPT-4o: Render-backed limits.
const STT_FILE_SIZE_LIMIT_BYTES: Record<SttModel, number> = {
  'voxtral-mini-transcribe-2507': 1024 * 1024 * 1024,
  'voxtral-mini-latest': 1024 * 1024 * 1024,
  'gpt-4o-transcribe': 200 * 1024 * 1024, // Render backend; multer limit is 200 MB
  'gpt-4o-transcribe-diarize': 500 * 1024 * 1024, // Render backend handles chunking; 500 MB is well above any real recording
}
// Vercel serverless functions enforce a 4.5 MB request body limit.
// We target 4 MB to leave headroom for FormData overhead (field names, boundaries, etc.).
const VERCEL_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024
const STT_DURATION_LIMIT_SECONDS: Record<SttModel, number> = {
  'voxtral-mini-transcribe-2507': 3 * 60 * 60,
  'voxtral-mini-latest': 3 * 60 * 60,
  'gpt-4o-transcribe': 2 * 60 * 60,
  'gpt-4o-transcribe-diarize': 2 * 60 * 60,
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** unit)
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return ''
  return fileName.slice(dotIndex + 1).toLowerCase()
}

function isAzureOpenAiSttModel(model: SttModel): boolean {
  return model.startsWith('gpt-4o')
}

function isLikelyAudioFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return file.type.startsWith('audio/') || ACCEPTED_AUDIO_TYPES.includes(file.type) || ACCEPTED_AUDIO_EXTENSIONS.includes(ext)
}

function isLikelyVideoFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return file.type.startsWith('video/') || ACCEPTED_VIDEO_TYPES.includes(file.type) || ACCEPTED_VIDEO_EXTENSIONS.includes(ext)
}

function isLikelyMistralCompatibleAudio(file: File): boolean {
  const ext = getFileExtension(file.name)
  return MISTRAL_COMPATIBLE_AUDIO_TYPES.includes(file.type) || MISTRAL_COMPATIBLE_AUDIO_EXTENSIONS.includes(ext)
}

function fileNameWithoutExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return fileName
  return fileName.slice(0, dotIndex)
}

let _ffmpeg: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg?.loaded) return _ffmpeg
  const ffmpeg = new FFmpeg()
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  _ffmpeg = ffmpeg
  return ffmpeg
}

async function extractAudioFromVideo(videoFile: File): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const ext = getFileExtension(videoFile.name) || 'mp4'
  const inputName = `input.${ext}`
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile))
  await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', 'output.mp3'])
  const data = await ffmpeg.readFile('output.mp3')
  await ffmpeg.deleteFile(inputName)
  await ffmpeg.deleteFile('output.mp3')
  return new Blob([(data as Uint8Array).slice()], { type: 'audio/mpeg' })
}

// Compresses audio to MP3 at progressively lower bitrates until it fits within limitBytes.
// Uses mono channel to halve size. Tries 64 → 32 → 16 kbps (all adequate for speech STT).
async function compressAudioForUpload(blob: Blob, limitBytes: number): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const mimeType = blob.type
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('flac') ? 'flac'
    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
    : 'webm'
  const inputName = `stt_in.${ext}`
  await ffmpeg.writeFile(inputName, await fetchFile(blob))
  for (const kbps of [64, 32, 16]) {
    await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-b:a', `${kbps}k`, '-ac', '1', 'stt_out.mp3'])
    const data = await ffmpeg.readFile('stt_out.mp3')
    await ffmpeg.deleteFile('stt_out.mp3')
    const compressed = new Blob([(data as Uint8Array).slice()], { type: 'audio/mpeg' })
    if (compressed.size <= limitBytes) {
      await ffmpeg.deleteFile(inputName)
      return compressed
    }
  }
  await ffmpeg.deleteFile(inputName)
  throw new Error(`Audio (${formatBytes(blob.size)}) could not be compressed to fit the ${formatBytes(limitBytes)} provider limit`)
}

function SttPanel({
  onHistorySaved,
  historyActionRequest,
}: {
  onHistorySaved: () => Promise<void> | void
  historyActionRequest?: HistoryActionRequest | null
}) {
  const [model, setModelRaw] = useState<SttModel>(() => {
    if (typeof window === 'undefined') return 'voxtral-mini-transcribe-2507'
    const saved = localStorage.getItem('speech-lab-stt-model')
    if (saved && ['voxtral-mini-transcribe-2507','voxtral-mini-latest','gpt-4o-transcribe','gpt-4o-transcribe-diarize'].includes(saved)) return saved as SttModel
    return 'voxtral-mini-transcribe-2507'
  })
  const setModel = (m: SttModel) => { setModelRaw(m); localStorage.setItem('speech-lab-stt-model', m) }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [segments, setSegments] = useState<{ start: number; end: number; text: string }[]>([])
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [convertingVideo, setConvertingVideo] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [recordedBytes, setRecordedBytes] = useState(0)
  const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null)
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0)
  const [compressing, setCompressing] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Diarize-specific: tracks how many 10-min chunks have completed so we can show progress
  const [diarizeProgress, setDiarizeProgress] = useState<{ completed: number; total: number } | null>(null)

  // Saved recordings (max 3, stored in S3 for offline retry)
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([])
  const [savingRecording, setSavingRecording] = useState(false)
  // Tracks which recording ID is currently being retried (for loading state)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  useEffect(() => {
    if (!recording || !recordingStartMs) return
    const interval = window.setInterval(() => {
      setRecordingElapsedSec((Date.now() - recordingStartMs) / 1000)
    }, 250)
    return () => window.clearInterval(interval)
  }, [recording, recordingStartMs])

  // Fetch saved recordings from S3 on mount
  useEffect(() => {
    void fetchRecordings()
  }, [])

  const fetchRecordings = async () => {
    try {
      const res = await fetch('/api/speech/recordings')
      if (!res.ok) return
      const data = await res.json()
      setSavedRecordings(data.recordings ?? [])
    } catch {
      // Silent fail — recordings panel just won't show
    }
  }

  // Save a recording blob to S3 (called in parallel with transcription)
  const saveRecordingToS3 = async (blob: Blob, filename: string): Promise<SavedRecording | null> => {
    setSavingRecording(true)
    try {
      const recording = await uploadSpeechRecording(blob, filename)
      if (recording) await fetchRecordings() // Refresh the list
      return recording
    } catch {
      // Non-fatal — recording still transcribes even if S3 save fails
      return null
    } finally {
      setSavingRecording(false)
    }
  }

  // Delete a saved recording
  const deleteRecording = async (id: string) => {
    try {
      await fetch(`/api/speech/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setSavedRecordings((prev) => prev.filter((r) => r.id !== id))
    } catch {
      // Silent fail
    }
  }

  // Retry transcription of a saved recording with the currently selected model
  const retryRecording = async (id: string) => {
    setRetryingId(id)
    try {
      // Download the audio blob from S3 via our proxy API (avoids CORS)
      const audioRes = await fetch(`/api/speech/recordings/${encodeURIComponent(id)}`)
      if (!audioRes.ok) throw new Error('Failed to download recording')
      const blob = await audioRes.blob()

      // Derive a filename from the recording ID (e.g. "1712678400000-abc123.webm")
      const uploadName = id.includes('.') ? id : `${id}.webm`

      // Send it through the normal transcription flow
      await handleTranscribe(blob, uploadName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetryingId(null)
    }
  }

  // Handles gpt-4o-transcribe-diarize: sends audio to the Render speech-tools service
  // which chunks it into 10-min segments, processes them in parallel via Azure, and
  // streams SSE events back. Bypasses Vercel entirely (no 60-300s timeout issue).
  const handleDiarizeTranscribe = async (
    audioBlob: Blob,
    uploadFileName: string,
    options: { recordingPromise?: Promise<SavedRecording | null>; recording?: SavedRecording | null } = {}
  ) => {
    setLoading(true)
    setError(null)
    setTranscript(null)
    setSegments([])
    setDiarizeProgress(null)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, uploadFileName)
      formData.append('max_workers', '10')

      const res = await fetch('https://speech-tools.onrender.com/diarize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + await fetchSpeechServiceToken('diarize') },
        body: formData,
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(`Render service error ${res.status}: ${text}`)
      }

      // Parse the SSE stream line by line.
      // Each event is: "data: {json}\n\n"
      // We accumulate partial chunks in a buffer to handle mid-chunk network reads.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // Accumulates segments from each chunk_done event so we can display them progressively.
      // Mutable array intentionally outside useState — updated during stream, React state is set after each sort.
      const partialSegs: { speaker: string; text: string; start: number; end: number }[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on newlines; keep the last incomplete line in the buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue

          // Parse is typed loosely because the SseEvent union lives in the Render service.
          // We use "type" as the discriminant, same as the TypeScript type file.
          const event = JSON.parse(json) as {
            type: string;
            totalChunks?: number;
            completed?: number;
            total?: number;
            segments?: { speaker: string; text: string; start: number; end: number }[];
            totalSegments?: number;
            uniqueSpeakers?: string[];
            totalMs?: number;
            error?: string;
            message?: string;
          }

          if (event.type === 'started') {
            setDiarizeProgress({ completed: 0, total: event.totalChunks ?? 0 })
          } else if (event.type === 'chunk_done') {
            setDiarizeProgress({ completed: event.completed ?? 0, total: event.total ?? 0 })
            // Merge this chunk's segments into our running list and display immediately.
            // Sorting by start time ensures out-of-order chunk arrivals display correctly.
            if (event.segments && event.segments.length > 0) {
              partialSegs.push(...event.segments)
              partialSegs.sort((a, b) => a.start - b.start)
              const formatted = partialSegs.map(s => {
                const ts = formatDuration(Math.round(s.start))
                return `[Speaker ${s.speaker}] ${ts}  ${s.text.trim()}`
              }).join('\n')
              setTranscript(formatted)
              setSegments(partialSegs.map(s => ({
                start: s.start,
                end: s.end,
                text: `[Speaker ${s.speaker}] ${s.text}`,
              })))
            }
          } else if (event.type === 'complete') {
            const segs = event.segments ?? []
            // Format as "[Speaker A] 0:00  text" — one line per speaker turn
            const formatted = segs.map(s => {
              const ts = formatDuration(Math.round(s.start))
              return `[Speaker ${s.speaker}] ${ts}  ${s.text.trim()}`
            }).join('\n')
            setTranscript(formatted)
            setSegments(segs.map(s => ({
              start: s.start,
              end: s.end,
              text: `[Speaker ${s.speaker}] ${s.text}`,
            })))
            try {
              const recording = options.recording ?? await options.recordingPromise?.catch(() => null) ?? null
              const saved = await saveSpeechHistory({
                modality: 'stt',
                title: `Diarize · gpt-4o-transcribe-diarize`,
                content: formatted,
                metadata: {
                  model: 'gpt-4o-transcribe-diarize',
                  segments: event.totalSegments ?? segs.length,
                  speakers: event.uniqueSpeakers?.length ?? 0,
                  segmentsData: segs.slice(0, 500).map((segment) => ({
                    start: segment.start,
                    end: segment.end,
                    text: `[Speaker ${segment.speaker}] ${segment.text}`,
                  })),
                  ...(recording ? { recording } : {}),
                },
              })
              if (saved) await onHistorySaved()
            } catch (historyError) {
              console.warn('Failed to save diarization history', historyError)
            }
          } else if (event.type === 'error') {
            throw new Error(event.message ?? event.error ?? 'Diarization failed')
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diarization failed')
    } finally {
      setLoading(false)
      setDiarizeProgress(null)
    }
  }

  /**
   * Unified transcription path for all Voxtral + Azure gpt-4o-transcribe models.
   * Calls the Render speech-tools /transcribe endpoint which returns SSE events.
   *
   * Event format from Render:
   *   { type: "delta", text: "..." }  — incremental token (Azure models stream these)
   *   { type: "done",  text: "...", segments?: [...] } — final authoritative transcript
   *   { type: "error", message: "..." }
   *
   * Advantages over the old Vercel path:
   *   - No Vercel timeout — Render handles files that take minutes
   *   - No S3 presign dance for large files (Render multer handles up to 200 MB directly)
   *   - Azure gpt-4o-transcribe streams tokens word-by-word
   */
  const handleRenderTranscribe = async (
    audioBlob: Blob,
    uploadFileName: string,
    options: { modelOverride?: SttModel; recordingPromise?: Promise<SavedRecording | null>; recording?: SavedRecording | null } = {}
  ) => {
    const activeModel = options.modelOverride ?? model
    setLoading(true)
    setError(null)
    setTranscript(null)
    setSegments([])

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, uploadFileName)
      formData.append('model', activeModel)

      const res = await fetch('https://speech-tools.onrender.com/transcribe', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + await fetchSpeechServiceToken('transcribe') },
        body: formData,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Transcription failed (HTTP ${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let runningText = ''
      let finalSegments: { start: number; end: number; text: string }[] = []
      // For parallel chunked mode: accumulate per-chunk text, keyed by chunk index
      const partialTexts = new Map<number, string>()
      let totalChunks = 1

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw) as {
              type: string
              text?: string
              totalChunks?: number
              index?: number
              completed?: number
              total?: number
              segments?: { start: number; end: number; text: string }[]
              message?: string
            }

            if (event.type === 'transcribe_started') {
              // Large file split into chunks — show chunk progress
              totalChunks = event.totalChunks ?? 1
              setDiarizeProgress({ completed: 0, total: totalChunks })
            } else if (event.type === 'chunk_delta') {
              // Azure is streaming tokens live from within one parallel chunk slot
              // Accumulate into that slot's running text and immediately re-render
              const idx = event.index ?? 0
              const prev = partialTexts.get(idx) ?? ''
              partialTexts.set(idx, prev + (event.text ?? ''))

              // Rebuild visible transcript: show all known slots in order, placeholder for unstarted ones
              const assembled = Array.from({ length: totalChunks }, (_, i) => {
                if (partialTexts.has(i)) return partialTexts.get(i)!
                return `[Chunk ${i + 1} — processing…]`
              }).join('\n\n')
              setTranscript(assembled.trim())
            } else if (event.type === 'chunk_text_done') {
              // One chunk finished — overwrite with authoritative text and update counter
              partialTexts.set(event.index ?? 0, event.text ?? '')
              setDiarizeProgress({ completed: event.completed ?? 0, total: event.total ?? totalChunks })

              // Assemble available chunks in index order, with placeholders for missing ones
              const assembled = Array.from({ length: event.total ?? totalChunks }, (_, i) => {
                if (partialTexts.has(i)) return partialTexts.get(i)!
                return `[Chunk ${i + 1} — processing…]`
              }).join('\n\n')
              setTranscript(assembled.trim())
            } else if (event.type === 'delta' && event.text) {
              // Azure streaming: show tokens word-by-word as they arrive (small file / single-shot path)
              runningText += event.text
              setTranscript(runningText)
            } else if (event.type === 'done' && event.text != null) {
              // Final authoritative text from Render — use this as the ground truth
              runningText = event.text
              setTranscript(event.text)
              if (event.segments) {
                finalSegments = event.segments
                setSegments(event.segments)
              }
            } else if (event.type === 'error') {
              throw new Error(event.message || 'Transcription error from Render service')
            }
          } catch (parseErr) {
            // Re-throw real errors but swallow JSON parse errors (non-JSON SSE lines)
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      if (runningText) {
        try {
          const recording = options.recording ?? await options.recordingPromise?.catch(() => null) ?? null
          const saved = await saveSpeechHistory({
            modality: 'stt',
            title: `STT · ${activeModel}`,
            content: runningText,
            metadata: {
              model: activeModel,
              segments: finalSegments.length,
              segmentsData: finalSegments.slice(0, 500),
              ...(recording ? { recording } : {}),
            },
          })
          if (saved) await onHistorySaved()
        } catch (historyError) {
          console.warn('Failed to save transcription history', historyError)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTranscribe = async (
    audioBlob: Blob,
    uploadFileName = 'recording.webm',
    options: { modelOverride?: SttModel; recordingPromise?: Promise<SavedRecording | null>; recording?: SavedRecording | null } = {}
  ) => {
    const activeModel = options.modelOverride ?? model
    // Diarize model: stream parallel chunks from Render speech-tools /diarize
    if (activeModel === 'gpt-4o-transcribe-diarize') {
      await handleDiarizeTranscribe(audioBlob, uploadFileName, options)
      return
    }

    // All non-diarize STT models go to Render /transcribe (avoids Vercel timeouts).
    await handleRenderTranscribe(audioBlob, uploadFileName, options)
  }

  const processFile = async (file: File) => {
    setFileName(file.name)

    const isVideo = isLikelyVideoFile(file)
    const isAudio = isLikelyAudioFile(file)

    if (!isVideo && !isAudio) {
      setError('Unsupported file format. Try WAV, MP3, M4A, MP4, MOV, or WebM.')
      return
    }

    const limitBytes = STT_FILE_SIZE_LIMIT_BYTES[model]

    if (isVideo) {
      setConvertingVideo(true)
      setError(null)
      try {
        let audioBlob = await extractAudioFromVideo(file)
        setConvertingVideo(false)
        if (audioBlob.size > limitBytes) {
          setCompressing(true)
          try {
            audioBlob = await compressAudioForUpload(audioBlob, limitBytes)
          } finally {
            setCompressing(false)
          }
        }
        await handleTranscribe(audioBlob, `${fileNameWithoutExtension(file.name)}.mp3`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video audio extraction failed')
      } finally {
        setConvertingVideo(false)
        setCompressing(false)
      }
      return
    }

    // Audio file: convert format if needed, then compress if over the provider limit
    let audioBlob: Blob = file
    let uploadName = file.name

    if (!isAzureOpenAiSttModel(model) && !isLikelyMistralCompatibleAudio(file)) {
      try {
        audioBlob = await convertRecordedBlobToWav(file)
        uploadName = `${fileNameWithoutExtension(file.name)}.wav`
      } catch {
        setError('Audio format conversion failed. Try selecting GPT-4o Transcribe or upload WAV/MP3/WebM.')
        return
      }
    }

    if (audioBlob.size > limitBytes) {
      setCompressing(true)
      try {
        audioBlob = await compressAudioForUpload(audioBlob, limitBytes)
        uploadName = `${fileNameWithoutExtension(file.name)}.mp3`
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Audio compression failed')
        setCompressing(false)
        return
      }
      setCompressing(false)
    }

    await handleTranscribe(audioBlob, uploadName)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const selectedMimeType = preferredMimeTypes.find((value) => MediaRecorder.isTypeSupported(value))
      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
          setRecordedBytes((prev) => prev + e.data.size)
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const mimeType = recorder.mimeType || selectedMimeType || 'audio/webm'
        const extension = mimeType.includes('mp4') ? 'm4a' : 'webm'
        let blob = new Blob(chunks, { type: mimeType })
        let uploadName = `recording.${extension}`
        const limitBytes = STT_FILE_SIZE_LIMIT_BYTES[model]

        // Keep the original blob for S3 save (before any compression)
        const originalBlob = blob

        if (blob.size > limitBytes) {
          setCompressing(true)
          try {
            blob = await compressAudioForUpload(blob, limitBytes)
            uploadName = 'recording.mp3'
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Audio compression failed')
            setCompressing(false)
            return
          }
          setCompressing(false)
        }

        // Save to S3 in parallel and attach the recording metadata to history
        // when the upload succeeds.
        const recordingPromise = saveRecordingToS3(originalBlob, `recording.${extension}`)
        void handleTranscribe(blob, uploadName, { recordingPromise })
      }

      setRecordedBytes(0)
      setRecordingElapsedSec(0)
      setRecordingStartMs(Date.now())
      recorder.start(1000)
      setMediaRecorder(recorder)
      setRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      setRecording(false)
      setMediaRecorder(null)
      setRecordingStartMs(null)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void processFile(file)
  }

  useEffect(() => {
    if (!historyActionRequest) return
    const item = historyActionRequest.item
    const metadata = getHistoryMetadata(item)
    const historyModel = getMetadataString(metadata, 'model')
    const restoredModel = historyModel && ['voxtral-mini-transcribe-2507','voxtral-mini-latest','gpt-4o-transcribe','gpt-4o-transcribe-diarize'].includes(historyModel)
      ? historyModel as SttModel
      : model
    const segmentsData = metadata.segmentsData
    const restoredSegments = Array.isArray(segmentsData)
      ? segmentsData.filter((segment): segment is { start: number; end: number; text: string } =>
          isRecord(segment) &&
          typeof segment.start === 'number' &&
          typeof segment.end === 'number' &&
          typeof segment.text === 'string'
        )
      : []

    setModel(restoredModel)
    setTranscript(item.content)
    setSegments(restoredSegments)
    setError(null)

    if (historyActionRequest.action === 'rerun') {
      const recording = getHistoryRecording(metadata)
      if (!recording) {
        setError('No saved audio is available for this history item. Restore the transcript or upload the recording again.')
        return
      }

      void (async () => {
        try {
          const audioRes = await fetch(`/api/speech/recordings/${encodeURIComponent(recording.id)}`)
          if (!audioRes.ok) throw new Error('Saved recording is no longer available')
          const blob = await audioRes.blob()
          await handleTranscribe(blob, recording.id, { modelOverride: restoredModel, recording })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'History rerun failed')
        }
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyActionRequest?.requestId])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">mic</span>
        <div>
          <h3 className="font-medium text-foreground">Transcription</h3>
          <p className="text-xs text-foreground/40">Mistral Voxtral · Azure OpenAI GPT‑4o</p>
        </div>
      </div>

      {/* Model selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Model</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setModel('voxtral-mini-transcribe-2507')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'voxtral-mini-transcribe-2507'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>Transcribe (2507)</div>
            <div className="text-xs opacity-60 mt-0.5">Batch · timestamps</div>
          </button>
          <button
            onClick={() => setModel('voxtral-mini-latest')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'voxtral-mini-latest'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>Voxtral Mini Latest</div>
            <div className="text-xs opacity-60 mt-0.5">Latest provider default</div>
          </button>
          <button
            onClick={() => setModel('gpt-4o-transcribe')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'gpt-4o-transcribe'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>GPT‑4o Transcribe</div>
            <div className="text-xs opacity-60 mt-0.5">Azure OpenAI deployment</div>
          </button>
          <button
            onClick={() => setModel('gpt-4o-transcribe-diarize')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'gpt-4o-transcribe-diarize'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>GPT‑4o Diarize</div>
            <div className="text-xs opacity-60 mt-0.5">Azure OpenAI with speaker separation</div>
          </button>
        </div>
      </div>

      {/* Drag & Drop Zone + Upload */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragOver
            ? 'border-foreground/40 bg-foreground/[0.06] scale-[1.01]'
            : 'border-foreground/15 bg-foreground/[0.02] hover:border-foreground/25 hover:bg-foreground/[0.04]'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <span className={`material-symbols-outlined text-4xl transition-colors ${dragOver ? 'text-foreground/60' : 'text-foreground/25'}`}>
            {convertingVideo ? 'movie_filter' : 'cloud_upload'}
          </span>
          {convertingVideo ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/60">Extracting audio from video…</p>
              <p className="text-xs text-foreground/30">This may take a moment for longer videos</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/60">
                Drag & drop audio or video files here
              </p>
              <p className="text-xs text-foreground/30">
                Supports WAV, MP3, WebM, FLAC, M4A, AIFF, CAF, MP4, MOV, AVI, MKV · Compressed automatically if over provider limit
              </p>
              {fileName && !loading && (
                <p className="text-xs text-foreground/40 mt-1">Last file: {fileName}</p>
              )}
            </div>
          )}
          <label className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-foreground/5 text-foreground/60 font-medium text-sm hover:bg-foreground/10 transition-colors cursor-pointer mt-1">
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Browse Files
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Record button */}
      <div className="flex gap-3">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || convertingVideo || compressing || uploading}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-medium text-sm transition-all cursor-pointer ${
            recording
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-foreground text-background hover:opacity-90'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-lg">
            {recording ? 'stop' : 'mic'}
          </span>
          {recording ? 'Stop Recording' : 'Record'}
        </button>
      </div>

      {/* Saving indicator */}
      {savingRecording && (
        <div className="flex items-center gap-2 text-foreground/40 text-xs">
          <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
          Saving recording to cloud…
        </div>
      )}

      {/* Saved Recordings (max 3) */}
      {savedRecordings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground/50 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">cloud_done</span>
            Saved Recordings ({savedRecordings.length}/3)
          </p>
          <div className="space-y-1.5">
            {savedRecordings.map((rec) => {
              const date = new Date(rec.createdAt)
              const timeStr = date.toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })
              const isRetrying = retryingId === rec.id
              return (
                <div
                  key={rec.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-foreground/[0.03] border border-foreground/10 text-sm"
                >
                  <span className="material-symbols-outlined text-foreground/30 text-base">mic</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground/70 text-xs">{timeStr}</span>
                    <span className="text-foreground/30 text-xs ml-2">{formatBytes(rec.sizeBytes)}</span>
                  </div>
                  <button
                    onClick={() => retryRecording(rec.id)}
                    disabled={loading || isRetrying}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-foreground/5 text-foreground/60 text-xs hover:bg-foreground/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRetrying ? (
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">replay</span>
                    )}
                    Retry
                  </button>
                  <button
                    onClick={() => deleteRecording(rec.id)}
                    disabled={isRetrying}
                    className="inline-flex items-center p-1 rounded-full text-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Delete recording"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-sm text-red-700">Recording… {formatDuration(recordingElapsedSec)}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-red-700/90">
              <span>File size</span>
              <span>
                {formatBytes(recordedBytes)} / {formatBytes(STT_FILE_SIZE_LIMIT_BYTES[model])}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-red-100 overflow-hidden">
              <div
                className={`h-full transition-all ${recordedBytes / STT_FILE_SIZE_LIMIT_BYTES[model] >= 0.8 ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min((recordedBytes / STT_FILE_SIZE_LIMIT_BYTES[model]) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-red-700/90">
              <span>Duration guidance</span>
              <span>
                {formatDuration(recordingElapsedSec)} / {formatDuration(STT_DURATION_LIMIT_SECONDS[model])}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-red-100 overflow-hidden">
              <div
                className={`h-full transition-all ${recordingElapsedSec / STT_DURATION_LIMIT_SECONDS[model] >= 0.8 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min((recordingElapsedSec / STT_DURATION_LIMIT_SECONDS[model]) * 100, 100)}%` }}
              />
            </div>
          </div>

          {(recordedBytes / STT_FILE_SIZE_LIMIT_BYTES[model] >= 0.8 || recordingElapsedSec / STT_DURATION_LIMIT_SECONDS[model] >= 0.8) && (
            <p className="text-xs text-red-700/90">
              Approaching provider limits. Audio will be compressed if needed before upload.
            </p>
          )}
        </div>
      )}

      {/* Compressing */}
      {compressing && (
        <div className="flex items-center gap-2 text-foreground/40 text-sm">
          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
          Compressing audio to fit provider limit…
        </div>
      )}

      {/* Uploading to S3 */}
      {uploading && (
        <div className="flex items-center gap-2 text-foreground/40 text-sm">
          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
          Uploading audio…
        </div>
      )}

      {/* Loading */}
      {loading && !uploading && (
        <div className="flex items-center gap-2 text-foreground/40 text-sm">
          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
          {diarizeProgress
            ? `${model === 'gpt-4o-transcribe-diarize' ? 'Diarizing' : 'Transcribing'}… ${diarizeProgress.completed} / ${diarizeProgress.total} chunks`
            : 'Transcribing…'}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-500 text-lg">error</span>
          {error}
        </div>
      )}

      {/* Transcript */}
      {transcript !== null && (
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-xl bg-foreground/[0.03] border border-foreground/10">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm font-medium text-foreground/70">Transcript</p>
              <button
                onClick={() => navigator.clipboard.writeText(transcript || '')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/5 text-foreground/60 text-xs hover:bg-foreground/10 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                Copy
              </button>
            </div>
            <textarea
              value={transcript || ''}
              readOnly
              rows={6}
              tabIndex={0}
              aria-label="Transcript output"
              className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-3 py-2 text-sm text-foreground leading-relaxed resize-y"
            />
          </div>

          {/* Segments with timestamps */}
          {segments.length > 0 && (
            <details className="group">
              <summary className="text-sm text-foreground/40 cursor-pointer hover:text-foreground/60 transition-colors select-none">
                Segments ({segments.length})
              </summary>
              <div className="mt-2 space-y-1">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="tabular-nums text-foreground/30 shrink-0">
                      {seg.start.toFixed(1)}s–{seg.end.toFixed(1)}s
                    </span>
                    <span className="text-foreground/70">{seg.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Service Limits */}
      <details className="group">
        <summary className="text-xs text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors select-none">
          API Limits &amp; Info
        </summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-foreground/40">
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">Voxtral Mini Transcribe (2507)</p>
            <p>App cap: 25MB upload · Mistral batch transcription supports long-form audio up to ~3 hours</p>
            <p>Best with WAV/MP3/FLAC/WebM/OGG; M4A/AIFF/CAF are converted when needed</p>
          </div>
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">Voxtral Mini Latest</p>
            <p>Same upload cap in this app (25MB) and same provider family constraints as above</p>
            <p>Good default for Mistral path while model revisions roll forward</p>
          </div>
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">GPT‑4o Transcribe</p>
            <p>Transcription API upload limit: 25MB per request</p>
            <p>Formats: MP3, MP4, MPEG, MPGA, M4A, WAV, WebM</p>
          </div>
          <div className="rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5">
            <p className="font-medium text-foreground/50 mb-1">GPT‑4o Transcribe Diarize</p>
            <p>Up to 500 MB. Splits to 10-min chunks automatically and processes them in parallel via a dedicated Render service — no Vercel timeout limit.</p>
            <p>For long audio, chunking is still recommended to avoid provider timeouts</p>
          </div>
        </div>
      </details>
    </div>
  )
}

/* ─── Pronunciation Panel ─── */
async function fetchSpeechServiceToken(scope: 'transcribe' | 'diarize'): Promise<string> {
  const res = await fetch('/api/speech/stt/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.token !== 'string') throw new Error(data.error || 'Speech service authorization unavailable')
  return data.token
}

function getTtsVoiceLabel(voice: string): string {
  return pronunciationReferenceVoiceLabel(voice).replace(/^chirp3:en-US-Chirp3-HD-/, '')
}

function normalizeAzureWord(word: AzureWord): PronWord {
  const assessment = word.PronunciationAssessment
  const prosody = (assessment?.Feedback ?? word.Feedback)?.Prosody

  return {
    word: word.Word,
    accuracyScore: assessment?.AccuracyScore ?? word.AccuracyScore ?? 0,
    errorType: assessment?.ErrorType ?? word.ErrorType ?? 'None',
    offset: word.Offset,
    duration: word.Duration,
    syllables: (word.Syllables ?? []).map((syllable) => ({
      syllable: syllable.Syllable,
      grapheme: syllable.Grapheme,
      accuracyScore: syllable.PronunciationAssessment?.AccuracyScore ?? syllable.AccuracyScore ?? 0,
      offset: syllable.Offset,
      duration: syllable.Duration,
    })),
    phonemes: (word.Phonemes ?? []).map((phoneme) => ({
      phoneme: phoneme.Phoneme,
      accuracyScore: phoneme.PronunciationAssessment?.AccuracyScore ?? phoneme.AccuracyScore ?? 0,
      offset: phoneme.Offset,
      duration: phoneme.Duration,
      nBestPhonemes: (phoneme.PronunciationAssessment?.NBestPhonemes ?? phoneme.NBestPhonemes ?? []).map((candidate) => ({
        phoneme: candidate.Phoneme,
        score: candidate.Score,
      })),
    })),
    prosody: prosody
      ? {
          breakErrorTypes: prosody.Break?.ErrorTypes ?? [],
          unexpectedBreakConfidence: prosody.Break?.UnexpectedBreak?.Confidence,
          missingBreakConfidence: prosody.Break?.MissingBreak?.Confidence,
          breakLength: prosody.Break?.BreakLength,
          intonationErrorTypes: prosody.Intonation?.ErrorTypes ?? [],
          monotoneConfidence: prosody.Intonation?.Monotone?.Confidence,
          wordPitchSlopeConfidence: prosody.Intonation?.Monotone?.WordPitchSlopeConfidence,
          syllablePitchDeltaConfidence: prosody.Intonation?.Monotone?.SyllablePitchDeltaConfidence,
        }
      : undefined,
  }
}

function isOmittedPronunciationWord(word: PronWord): boolean {
  return word.errorType === 'Omission'
}

function getProsodyBreakIssues(word: PronWord): ProsodyBreakIssue[] {
  const issues: ProsodyBreakIssue[] = []
  const unexpectedBreakConfidence = word.prosody?.unexpectedBreakConfidence
  const missingBreakConfidence = word.prosody?.missingBreakConfidence

  // Azure's REST response can report high raw break confidence values even
  // when ErrorTypes is ["None"]. Only surface pause guidance for explicit labels.
  if (
    word.errorType === 'UnexpectedBreak' ||
    word.prosody?.breakErrorTypes.includes('UnexpectedBreak')
  ) {
    issues.push({ type: 'unexpected-break', word: word.word, confidence: unexpectedBreakConfidence })
  }

  if (
    word.errorType === 'MissingBreak' ||
    word.prosody?.breakErrorTypes.includes('MissingBreak')
  ) {
    issues.push({ type: 'missing-break', word: word.word, confidence: missingBreakConfidence })
  }

  return issues
}

function hasMonotoneFeedback(word: PronWord): boolean {
  return word.errorType === 'Monotone' || Boolean(word.prosody?.intonationErrorTypes.includes('Monotone'))
}

async function postAssessmentPhase(url:string, body:unknown) {
  // A server-side background worker may already own the phase; wait for its persisted result.
  for (let i=0;i<45;i++) {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const data=await response.json().catch(()=>({}))
    if (response.status===202) { await new Promise(resolve=>setTimeout(resolve,2000)); continue }
    if (!response.ok) throw speechLabRequestError(data,'Assessment enrichment unavailable')
    return data
  }
  throw new Error('Analysis is still processing. Try restoring the saved attempt to refresh it.')
}
async function fetchDeliveryAnalysis(attemptId: string): Promise<DeliveryAnalysis> {
  const data=await postAssessmentPhase('/api/speech/pronunciation/delivery',{attemptId})
  if (!data.delivery) throw new Error('Delivery analysis unavailable')
  return data.delivery as DeliveryAnalysis
}

async function normalizePronunciationAudio(audio: Blob): Promise<Blob> {
  const bytes = await audio.arrayBuffer()
  // Preserve already-normalized PCM recordings bit-for-bit, including benchmark WAVs.
  if (bytes.byteLength >= 44) {
    const view = new DataView(bytes)
    if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57415645 && view.getUint32(12) === 0x666d7420 && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 && view.getUint32(24, true) === 16000 && view.getUint16(34, true) === 16) {
      return new Blob([bytes], { type: 'audio/wav' })
    }
  }
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0))
    const resampler = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
    const source = resampler.createBufferSource()
    source.buffer = decoded
    source.connect(resampler.destination)
    source.start()
    return audioBufferToWavBlob(await resampler.startRendering())
  } finally {
    await context.close()
  }
}

async function fetchPronunciationCoach(result: PronResult, referenceText: string, language: string, subject: AssessmentSubject, referenceSource: 'manual' | 'transcription'): Promise<PronunciationCoach> {
  const d = result.delivery
  const input: PronunciationCoachInput = {
    referenceText, recognizedText: result.displayText, language, source: subject.type, referenceSource,
    scores: { pronunciation: result.pronScore, accuracy: result.accuracyScore, fluency: result.fluencyScore, completeness: result.completenessScore, prosody: result.prosodyScore },
    recognitionStatus: result.recognitionStatus, snr: result.snr, words: result.words.slice(0, 220),
    ...(d ? { delivery: {
      speakingRateWpm: d.speakingRateWpm, durationSec: d.summary.durationSec, pauseCount: d.summary.pauseCount, totalPauseSec: d.summary.totalPauseSec,
      pitchRangeSemitones: d.pitch.rangeSemitones, intensityRangeDb: d.intensity.rangeDb,
      pauses: d.pauses.slice(0, 80), phrases: d.phrases.slice(0, 80).map(p => ({ ...p, text: p.text.slice(0, 500) })),
    } } : {}),
  }
  const data=await postAssessmentPhase('/api/speech/pronunciation/coach',result.attemptId?{attemptId:result.attemptId}:input)
  if (!data.coach) throw speechLabRequestError(data, 'AI coaching unavailable.')
  return data.coach as PronunciationCoach
}

function countPronunciationIssues(words: PronWord[]) {
  const counts = {
    wordCount: words.length,
    scoredWordCount: 0,
    omissionCount: 0,
    mispronunciationCount: 0,
    unexpectedBreakCount: 0,
    missingBreakCount: 0,
    monotoneCount: 0,
    lowAccuracyCount: 0,
  }

  for (const word of words) {
    if (!isOmittedPronunciationWord(word) && Number.isFinite(word.accuracyScore)) {
      counts.scoredWordCount += 1
    }
    if (word.errorType === 'Omission') counts.omissionCount += 1
    if (word.errorType === 'Mispronunciation') counts.mispronunciationCount += 1
    if (word.errorType === 'UnexpectedBreak' || word.prosody?.breakErrorTypes.includes('UnexpectedBreak')) counts.unexpectedBreakCount += 1
    if (word.errorType === 'MissingBreak' || word.prosody?.breakErrorTypes.includes('MissingBreak')) counts.missingBreakCount += 1
    if (word.errorType === 'Monotone' || word.prosody?.intonationErrorTypes.includes('Monotone')) counts.monotoneCount += 1
    if (!isOmittedPronunciationWord(word) && word.accuracyScore < SCORE_EXCELLENT) counts.lowAccuracyCount += 1
  }

  return counts
}

function trimDeliveryAnalysisForHistory(analysis?: DeliveryAnalysis): DeliveryAnalysis | undefined {
  if (!analysis) return undefined
  return {
    ...analysis,
    pitch: {
      ...analysis.pitch,
      series: analysis.pitch.series.slice(0, 400),
    },
    intensity: {
      ...analysis.intensity,
      series: analysis.intensity.series.slice(0, 400),
    },
    speechSegments: analysis.speechSegments.slice(0, 200),
    pauses: analysis.pauses.slice(0, 200),
    phrases: analysis.phrases.slice(0, 200),
    insights: analysis.insights.slice(0, 10),
  }
}

function buildPronunciationHistoryMetadata(args: {
  result: PronResult
  referenceText: string
  language: string
  subject: AssessmentSubject
  deliveryError?: string | null
  recording?: SavedRecording | null
  referenceSource?: 'manual' | 'transcription'
  referenceTranscriptionModel?: string
}) {
  const { result, referenceText, language, subject, deliveryError, recording, referenceSource, referenceTranscriptionModel } = args
  const wordsLimit = 220
  const issueCounts = countPronunciationIssues(result.words)

  return {
    schemaVersion: 3,
    requestId: result.requestId ?? null,
    language,
    source: subject.type,
    referenceSource: referenceSource ?? 'manual',
    referenceTranscriptionModel,
    audio: result.audio,
    coach: result.coach,
    coachError: result.coachError,
    ...(subject.type === 'reference-voice'
      ? {
          voice: subject.voice,
          referenceProvider: subject.provider,
          referenceModel: subject.model,
          ...(subject.storageUrl ? { storageUrl: subject.storageUrl } : {}),
        }
      : {}),
    ...(recording ? { recording } : {}),
    referenceText,
    referenceWordCount: referenceText.trim() ? referenceText.trim().split(/\s+/).length : 0,
    recognitionStatus: result.recognitionStatus,
    displayText: result.displayText,
    lexical: result.lexical ?? null,
    confidence: result.confidence ?? null,
    snr: result.snr ?? null,
    scores: {
      pronunciation: result.pronScore,
      accuracy: result.accuracyScore,
      fluency: result.fluencyScore,
      completeness: result.completenessScore,
      prosody: result.prosodyScore ?? null,
    },
    // Top-level score fields keep old history rows and quick summaries simple.
    pronScore: result.pronScore,
    accuracyScore: result.accuracyScore,
    fluencyScore: result.fluencyScore,
    completenessScore: result.completenessScore,
    prosodyScore: result.prosodyScore ?? null,
    issueCounts,
    words: result.words.slice(0, wordsLimit),
    wordsTruncated: result.words.length > wordsLimit,
    delivery: trimDeliveryAnalysisForHistory(result.delivery),
    ...(deliveryError ? { deliveryError } : {}),
  } satisfies Record<string, unknown>
}

function pronResultFromHistoryItem(item: HistoryItem): PronResult | null {
  if (item.modality !== 'pronunciation') return null
  const metadata = getHistoryMetadata(item)
  const scores = getHistoryPronunciationScores(metadata)
  if (
    scores.pronScore == null ||
    scores.accuracyScore == null ||
    scores.fluencyScore == null ||
    scores.completenessScore == null
  ) {
    return null
  }

  return {
    requestId: getMetadataString(metadata, 'requestId'),
    pronScore: scores.pronScore,
    accuracyScore: scores.accuracyScore,
    fluencyScore: scores.fluencyScore,
    completenessScore: scores.completenessScore,
    prosodyScore: scores.prosodyScore ?? undefined,
    recognitionStatus: getMetadataString(metadata, 'recognitionStatus') ?? 'Unknown',
    displayText: getMetadataString(metadata, 'displayText') ?? item.content,
    lexical: getMetadataString(metadata, 'lexical'),
    confidence: getMetadataNumber(metadata, 'confidence') ?? undefined,
    snr: getMetadataNumber(metadata, 'snr') ?? undefined,
    words: getHistoryPronunciationWords(metadata),
    delivery: getHistoryDeliveryAnalysis(metadata),
    coach: getHistoryCoach(metadata) ?? undefined,
    coachError: getMetadataString(metadata, 'coachError') ?? undefined,
    historyId: item.id,
    attemptId: getMetadataString(metadata, 'attemptId') ?? undefined,
    assessmentReferenceText:item.content,
    assessmentLanguage:getMetadataString(metadata,'language')??undefined,
    audio: getNestedRecord(metadata, 'audio') as PronResult['audio'],
  }
}

const PRONUNCIATION_TRANSCRIPTION_MODELS = [
  'mai-transcribe-2',
  'gpt-4o-transcribe-diarize',
  'voxtral-mini-transcribe-2507',
  'voxtral-mini-latest',
] as const
type PronunciationTranscriptionModel = (typeof PRONUNCIATION_TRANSCRIPTION_MODELS)[number]

function PronunciationPanel({
  onHistorySaved,
  historyActionRequest,
}: {
  onHistorySaved: () => Promise<void> | void
  historyActionRequest?: HistoryActionRequest | null
}) {
  const [referenceText, setReferenceText] = useState('')
  const [referenceSource, setReferenceSource] = useState<'manual' | 'transcription'>('transcription')
  const [transcriptionModel, setTranscriptionModelRaw] = useState<PronunciationTranscriptionModel>(() => {
    if (typeof window === 'undefined') return 'mai-transcribe-2'
    const saved = localStorage.getItem('speech-lab-pron-model')
    if (saved === 'gpt-4o-transcribe') localStorage.setItem('speech-lab-pron-model', 'mai-transcribe-2')
    return PRONUNCIATION_TRANSCRIPTION_MODELS.find((m) => m === saved) ?? 'mai-transcribe-2'
  })
  const setTranscriptionModel = (m: PronunciationTranscriptionModel) => { setTranscriptionModelRaw(m); localStorage.setItem('speech-lab-pron-model', m) }
  const [language, setLanguage] = useState('en-US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [result, setResult] = useState<PronResult | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const assessmentSequence = useRef(0)
  const [selectedWord, setSelectedWord] = useState<PronWord | null>(null)
  const [assessmentSubject, setAssessmentSubject] = useState<AssessmentSubject>({ type: 'recording' })
  const [referenceVoice, setReferenceVoice] = useState<string>(DEFAULT_PRONUNCIATION_REFERENCE_VOICE)
  const [referenceVoiceAudioUrl, setReferenceVoiceAudioUrl] = useState<string | null>(null)
  const [generatedReferenceVoice, setGeneratedReferenceVoice] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Assessing pronunciation…')
  const [lastAssessmentAttempt, setLastAssessmentAttempt] = useState<PronunciationAssessmentAttempt | null>(null)
  const [retryAction, setRetryAction] = useState<PronunciationRetryAction | null>(null)
  const [calibration, setCalibration] = useState<CalibrationReport | null>(null)
  const [calibrationLoading, setCalibrationLoading] = useState(false)
  const [calibrationError, setCalibrationError] = useState<string | null>(null)
  const [buildingReferences, setBuildingReferences] = useState(false)
  const [referenceProgress, setReferenceProgress] = useState<string | null>(null)
  const calibrationSequence = useRef(0)
  const refreshCalibration = useCallback(async (attemptId?: string) => {
    const seq = ++calibrationSequence.current
    if (!attemptId) {setCalibration(null);setCalibrationLoading(false);setCalibrationError(null);return}
    setCalibrationLoading(true);setCalibrationError(null)
    try {
      const res = await fetch('/api/speech/pronunciation/calibration?id=' + encodeURIComponent(attemptId))
      const data = await res.json()
      if (!res.ok || !data.report) throw new Error(data.error || 'Calibration unavailable')
      if (seq === calibrationSequence.current) setCalibration(data.report)
      return data.report as CalibrationReport
    } catch (err) {
      if (seq === calibrationSequence.current) setCalibrationError(err instanceof Error ? err.message : 'Calibration unavailable')
    } finally { if (seq === calibrationSequence.current) setCalibrationLoading(false) }
  }, [])
  useEffect(() => {
    setCalibration(null)
    void refreshCalibration(result?.attemptId)
  }, [result?.attemptId, result?.delivery?.version, refreshCalibration])


  useEffect(() => {
    return () => {
      if (referenceVoiceAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(referenceVoiceAudioUrl)
    }
  }, [referenceVoiceAudioUrl])

  const handleAssess = async (
    audioBlob: Blob,
    overrideReferenceText?: string,
    subject: AssessmentSubject = { type: 'recording' },
    options: { recordingPromise?: Promise<SavedRecording | null>; recording?: SavedRecording | null; language?: string; referenceSource?: 'manual' | 'transcription' } = {}
  ) => {
    const resolvedLanguage = options.language ?? language
    const resolvedReferenceSource = options.referenceSource ?? (subject.type === 'reference-voice' ? 'manual' : referenceSource)
    const resolvedReferenceText = (overrideReferenceText ?? referenceText).trim()
    if (!resolvedReferenceText) {
      setError('Reference text is required')
      return
    }
    const sequence = ++assessmentSequence.current
    const isCurrent = () => sequence === assessmentSequence.current
    setLoading(true)
    setError(null)
    setErrorRequestId(null)
    setResult(null)
    setSelectedWord(null)
    setCoachLoading(true)
    setDeliveryLoading(true)
    setDeliveryError(null)
    setAssessmentSubject(subject)
    setLoadingMessage(subject.type === 'reference-voice' ? 'Assessing reference voice…' : 'Assessing pronunciation…')

    try {
      const wavBlob = await normalizePronunciationAudio(audioBlob)
      const attempt = { audioBlob: wavBlob, referenceText: resolvedReferenceText, subject, language: resolvedLanguage, referenceSource: resolvedReferenceSource }
      setLastAssessmentAttempt(attempt)
      setRetryAction({ type: 'assessment', attempt })
      const formData = new FormData()
      formData.append('audio', wavBlob, 'pronunciation.wav')
      formData.append('referenceText', resolvedReferenceText)
      formData.append('language', resolvedLanguage)
      formData.append('source', subject.type)
      formData.append('autoEnrich','true')
      formData.append('referenceSource', resolvedReferenceSource)
      if (resolvedReferenceSource === 'transcription') formData.append('referenceTranscriptionModel',transcriptionModel)
      if (subject.type === 'reference-voice') {
        formData.append('voice',subject.voice)
        if (subject.storageUrl) formData.append('referenceUrl',subject.storageUrl)
      }

      const res = await fetch('/api/speech/pronunciation', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw speechLabRequestError(data, 'Pronunciation assessment failed')
      }

      const data = (await res.json()) as AzurePronunciationResponse
      // Azure usually returns NBest[0].PronunciationAssessment, but some
      // payloads place assessment/words at top level.
      const nbestTop = data.NBest?.[0]
      const assessment =
        nbestTop?.PronunciationAssessment ??
        data.PronunciationAssessment ??
        (typeof nbestTop?.AccuracyScore === 'number' &&
        typeof nbestTop?.FluencyScore === 'number' &&
        typeof nbestTop?.CompletenessScore === 'number' &&
        typeof nbestTop?.PronScore === 'number'
          ? {
              AccuracyScore: nbestTop.AccuracyScore,
              FluencyScore: nbestTop.FluencyScore,
              CompletenessScore: nbestTop.CompletenessScore,
              ProsodyScore: nbestTop.ProsodyScore,
              PronScore: nbestTop.PronScore,
            }
          : undefined)
      const words = nbestTop?.Words || data.Words || []

      if (assessment) {
        const nextResult: PronResult = {
          requestId: data._requestId ?? null,
          audio: data._audio,
          attemptId: data._attemptId,
          assessmentReferenceText:resolvedReferenceText,
          assessmentLanguage:resolvedLanguage,
          historyId: data._historyId,
          accuracyScore: assessment.AccuracyScore,
          fluencyScore: assessment.FluencyScore,
          completenessScore: assessment.CompletenessScore,
          prosodyScore: assessment.ProsodyScore,
          pronScore: assessment.PronScore,
          recognitionStatus: data.RecognitionStatus || 'Unknown',
          displayText: nbestTop?.Display || data.DisplayText || resolvedReferenceText,
          lexical: nbestTop?.Lexical || null,
          confidence: nbestTop?.Confidence,
          snr: data.SNR,
          words: words.map(normalizeAzureWord),
        }
        if (isCurrent()) {
          setResult(nextResult)
          setRetryAction(null)
        }
        // The server persisted measured evidence and history before returning.
        // Keep the original microphone file linked when its upload succeeds.
        const historyPromise = (async () => {
          const recording = options.recording ?? await options.recordingPromise?.catch(() => null) ?? null
          try {
            if (data._historyId) {
              if (recording) await patchPronunciationHistory(data._historyId, {recording})
              await onHistorySaved()
              return {id:data._historyId,recording}
            }
            // Legacy/failure fallback: save measured results even if evidence archival failed.
            const saved = await saveSpeechHistory({ modality:'pronunciation',title:'Pronunciation · '+resolvedLanguage,content:resolvedReferenceText,metadata:buildPronunciationHistoryMetadata({result:nextResult,referenceText:resolvedReferenceText,language:resolvedLanguage,subject,recording,referenceSource:resolvedReferenceSource,referenceTranscriptionModel:resolvedReferenceSource==='transcription'?transcriptionModel:undefined}) })
            if (saved && isCurrent()) setResult(current=>current?{...current,historyId:saved.id}:current)
            await onHistorySaved()
            return {id:saved?.id,recording}
          } catch { return {id:data._historyId,recording} }
        })()
        void (async () => {
          let final: PronResult = nextResult
          let deliveryErrorForHistory: string | null = null
          try {
            if (!nextResult.attemptId) throw new Error('Assessment evidence storage unavailable; acoustic analysis cannot run.')
            const delivery = await fetchDeliveryAnalysis(nextResult.attemptId)
            final={...final,delivery}
            if (isCurrent()) setResult(current=>current?{...current,delivery}:current)
          } catch (err) {
            deliveryErrorForHistory=err instanceof Error?err.message:'Delivery analysis failed'
            if (isCurrent()) setDeliveryError(deliveryErrorForHistory)
          } finally { if (isCurrent()) setDeliveryLoading(false) }
          try {
            const coach=await fetchPronunciationCoach(final,resolvedReferenceText,resolvedLanguage,subject,resolvedReferenceSource)
            final={...final,coach}
            if (isCurrent()) setResult(current=>current?{...current,coach,coachError:undefined}:current)
          } catch (err) {
            const coachError=err instanceof Error?err.message:'AI coaching unavailable.'
            final={...final,coachError}
            if (isCurrent()) setResult(current=>current?{...current,coachError}:current)
          } finally { if (isCurrent()) setCoachLoading(false) }
          const history=await historyPromise
          try {
            // Canonical delivery/coach routes already update the stored attempt.
            if (history.id && !nextResult.attemptId) await patchPronunciationHistory(history.id,{coach:final.coach??null,coachError:final.coachError??null,delivery:trimDeliveryAnalysisForHistory(final.delivery)??null,deliveryError:deliveryErrorForHistory})
            await onHistorySaved()
          } catch { /* assessment remains usable */ }
        })()
      } else if (isCurrent()) {
        setDeliveryLoading(false)
        setCoachLoading(false)
        setErrorRequestId(data._requestId ?? null)
        const recognitionStatus = data.RecognitionStatus
        const recognizedText = (nbestTop?.Display || data.DisplayText)?.trim()
        if (recognitionStatus || recognizedText) {
          const diagnostic = [
            'No assessment data returned.',
            recognitionStatus ? `Status: ${recognitionStatus}.` : null,
            recognizedText ? `Recognized: "${recognizedText}".` : null,
          ]
            .filter(Boolean)
            .join(' ')
          setError(diagnostic)
        } else {
          setError('No assessment data returned. Make sure you speak clearly and match the reference text.')
        }
      }
    } catch (err) {
      if (isCurrent()) { setDeliveryLoading(false); setCoachLoading(false); setError(err instanceof Error ? err.message : 'Unknown error'); setErrorRequestId(getSpeechLabRequestId(err)) }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  const assessReferenceVoiceWith = async (inputReferenceText: string, selectedVoice: string, assessmentLanguage = language) => {
    const trimmedReferenceText = inputReferenceText.trim()
    if (!trimmedReferenceText) {
      setError('Reference text is required before generating a reference voice')
      return
    }

    const voice = isPronunciationReferenceVoice(selectedVoice) ? selectedVoice : DEFAULT_PRONUNCIATION_REFERENCE_VOICE
    setReferenceText(trimmedReferenceText)
    setReferenceVoice(voice)
    setLoading(true)
    setError(null)
    setErrorRequestId(null)
    setRetryAction({ type: 'reference-voice' })
    setLoadingMessage('Generating reference voice…')

    try {
      const res = await fetch('/api/speech/pronunciation/reference', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmedReferenceText, voice }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw speechLabRequestError(data, 'Reference voice generation failed')
      }

      const data = await res.json() as { audio?: string; mimeType?: string; storageUrl?: string }
      if (!data.audio || !data.mimeType) {
        throw new Error('Reference voice generation returned no audio')
      }

      const wavBlob = await normalizePronunciationAudio(ttsPayloadToBlob(data.audio, data.mimeType))
      setReferenceVoiceAudioUrl(URL.createObjectURL(wavBlob))
      setGeneratedReferenceVoice(voice)
      await handleAssess(wavBlob, trimmedReferenceText, { type: 'reference-voice', voice, provider: PRONUNCIATION_REFERENCE_PROVIDER, model: PRONUNCIATION_REFERENCE_MODEL, storageUrl: data.storageUrl }, { language: assessmentLanguage, referenceSource: 'manual' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setErrorRequestId(getSpeechLabRequestId(err))
    } finally {
      setLoading(false)
    }
  }

  const assessReferenceVoice = async () => {
    await assessReferenceVoiceWith(referenceText, referenceVoice)
  }

  const buildReferenceRange = async () => {
    if (!result?.attemptId || buildingReferences) return
    const attemptId=result.attemptId
    const text=(result.assessmentReferenceText ?? lastAssessmentAttempt?.referenceText ?? referenceText).trim()
    const targetLanguage=result.assessmentLanguage ?? lastAssessmentAttempt?.language ?? language
    const seq=assessmentSequence.current
    setBuildingReferences(true);setCalibrationError(null)
    try {
      const existing=await refreshCalibration(attemptId)
      const accepted=new Set(existing?.referenceVoiceCount && existing.referenceVoiceCount >= 2 ? [] : existing?.referenceSamples.filter(s=>s.accepted && s.id!==attemptId).map(s=>s.voice)??[])
      for (const voice of PRONUNCIATION_REFERENCE_VOICES) {
        if (accepted.has(voice.id)) continue
        for (let retry=0;retry<2;retry++) {
          if (seq!==assessmentSequence.current) return
          setReferenceProgress('Generating '+voice.name+(retry?' · retrying quality check':''))
          const gen=await fetch('/api/speech/pronunciation/reference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:voice.id})})
          const audio=await gen.json()
          if (!gen.ok || !audio.audio) throw new Error(audio.error || 'Unable to generate reference')
          const wav=await normalizePronunciationAudio(ttsPayloadToBlob(audio.audio,audio.mimeType))
          const form=new FormData()
          form.append('audio',wav,'reference.wav');form.append('referenceText',text);form.append('language',targetLanguage);form.append('source','reference-voice');form.append('referenceSource','manual');form.append('voice',voice.id)
          if (audio.storageUrl) form.append('referenceUrl',audio.storageUrl)
          const res=await fetch('/api/speech/pronunciation',{method:'POST',body:form})
          const assessed=await res.json()
          if (!res.ok || !assessed._attemptId) throw new Error(assessed.error || 'Unable to archive reference assessment')
          if (assessed._referenceQuality?.accepted) {
            setReferenceProgress('Analyzing '+voice.name+' acoustics')
            await fetchDeliveryAnalysis(assessed._attemptId).catch(()=>{})
            break
          }
        }
      }
      if (seq===assessmentSequence.current) {
        await refreshCalibration(attemptId)
        void retryCoaching(result)
      }
      await onHistorySaved()
    } catch (err) { if (seq===assessmentSequence.current) setCalibrationError(err instanceof Error?err.message:'Reference range unavailable') }
    finally {setBuildingReferences(false);setReferenceProgress(null)}
  }

  const transcribeReferenceText = async (audioBlob: Blob) => {
    const formData = new FormData()
    if (transcriptionModel === 'mai-transcribe-2') {
      formData.append('audio', await normalizePronunciationAudio(audioBlob), 'reference.wav')
    } else {
      formData.append('audio', audioBlob, 'reference.webm')
    }
    formData.append('model', transcriptionModel)

    const res = await fetch('/api/speech/stt', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw speechLabRequestError(data, 'Reference transcription failed')
    }

    const data = await res.json()
    const text = (data.text as string | undefined)?.trim()
    if (!text) {
      throw new Error('No transcription text returned for reference')
    }
    return text
  }

  const transcribeAndAssessRecording = async (
    audioBlob: Blob,
    recordingPromise?: Promise<SavedRecording | null>
  ) => {
    setLoading(true)
    setError(null)
    setErrorRequestId(null)
    setRetryAction({ type: 'transcription', audioBlob })
    try {
      const assessmentAudio = transcriptionModel === 'mai-transcribe-2' ? await normalizePronunciationAudio(audioBlob) : audioBlob
      const nextReferenceText = await transcribeReferenceText(assessmentAudio)
      setReferenceText(nextReferenceText)
      await handleAssess(assessmentAudio, nextReferenceText, { type: 'recording' }, { recordingPromise, referenceSource: 'transcription' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setErrorRequestId(getSpeechLabRequestId(err))
      setLoading(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const selectedMimeType = preferredMimeTypes.find((value) => MediaRecorder.isTypeSupported(value))
      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || selectedMimeType || 'audio/webm' })
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const recordingPromise = uploadSpeechRecording(blob, `pronunciation.${extension}`)
        if (referenceSource === 'transcription') {
          void transcribeAndAssessRecording(blob, recordingPromise)
          return
        }
        void handleAssess(blob, undefined, { type: 'recording' }, { recordingPromise })
      }

      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
    } catch {
      setError('Microphone access denied')
      setErrorRequestId(null)
      setRetryAction({ type: 'recording' })
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      setRecording(false)
      setMediaRecorder(null)
    }
  }

  const retryPronunciationAction = () => {
    if (!retryAction) return
    if (retryAction.type === 'assessment') {
      void handleAssess(retryAction.attempt.audioBlob, retryAction.attempt.referenceText, retryAction.attempt.subject, { language: retryAction.attempt.language, referenceSource: retryAction.attempt.referenceSource })
    } else if (retryAction.type === 'reference-voice') {
      void assessReferenceVoice()
    } else if (retryAction.type === 'transcription') {
      void transcribeAndAssessRecording(retryAction.audioBlob)
    } else {
      void startRecording()
    }
  }

  const retryCoaching = async (evidence = result) => {
    if (!evidence) return
    const sequence = assessmentSequence.current
    const attempt = lastAssessmentAttempt
    setCoachLoading(true)
    setResult(current => current ? { ...current, coachError: undefined } : current)
    try {
      const coach = await fetchPronunciationCoach(evidence, attempt?.referenceText ?? referenceText, attempt?.language ?? language, attempt?.subject ?? assessmentSubject, attempt?.referenceSource ?? referenceSource)
      if (sequence === assessmentSequence.current) setResult(current => current ? { ...current, coach, coachError: undefined } : current)
      if (evidence.historyId && !evidence.attemptId) {
        await patchPronunciationHistory(evidence.historyId, { coach, coachError: null })
      }
      await onHistorySaved()
    } catch (error) {
      const coachError = error instanceof Error ? error.message : 'AI coaching unavailable.'
      if (sequence === assessmentSequence.current) setResult(current => current ? { ...current, coachError } : current)
      if (evidence.historyId && !evidence.attemptId) await patchPronunciationHistory(evidence.historyId, { coachError }).catch(() => {})
    } finally {
      if (sequence === assessmentSequence.current) setCoachLoading(false)
    }
  }

  const retryDeliveryAnalysis = async () => {
    if (!result?.attemptId) return
    const sequence = assessmentSequence.current
    setDeliveryLoading(true)
    setDeliveryError(null)
    try {
      const delivery = await fetchDeliveryAnalysis(result.attemptId)
      if (sequence === assessmentSequence.current) setResult(current => current ? { ...current, delivery } : current)
      await onHistorySaved()
      if (sequence === assessmentSequence.current) void retryCoaching({ ...result, delivery })
    } catch (deliveryFailure) {
      if (sequence === assessmentSequence.current) setDeliveryError(deliveryFailure instanceof Error ? deliveryFailure.message : 'Delivery analysis failed')
    } finally {
      if (sequence === assessmentSequence.current) setDeliveryLoading(false)
    }
  }

  useEffect(() => {
    if (!historyActionRequest) return
    const item = historyActionRequest.item
    const metadata = getHistoryMetadata(item)
    const restoredLanguage = getMetadataString(metadata, 'language') ?? language
    const source = getMetadataString(metadata, 'source')
    const voice = getMetadataString(metadata, 'voice') ?? referenceVoice
    const savedResult = pronResultFromHistoryItem(item)
    const deliveryErrorFromHistory = getMetadataString(metadata, 'deliveryError')
    const restoredReferenceSource = getMetadataString(metadata, 'referenceSource') === 'transcription' ? 'transcription' : 'manual'
    const historicTranscriptionModel = getMetadataString(metadata, 'referenceTranscriptionModel')
    const restoredTranscriptionModel = PRONUNCIATION_TRANSCRIPTION_MODELS.find(model => model === historicTranscriptionModel)
    if (restoredTranscriptionModel) setTranscriptionModel(restoredTranscriptionModel)
    assessmentSequence.current += 1
    setLastAssessmentAttempt(null)
    setCoachLoading(false)
    setLoading(false)
    setReferenceText(item.content)
    setLanguage(restoredLanguage)
    setReferenceSource(restoredReferenceSource)
    setReferenceVoice(isPronunciationReferenceVoice(voice) ? voice : DEFAULT_PRONUNCIATION_REFERENCE_VOICE)
    setReferenceVoiceAudioUrl(source === 'reference-voice' ? getHistoryPlayableUrl(metadata) : null)
    setGeneratedReferenceVoice(source === 'reference-voice' ? voice : null)
    setSelectedWord(null)
    setError(null)
    setErrorRequestId(null)
    setDeliveryError(deliveryErrorFromHistory)
    setDeliveryLoading(false)
    setAssessmentSubject(source === 'reference-voice'
      ? { type: 'reference-voice', voice, provider: getMetadataString(metadata, 'referenceProvider') ?? undefined, model: getMetadataString(metadata, 'referenceModel') ?? undefined, storageUrl: getMetadataString(metadata, 'storageUrl') ?? undefined }
      : { type: 'recording' }
    )
    setResult(savedResult)

    if (historyActionRequest.action === 'rerun') {
      if (source === 'reference-voice') {
        void assessReferenceVoiceWith(item.content, voice, restoredLanguage)
        return
      }

      const recording = getHistoryRecording(metadata)
      const rawSource = getMetadataString(metadata,'assessmentSourceUrl')
      const savedSource = rawSource && /^\/api\/speech\/pronunciation\/audio\?id=[a-f0-9-]{36}&variant=source$/i.test(rawSource) ? rawSource : null
      if (!recording && !savedSource) {
        setError('No saved audio is available for this history item. Restore the diagnostic view or record again.')
        return
      }

      void (async () => {
        try {
          const audioRes = await fetch(savedSource || `/api/speech/recordings/${encodeURIComponent(recording!.id)}`)
          if (!audioRes.ok) throw new Error('Saved recording is no longer available')
          const blob = await audioRes.blob()
          await handleAssess(blob, item.content, { type: 'recording' }, { recording, language: restoredLanguage, referenceSource: restoredReferenceSource })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'History rerun failed')
          setErrorRequestId(getSpeechLabRequestId(err))
        }
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyActionRequest?.requestId])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">spellcheck</span>
        <div>
          <h3 className="font-medium text-foreground">Pronunciation Assessment</h3>
          <p className="text-xs text-foreground/40">Azure acoustic scores · GPT-6.2 Sol medium · same-phrase Eleven v4 reference ranges</p>
        </div>
      </div>

      {/* Reference text */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Reference Source</label>
        <select
          value={referenceSource}
          onChange={(e) => setReferenceSource(e.target.value as 'manual' | 'transcription')}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
        >
          <option value="manual">Manual text input</option>
          <option value="transcription">Auto-generate from transcription</option>
        </select>
      </div>

      {referenceSource === 'transcription' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/70">Transcription Service</label>
          <select
            value={transcriptionModel}
            onChange={(e) => setTranscriptionModel(e.target.value as PronunciationTranscriptionModel)}
            className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
          >
            <option value="mai-transcribe-2">MAI-Transcribe-2 (default)</option>
            <option value="gpt-4o-transcribe-diarize">GPT‑4o Transcribe Diarize</option>
            <option value="voxtral-mini-transcribe-2507">Mistral Voxtral Transcribe (2507)</option>
            <option value="voxtral-mini-latest">Mistral Voxtral Mini Latest</option>
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Reference Text</label>
        <input
          type="text"
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          placeholder={referenceSource === 'transcription' ? 'Will autofill from recording…' : 'Type the word or phrase to practice…'}
          readOnly={referenceSource === 'transcription'}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
        />
        {referenceSource === 'transcription' && (
          <p className="text-xs text-foreground/40">
            Auto-generated text is useful for exploratory feedback. Use manual text input when practicing omissions and completeness against a fixed script.
          </p>
        )}
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="es-ES">Spanish</option>
          <option value="fr-FR">French</option>
          <option value="de-DE">German</option>
          <option value="zh-CN">Chinese (Mandarin)</option>
          <option value="ja-JP">Japanese</option>
          <option value="ko-KR">Korean</option>
        </select>
      </div>

      {/* Reference voice baseline */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Reference Voice Baseline</label>
        <select
          value={referenceVoice}
          onChange={(e) => setReferenceVoice(e.target.value)}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
        >
          <optgroup label="Eleven v4 · Vercel AI Gateway">
            {PRONUNCIATION_REFERENCE_VOICES.map(voice => <option key={voice.id} value={voice.id}>{voice.name} — {voice.description}</option>)}
          </optgroup>
        </select>
        <p className="text-xs text-foreground/40">
          Generate this voice and score it against the same text to establish a provider baseline.
        </p>
      </div>

      {/* Assessment actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={buildingReferences || loading || (referenceSource === 'manual' && !referenceText.trim())}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-medium text-sm transition-all cursor-pointer ${
            recording
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-foreground text-background hover:opacity-90'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-lg">
            {recording ? 'stop' : 'mic'}
          </span>
          {recording ? 'Stop & Assess' : 'Record Pronunciation'}
        </button>

        <button
          onClick={assessReferenceVoice}
          disabled={buildingReferences || loading || recording || !referenceText.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-foreground/15 bg-foreground/[0.03] text-foreground/70 font-medium text-sm hover:bg-foreground/[0.08] hover:text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg">record_voice_over</span>
          Assess Reference Voice
        </button>
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-sm text-red-700">Recording… Speak the reference text now.</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-foreground/40 text-sm">
          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
          {loadingMessage}
        </div>
      )}

      {/* Generated reference voice playback */}
      {referenceVoiceAudioUrl && generatedReferenceVoice && (
        <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 px-3 py-2.5 space-y-2">
          <div>
            <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Generated Reference Voice</p>
            <p className="text-xs text-foreground/40 mt-0.5">{getTtsVoiceLabel(generatedReferenceVoice)} · Use this as a listening baseline, then record your own attempt.</p>
          </div>
          <audio controls src={referenceVoiceAudioUrl} className="w-full" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
            <div>
              <p>{error}</p>
              {errorRequestId && <p className="text-xs opacity-70 mt-0.5">Tracking ID: {errorRequestId}</p>}
            </div>
          </div>
          {retryAction && (
            <button
              type="button"
              onClick={retryPronunciationAction}
              disabled={loading || recording}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-xl bg-foreground/[0.03] border border-foreground/10 p-3 space-y-2">
            <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Recognition Snapshot</p>
            <p className="text-sm text-foreground/70">Recognized: <span className="text-foreground font-medium">{result.displayText || '—'}</span></p>
            <p className="text-xs text-foreground/45">
              Source: {assessmentSubject.type === 'reference-voice'
                ? `Generated reference voice · ${getTtsVoiceLabel(assessmentSubject.voice)}`
                : 'Microphone recording'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-foreground/50">
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">Status: {result.recognitionStatus}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">Confidence: {result.confidence != null ? result.confidence.toFixed(3) : 'n/a'}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">SNR: {result.snr != null ? result.snr.toFixed(1) : 'n/a'}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5 truncate" title={result.lexical || undefined}>Lexical: {result.lexical || 'n/a'}</div>
            </div>
          </div>

          {result.audio?.storageId && assessmentSubject.type === 'recording' && <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 space-y-1"><p className="text-xs font-medium text-foreground/70">Assessed recording · normalized audio</p><audio controls preload="none" aria-label="Listen to the assessed recording" className="w-full" src={'/api/speech/pronunciation/audio?id='+encodeURIComponent(result.audio.storageId)} /></div>}
          {result.attemptId && <PronunciationCalibration
            report={calibration?.attemptId === result.attemptId ? calibration : null} loading={calibrationLoading || deliveryLoading || coachLoading} error={calibrationError}
            building={buildingReferences} progress={referenceProgress}
            onBuild={() => void buildReferenceRange()} onRefresh={() => void refreshCalibration(result.attemptId)}
          />}

          {/* Overall score — semi-circle gauge */}
          <div className="flex justify-center py-2">
            <SemiCircleGauge label="Overall" score={result.pronScore} size={180} />
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ScoreCard
              label="Accuracy"
              score={result.accuracyScore}
              tooltip="How closely your phonemes matched expected pronunciation."
            />
            <ScoreCard
              label="Fluency"
              score={result.fluencyScore}
              tooltip="How naturally your pacing and flow matched expected speech rhythm."
            />
            <ScoreCard
              label="Completeness"
              score={result.completenessScore}
              tooltip="How much of the reference text was spoken and recognized correctly."
            />
            {result.prosodyScore != null && (
              <ScoreCard
                label="Prosody"
                score={result.prosodyScore}
                tooltip="How well your intonation, stress, and speaking naturalness were captured."
              />
            )}
          </div>

          {language !== 'en-US' && (
            <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 px-3 py-2.5 text-xs text-foreground/50">
              Detailed IPA, syllable, spoken-phoneme, and prosody feedback is available for English (US). Other locales keep the scores Azure returns.
            </div>
          )}

          {language === 'en-US' && result.prosodyScore != null && (
            <ProsodyFeedback words={result.words} />
          )}

          <HistoryCoachSection metadata={{ coach: result.coach, coachError: result.coachError }} live loading={coachLoading} onRetry={() => void retryCoaching()} />
          <PhoneticPronunciation words={result.words} onSelectWord={setSelectedWord} />

          <DeliveryAnalysisPanel
            analysis={result.delivery}
            loading={deliveryLoading}
            error={deliveryError}
            onRetry={result.attemptId ? retryDeliveryAnalysis : undefined}
          />

          {/* Word-level breakdown */}
          {result.words.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Word Breakdown</p>
              {result.words.some(isOmittedPronunciationWord) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  Words labeled <span className="font-medium">omitted</span> were not aligned to recognized audio. Azure does not provide a valid pronunciation score for omitted words. For recordings over 30 seconds, use a shorter script until continuous assessment is added.
                  {result.requestId && (
                    <span className="block mt-1 text-[11px] text-amber-700/70">
                      Tracking ID: <span className="font-mono">{result.requestId}</span>
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {result.words.map((w, i) => (
                  <PronunciationWordChip key={`${w.word}-${i}`} word={w} onClick={() => setSelectedWord(w)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedWord && <PronunciationWordModal word={selectedWord} onClose={() => setSelectedWord(null)} />}

      {/* Service Limits */}
      <details className="group">
        <summary className="text-xs text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors select-none">
          API Limits &amp; Info
        </summary>
        <div className="mt-2 rounded-lg bg-foreground/[0.02] border border-foreground/5 p-2.5 text-xs text-foreground/40">
          <p className="font-medium text-foreground/50 mb-1">Azure Speech Pronunciation</p>
          <p>Current short REST assessment: up to 30 seconds · WAV format preferred</p>
          <p>Rate limit: 20 concurrent requests (standard S0 tier)</p>
          <p>Assessment: Phoneme-level scoring with prosody analysis</p>
        </div>
      </details>
    </div>
  )
}

function formatAzureTime(value?: number): string | null {
  return value == null ? null : `${(value / 10_000_000).toFixed(2)}s`
}

function formatConfidence(value?: number): string {
  if (value == null) return 'reported by Azure'
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}% confidence`
}

function ProsodyFeedback({ words }: { words: PronWord[] }) {
  const breakIssues = words.flatMap(getProsodyBreakIssues)
  const monotoneDetected = words.some(hasMonotoneFeedback)

  if (breakIssues.length === 0 && !monotoneDetected) return null

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 p-3 space-y-2.5">
      <div>
        <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Azure prosody observations</p>
        <p className="text-xs text-foreground/40 mt-0.5">Measured flags; the AI coaching interprets their significance.</p>
      </div>

      {breakIssues.map((issue, index) => (
        <div
          key={`${issue.type}-${issue.word}-${index}`}
          className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700"
        >
          <span className="material-symbols-outlined text-lg">pause_circle</span>
          <p>
            {issue.type === 'unexpected-break'
              ? <>Unexpected break before <span className="font-medium">{issue.word}</span>.</>
              : <>Missing break before <span className="font-medium">{issue.word}</span>.</>}
            <span className="ml-1 text-xs opacity-70">({formatConfidence(issue.confidence)})</span>
          </p>
        </div>
      ))}

      {monotoneDetected && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
          <span className="material-symbols-outlined text-lg">graphic_eq</span>
          <p>Azure flagged a potentially monotone segment.</p>
        </div>
      )}

      <p className="text-[11px] text-foreground/35">
        Pause observations appear only when Azure explicitly labels a missing or unexpected break.
      </p>
    </div>
  )
}

function DeliveryAnalysisPanel({
  analysis,
  loading,
  error,
  onRetry,
}: {
  analysis?: DeliveryAnalysis
  loading: boolean
  error: string | null
  onRetry?: () => void
}) {
  if (loading) {
    return (
      <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 px-3 py-3 flex items-center gap-2 text-sm text-foreground/50">
        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
        Measuring pitch, pacing, and pauses…
      </div>
    )
  }

  if (!analysis) {
    return error ? (
      <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 px-3 py-2.5 text-xs text-foreground/50 flex items-center justify-between gap-3">
        <span>Delivery measurements are temporarily unavailable. Azure pronunciation scores are still shown.</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-foreground/15 px-3 py-1 font-medium text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Try Again
          </button>
        )}
      </div>
    ) : null
  }

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 p-3 space-y-3">
      <div>
        <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Acoustic delivery measurements</p>
        <p className="text-xs text-foreground/40 mt-0.5">Praat acoustic measurements combined with Azure word timing.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <DeliveryMetric label="Speaking Rate" value={analysis.speakingRateWpm != null ? `${analysis.speakingRateWpm} WPM` : 'n/a'} />
        <DeliveryMetric label="Pitch Range" value={analysis.pitch.rangeSemitones != null ? `${analysis.pitch.rangeSemitones.toFixed(1)} st` : 'n/a'} />
        <DeliveryMetric label="Internal Pauses" value={`${analysis.summary.pauseCount}`} />
        <DeliveryMetric label="Volume Range" value={analysis.intensity.rangeDb != null ? `${analysis.intensity.rangeDb.toFixed(1)} dB` : 'n/a'} />
      </div>

      <div className="space-y-1.5">
        {analysis.insights.length > 0 && <p className="text-[11px] text-foreground/50">Legacy rule-based observations</p>}
        {analysis.insights.map((insight, index) => (
          <div
            key={`${insight.category}-${index}`}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              insight.severity === 'strength'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : insight.severity === 'improve'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-foreground/[0.03] border-foreground/10 text-foreground/65'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {insight.category === 'fluency' ? 'speed' : insight.category === 'prosody' ? 'graphic_eq' : 'check_circle'}
            </span>
            <p>{insight.message}</p>
          </div>
        ))}
      </div>

      {analysis.phrases.length > 1 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-foreground/40">Phrase Pace Timeline</p>
          <div className="flex gap-1 h-2">
            {analysis.phrases.map((phrase, index) => (
              <div
                key={`${phrase.startSec}-${index}`}
                className={`rounded-full ${phrase.wpm > 180 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ flexGrow: Math.max(phrase.endSec - phrase.startSec, 0.5) }}
                title={`${phrase.text} · ${phrase.wpm} WPM`}
              />
            ))}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {analysis.phrases.map((phrase, index) => (
              <p key={`${phrase.text}-${index}`} className="text-xs text-foreground/50 truncate" title={phrase.text}>
                <span className="text-foreground/35">{index + 1}.</span> {phrase.text} <span className="text-foreground/35">· {phrase.wpm} WPM</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <details className="group">
        <summary className="text-xs text-foreground/40 cursor-pointer hover:text-foreground/60 transition-colors select-none">
          Acoustic charts
        </summary>
        <div className="mt-3 space-y-3">
          <DeliveryChart
            label="Pitch contour"
            unit="semitones from your median"
            points={analysis.pitch.series.map((point) => ({ timeSec: point.timeSec, value: point.semitones }))}
            pauses={analysis.pauses}
            durationSec={analysis.summary.durationSec}
          />
          <DeliveryChart
            label="Intensity contour"
            unit="dB"
            points={analysis.intensity.series.map((point) => ({ timeSec: point.timeSec, value: point.db }))}
            pauses={analysis.pauses}
            durationSec={analysis.summary.durationSec}
          />
        </div>
      </details>
    </div>
  )
}

function DeliveryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-foreground/[0.025] border border-foreground/8 px-2.5 py-2">
      <p className="text-[11px] text-foreground/40">{label}</p>
      <p className="text-sm font-medium text-foreground/75 mt-0.5">{value}</p>
    </div>
  )
}

function DeliveryChart({
  label,
  unit,
  points,
  pauses,
  durationSec,
}: {
  label: string
  unit: string
  points: Array<{ timeSec: number; value?: number | null }>
  pauses: DeliveryPause[]
  durationSec: number
}) {
  const width = 720
  const height = 140
  const padding = 14
  const finitePoints = points.filter((point): point is { timeSec: number; value: number } => point.value != null && Number.isFinite(point.value))
  const values = finitePoints.map((point) => point.value)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 1
  const range = Math.max(max - min, 1)
  const chartDuration = Math.max(durationSec, 0.1)
  const coordinates = finitePoints.map((point) => {
    const x = padding + point.timeSec / chartDuration * (width - padding * 2)
    const y = height - padding - (point.value - min) / range * (height - padding * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div className="rounded-lg bg-background/40 border border-foreground/8 px-2.5 py-2">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs text-foreground/60">{label}</p>
        <p className="text-[11px] text-foreground/35">{unit}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" role="img" aria-label={label}>
        <line x1={padding} x2={width - padding} y1={height / 2} y2={height / 2} className="stroke-foreground/10" strokeWidth="1" />
        {pauses.map((pause, index) => {
          const x = padding + pause.startSec / chartDuration * (width - padding * 2)
          const pauseWidth = Math.max(2, pause.durationSec / chartDuration * (width - padding * 2))
          return <rect key={`${pause.startSec}-${index}`} x={x} y={padding} width={pauseWidth} height={height - padding * 2} rx="3" className="fill-amber-400/20" />
        })}
        {coordinates && <polyline points={coordinates} fill="none" className="stroke-emerald-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </div>
  )
}

function PronunciationWordChip({ word, onClick }: { word: PronWord; onClick: () => void }) {
  const breakIssues = getProsodyBreakIssues(word)
  const hasPronunciationError = word.errorType !== 'None' && !['UnexpectedBreak', 'MissingBreak', 'Monotone'].includes(word.errorType)
  const style = isOmittedPronunciationWord(word)
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : hasPronunciationError
    ? 'bg-red-50 border-red-200 text-red-700'
    : breakIssues.length > 0
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : word.accuracyScore >= SCORE_EXCELLENT
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : word.accuracyScore >= SCORE_GOOD
          ? 'bg-amber-50 border-amber-200 text-amber-700'
          : 'bg-red-50 border-red-200 text-red-700'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative px-3 py-1.5 rounded-xl text-sm font-medium border transition-all hover:-translate-y-0.5 cursor-pointer ${style}`}
    >
      {word.word}
      <span className="ml-1.5 text-xs opacity-60">
        {isOmittedPronunciationWord(word) ? 'omitted' : Math.round(word.accuracyScore)}
      </span>
      <span className="pointer-events-none absolute z-20 hidden group-hover:block group-focus-visible:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-64 rounded-lg bg-glass backdrop-blur-md border border-glass-border px-2.5 py-2 text-left text-[11px] text-foreground/70 shadow-lg">
        {isOmittedPronunciationWord(word)
          ? 'Not aligned to recognized audio'
          : word.syllables.length > 0
          ? <>Syllables: {word.syllables.map((syllable) => `${syllable.syllable} ${Math.round(syllable.accuracyScore)}`).join(' · ')}</>
          : 'Click for phoneme details'}
      </span>
    </button>
  )
}

function PronunciationWordModal({ word, onClose }: { word: PronWord; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <button type="button" aria-label="Close word details" className="absolute inset-0 bg-background/60 backdrop-blur-xl cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`${word.word} pronunciation details`} className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-glass backdrop-blur-xl border border-glass-border shadow-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-foreground/40 uppercase tracking-wider">Word Details</p>
            <h3 className="text-xl font-medium text-foreground mt-0.5">
              {word.word}{' '}
              <span className="text-sm text-foreground/40">
                {isOmittedPronunciationWord(word) ? 'omitted' : Math.round(word.accuracyScore)}
              </span>
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-foreground/5 hover:bg-foreground/10 p-2 text-foreground/50 transition-colors cursor-pointer" aria-label="Close">
            <span className="material-symbols-outlined text-lg block">close</span>
          </button>
        </div>
        <div className="mt-4">
          <PronunciationWordDetailBody word={word} />
        </div>
      </div>
    </div>
  )
}

function PhoneticPronunciation({ words, onSelectWord }: { words: PronWord[]; onSelectWord: (word: PronWord) => void }) {
  const available = words.filter(word => word.phonemes.some(phone => Boolean(phone.phoneme)) && !isOmittedPronunciationWord(word))
  if (!available.length) return null
  return <section className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 space-y-3" aria-label="Phonetic pronunciation">
    <div><p className="text-xs font-medium uppercase tracking-wider text-foreground/50">Phonetic pronunciation</p><p className="text-xs text-foreground/50 mt-1">Expected IPA versus Azure’s most likely sound candidates. These are alignment-based estimates, not a definitive phonetic transcription.</p></div>
    <div className="grid gap-1.5 sm:grid-cols-2">
      {available.map((word, index) => {
        const candidate = word.phonemes.map(phone => phone.nBestPhonemes[0]?.phoneme ?? '·')
        const hasCandidates = candidate.some(phone => phone !== '·')
        const differs = word.phonemes.some((phone, i) => candidate[i] !== '·' && candidate[i] !== phone.phoneme)
        return <button type="button" key={`${word.word}-${index}`} onClick={() => onSelectWord(word)} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-2 text-left hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
          <span className="flex justify-between gap-2 text-sm text-foreground"><span>{word.word}</span><span className="tabular-nums text-xs text-foreground/60">{Math.round(word.accuracyScore)}</span></span>
          <span className="block text-xs text-foreground/55">Target <span className="font-mono text-foreground/80">/{word.phonemes.map(phone => phone.phoneme || '·').join(' ')}/</span></span>
          <span className="block text-xs text-foreground/55">Candidate <span className={`font-mono ${differs ? 'text-amber-600' : 'text-foreground/80'}`}>{hasCandidates ? `[${candidate.join(' ')}]` : 'Unavailable'}</span></span>
        </button>
      })}
    </div>
  </section>
}

function PronunciationWordDetailBody({ word }: { word: PronWord }) {
  const start = formatAzureTime(word.offset)
  const duration = formatAzureTime(word.duration)
  const breakIssues = getProsodyBreakIssues(word)

  return (
    <div className="space-y-3 text-foreground">
      {(word.errorType !== 'None' || breakIssues.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {word.errorType !== 'None' && (
            <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] text-foreground/60">{word.errorType}</span>
          )}
          {breakIssues.map((issue) => (
            <span key={issue.type} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] text-foreground/60">
              {issue.type === 'unexpected-break' ? 'Unexpected pause' : 'Missing pause'}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-3 space-y-3">
        {(start || duration) && (
          <p className="text-[11px] text-foreground/40">
            {start ? `Starts at ${start}` : null}
            {start && duration ? ' · ' : null}
            {duration ? `Duration ${duration}` : null}
          </p>
        )}

        {word.syllables.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-foreground/40">Syllables</p>
            <div className="flex flex-wrap gap-1.5">
              {word.syllables.map((syllable, index) => (
                <span key={`${syllable.syllable}-${index}`} className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-xs text-foreground/70">
                  {syllable.syllable} <span className="text-foreground/40">{Math.round(syllable.accuracyScore)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {word.phonemes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-foreground/40">Phonemes</p>
            <div className="space-y-1.5">
              {word.phonemes.map((phoneme, index) => {
                const likelySpoken = phoneme.nBestPhonemes[0]
                return (
                  <div key={`${phoneme.phoneme}-${index}`} className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-foreground/70">Expected <span className="font-medium text-foreground">{phoneme.phoneme}</span></span>
                      <span className="text-foreground/50">Score {Math.round(phoneme.accuracyScore)}</span>
                      {likelySpoken && (
                        <span className={likelySpoken.phoneme === phoneme.phoneme ? 'text-emerald-700' : 'text-red-700'}>
                          Top candidate <span className="font-medium">{likelySpoken.phoneme}</span>
                        </span>
                      )}
                    </div>
                    {phoneme.nBestPhonemes.length > 0 && (
                      <p className="mt-1 text-[11px] text-foreground/40">
                        Candidates: {phoneme.nBestPhonemes.map((candidate) => `${candidate.phoneme} ${Math.round(candidate.score)}`).join(' · ')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {word.syllables.length === 0 && word.phonemes.length === 0 && (
          <p className="text-xs text-foreground/40">Azure did not return a syllable or phoneme breakdown for this word.</p>
        )}
      </div>
    </div>
  )
}

/* ─── Semi-Circle Score Gauge (Pronunciation) ─── */
const SCORE_GOOD = 50
const SCORE_EXCELLENT = 80

function SemiCircleGauge({ label, score, size = 160 }: { label: string; score: number; size?: number }) {
  const radius = (size - 20) / 2
  const circumference = Math.PI * radius
  const progress = Math.min(Math.max(score, 0), 100) / 100

  const getColor = (s: number) =>
    s >= SCORE_EXCELLENT ? '#10b981' : s >= SCORE_GOOD ? '#f59e0b' : '#ef4444'

  const strokeColor = getColor(score)

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size / 2 + 16}
        viewBox={`0 0 ${size} ${size / 2 + 16}`}
        className="overflow-visible"
      >
        {/* Background arc */}
        <path
          d={`M 10 ${size / 2 + 6} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 6}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          className="text-foreground/[0.06]"
        />
        {/* Colored progress arc */}
        <path
          d={`M 10 ${size / 2 + 6} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 6}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${circumference * (1 - progress)}`}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.4s ease' }}
        />
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: `${size / 5}px`, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(score)}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          className="fill-foreground/40"
          style={{ fontSize: '11px' }}
        >
          {label}
        </text>
      </svg>
    </div>
  )
}

function ScoreCard({ label, score, tooltip }: { label: string; score: number; tooltip?: string }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const color =
    score >= SCORE_EXCELLENT ? 'text-emerald-600' : score >= SCORE_GOOD ? 'text-amber-600' : 'text-red-600'
  const bgColor =
    score >= SCORE_EXCELLENT ? 'bg-emerald-50 border-emerald-200' : score >= SCORE_GOOD ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  return (
    <div className={`rounded-xl px-4 py-3 border ${bgColor} text-center`}>
      <div className="inline-flex items-center gap-1 mb-1 relative">
        <p className="text-xs text-foreground/40">{label}</p>
        {tooltip && (
          <button
            type="button"
            title={tooltip}
            className="material-symbols-outlined text-[14px] text-foreground/35 cursor-help bg-transparent border-0 p-0 leading-none"
            aria-label={`${label} info`}
            onClick={() => setShowTooltip((prev) => !prev)}
          >
            help
          </button>
        )}
        {tooltip && showTooltip && (
          <div className="absolute z-10 top-full mt-1 left-1/2 -translate-x-1/2 w-52 rounded-lg bg-glass backdrop-blur-md border border-glass-border px-2 py-1.5 text-[11px] text-foreground/70 text-left shadow-lg">
            {tooltip}
          </div>
        )}
      </div>
      <p className={`text-2xl font-medium tabular-nums ${color}`}>{Math.round(score)}</p>
    </div>
  )
}

/* ─── Types ─── */
type AssessmentSubject =
  | { type: 'recording' }
  | { type: 'reference-voice'; voice: string; storageUrl?: string; provider?: string; model?: string }

interface PronunciationAssessmentAttempt {
  audioBlob: Blob
  referenceText: string
  subject: AssessmentSubject
  language: string
  referenceSource: 'manual' | 'transcription'
}

type PronunciationRetryAction =
  | { type: 'assessment'; attempt: PronunciationAssessmentAttempt }
  | { type: 'reference-voice' }
  | { type: 'transcription'; audioBlob: Blob }
  | { type: 'recording' }

interface PronResult {
  requestId?: string | null
  pronScore: number
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore?: number
  recognitionStatus: string
  displayText: string
  lexical?: string | null
  confidence?: number
  snr?: number
  words: PronWord[]
  delivery?: DeliveryAnalysis
  coach?: HistoryCoach | PronunciationCoach
  coachError?: string
  historyId?: string
  attemptId?: string
  assessmentReferenceText?: string
  assessmentLanguage?: string
  audio?: { sha256: string; sampleRate?: number; normalized: boolean; storageId?:string; normalizationVersion?:string; durationSeconds?:number }
}

interface DeliveryPoint {
  timeSec: number
  semitones?: number | null
  db?: number | null
}

interface DeliveryPause {
  startSec: number
  endSec: number
  durationSec: number
}

interface RawDeliveryAnalysis {
  version: number
  summary: {
    durationSec: number
    voicedDurationSec: number
    pauseCount: number
    totalPauseSec: number
    longPauseCount: number
  }
  pitch: {
    medianHz: number | null
    rangeSemitones: number | null
    stddevSemitones: number | null
    endingDeltaSemitones: number | null
    series: DeliveryPoint[]
  }
  intensity: {
    rangeDb: number | null
    stddevDb: number | null
    series: DeliveryPoint[]
  }
  speechSegments: Array<{ startSec: number; endSec: number; durationSec: number }>
  pauses: DeliveryPause[]
  acousticInsights: Array<{ code: string; severity: 'improve' | 'consider'; message: string }>
}

interface DeliveryAnalysis extends RawDeliveryAnalysis {
  speakingRateWpm: number | null
  phrases: DeliveryPhrase[]
  insights: DeliveryInsight[]
}

interface DeliveryPhrase {
  text: string
  startSec: number
  endSec: number
  wordCount: number
  wpm: number
}

interface DeliveryInsight {
  category: 'fluency' | 'prosody' | 'overall'
  severity: 'improve' | 'consider' | 'strength'
  message: string
}

interface PronWord {
  word: string
  accuracyScore: number
  errorType: string
  offset?: number
  duration?: number
  syllables: PronSyllable[]
  phonemes: PronPhoneme[]
  prosody?: PronWordProsody
}

interface PronSyllable {
  syllable: string
  grapheme?: string
  accuracyScore: number
  offset?: number
  duration?: number
}

interface PronPhoneme {
  phoneme: string
  accuracyScore: number
  offset?: number
  duration?: number
  nBestPhonemes: PronPhonemeCandidate[]
}

interface PronPhonemeCandidate {
  phoneme: string
  score: number
}

interface PronWordProsody {
  breakErrorTypes: string[]
  unexpectedBreakConfidence?: number
  missingBreakConfidence?: number
  breakLength?: number
  intonationErrorTypes: string[]
  monotoneConfidence?: number
  wordPitchSlopeConfidence?: number
  syllablePitchDeltaConfidence?: number
}

interface ProsodyBreakIssue {
  type: 'unexpected-break' | 'missing-break'
  word: string
  confidence?: number
}

interface AzureFeedback {
  Prosody?: {
    Break?: {
      ErrorTypes?: string[]
      UnexpectedBreak?: { Confidence?: number }
      MissingBreak?: { Confidence?: number }
      BreakLength?: number
    }
    Intonation?: {
      ErrorTypes?: string[]
      Monotone?: {
        Confidence?: number
        WordPitchSlopeConfidence?: number
        SyllablePitchDeltaConfidence?: number
      }
    }
  }
}

interface AzureSyllable {
  Syllable: string
  Grapheme?: string
  AccuracyScore?: number
  Offset?: number
  Duration?: number
  PronunciationAssessment?: {
    AccuracyScore?: number
  }
}

interface AzurePhoneme {
  Phoneme: string
  AccuracyScore?: number
  Offset?: number
  Duration?: number
  NBestPhonemes?: AzurePhonemeCandidate[]
  PronunciationAssessment?: {
    AccuracyScore?: number
    NBestPhonemes?: AzurePhonemeCandidate[]
  }
}

interface AzurePhonemeCandidate {
  Phoneme: string
  Score: number
}

interface AzureWord {
  Word: string
  AccuracyScore?: number
  ErrorType?: string
  Offset?: number
  Duration?: number
  Feedback?: AzureFeedback
  Syllables?: AzureSyllable[]
  Phonemes?: AzurePhoneme[]
  PronunciationAssessment?: {
    AccuracyScore?: number
    ErrorType?: string
    Feedback?: AzureFeedback
  }
}

interface AzurePronunciationResponse {
  _requestId?: string
  _historyId?: string
  _attemptId?: string
  _audio?: { sha256: string; sampleRate?: number; normalized: boolean; storageId?:string; normalizationVersion?:string; durationSeconds?:number }
  RecognitionStatus?: string
  DisplayText?: string
  SNR?: number
  PronunciationAssessment?: {
    AccuracyScore: number
    FluencyScore: number
    CompletenessScore: number
    ProsodyScore?: number
    PronScore: number
  }
  Words?: AzureWord[]
  NBest?: Array<{
    Display?: string
    Confidence?: number
    Lexical?: string
    AccuracyScore?: number
    FluencyScore?: number
    CompletenessScore?: number
    ProsodyScore?: number
    PronScore?: number
    PronunciationAssessment?: {
      AccuracyScore: number
      FluencyScore: number
      CompletenessScore: number
      ProsodyScore?: number
      PronScore: number
    }
    Words?: AzureWord[]
  }>
}

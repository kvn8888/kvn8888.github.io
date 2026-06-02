'use client'

import { useState, useEffect } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { buildTtsBatches, textSize, createIntlSegmenter } from '@/lib/tts/sentenceSplitter'

// The segmenter instance is created once at module load time (browser-safe).
// To swap to wink-nlp: import { createWinkSegmenter } from '@/lib/tts/winkSegmenter'
// and pass it as the third argument to buildTtsBatches().
const _intlSegmenter = createIntlSegmenter()

type Tab = 'tts' | 'stt' | 'pronunciation'
type SpeechModality = Tab | 'all'
type SttModel = 'voxtral-mini-transcribe-2507' | 'voxtral-mini-latest' | 'gpt-4o-transcribe' | 'gpt-4o-transcribe-diarize' | 'interfaze'

interface HistoryItem {
  id: string
  modality: Tab
  title: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: number
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
  const [historyFilter, setHistoryFilter] = useState<SpeechModality>('all')
  // Safari animation fix — only add blur-reveal classes after mount
  // so Safari doesn't cache the final state on refresh
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/speech/history', { cache: 'no-store' })
      if (!res.ok) {
        setHistoryError('Unable to load history right now.')
        return
      }
      const data = await res.json()
      setHistory(data.items || [])
      setHistoryError(null)
    } catch {
      setHistoryError('Unable to load history right now.')
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const deleteHistory = async (id: string) => {
    try {
      const res = await fetch('/api/speech/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id))
        setHistoryError(null)
      } else {
        setHistoryError('Unable to delete history item.')
      }
    } catch {
      setHistoryError('Unable to delete history item.')
    }
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
        {activeTab === 'tts' && <TtsPanel onHistorySaved={loadHistory} />}
        {activeTab === 'stt' && <SttPanel onHistorySaved={loadHistory} />}
        {activeTab === 'pronunciation' && !hidePronunciation && <PronunciationPanel onHistorySaved={loadHistory} />}
      </div>

      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-5 space-y-3 ${mounted ? 'blur-reveal-4' : 'opacity-0'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-foreground">History</h3>
            <p className="text-xs text-foreground/40">Stored in Turso across all speech modalities</p>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={loadHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 text-foreground/60 text-xs hover:bg-foreground/10 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {historyError && <p className="text-xs text-foreground/40">{historyError}</p>}

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {history
            .filter((item) => historyFilter === 'all' || item.modality === historyFilter)
            .map((item) => (
              <div key={item.id} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-foreground">{item.title}</p>
                    <p className="text-xs text-foreground/40">
                      {modalityLabels[item.modality]} · {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteHistory(item.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                </div>
                {item.content && (
                  <p className="text-xs text-foreground/60 mt-2 whitespace-pre-wrap break-words">{item.content}</p>
                )}
              </div>
            ))}
          {history.filter((item) => historyFilter === 'all' || item.modality === historyFilter).length === 0 && (
            <p className="text-sm text-foreground/40 py-2">No history yet.</p>
          )}
        </div>
      </div>

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

function saveSpeechHistory(payload: { modality: Tab; title: string; content?: string; metadata?: Record<string, unknown> }) {
  // History persistence is best-effort and should not block core speech actions.
  void fetch('/api/speech/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn('Failed to save speech history', error)
  })
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

/* ─── TTS Panel ─── */
function TtsPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Gacrux')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const isChirp3Voice = voice.startsWith('chirp3:')
  const maxChars = isChirp3Voice ? CHIRP3_TEXT_LIMIT_BYTES : GEMINI_TEXT_LIMIT

  /**
   * Fetches a single TTS batch from the API and returns the raw audio Uint8Array
   * plus MIME type.  Throws on API errors so the caller can catch and surface them.
   */
  const fetchTtsBatch = async (batchText: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; summary?: string; storageUrl?: string }> => {
    const res = await fetch('/api/speech/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: batchText,
        voice,
        provider: isChirp3Voice ? 'chirp3' : 'gemini',
        ...(!isChirp3Voice && instructions.trim() ? { instructions: instructions.trim() } : {}),
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'TTS generation failed')
    }

    const { audio, mimeType, summary, storageUrl } = await res.json()
    const raw = atob(audio)
    const bytes = new Uint8Array(new ArrayBuffer(raw.length))
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return { bytes, mimeType, summary, storageUrl }
  }

  /**
   * Wraps raw PCM bytes in a WAV header and returns the full WAV Uint8Array.
   * Used for Gemini responses which return raw L16 PCM.
   */
  const wrapPcmInWav = (pcmBytes: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array<ArrayBuffer> => {
    const header = new DataView(createWavHeader(pcmBytes.length, sampleRate, channels, bitsPerSample))
    const out = new Uint8Array(new ArrayBuffer(44 + pcmBytes.length))
    for (let i = 0; i < 44; i++) out[i] = header.getUint8(i)
    out.set(pcmBytes, 44)
    return out
  }

  const handleGenerate = async () => {
    const trimmedText = text.trim()
    if (!trimmedText) return

    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setBatchProgress(null)

    try {
      const limit = isChirp3Voice ? CHIRP3_TEXT_LIMIT_BYTES : GEMINI_TEXT_LIMIT
      // NLP sentence splitter: pack sentences into batches that maximise usage
      // while staying under the API limit.  Full DSA docs in @/lib/tts/sentenceSplitter.ts
      const batches = buildTtsBatches(trimmedText, { limit, isChirp3: isChirp3Voice }, _intlSegmenter)
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

        const { bytes, mimeType, summary, storageUrl } = await fetchTtsBatch(batches[i])

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

      saveSpeechHistory({
        modality: 'tts',
        title: firstSummary || `TTS · ${voice}`,
        content: trimmedText.slice(0, 500),
        metadata: {
          voice,
          provider: isChirp3Voice ? 'chirp3' : 'gemini',
          mimeType: overallMimeType,
          batchCount: batches.length,
          ...(firstStorageUrl ? { storageUrl: firstStorageUrl } : {}),
        },
      })
      onHistorySaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setBatchProgress(null)
    } finally {
      setLoading(false)
    }
  }

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
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-500 text-lg">error</span>
          {error}
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
// Voxtral: 1 GB (Mistral docs), GPT-4o: 25 MB (Azure OpenAI limit), Interfaze: 25 MB (conservative, unconfirmed)
const STT_FILE_SIZE_LIMIT_BYTES: Record<SttModel, number> = {
  'voxtral-mini-transcribe-2507': 1024 * 1024 * 1024,
  'voxtral-mini-latest': 1024 * 1024 * 1024,
  'gpt-4o-transcribe': 200 * 1024 * 1024, // Render backend; multer limit is 200 MB
  'gpt-4o-transcribe-diarize': 500 * 1024 * 1024, // Render backend handles chunking; 500 MB is well above any real recording
  'interfaze': 25 * 1024 * 1024,
}
// Vercel serverless functions enforce a 4.5 MB request body limit.
// We target 4 MB to leave headroom for FormData overhead (field names, boundaries, etc.).
const VERCEL_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024
const STT_DURATION_LIMIT_SECONDS: Record<SttModel, number> = {
  'voxtral-mini-transcribe-2507': 3 * 60 * 60,
  'voxtral-mini-latest': 3 * 60 * 60,
  'gpt-4o-transcribe': 2 * 60 * 60,
  'gpt-4o-transcribe-diarize': 2 * 60 * 60,
  'interfaze': 2 * 60 * 60,
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

function isInterfazeSttModel(model: SttModel): boolean {
  return model === 'interfaze'
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

function SttPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [model, setModelRaw] = useState<SttModel>(() => {
    if (typeof window === 'undefined') return 'voxtral-mini-transcribe-2507'
    const saved = localStorage.getItem('speech-lab-stt-model')
    if (saved && ['voxtral-mini-transcribe-2507','voxtral-mini-latest','gpt-4o-transcribe','gpt-4o-transcribe-diarize','interfaze'].includes(saved)) return saved as SttModel
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
  const [savedRecordings, setSavedRecordings] = useState<
    { id: string; key: string; sizeBytes: number; createdAt: string }[]
  >([])
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
  const saveRecordingToS3 = async (blob: Blob, filename: string) => {
    setSavingRecording(true)
    try {
      const formData = new FormData()
      formData.append('audio', blob, filename)
      const res = await fetch('/api/speech/recordings', { method: 'POST', body: formData })
      if (res.ok) await fetchRecordings() // Refresh the list
    } catch {
      // Non-fatal — recording still transcribes even if S3 save fails
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
  const handleDiarizeTranscribe = async (audioBlob: Blob, uploadFileName: string) => {
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
            saveSpeechHistory({
              modality: 'stt',
              title: `Diarize · gpt-4o-transcribe-diarize`,
              content: formatted.slice(0, 1500),
              metadata: {
                model: 'gpt-4o-transcribe-diarize',
                segments: event.totalSegments ?? segs.length,
                speakers: event.uniqueSpeakers?.length ?? 0,
              },
            })
            onHistorySaved()
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
  const handleRenderTranscribe = async (audioBlob: Blob, uploadFileName: string) => {
    setLoading(true)
    setError(null)
    setTranscript(null)
    setSegments([])

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, uploadFileName)
      formData.append('model', model)

      const res = await fetch('https://speech-tools.onrender.com/transcribe', {
        method: 'POST',
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
        saveSpeechHistory({
          modality: 'stt',
          title: `STT · ${model}`,
          content: runningText.slice(0, 1500),
          metadata: { model },
        })
        onHistorySaved()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTranscribe = async (audioBlob: Blob, uploadFileName = 'recording.webm') => {
    // Diarize model: stream parallel chunks from Render speech-tools /diarize
    if (model === 'gpt-4o-transcribe-diarize') {
      await handleDiarizeTranscribe(audioBlob, uploadFileName)
      return
    }

    // All Voxtral + gpt-4o-transcribe models go to Render /transcribe (avoids Vercel timeouts)
    if (model !== 'interfaze') {
      await handleRenderTranscribe(audioBlob, uploadFileName)
      return
    }

    // interfaze stays on Vercel — small file direct FormData only
    setLoading(true)
    setError(null)
    setTranscript(null)
    setSegments([])

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, uploadFileName)
      formData.append('model', model)
      const res = await fetch('/api/speech/stt', { method: 'POST', body: formData })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Transcription failed')
      }

      const data = await res.json()
      setTranscript(data.text || '')
      if (data.segments) {
        setSegments(data.segments.map((s: { start: number; end: number; text: string }) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })))
      }
      saveSpeechHistory({
        modality: 'stt',
        title: `STT · ${model}`,
        content: (data.text || '').slice(0, 1500),
        metadata: { model },
      })
      onHistorySaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
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

    if (!isAzureOpenAiSttModel(model) && !isInterfazeSttModel(model) && !isLikelyMistralCompatibleAudio(file)) {
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

        // Save to S3 (background, non-blocking) AND transcribe in parallel
        void saveRecordingToS3(originalBlob, `recording.${extension}`)
        void handleTranscribe(blob, uploadName)
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

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">mic</span>
        <div>
          <h3 className="font-medium text-foreground">Transcription</h3>
          <p className="text-xs text-foreground/40">Mistral Voxtral · Azure OpenAI GPT‑4o · Interfaze</p>
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
          <button
            onClick={() => setModel('interfaze')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'interfaze'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>Interfaze</div>
            <div className="text-xs opacity-60 mt-0.5">Interfaze AI multimodal</div>
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
const DELIVERY_ANALYSIS_URL = 'https://speech-tools.onrender.com/analyze-delivery'
const AZURE_TIME_UNITS_PER_SECOND = 10_000_000
const PHRASE_BREAK_SECONDS = 0.45
const LONG_PAUSE_SECONDS = 0.9
const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'hmm', 'like', 'basically', 'actually'])

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

function getPronWordStartSec(word: PronWord): number | null {
  return word.offset == null ? null : word.offset / AZURE_TIME_UNITS_PER_SECOND
}

function getPronWordEndSec(word: PronWord): number | null {
  const start = getPronWordStartSec(word)
  return start == null || word.duration == null ? null : start + word.duration / AZURE_TIME_UNITS_PER_SECOND
}

async function fetchDeliveryAnalysis(audioBlob: Blob): Promise<RawDeliveryAnalysis> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 90_000)
  const formData = new FormData()
  formData.append('audio', audioBlob, 'delivery.wav')

  try {
    const res = await fetch(DELIVERY_ANALYSIS_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Delivery analysis failed (HTTP ${res.status})`)
    return await res.json() as RawDeliveryAnalysis
  } finally {
    window.clearTimeout(timeout)
  }
}

function buildDeliveryAnalysis(raw: RawDeliveryAnalysis, words: PronWord[]): DeliveryAnalysis {
  const timedWords = words
    .map((word) => ({ word, startSec: getPronWordStartSec(word), endSec: getPronWordEndSec(word) }))
    .filter((item): item is { word: PronWord; startSec: number; endSec: number } => item.startSec != null && item.endSec != null)
  const firstWord = timedWords[0]
  const lastWord = timedWords[timedWords.length - 1]
  const spokenSpanSec = firstWord && lastWord ? Math.max(lastWord.endSec - firstWord.startSec, 0.5) : raw.summary.voicedDurationSec
  const speakingRateWpm = timedWords.length > 0 && spokenSpanSec > 0
    ? Math.round(timedWords.length / spokenSpanSec * 60)
    : null
  const phrases: DeliveryPhrase[] = []

  for (const item of timedWords) {
    const current = phrases[phrases.length - 1]
    if (!current || item.startSec - current.endSec >= PHRASE_BREAK_SECONDS) {
      phrases.push({
        text: item.word.word,
        startSec: item.startSec,
        endSec: item.endSec,
        wordCount: 1,
        wpm: 0,
      })
      continue
    }
    current.text += ` ${item.word.word}`
    current.endSec = item.endSec
    current.wordCount += 1
  }

  for (const phrase of phrases) {
    phrase.wpm = Math.round(phrase.wordCount / Math.max(phrase.endSec - phrase.startSec, 0.5) * 60)
  }

  const insights: DeliveryInsight[] = raw.acousticInsights
    .filter((insight) => insight.code !== 'long-pause')
    .map((insight) => ({
      category: 'prosody',
      severity: insight.severity,
      message: insight.message,
    }))

  for (let index = 1; index < timedWords.length; index += 1) {
    const previous = timedWords[index - 1]
    const current = timedWords[index]
    const pauseSec = current.startSec - previous.endSec
    if (pauseSec >= LONG_PAUSE_SECONDS) {
      insights.push({
        category: 'fluency',
        severity: 'improve',
        message: `You paused ${pauseSec.toFixed(1)}s before "${current.word.word}". Try connecting that phrase more smoothly.`,
      })
    }
  }

  if (speakingRateWpm != null && speakingRateWpm > 180) {
    insights.push({
      category: 'fluency',
      severity: 'improve',
      message: `Your average pace was ${speakingRateWpm} WPM. Slow down slightly so key phrases have room to land.`,
    })
  } else if (speakingRateWpm != null && speakingRateWpm < 100) {
    insights.push({
      category: 'fluency',
      severity: 'consider',
      message: `Your average pace was ${speakingRateWpm} WPM. Try linking short phrases together to create more forward momentum.`,
    })
  }

  const fastestPhrase = phrases.reduce<DeliveryPhrase | null>(
    (fastest, phrase) => !fastest || phrase.wpm > fastest.wpm ? phrase : fastest,
    null
  )
  if (
    fastestPhrase &&
    speakingRateWpm != null &&
    fastestPhrase.wordCount >= 3 &&
    fastestPhrase.wpm > Math.max(170, speakingRateWpm * 1.25)
  ) {
    insights.push({
      category: 'fluency',
      severity: 'consider',
      message: `The phrase "${fastestPhrase.text}" accelerated to about ${fastestPhrase.wpm} WPM. Practice it once with a steadier pace.`,
    })
  }

  const fillerCounts = new Map<string, number>()
  for (const { word } of timedWords) {
    const normalized = word.word.toLowerCase().replace(/[^a-z']/g, '')
    if (FILLER_WORDS.has(normalized)) fillerCounts.set(normalized, (fillerCounts.get(normalized) ?? 0) + 1)
  }
  if (fillerCounts.size > 0) {
    const summary = Array.from(fillerCounts.entries()).map(([word, count]) => `"${word}" ×${count}`).join(', ')
    insights.push({
      category: 'fluency',
      severity: 'consider',
      message: `Review filler words: ${summary}. Replacing them with a brief intentional pause can make the delivery clearer.`,
    })
  }

  if (insights.length === 0) {
    insights.push({
      category: 'overall',
      severity: 'strength',
      message: 'Your pacing and acoustic variation were balanced in this recording. Keep the same delivery and compare across a longer sample.',
    })
  }

  const priority = { improve: 0, consider: 1, strength: 2 }
  insights.sort((a, b) => priority[a.severity] - priority[b.severity])

  return {
    ...raw,
    speakingRateWpm,
    phrases,
    insights: insights.slice(0, 5),
  }
}

function PronunciationPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [referenceText, setReferenceText] = useState('')
  const [referenceSource, setReferenceSource] = useState<'manual' | 'transcription'>('transcription')
  const [transcriptionModel, setTranscriptionModelRaw] = useState<SttModel>(() => {
    if (typeof window === 'undefined') return 'gpt-4o-transcribe'
    const saved = localStorage.getItem('speech-lab-pron-model')
    if (saved && ['voxtral-mini-transcribe-2507','voxtral-mini-latest','gpt-4o-transcribe','gpt-4o-transcribe-diarize','interfaze'].includes(saved)) return saved as SttModel
    return 'gpt-4o-transcribe'
  })
  const setTranscriptionModel = (m: SttModel) => { setTranscriptionModelRaw(m); localStorage.setItem('speech-lab-pron-model', m) }
  const [language, setLanguage] = useState('en-US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [result, setResult] = useState<PronResult | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [selectedWord, setSelectedWord] = useState<PronWord | null>(null)

  const handleAssess = async (audioBlob: Blob, overrideReferenceText?: string) => {
    const resolvedReferenceText = (overrideReferenceText ?? referenceText).trim()
    if (!resolvedReferenceText) {
      setError('Reference text is required')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    setSelectedWord(null)
    setDeliveryLoading(true)
    setDeliveryError(null)

    try {
      const wavBlob = await convertRecordedBlobToWav(audioBlob)
      const deliveryPromise = fetchDeliveryAnalysis(wavBlob)
        .then((analysis) => ({ analysis }))
        .catch((deliveryFailure: unknown) => ({
          error: deliveryFailure instanceof Error ? deliveryFailure.message : 'Delivery analysis failed',
        }))
      const formData = new FormData()
      formData.append('audio', wavBlob, 'pronunciation.wav')
      formData.append('referenceText', resolvedReferenceText)
      formData.append('language', language)

      const res = await fetch('/api/speech/pronunciation', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Pronunciation assessment failed')
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
        const nextResult = {
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
        setResult(nextResult)
        void deliveryPromise.then((outcome) => {
          if ('error' in outcome) {
            setDeliveryError(outcome.error)
            return
          }
          setResult((current) => current ? { ...current, delivery: buildDeliveryAnalysis(outcome.analysis, current.words) } : current)
        }).finally(() => setDeliveryLoading(false))
        saveSpeechHistory({
          modality: 'pronunciation',
          title: `Pronunciation · ${language}`,
          content: resolvedReferenceText.slice(0, 300),
          metadata: {
            pronScore: nextResult.pronScore,
            accuracyScore: nextResult.accuracyScore,
            fluencyScore: nextResult.fluencyScore,
            prosodyScore: nextResult.prosodyScore,
          },
        })
        onHistorySaved()
      } else {
        setDeliveryLoading(false)
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
      setDeliveryLoading(false)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const transcribeReferenceText = async (audioBlob: Blob) => {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'reference.webm')
    formData.append('model', transcriptionModel)

    const res = await fetch('/api/speech/stt', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Reference transcription failed')
    }

    const data = await res.json()
    const text = (data.text as string | undefined)?.trim()
    if (!text) {
      throw new Error('No transcription text returned for reference')
    }
    return text
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
        if (referenceSource === 'transcription') {
          void (async () => {
            try {
              setLoading(true)
              setError(null)
              const nextReferenceText = await transcribeReferenceText(blob)
              setReferenceText(nextReferenceText)
              await handleAssess(blob, nextReferenceText)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unknown error')
              setLoading(false)
            }
          })()
          return
        }
        void handleAssess(blob)
      }

      recorder.start()
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
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">spellcheck</span>
        <div>
          <h3 className="font-medium text-foreground">Pronunciation Assessment</h3>
          <p className="text-xs text-foreground/40">Powered by Microsoft Azure Speech — phoneme-level accuracy scoring</p>
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
            onChange={(e) => setTranscriptionModel(e.target.value as SttModel)}
            className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
          >
            <option value="gpt-4o-transcribe">GPT‑4o Transcribe (default)</option>
            <option value="gpt-4o-transcribe-diarize">GPT‑4o Transcribe Diarize</option>
            <option value="voxtral-mini-transcribe-2507">Mistral Voxtral Transcribe (2507)</option>
            <option value="voxtral-mini-latest">Mistral Voxtral Mini Latest</option>
            <option value="interfaze">Interfaze</option>
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

      {/* Record button */}
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={loading || (referenceSource === 'manual' && !referenceText.trim())}
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
          Assessing pronunciation…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-500 text-lg">error</span>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-xl bg-foreground/[0.03] border border-foreground/10 p-3 space-y-2">
            <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Recognition Snapshot</p>
            <p className="text-sm text-foreground/70">Recognized: <span className="text-foreground font-medium">{result.displayText || '—'}</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-foreground/50">
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">Status: {result.recognitionStatus}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">Confidence: {result.confidence != null ? result.confidence.toFixed(3) : 'n/a'}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5">SNR: {result.snr != null ? result.snr.toFixed(1) : 'n/a'}</div>
              <div className="rounded-lg bg-foreground/[0.02] border border-foreground/8 px-2.5 py-1.5 truncate" title={result.lexical || undefined}>Lexical: {result.lexical || 'n/a'}</div>
            </div>
          </div>

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

          <DeliveryAnalysisPanel analysis={result.delivery} loading={deliveryLoading} error={deliveryError} />

          {/* Word-level breakdown */}
          {result.words.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Word Breakdown</p>
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
          <p>Max audio: 5 minutes per request · WAV format preferred</p>
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
        <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Prosody Feedback</p>
        <p className="text-xs text-foreground/40 mt-0.5">English (US) guidance for pauses and intonation.</p>
      </div>

      {breakIssues.map((issue, index) => (
        <div
          key={`${issue.type}-${issue.word}-${index}`}
          className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700"
        >
          <span className="material-symbols-outlined text-lg">pause_circle</span>
          <p>
            {issue.type === 'unexpected-break'
              ? <>Avoid pausing before <span className="font-medium">{issue.word}</span>.</>
              : <>Add a short pause before <span className="font-medium">{issue.word}</span>.</>}
            <span className="ml-1 text-xs opacity-70">({formatConfidence(issue.confidence)})</span>
          </p>
        </div>
      ))}

      {monotoneDetected && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
          <span className="material-symbols-outlined text-lg">graphic_eq</span>
          <p>Your pitch stayed relatively flat across this sentence. Vary emphasis and intonation around the key words.</p>
        </div>
      )}

      <p className="text-[11px] text-foreground/35">
        Pause suggestions appear only when Azure explicitly labels a missing or unexpected break.
      </p>
    </div>
  )
}

function DeliveryAnalysisPanel({ analysis, loading, error }: { analysis?: DeliveryAnalysis; loading: boolean; error: string | null }) {
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
      <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 px-3 py-2.5 text-xs text-foreground/50">
        Delivery measurements are temporarily unavailable. Azure pronunciation scores are still shown.
      </div>
    ) : null
  }

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-foreground/10 p-3 space-y-3">
      <div>
        <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Actionable Delivery Analysis</p>
        <p className="text-xs text-foreground/40 mt-0.5">Praat acoustic measurements combined with Azure word timing.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <DeliveryMetric label="Speaking Rate" value={analysis.speakingRateWpm != null ? `${analysis.speakingRateWpm} WPM` : 'n/a'} />
        <DeliveryMetric label="Pitch Range" value={analysis.pitch.rangeSemitones != null ? `${analysis.pitch.rangeSemitones.toFixed(1)} st` : 'n/a'} />
        <DeliveryMetric label="Internal Pauses" value={`${analysis.summary.pauseCount}`} />
        <DeliveryMetric label="Volume Range" value={analysis.intensity.rangeDb != null ? `${analysis.intensity.rangeDb.toFixed(1)} dB` : 'n/a'} />
      </div>

      <div className="space-y-1.5">
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
  const style = hasPronunciationError
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
      <span className="ml-1.5 text-xs opacity-60">{Math.round(word.accuracyScore)}</span>
      <span className="pointer-events-none absolute z-20 hidden group-hover:block group-focus-visible:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-64 rounded-lg bg-glass backdrop-blur-md border border-glass-border px-2.5 py-2 text-left text-[11px] text-foreground/70 shadow-lg">
        {word.syllables.length > 0
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
              {word.word} <span className="text-sm text-foreground/40">{Math.round(word.accuracyScore)}</span>
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
                          Heard <span className="font-medium">{likelySpoken.phoneme}</span>
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
interface PronResult {
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

'use client'

import { useState, useEffect } from 'react'

type Tab = 'tts' | 'stt' | 'pronunciation'
type SpeechModality = Tab | 'all'
type SttModel = 'voxtral-mini-transcribe-2602' | 'voxtral-mini-transcribe-realtime-2602' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe'

interface HistoryItem {
  id: string
  modality: Tab
  title: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: number
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'tts', label: 'Text to Speech', icon: 'record_voice_over' },
  { id: 'stt', label: 'Transcription', icon: 'mic' },
  { id: 'pronunciation', label: 'Pronunciation', icon: 'spellcheck' },
]
const modalityLabels: Record<Tab, string> = {
  tts: 'Text to Speech',
  stt: 'Transcription',
  pronunciation: 'Pronunciation',
}

export default function SpeechLabPage() {
  const [activeTab, setActiveTab] = useState<Tab>('tts')
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
      <div className={`flex justify-center gap-2 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden ${mounted ? 'blur-reveal-3' : 'opacity-0'}`}>
        {activeTab === 'tts' && <TtsPanel onHistorySaved={loadHistory} />}
        {activeTab === 'stt' && <SttPanel onHistorySaved={loadHistory} />}
        {activeTab === 'pronunciation' && <PronunciationPanel onHistorySaved={loadHistory} />}
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
              <option value="pronunciation">Pronunciation</option>
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

/* ─── TTS Panel ─── */
function TtsPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Gacrux')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setAudioUrl(null)

    try {
      const res = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice,
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'TTS generation failed')
      }

      const { audio, mimeType } = await res.json()

      // Convert base64 PCM → playable WAV blob
      const raw = atob(audio)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

      // If mime is L16, wrap in WAV header; otherwise treat as-is
      let blob: Blob
      if (mimeType?.includes('L16')) {
        const sampleRate = 24000
        const wavHeader = createWavHeader(bytes.length, sampleRate, 1, 16)
        blob = new Blob([wavHeader, bytes], { type: 'audio/wav' })
      } else {
        blob = new Blob([bytes], { type: mimeType || 'audio/wav' })
      }

      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      saveSpeechHistory({
        modality: 'tts',
        title: `TTS · ${voice}`,
        content: text.trim().slice(0, 500),
        metadata: { voice, mimeType: mimeType || 'audio/wav' },
      })
      onHistorySaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">record_voice_over</span>
        <div>
          <h3 className="font-medium text-foreground">Gemini 2.5 Flash TTS</h3>
          <p className="text-xs text-foreground/40">Powered by Google AI — 30 expressive voices with style control</p>
        </div>
      </div>

      {/* Text input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to speak..."
          rows={4}
          maxLength={4096}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none transition-all"
        />
        <p className="text-xs text-foreground/30 text-right">{text.length} / 4096</p>
      </div>

      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Voice</label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full rounded-xl bg-foreground/[0.03] border border-foreground/10 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all appearance-none cursor-pointer"
        >
          {geminiVoices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} — {v.style}
            </option>
          ))}
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
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Speak in a warm, conversational tone with a slight British accent..."
            rows={2}
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
            Generating…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg">play_arrow</span>
            Generate Speech
          </>
        )}
        </button>
      </div>

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
function SttPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [model, setModel] = useState<SttModel>('voxtral-mini-transcribe-2602')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [segments, setSegments] = useState<{ start: number; end: number; text: string }[]>([])
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)

  const handleTranscribe = async (audioBlob: Blob) => {
    setLoading(true)
    setError(null)
    setTranscript(null)
    setSegments([])

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('model', model)

      const res = await fetch('/api/speech/stt', {
        method: 'POST',
        body: formData,
      })

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
        metadata: { model, segments: data.segments?.length || 0 },
      })
      onHistorySaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        handleTranscribe(blob)
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleTranscribe(file)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="material-symbols-outlined text-foreground/40">mic</span>
        <div>
          <h3 className="font-medium text-foreground">Voxtral Transcription</h3>
          <p className="text-xs text-foreground/40">Powered by Mistral + OpenAI models (GPT‑4o audio options included)</p>
        </div>
      </div>

      {/* Model selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/70">Model</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setModel('voxtral-mini-transcribe-2602')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'voxtral-mini-transcribe-2602'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>Transcribe 2</div>
            <div className="text-xs opacity-60 mt-0.5">Batch · diarization · timestamps</div>
          </button>
          <button
            onClick={() => setModel('voxtral-mini-transcribe-realtime-2602')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'voxtral-mini-transcribe-realtime-2602'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>Realtime 2</div>
            <div className="text-xs opacity-60 mt-0.5">Streaming · sub-200ms latency</div>
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
            <div className="text-xs opacity-60 mt-0.5">OpenAI audio input</div>
          </button>
          <button
            onClick={() => setModel('gpt-4o-mini-transcribe')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              model === 'gpt-4o-mini-transcribe'
                ? 'bg-foreground text-background'
                : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            <div>GPT‑4o Mini Transcribe</div>
            <div className="text-xs opacity-60 mt-0.5">Lower latency / cost</div>
          </button>
        </div>
      </div>

      {/* Record / Upload */}
      <div className="flex gap-3">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading}
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

        <label className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground/5 text-foreground/60 font-medium text-sm hover:bg-foreground/10 transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-lg">upload_file</span>
          Upload Audio
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-sm text-red-700">Recording…</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-foreground/40 text-sm">
          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
          Transcribing…
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
    </div>
  )
}

/* ─── Pronunciation Panel ─── */
function PronunciationPanel({ onHistorySaved }: { onHistorySaved: () => void }) {
  const [referenceText, setReferenceText] = useState('')
  const [referenceSource, setReferenceSource] = useState<'manual' | 'transcription'>('manual')
  const [transcriptionModel, setTranscriptionModel] = useState<SttModel>('gpt-4o-transcribe')
  const [language, setLanguage] = useState('en-US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [result, setResult] = useState<PronResult | null>(null)

  const handleAssess = async (audioBlob: Blob, overrideReferenceText?: string) => {
    const resolvedReferenceText = (overrideReferenceText ?? referenceText).trim()
    if (!resolvedReferenceText) {
      setError('Reference text is required')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'pronunciation.webm')
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

      const data = await res.json()
      // Azure returns NBest[0].PronunciationAssessment
      const assessment = data.NBest?.[0]?.PronunciationAssessment
      const words = data.NBest?.[0]?.Words || []

      if (assessment) {
        const nextResult = {
          accuracyScore: assessment.AccuracyScore,
          fluencyScore: assessment.FluencyScore,
          completenessScore: assessment.CompletenessScore,
          prosodyScore: assessment.ProsodyScore,
          pronScore: assessment.PronScore,
          displayText: data.DisplayText || resolvedReferenceText,
          words: words.map((w: AzureWord) => ({
            word: w.Word,
            accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
            errorType: w.PronunciationAssessment?.ErrorType || 'None',
          })),
        }
        setResult(nextResult)
        saveSpeechHistory({
          modality: 'pronunciation',
          title: `Pronunciation · ${language}`,
          content: resolvedReferenceText.slice(0, 300),
          metadata: {
            pronScore: nextResult.pronScore,
            accuracyScore: nextResult.accuracyScore,
            fluencyScore: nextResult.fluencyScore,
          },
        })
        onHistorySaved()
      } else {
        setError('No assessment data returned. Make sure you speak clearly.')
      }
    } catch (err) {
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
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
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
            <option value="gpt-4o-mini-transcribe">GPT‑4o Mini Transcribe</option>
            <option value="voxtral-mini-transcribe-2602">Mistral Voxtral Transcribe 2</option>
            <option value="voxtral-mini-transcribe-realtime-2602">Mistral Voxtral Realtime 2</option>
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
          {/* Overall scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ScoreCard label="Overall" score={result.pronScore} />
            <ScoreCard label="Accuracy" score={result.accuracyScore} />
            <ScoreCard label="Fluency" score={result.fluencyScore} />
            <ScoreCard label="Completeness" score={result.completenessScore} />
          </div>

          {result.prosodyScore != null && (
            <div className="w-full sm:w-1/4">
              <ScoreCard label="Prosody" score={result.prosodyScore} />
            </div>
          )}

          {/* Word-level breakdown */}
          {result.words.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/40 uppercase tracking-wider font-medium">Word Breakdown</p>
              <div className="flex flex-wrap gap-2">
                {result.words.map((w, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
                      w.errorType !== 'None'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : w.accuracyScore >= 80
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : w.accuracyScore >= 50
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                    title={`Accuracy: ${w.accuracyScore}${w.errorType !== 'None' ? ` | Error: ${w.errorType}` : ''}`}
                  >
                    {w.word}
                    <span className="ml-1.5 text-xs opacity-60">{Math.round(w.accuracyScore)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Score Card (used in Pronunciation results) ─── */
function ScoreCard({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
  const bgColor =
    score >= 80 ? 'bg-emerald-50 border-emerald-200' : score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  return (
    <div className={`rounded-xl px-4 py-3 border ${bgColor} text-center`}>
      <p className="text-xs text-foreground/40 mb-1">{label}</p>
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
  displayText: string
  words: { word: string; accuracyScore: number; errorType: string }[]
}

interface AzureWord {
  Word: string
  PronunciationAssessment?: {
    AccuracyScore: number
    ErrorType: string
  }
}

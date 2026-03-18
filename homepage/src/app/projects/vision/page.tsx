'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
const ACCEPTED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.gif,.webp'
const MAX_SIZE_MB = 10

const PROMPT_SUGGESTIONS = [
  'Extract all text from this image',
  'Detect and list all objects',
  'Describe what you see in detail',
  'Extract the total price and tax',
  'What are the key data points in this image?',
]

export default function VisionPage() {
  const [mounted, setMounted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Clean up object URL on unmount / image change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const loadImage = useCallback((f: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
      setError(`Unsupported file type: ${f.type || 'unknown'}. Please upload a JPEG, PNG, GIF, or WebP.`)
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`)
      return
    }
    setImage(f)
    setPreviewUrl(URL.createObjectURL(f))
    setResult(null)
    setError(null)
    textareaRef.current?.focus()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) loadImage(f)
    },
    [loadImage]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) loadImage(f)
      e.target.value = ''
    },
    [loadImage]
  )

  const handleSubmit = async () => {
    if (!image || !prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('image', image)
      formData.append('prompt', prompt.trim())

      const res = await fetch('/api/vision', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Vision request failed. Please try again.')
        return
      }

      setResult(data.text)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const handleCopy = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
    } catch {
      const el = document.createElement('textarea')
      el.value = result
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const handleReset = useCallback(() => {
    setImage(null)
    setPreviewUrl(null)
    setPrompt('')
    setResult(null)
    setError(null)
  }, [])

  const canSubmit = Boolean(image && prompt.trim() && !loading)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-3xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Vision
        </h1>
        <p className={`text-foreground/60 mt-2 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Upload an image and ask anything — OCR, object detection, description, and more via Interfaze.
        </p>
      </div>

      <div className={`space-y-4 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
        {/* Image area */}
        {!image ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-4
              rounded-2xl border-2 border-dashed p-12 cursor-pointer
              transition-all duration-200
              ${isDragging
                ? 'border-foreground/40 bg-foreground/10 scale-[1.01]'
                : 'border-glass-border hover:border-glass-border-hover bg-glass hover:bg-glass-hover'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_EXTENSIONS}
              onChange={handleFileChange}
              className="hidden"
            />
            <span className={`material-symbols-outlined text-5xl transition-colors ${isDragging ? 'text-foreground/60' : 'text-foreground/30'}`}>
              {isDragging ? 'file_download' : 'image'}
            </span>
            <div className="text-center">
              <p className="text-foreground font-medium">
                {isDragging ? 'Drop to load' : 'Drop an image or click to browse'}
              </p>
              <p className="text-foreground/50 text-sm mt-1">
                JPEG, PNG, WebP, GIF — up to {MAX_SIZE_MB} MB
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden">
            {/* Image preview */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl!}
              alt="Uploaded"
              className="w-full max-h-72 object-contain bg-foreground/[0.02]"
            />
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-glass-border">
              <div className="flex items-center gap-2 text-foreground/50 text-sm min-w-0">
                <span className="material-symbols-outlined text-base shrink-0">attach_file</span>
                <span className="truncate">{image.name}</span>
                <span className="shrink-0 opacity-60">· {(image.size / 1024).toFixed(0)} KB</span>
              </div>
              <button
                onClick={handleReset}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Prompt suggestions */}
        {image && !result && (
          <div className="flex flex-wrap gap-2">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground/70 text-xs transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Prompt input */}
        {image && (
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this image…"
              rows={3}
              className="w-full px-5 pt-4 pb-2 bg-transparent text-foreground placeholder:text-foreground/30 text-sm resize-none focus:outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <p className="text-xs text-foreground/30">⌘ Return to send</p>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all cursor-pointer bg-foreground text-background hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    Analyzing…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">send</span>
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm">
            <span className="material-symbols-outlined text-base mt-0.5 shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2 text-foreground/50 text-sm">
                <span className="material-symbols-outlined text-base">smart_toy</span>
                <span>Interfaze response</span>
              </div>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  copied
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50'
                    : 'bg-foreground/5 hover:bg-foreground/10 text-foreground/60'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-5 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words font-sans">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

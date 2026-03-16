'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
]

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.tiff'
const MAX_SIZE_MB = 20

export default function OcrPage() {
  const [mounted, setMounted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<{ markdown: string; pageCount: number; model: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const processFile = useCallback(async (f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(`Unsupported file type: ${f.type || 'unknown'}. Please upload a PDF or image.`)
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`)
      return
    }

    setFile(f)
    setError(null)
    setResult(null)
    setIsProcessing(true)

    try {
      const formData = new FormData()
      formData.append('file', f)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'OCR failed. Please try again.')
        return
      }

      setResult(data)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) {
        processFile(dropped)
      }
    },
    [processFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) {
        processFile(selected)
      }
      // Reset so the same file can be re-uploaded
      e.target.value = ''
    },
    [processFile]
  )

  const handleCopy = useCallback(async () => {
    if (!result?.markdown) return
    try {
      await navigator.clipboard.writeText(result.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that don't support clipboard API
      const el = document.createElement('textarea')
      el.value = result.markdown
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [result])

  const handleReset = useCallback(() => {
    setFile(null)
    setResult(null)
    setError(null)
    setIsProcessing(false)
    setCopied(false)
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-3xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Document OCR
        </h1>
        <p className={`text-foreground/60 mt-2 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Extract text and structure from PDFs and images using Mistral Document AI.
          Results are returned as Markdown.
        </p>
      </div>

      {/* Drop Zone */}
      {!result && (
        <div className={mounted ? 'blur-reveal-2' : 'opacity-0'}>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-4
              rounded-2xl border-2 border-dashed p-12 cursor-pointer
              transition-all duration-200
              ${isDragging
                ? 'border-foreground/40 bg-foreground/10 scale-[1.01]'
                : 'border-glass-border hover:border-glass-border-hover bg-glass hover:bg-glass-hover'
              }
              ${isProcessing ? 'pointer-events-none opacity-70' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileChange}
              className="hidden"
            />

            {isProcessing ? (
              <>
                <span className="material-symbols-outlined text-5xl text-foreground/40 animate-spin">
                  progress_activity
                </span>
                <div className="text-center">
                  <p className="text-foreground font-medium">
                    Processing{file ? ` "${file.name}"` : ''}…
                  </p>
                  <p className="text-foreground/50 text-sm mt-1">
                    Mistral Document AI is reading your file
                  </p>
                </div>
              </>
            ) : (
              <>
                <span
                  className={`material-symbols-outlined text-5xl transition-colors ${
                    isDragging ? 'text-foreground/60' : 'text-foreground/30'
                  }`}
                >
                  {isDragging ? 'file_download' : 'upload_file'}
                </span>
                <div className="text-center">
                  <p className="text-foreground font-medium">
                    {isDragging ? 'Drop to extract' : 'Drop a file or click to browse'}
                  </p>
                  <p className="text-foreground/50 text-sm mt-1">
                    PDF, JPEG, PNG, WebP, GIF, TIFF, HEIC — up to {MAX_SIZE_MB} MB
                  </p>
                </div>

                {file && !error && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/5 text-foreground/60 text-sm">
                    <span className="material-symbols-outlined text-base">attach_file</span>
                    <span className="truncate max-w-xs">{file.name}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm">
              <span className="material-symbols-outlined text-base mt-0.5 shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Result Panel */}
      {result && (
        <div className={`mt-2 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-foreground/50 text-sm">
              <span className="material-symbols-outlined text-base">description</span>
              <span>
                {file?.name ?? 'Document'}
                {result.pageCount > 0 && (
                  <span className="ml-2 opacity-70">
                    · {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
                  ${copied
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50'
                    : 'bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground'
                  }
                `}
              >
                <span className="material-symbols-outlined text-base">
                  {copied ? 'check' : 'content_copy'}
                </span>
                {copied ? 'Copied!' : 'Copy Markdown'}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5 transition-all"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                New file
              </button>
            </div>
          </div>

          {/* Markdown output */}
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border overflow-hidden">
            {result.markdown ? (
              <pre className="p-6 text-sm text-foreground/80 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
                {result.markdown}
              </pre>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-foreground/40">
                <span className="material-symbols-outlined text-3xl">text_fields</span>
                <p className="text-sm">No text found in document</p>
              </div>
            )}
          </div>

          {/* Model badge */}
          <p className="mt-2 text-right text-xs text-foreground/30">
            via {result.model}
          </p>
        </div>
      )}
    </div>
  )
}

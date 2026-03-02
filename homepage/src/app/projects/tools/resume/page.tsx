'use client'

import { DragEvent, useMemo, useState } from 'react'

export default function ResumeUploaderPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const helperText = useMemo(() => {
    if (!file) return 'Drop a PDF here or choose a file.'
    if (file.size < 1024) return `${file.name} (${file.size} B)`
    return `${file.name} (${Math.round(file.size / 1024)} KB)`
  }, [file])

  const onFileSelected = (selected: File | null) => {
    if (!selected) return
    if (selected.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      setFile(null)
      return
    }

    setError(null)
    setSuccess(null)
    setFile(selected)
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    onFileSelected(event.dataTransfer.files?.[0] ?? null)
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/tools/resume', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setSuccess('Resume updated. The homepage Resume button now uses the latest PDF.')
      setFile(null)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-medium text-foreground blur-reveal">Resume Uploader</h1>
        <p className="text-sm text-foreground/50 mt-1 blur-reveal-1">
          Drag and drop your latest resume PDF. It replaces the S3 file used by the homepage Resume button.
        </p>
      </div>

      <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-5 space-y-4 blur-reveal-2">
        <label
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`block rounded-2xl border border-dashed p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-foreground/40 bg-foreground/10' : 'border-foreground/20 bg-foreground/[0.03]'
          }`}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
          />
          <span className="material-symbols-outlined text-4xl text-foreground/40">picture_as_pdf</span>
          <p className="mt-2 text-sm text-foreground/60">{helperText}</p>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">
              {isUploading ? 'progress_activity' : 'upload_file'}
            </span>
            {isUploading ? 'Uploading…' : 'Upload Resume'}
          </button>
          <a
            href="/api/resume"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground/60 hover:text-foreground/80 transition-colors"
          >
            Open current resume
          </a>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
            {success}
          </p>
        )}
      </div>
    </div>
  )
}

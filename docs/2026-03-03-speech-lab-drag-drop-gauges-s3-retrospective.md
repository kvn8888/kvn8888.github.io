# Building a Real Speech Lab: Drag & Drop, Video Transcription, S3 Persistence, and SVG Score Gauges

I had a functional Speech Lab — TTS, STT, and pronunciation assessment all worked. But the gap between "works in a demo" and "tool I'd actually ship" was wide. This session closed that gap across four dimensions: file handling UX, keyboard ergonomics, data persistence, and visual feedback design.

If you're an intern or new grad building portfolio projects with AI APIs, this is the playbook for turning a "calls the API" prototype into something that feels production-grade.

## The Problem Space

The starting point had three issues that compound in real usage:

1. **File upload was a hidden `<input type="file">`**. Users had to click a label, navigate a file picker, find their audio file. No drag-and-drop, no video support, no visual feedback.
2. **TTS had no keyboard shortcut**. You type a paragraph, reach for the mouse, click Generate. Repeat 50 times while testing voices. Death by a thousand clicks.
3. **Generated audio disappeared on page reload**. History metadata was saved to Turso, but the actual audio bytes weren't persisted anywhere.
4. **Pronunciation scores were flat numbers in colored boxes**. Accurate, but not intuitive. You had to mentally map "73" to "okay but not great."

## Step 1: Drag & Drop with Client-Side Video-to-Audio Extraction

The transcription service accepts audio files. But half the content people want to transcribe lives in video files — screen recordings, lecture captures, meeting clips. The standard approach would be server-side ffmpeg, but that adds a binary dependency, increases server costs, and means uploading large video files over the network just to throw away the video track.

Instead, I used the browser's built-in media pipeline:

```typescript
function extractAudioFromVideo(videoFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.src = URL.createObjectURL(videoFile)

    video.onloadedmetadata = () => {
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      const dest = audioCtx.createMediaStreamDestination()
      const source = audioCtx.createMediaElementSource(video)
      source.connect(dest)

      const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' })
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))

      recorder.start()
      video.play()
      video.onended = () => recorder.stop()
    }
  })
}
```

The technique: create an off-screen `<video>` element, route its audio through `AudioContext` → `MediaStreamDestination` → `MediaRecorder`. The browser decodes the video, we capture only the audio stream, and the result is a WebM blob ready for transcription.

**Trade-offs to know:**
- This plays the video at 1x speed in the background. A 10-minute video takes 10 minutes to extract. For long content, server-side ffmpeg would be faster.
- `muted = true` + `playsInline = true` are required for autoplay policies.
- I added a 10-minute safety timeout to prevent runaway recordings.
- Works in Chrome, Firefox, Edge. Safari has partial `MediaRecorder` support but handles WebM.

The drag-and-drop zone itself uses standard React drag events with visual feedback:

```tsx
<div
  onDrop={handleDrop}
  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
  onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
  className={`border-2 border-dashed rounded-2xl p-8 transition-all ${
    dragOver ? 'border-foreground/40 bg-foreground/[0.06] scale-[1.01]' : '...'
  }`}
>
```

The `scale-[1.01]` on drag-over is a small touch that makes the drop target feel responsive without being distracting.

### What I'd do differently

For production, I'd add a progress indicator during video extraction (the `timeupdate` event on the video element gives you elapsed/total). I'd also consider Web Workers for the AudioContext processing to keep the main thread free.

## Step 2: Cmd/Ctrl+Enter for TTS (The Smallest Change with the Biggest Impact)

This was six lines of code:

```tsx
<textarea
  onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleGenerate()
    }
  }}
/>
<p className="text-xs text-foreground/30">
  {text.length} / 4096 · ⌘/Ctrl+Enter to generate
</p>
```

Two decisions worth noting:
1. **`e.preventDefault()`** stops the textarea from inserting a newline.
2. **The hint text is inline with the character count**, not a separate tooltip or modal. Users see it immediately without searching.

This pattern — `(metaKey || ctrlKey) + Enter` — works cross-platform: Cmd+Enter on Mac, Ctrl+Enter on Windows/Linux.

### Why this matters for your portfolio

Keyboard shortcuts are the difference between a demo and a tool. If your project has a form that users submit repeatedly, add this pattern. It takes 2 minutes and signals that you think about UX beyond the happy path.

## Step 3: Gemini Summarization + S3 Audio Persistence

The existing history saved metadata to Turso (modality, title, timestamp) but used a hardcoded title like "TTS · Gacrux". For a history list, that's useless — you can't tell entries apart.

The fix: call Gemini 2.0 Flash to generate a one-sentence summary of the input text, then use that as the history title.

```typescript
async function summarizeText(apiKey: string, text: string): Promise<string | null> {
  if (text.length < 40) return null
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Summarize the following text in one short sentence (max 120 chars). Return only the summary:\n\n${text}`
          }]
        }]
      })
    }
  )
  // ...
}
```

For audio persistence, I chose S3 because `@aws-sdk/client-s3` was already a dependency (used by the resume uploader), and the pattern is simple:

```typescript
async function uploadToS3(wavBuffer: Buffer, key: string): Promise<string | null> {
  const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
  await client.send(new PutObjectCommand({
    Bucket: process.env.SPEECH_S3_BUCKET,
    Key: key,
    Body: wavBuffer,
    ContentType: 'audio/wav',
  }))
  return `s3://${bucket}/${key}`
}
```

Both operations run in parallel with `Promise.all` and are best-effort — if S3 is down or the summary API fails, the TTS response still returns the audio. The response shape extends gracefully:

```json
{
  "audio": "base64...",
  "mimeType": "audio/L16;rate=24000;channels=1",
  "summary": "A greeting about the weather in Portland",
  "storageUrl": "s3://speech-bucket/speech/tts/1709424181000-Gacrux.wav"
}
```

**Architecture decision: why not Azure Blob Storage?**

Three reasons: (1) S3 SDK was already installed, (2) the existing AWS credentials could be reused, (3) S3's pricing model is simpler for small-scale storage. Azure Blob Storage would work identically — swap `PutObjectCommand` for `BlockBlobClient.upload()` — but adding a new SDK for one feature isn't worth the dependency cost.

### Converting PCM to WAV for S3

The Gemini TTS API returns raw PCM (16-bit, 24kHz, mono). S3 stores bytes. But raw PCM without a WAV header is unplayable by most audio players. So I built a WAV wrapper server-side:

```typescript
function createWavBuffer(pcmBase64: string, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const pcm = Buffer.from(pcmBase64, 'base64')
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  // ... fmt + data subchunks
  return Buffer.concat([header, pcm])
}
```

The 44-byte WAV header is one of those things that looks intimidating but is actually just a fixed-format binary struct. Worth learning once.

## Step 4: Semi-Circle SVG Score Gauge

The pronunciation assessment returns scores (0-100) for accuracy, fluency, completeness, and an overall score. The previous UI showed these as colored number cards. The request was for a semi-circle gauge with red/yellow/green coloring and the score in the center.

I built this as a pure SVG component with zero dependencies:

```tsx
function SemiCircleGauge({ label, score, size = 160 }) {
  const radius = (size - 20) / 2
  const circumference = Math.PI * radius
  const progress = Math.min(Math.max(score, 0), 100) / 100

  const getColor = (s: number) =>
    s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={size} height={size / 2 + 16}>
      {/* Background arc */}
      <path
        d={`M 10 ${size/2+6} A ${radius} ${radius} 0 0 1 ${size-10} ${size/2+6}`}
        fill="none" stroke="currentColor" strokeWidth="10"
        className="text-foreground/[0.06]"
      />
      {/* Progress arc */}
      <path
        d={`M 10 ${size/2+6} A ${radius} ${radius} 0 0 1 ${size-10} ${size/2+6}`}
        fill="none" stroke={getColor(score)} strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      {/* Score text centered */}
      <text x={size/2} y={size/2 - 2} textAnchor="middle"
        style={{ fontSize: size/5, fontWeight: 600 }}>
        {Math.round(score)}
      </text>
    </svg>
  )
}
```

**The key technique**: SVG arc paths with `strokeDasharray` and `strokeDashoffset`. The total dash length equals the arc's circumference (π × radius for a semicircle). Setting `strokeDashoffset` to `circumference * (1 - progress)` reveals the exact proportion of the arc.

**Color thresholds**:
- **Green** (#10b981, emerald-500): ≥80 — good pronunciation
- **Yellow** (#f59e0b, amber-500): 50-79 — needs practice
- **Red** (#ef4444, red-500): <50 — significant issues

The 0.8s CSS transition on `strokeDashoffset` creates a smooth fill animation when results load.

### Layout decision

The overall score uses the large semi-circle gauge (180px). Sub-scores (accuracy, fluency, completeness, prosody) remain as compact colored cards in a 4-column grid. This creates a clear visual hierarchy: one big number you care about most, with details below.

## Step 5: API Limits Display

Each panel now has a collapsible "API Limits & Info" section showing:
- Maximum file sizes and formats
- Rate limits (free vs. paid tiers)
- Output format details

This is intentionally implemented as a `<details>` element — visible to power users who want it, hidden by default to keep the interface clean.

## What I Learned

1. **Browser media APIs are underrated for audio processing.** `AudioContext` + `MediaRecorder` can replace ffmpeg for simple extraction tasks, with zero server-side dependencies.

2. **Best-effort async operations should never block the happy path.** Summary generation and S3 upload run in parallel and degrade gracefully. The TTS response returns audio even if both fail.

3. **SVG arc math is simpler than it looks.** A semicircle is just an arc path with `strokeDasharray`. The hardest part is remembering that SVG's Y-axis is inverted.

4. **Small UX details compound.** Cmd+Enter, drag feedback with `scale-[1.01]`, character count with shortcut hint — individually trivial, collectively the difference between a prototype and a tool.

## How to Build This Yourself

If you're starting from scratch:

1. **Start with the API routes.** Get TTS, STT, and pronunciation working as simple POST endpoints before building any UI.
2. **Add the panels one at a time.** Each panel is a self-contained React component with its own state. No shared state management needed.
3. **Use Turso (or any SQLite-compatible DB) for history.** The schema is 7 columns. Don't overthink it.
4. **Add S3 last.** It's optional and the app works without it. Use `SPEECH_S3_BUCKET` as an opt-in flag.
5. **Build the SVG gauge from the math, not a library.** It's 30 lines of code. Libraries like recharts or d3 would add 100KB+ for a component this simple.

The full diff is ~400 lines across 3 files. Most of that is JSX for the drag-and-drop zone and model selector grid. The actual logic — video extraction, S3 upload, SVG math — is surprisingly compact.

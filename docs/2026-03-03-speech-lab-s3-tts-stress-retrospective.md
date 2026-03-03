## Speech Lab shipping notes — drag/drop STT, S3-backed TTS, and stress probes

**Why this matters (HN bait):** We took a toy speech playground and hardened it like a production tool: video-to-audio ingestion with zero extra installs, TTS outputs summarized by Gemini 3.0 and persisted to S3, a visual gauge for pronunciation quality, and a built-in stress probe you can run from the browser. Everything fits in the existing Next.js/Tailwind stack—no new dependencies.

### What shipped
- Drag-and-drop transcription now accepts audio or video; videos are re-encoded to audio in-browser via `captureStream + MediaRecorder` before hitting STT, keeping provider payloads clean.
- Gemini 2.5 TTS responses are summarized with `gemini-3.0-flash-preview-01`; audio is wrapped in WAV headers and pushed to S3 when configured, and history entries carry the summary + storage URL.
- A Limits & Reliability card surfaces quotas and a one-click TTS stress test (3 rapid POSTs with timing + failure counts).
- Pronunciation scoring moved to a semicircle gauge with color-coded thresholds (red/amber/green) and the score centered in the arc.

### How to reproduce this in your own project
1) **Video → audio without ffmpeg:** use `video.captureStream()` to pluck audio tracks, feed them to `MediaRecorder`, and ship the resulting WebM blob to your STT API. Keep a 25MB guard to avoid blocking conversions.  
2) **Summarize before you log:** after TTS generation, call Gemini 3.0 Flash with a tight prompt and low token cap (60 words) to store intent-focused summaries instead of raw text.  
3) **Persist audio cheaply:** wrap PCM in a WAV header server-side and `PutObject` to S3 using a scoped prefix (e.g., `speech/{timestamp}-{uuid}.wav`). Expose a `SPEECH_S3_PUBLIC_URL` to generate clickable history links without signing URLs.  
4) **Bake in health checks:** a tiny “stress test” button that fires a burst of TTS calls surfaces latency and key/limit issues without touching the terminal.  
5) **Visualize quality:** semicircle gauges are easy with `conic-gradient(from 180deg, ...)` and an overflow-hidden container—perfect for pronunciation scores where 0–100 maps to red/amber/green.

### Operational notes for interns/new grads
- Set `SPEECH_S3_BUCKET`, `SPEECH_S3_PREFIX`, and `SPEECH_S3_PUBLIC_URL` alongside the existing AWS creds; no new SDKs required.
- The stress probe is intentionally light (3 calls) to avoid burning quotas; tweak the loop count if you need heavier load.
- History stays capped at the 100 most recent entries per user via Turso—metadata now includes TTS summaries, voice, and storage pointers.
- If lint barks about config cycles, tackle ESLint config separately; it’s unrelated to the speech stack changes.

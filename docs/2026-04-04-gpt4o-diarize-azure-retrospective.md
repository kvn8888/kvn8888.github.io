# From "Audio File Corrupted" to 816 Segments in 5 Minutes: Getting gpt-4o-transcribe-diarize Working on Azure

I had an 84-minute recording of a Neo4j talk sitting in iCloud and wanted to see what Azure's new `gpt-4o-transcribe-diarize` model could do with it. What I expected to be a 10-minute experiment turned into a two-hour debugging loop that taught me more about multipart form serialization, Azure's divergence from OpenAI's API, and the surprising performance ceiling ceiling of the preview model than I bargained for — but ended with a 5-minute transcription yielding 816 labeled speaker segments.

---

## The Starting Point

Azure OpenAI has three transcription deployments in this environment:
- `gpt-4o-transcribe` — standard transcription
- `gpt-4o-mini-transcribe` — cheaper, faster
- `gpt-4o-transcribe-diarize` — **speaker-labeled transcription** (the interesting one)

The goal: feed in a long multi-speaker recording and get back a transcript with `[Speaker A]`, `[Speaker B]` labels and timestamps for each speaker turn.

The source file: `10-03-41.m4a` — 39MB, 84.5 minutes, 64kbps AAC from Just Press Record on iPhone.

---

## Step 1: The 400 Error That Started Everything

The first attempt used the OpenAI Python SDK directly:

```python
from openai import AzureOpenAI

client = AzureOpenAI(...)
with open("10-03-41.m4a", "rb") as f:
    result = client.audio.transcriptions.create(
        model=deployment,
        file=f,
        response_format="verbose_json",
    )
```

**Error:** `HTTP 400: Audio file might be corrupted or unsupported format`

The file wasn't corrupted — it's a perfectly valid m4a. The real issue: the file is 39MB, and Azure's limit is 25MB per request. A little ffmpeg later:

```bash
ffmpeg -i "10-03-41.m4a" -ac 1 -ar 16000 -b:a 32k /tmp/diarize_test.mp3
```

This produced a 19MB mono 32kbps mp3. Same error.

At this point I suspected the issue might be duration rather than file size — at 84 minutes, maybe there's a ceiling I wasn't aware of. But before going down that path, I had a different error to deal with.

---

## The Gotcha #1: `chunking_strategy is required for diarization models`

Switching to `response_format="diarized_json"` (the format that actually returns speaker labels) revealed the next wall:

```
400: chunking_strategy is required for audio files longer than 30 seconds for diarization models.
```

Fair enough. The OpenAI docs say:
> Set `chunking_strategy` (either `"auto"` or a Voice Activity Detection configuration)

So I added it using `extra_body`:

```python
result = client.audio.transcriptions.create(
    model=deployment,
    file=f,
    response_format="diarized_json",
    extra_body={"chunking_strategy": {"type": "auto"}}
)
```

Still **`400: chunking_strategy is required`**.

The `extra_body` parameter in the OpenAI SDK is designed to pass JSON fields that the SDK doesn't natively support. But it only works for JSON-encoded requests — and audio transcription is a `multipart/form-data` request. The `chunking_strategy` field gets silently dropped during form serialization, so Azure never sees it.

---

## The Gotcha #2: "auto" is not a valid chunking strategy for Azure

Once I switched to raw `requests.post` to actually get `chunking_strategy` into the multipart body:

```python
import json, requests

resp = requests.post(
    f"{endpoint}/openai/deployments/{deployment}/audio/transcriptions"
    f"?api-version=2025-03-01-preview",
    headers={"api-key": api_key},
    files={"file": ("audio.mp3", f, "audio/mpeg")},
    data={
        "response_format": "diarized_json",
        "chunking_strategy": json.dumps({"type": "auto"}),  # ← note json.dumps
    },
    timeout=300,
)
```

New error: `HTTP 400: Invalid value: 'auto'. Value must be 'server_vad'.`

The OpenAI docs say `"auto"` is valid. Azure doesn't support it — you must use `"server_vad"` explicitly:

```python
"chunking_strategy": json.dumps({"type": "server_vad"}),
```

With this change, the 1-minute test clip (235KB) returned `HTTP 200` with 78 segments.

---

## Step 2: The Full-File Problem

So the short clip works. What about the full 19MB 84-minute file?

Same `HTTP 400: Audio file might be corrupted or unsupported` as before.

I'm guessing the issue is duration, not file size. To verify, I made a 10-minute clip:

```bash
ffmpeg -i "10-03-41.m4a" -t 600 -ac 1 -ar 16000 -b:a 32k /tmp/diarize_10min.mp3
```

That worked — 78 segments, 3-4 minutes runtime.

The full file doesn't. The 10-minute clip does. This points to a server-side duration limit on the `gpt-4o-transcribe-diarize` preview model that's lower than the documented 25MB file size limit. Chunking is the only path forward.

---

## Step 3: Sequential Chunking

The first approach was sequential: split the full file into 10-minute chunks, transcribe each one, stitch the segments back together with time offsets:

```python
# Core loop
for i in range(n_chunks):
    start = i * 600  # seconds
    # ffmpeg: -ss {start} -t 600 → chunk_i.mp3
    segments = transcribe_chunk(chunk_path, offset_sec=start)
    for seg in segments:
        seg["start"] += start  # absolute timestamp
        seg["end"]   += start
    all_segments.extend(segments)
```

The full run completed — 810 segments, 10 unique speakers across the 84-minute recording. But wallclock time was alarming: **each 10-minute chunk took 5-10 minutes** to get a response from Azure. Sequential total: ~50 minutes.

Two observations from this run:

1. **Double-compression degrades things.** The chunks were extracted from the already-compressed 19MB mp3 (itself converted from the m4a). That's a 32kbps→32kbps re-encode — you're compressing compressed audio. The quality loss makes the voice activity detector work harder.

2. **Preview model is slow under load.** After sending many requests in rapid succession, Azure seemed to queue/throttle. The first few chunks returned faster than later ones.

---

## Step 4: Parallel Chunking

The fix for speed was obvious: parallelize. Azure will happily process multiple independent chunk requests simultaneously, and since each chunk is independent (it doesn't need results from the previous one to start), this is embarrassingly parallel.

I rewrote the script using `concurrent.futures.ThreadPoolExecutor`:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

with ThreadPoolExecutor(max_workers=4) as pool:
    futures = {
        pool.submit(transcribe_chunk, chunk_path, offset_sec, idx, ...): idx
        for idx, (chunk_path, offset_sec) in enumerate(chunks)
    }
    for future in as_completed(futures):
        chunk_idx, segments, timing = future.result()
        results[chunk_idx] = (segments, timing)

# Sort by timestamp after all chunks complete
all_segments.sort(key=lambda s: s.get("start", 0.0))
```

The key design decisions:
- **4 workers**: stays below the Azure deployment's observed rate limit
- **2-second stagger**: each worker starts 2 seconds after the previous one to avoid burst rate-limit pressure
- **Sorted final merge**: since futures complete out of order, sort by absolute `start` time before output
- **Chunk caching**: chunks saved to `/tmp/diarize_chunks_src/` and reused on reruns (not a temp directory)

Also important: the parallel version extracts chunks **directly from the original .m4a** instead of from the pre-converted mp3. One transcoding step instead of two.

**Result:** 816 segments, 8 speakers, **5.3 minutes total** — roughly 10x faster than sequential.

Per-chunk breakdown:

| Chunk | Offset | Duration | Segments | Time |
|-------|--------|----------|----------|------|
| 000 | 0 min | 10 min | 78 | 131s |
| 001 | 10 min | 10 min | 120 | 150s |
| 002 | 20 min | 10 min | 86 | 144s |
| 003 | 30 min | 10 min | 83 | 125s |
| 004 | 40 min | 10 min | 70 | 140s |
| 005 | 50 min | 10 min | 66 | 117s |
| 006 | 60 min | 10 min | 71 | 138s |
| 007 | 70 min | 10 min | 164 | 135s |
| 008 | 80 min | 4.5 min | 78 | 56s |

Chunk 7 had 164 segments — clearly the most active discussion part of the talk.

---

## The Revision: Per-Chunk Speaker Labels Are Local, Not Global

One important caveat: speaker labels are **per-chunk**. "Speaker A" in chunk 0 and "Speaker A" in chunk 7 are not necessarily the same person. The diarization model processes each chunk independently — it doesn't know anything about speakers from previous chunks.

This is visible in the output: some chunks have speakers labeled A and B, others have A, B, C, D. The model detects however many distinct voices it finds within that 10-minute window and labels them locally.

If you need globally consistent speaker IDs across the whole recording, you'd need to either:
1. Use the `known_speaker_references` API feature (supply short reference audio clips per person, up to 4)
2. Post-process: cluster speaker embeddings and re-align labels across chunks

For most use cases (Q&A attribution, summary generation, search), local labels within a chunk are sufficient.

---

## What I Got Right and Wrong

**Got right:**
- Switching to raw `requests.post` instead of wrestling with SDK abstraction for a multipart/form-data endpoint
- Using `json.dumps()` to serialize `chunking_strategy` as a form data string (not a dict — that would be `data={"chunking_strategy": {"type":"server_vad"}}` which Python's `requests` would encode wrong)
- Chunk caching — on a 9-chunk rerun, ffmpeg re-encoding is skipped entirely
- Sorting segments by absolute timestamp after parallel merge

**Got wrong:**
- Wasted time trying to debug the 19MB full-file failure by trying different file sizes, when the actual bottleneck was a server-side duration limit
- First sequential implementation extracted chunks from the already-compressed mp3 (double-compression), which made the VAD slower. Should have always sourced from the original m4a.
- The `# `@`` speaker label appearing in the output is likely a transcription artifact for inaudible/background audio — worth filtering in post-processing

---

## The Working Pattern (Copy This)

```python
"""
Azure OpenAI gpt-4o-transcribe-diarize — minimum working example.
API version: 2025-03-01-preview
chunking_strategy MUST be {"type":"server_vad"} — "auto" is REJECTED by Azure.
Use raw requests.post — extra_body in OpenAI SDK doesn't serialize for multipart.
"""
import json, requests
from pathlib import Path

endpoint   = "https://YOUR-RESOURCE.openai.azure.com"
api_key    = "YOUR-API-KEY"
deployment = "gpt-4o-transcribe-diarize"
api_ver    = "2025-03-01-preview"
url = f"{endpoint}/openai/deployments/{deployment}/audio/transcriptions?api-version={api_ver}"

audio = Path("clip.mp3")   # must be < 25MB; 10-min 32kbps mono ≈ 2.3MB
with audio.open("rb") as f:
    resp = requests.post(
        url,
        headers={"api-key": api_key},
        files={"file": (audio.name, f, "audio/mpeg")},
        data={
            "response_format": "diarized_json",
            "chunking_strategy": json.dumps({"type": "server_vad"}),
        },
        timeout=300,
    )

data = resp.json()
for seg in data.get("segments", []):
    print(f"[Speaker {seg['speaker']}] {seg['start']:.1f}s  {seg['text']}")
```

---

## What's Next

The transcription pipeline is working. The natural next step is integrating this into Speech Lab — the portfolio's existing transcription UI — with:

1. **Streaming output**: `gpt-4o-transcribe-diarize` supports `stream=True` which emits `transcript.text.segment` server-sent events as each segment finalizes. For long recordings, this is dramatically better UX than waiting 5 minutes for a complete result.

2. **Known speaker references**: The API accepts up to 4 reference audio clips (base64 data URLs) with names, which enables globally consistent labeling: `"Speaker A"` → `"Kevin"` across the entire recording.

3. **Cross-chunk speaker alignment**: A post-processing pass that extracts speaker embeddings and clusters them across chunks would solve the per-chunk-local-label problem without requiring reference clips.

---

The model took a lot of coaxing — three distinct `400` errors before the first successful request, a 10x speedup hiding in simple parallelization, and an Azure quirk that contradicts the official OpenAI docs. But 816 labeled speaker segments from an 84-minute cold recording in 5 minutes is genuinely impressive.

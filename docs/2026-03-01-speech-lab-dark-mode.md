# Speech Lab + Dusk Dark Mode — From Tools to Themes

What started as "add a text-to-speech page" turned into restructuring the project navigation, building three API proxy routes, implementing a full dark mode system, and bikeshedding blob border-radius values. A typical Saturday.

## The Starting Point

The portfolio site had a project hub at `/projects` with cards for each tool. Speech features (TTS, STT, pronunciation scoring) were on the roadmap but had no home. The site was also light-mode only — fine for a resume site, but bland for something meant to show off engineering taste.

## Step 1: Speech API Proxies

Three new API routes, each proxying a different AI service:

- **`/api/speech/tts`** — Google's Gemini 2.5 Flash for text-to-speech. The interesting bit: Gemini returns raw PCM audio (L16/24000Hz), so the client has to manually construct a WAV header to make it playable in `<audio>`:

```typescript
const wavHeader = new ArrayBuffer(44)
const view = new DataView(wavHeader)
view.setUint32(0, 0x52494646, false) // "RIFF"
view.setUint32(4, 36 + dataLength, true)
// ... 44 bytes of WAV spec
```

- **`/api/speech/stt`** — Mistral's Voxtral for transcription. Supports two models: batch (cheaper, ~2602 vintage) and realtime (streaming). The API expects multipart form data, not JSON — caught me off guard since most AI APIs are JSON-first.

- **`/api/speech/pronunciation`** — Azure's Speech SDK for pronunciation scoring. The most complex of the three: you send a WAV file plus a reference text, and get back per-word accuracy scores, fluency metrics, and even per-phoneme breakdowns. The `Pronunciation-Assessment` header takes a Base64-encoded JSON config, which is one of those API designs that makes you wonder about the committee meeting.

## Step 2: The Tools Hub

The Speech Lab started as a card on the main projects page. But the user (me) realized it belongs under a "Tools" umbrella — there'll be more utilities. So the nav restructured:

```
/projects          → hub (Usage Monitor, Tools, Dashboard, Notes)
/projects/tools    → tools hub (Speech Lab, future utilities)
/projects/tools/speech → Speech Lab with 3 tabs
```

The key insight: Next.js App Router makes this trivial. Moving a page is literally `mv speech/ tools/speech/`. No route config files, no manifest updates, no webpack aliases. Just filesystem.

## Step 3: Staggered Blur Reveal

The homepage had a nice effect where elements unblur sequentially — heading first, then subtitle, then cards, each 100ms apart. The project pages didn't have this. Adding it meant:

- Server components: just add `blur-reveal-N` CSS classes directly
- Client components: use the `mounted` state trick for Safari compat:

```tsx
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])
<h1 className={mounted ? 'blur-reveal' : 'opacity-0'}>
```

Without the mounted trick, Safari caches the final animation state on page refresh and skips the animation entirely.

## Step 4: Dusk Dark Mode

The dark mode wasn't going to be "invert the colors." The design direction: a dusk/sunset theme — deep warm-black background with amber and gold aurora blobs suggesting a setting sun, plus a violet blob for the darkening sky above.

**CSS variable system:**
```css
:root {
  --glass: rgba(255, 255, 255, 0.6);    /* frosted white */
}
.dark {
  --glass: rgba(0, 0, 0, 0.4);          /* frosted dark */
  --background: #0d0a08;                 /* warm black, not pure black */
}
```

Every `bg-white/60` in the codebase became `bg-glass`. Every `text-gray-500` became `text-foreground/50`. This was the tedious but necessary work — about 40+ class replacements across 10 files.

**The aurora blobs got organic shapes.** The original blobs were perfect circles (`border-radius: 50%`). The new ones use asymmetric border-radius that morphs between shapes over the 20-second animation cycle:

```css
border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%;
```

Think macOS Ventura wallpaper or Windows 11 — abstract, flowing, not geometric.

**Progressive blur** adds depth: bottom blobs (near the "horizon") are sharper (60px blur), middle blobs use standard 80px, and the top blob (dark sky) dissolves at 120px. This creates a natural gradient from defined warmth at the bottom to abstract darkness at the top.

**Noise overlay** at 3% opacity adds subtle grain texture via an inline SVG fractalNoise filter. Invisible in light mode, barely visible in dark, but it prevents the background from feeling flat.

## The Gotcha: Flash of White

The theme toggle worked, but switching to dark mode and refreshing showed a brief white flash. Classic SSR hydration problem.

**Symptom:** Page loads white for ~100ms, then snaps to dark.

**Root cause:** The `ThemeProvider` component initialized with `useState('system')` as default. Even though an inline `<script>` tag in `<head>` set `.dark` on `<html>` before paint, React's hydration would briefly reconcile with the default state and remove the class.

**Fix:** Initialize state from `localStorage` and `classList` directly in the `useState` initializer (using a function to avoid SSR issues):

```tsx
const [theme, setThemeState] = useState<Theme>(() => {
  if (typeof window === 'undefined') return 'system'
  return localStorage.getItem('theme') as Theme || 'system'
})
```

This way the ThemeProvider's first render already matches what the inline script set. No flash.

## What's Next

- The Speech Lab tabs are built but untested with live API keys — need to add `GEMINI_API_KEY`, `MISTRAL_API_KEY`, and `AZURE_SPEECH_KEY` to Vercel
- The dark mode status colors (red warnings, emerald success) have CSS overrides but could use proper design tokens
- The homepage theme toggle is useful but barely discoverable — might need a tooltip or onboarding hint

---

The blob shapes were the most fun part. There's something deeply satisfying about tweaking `border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%` and watching CSS do what used to require a GPU shader.

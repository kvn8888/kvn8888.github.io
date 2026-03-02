# Environment Variables & Deployment

## Environment Variables

All set in `.env.local` (local) and Vercel dashboard (production).

### Required

| Variable | Description |
| --- | --- |
| `AUTH_SECRET` | Random string for JWT encryption. Generate with `npx auth secret` |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID from Cloud Console |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_TRUST_HOST` | Set to `true` for Vercel (lets Auth.js infer host from request) |
| `ALLOWED_EMAILS` | Comma-separated email whitelist (e.g. `user@gmail.com,other@gmail.com`) |

### Optional (API Monitoring)

| Variable | Description |
| --- | --- |
| `TAVILY_API_KEY` | Tavily API key for usage monitoring (`tvly-...`) |
| `VERCEL_API_TOKEN` | Vercel personal access token for billing API |
| `RENDER_API_KEY` | Render API key for services monitoring |

### Optional (Speech Lab)

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | Gemini TTS key (`/api/speech/tts`) |
| `MISTRAL_API_KEY` | Mistral Voxtral transcription key (`/api/speech/stt`) |
| `OPENAI_API_KEY` | OpenAI transcription key for GPT-4o audio model options |
| `AZURE_SPEECH_KEY` | Azure Speech key for pronunciation assessment |
| `AZURE_SPEECH_REGION` | Azure Speech region (e.g. `eastus`) |
| `TURSO_DATABASE_URL` | Turso/libSQL database URL for Speech Lab history |
| `TURSO_AUTH_TOKEN` | Turso auth token for Speech Lab history writes/reads |

## Google OAuth Setup

Registered callback URIs in Google Cloud Console:

- `http://localhost:3000/api/auth/callback/google`
- `https://kevinc.dev/api/auth/callback/google`
- `https://kevin-chen.dev/api/auth/callback/google`
- `https://k3vnc.dev/api/auth/callback/google`

Add new domains here if additional CNAMEs are configured.

## Vercel Deployment

- Project deploys from `dia-design` branch
- SSR mode (not static export)
- Set all required env vars in Vercel Dashboard → Project Settings → Environment Variables
- `AUTH_TRUST_HOST=true` is critical for production auth to work

## GitHub Pages (Legacy)

- `main` branch deploys static export via GitHub Actions
- Only used as fallback — primary deployment is Vercel

## External APIs

### Tavily

- Endpoint: `GET https://api.tavily.com/usage`
- Auth: `Authorization: Bearer <TAVILY_API_KEY>`
- Returns: `{ key: { usage, limit, ... }, account: { current_plan, plan_usage, plan_limit, ... } }`

### Vercel

- Endpoint: `GET https://api.vercel.com/v1/billing/charges`
- Auth: `Authorization: Bearer <VERCEL_API_TOKEN>`
- Returns FOCUS v1.3 JSONL. May return empty for Hobby plans — app falls back to known limits.

### Render

- Endpoint: `GET https://api.render.com/v1/services?limit=20`
- Auth: `Authorization: Bearer <RENDER_API_KEY>`
- Returns: `[{ service: { id, name, type, ... } }]`

## Notes

- `.env*` files are gitignored
- `docs/` directory is gitignored (local retrospectives only)
- `next.config.ts` allows Google profile images from `lh3.googleusercontent.com`

// Single source of truth for the runtime secrets UI.
// Keep this list aligned with homepage/.env.example and with routes that use getSecret().

export interface ManagedSecretField {
  key: string
  description: string
}

export interface ManagedSecretGroup {
  label: string
  icon: string
  keys: ManagedSecretField[]
}

export const MANAGED_SECRET_GROUPS: ManagedSecretGroup[] = [
  {
    label: 'Google / Gemini',
    icon: 'acute',
    keys: [
      { key: 'GEMINI_API_KEY', description: 'Gemini TTS, cover letter analysis, and job parsing' },
      { key: 'GCP_SERVICE_ACCOUNT_KEY', description: 'Chirp 3 TTS (base64 JSON service account)' },
      { key: 'GCP_BILLING_EXPORT_PROJECT_ID', description: 'BigQuery billing export project ID' },
      { key: 'GCP_BILLING_EXPORT_DATASET', description: 'BigQuery billing export dataset name' },
    ],
  },
  {
    label: 'Mistral',
    icon: 'wind_power',
    keys: [
      { key: 'MISTRAL_API_KEY', description: 'Voxtral STT transcription and Mistral usage monitoring' },
    ],
  },
  {
    label: 'Azure',
    icon: 'cloud',
    keys: [
      { key: 'AZURE_SPEECH_KEY', description: 'Speech Service pronunciation assessment' },
      { key: 'AZURE_SPEECH_REGION', description: 'Speech Service region (for example eastus)' },
      { key: 'AZURE_OPENAI_API_KEY', description: 'Azure OpenAI STT key' },
      { key: 'AZURE_OPENAI_ENDPOINT', description: 'Azure OpenAI endpoint URL' },
      { key: 'AZURE_OPENAI_API_VERSION', description: 'Azure OpenAI transcription API version' },
      { key: 'AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE', description: 'Deployment name for gpt-4o-transcribe' },
      { key: 'AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_TRANSCRIBE_DIARIZE', description: 'Deployment name for gpt-4o-transcribe-diarize' },
      { key: 'AZURE_OPENAI_STT_DEPLOYMENT_GPT4O_MINI_TRANSCRIBE', description: 'Deployment name for gpt-4o-mini-transcribe' },
      { key: 'AZURE_TENANT_ID', description: 'Azure AD tenant ID for billing access' },
      { key: 'AZURE_CLIENT_ID', description: 'Azure app client ID for billing access' },
      { key: 'AZURE_CLIENT_SECRET', description: 'Azure app client secret for billing access' },
      { key: 'AZURE_SUBSCRIPTION_ID', description: 'Azure subscription ID for cost management' },
      { key: 'AZURE_BILLING_ACCOUNT_ID', description: 'Azure billing account ID' },
      { key: 'AZURE_BILLING_PROFILE_ID', description: 'Azure billing profile ID' },
    ],
  },
  {
    label: 'AWS / S3',
    icon: 'database',
    keys: [
      { key: 'AWS_REGION', description: 'AWS region used for S3-backed resume and speech storage' },
      { key: 'AWS_ACCESS_KEY_ID', description: 'AWS access key ID for S3 operations' },
      { key: 'AWS_SECRET_ACCESS_KEY', description: 'AWS secret access key for S3 operations' },
      { key: 'RESUME_S3_BUCKET', description: 'S3 bucket that stores the public resume PDF' },
      { key: 'RESUME_S3_KEY', description: 'Resume object key override (defaults to resume.pdf)' },
      { key: 'RESUME_S3_PUBLIC_URL', description: 'Optional public URL that bypasses direct S3 links' },
      { key: 'SPEECH_S3_BUCKET', description: 'Optional S3 bucket for Speech Lab audio history' },
    ],
  },
  {
    label: 'Email / Auth',
    icon: 'mail',
    keys: [
      { key: 'RESEND_API_KEY', description: 'Resend email delivery for verification codes and usage checks' },
      { key: 'AUTH_EMAIL_FROM', description: 'From address for verification emails' },
    ],
  },
  {
    label: 'Usage Monitoring',
    icon: 'monitoring',
    keys: [
      { key: 'GITHUB_PAT', description: 'GitHub billing API for Codespaces and Copilot usage' },
      { key: 'GITHUB_USERNAME', description: 'GitHub username for personal billing endpoints' },
      { key: 'TAVILY_API_KEY', description: 'Tavily search and usage' },
      { key: 'OPENROUTER_API_KEY', description: 'OpenRouter credit usage' },
      { key: 'RENDER_API_KEY', description: 'Render services and bandwidth usage' },
      { key: 'REPLICATE_API_TOKEN', description: 'Replicate account status and usage checks' },
      { key: 'VERCEL_API_TOKEN', description: 'Vercel billing API and env sync token' },
      { key: 'VERCEL_PROJECT_ID', description: 'Vercel project ID for env sync (preferred)' },
      { key: 'VERCEL_PROJECT_NAME', description: 'Vercel project name or slug for env sync (fallback)' },
      { key: 'VERCEL_TEAM_ID', description: 'Vercel team ID for env sync (optional)' },
      { key: 'VERCEL_TEAM_SLUG', description: 'Vercel team slug for env sync (optional)' },
      { key: 'ODDS_API_KEY', description: 'The Odds API usage' },
      { key: 'VENICE_API_KEY', description: 'Venice AI usage' },
      { key: 'TURSO_API_TOKEN', description: 'Turso usage API token' },
      { key: 'TURSO_ORG_SLUG', description: 'Turso organization slug' },
    ],
  },
  {
    label: 'Automation',
    icon: 'sync_alt',
    keys: [
      { key: 'SHEETS_WEBHOOK_URL', description: 'Optional Google Sheets webhook for job tracker dual writes' },
    ],
  },
]
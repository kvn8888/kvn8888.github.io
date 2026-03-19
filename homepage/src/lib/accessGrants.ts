// Central registry for all grantable protected areas.
// Each grant can unlock page routes, legacy aliases, and backing API prefixes together.
export interface AccessGrantOption {
  key: string
  label: string
  description: string
  hubPaths: readonly ('/projects' | '/tools')[]
  pathPrefixes: readonly string[]
}

export const ACCESS_GRANT_OPTIONS = [
  {
    key: 'usage-monitor',
    label: 'API Usage Monitor',
    description: 'Usage dashboard and its protected billing proxy APIs.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/usage', '/api/usage'],
  },
  {
    key: 'speech-studio',
    label: 'Speech Studio',
    description: 'TTS, transcription, history, and legacy speech lab route (excludes pronunciation).',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/speech-studio', '/projects/tools/speech', '/api/speech/tts', '/api/speech/stt', '/api/speech/history'],
  },
  {
    key: 'pronunciation-assessment',
    label: 'Pronunciation Assessment',
    description: 'Azure pronunciation assessment tool inside Speech Studio.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/api/speech/pronunciation'],
  },
  {
    key: 'cover-letter-workbench',
    label: 'Cover Letter Workbench',
    description: 'Workbench access plus the legacy cover letter tool and matching API.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/cover-letter-workbench', '/projects/tools/coverletter', '/api/coverletter'],
  },
  {
    key: 'job-tracker',
    label: 'Job Tracker',
    description: 'Job Tracker and the related job parsing and persistence APIs.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/job-tracker', '/projects/tools/resume-tool', '/api/jobs'],
  },
  {
    key: 'ocr',
    label: 'Document OCR',
    description: 'Mistral Document AI OCR page and its backing API.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/ocr', '/api/ocr'],
  },
  {
    key: 'vision',
    label: 'Vision',
    description: 'Interfaze vision page for image OCR and object detection.',
    hubPaths: ['/projects'],
    pathPrefixes: ['/projects/vision', '/api/vision'],
  },
  {
    key: 'sign-in-manager',
    label: 'Sign-In Manager',
    description: 'Approval queue UI, legacy logins page, and the login-admin API.',
    hubPaths: ['/tools'],
    pathPrefixes: ['/tools/sign-in-manager', '/projects/logins', '/api/logins'],
  },
  {
    key: 'project-dashboard',
    label: 'Project Dashboard',
    description: 'Internal project dashboard.',
    hubPaths: ['/tools'],
    pathPrefixes: ['/tools/project-dashboard'],
  },
  {
    key: 'notes',
    label: 'Notes',
    description: 'Private notes UI and note-management API.',
    hubPaths: ['/tools'],
    pathPrefixes: ['/tools/notes', '/api/notes'],
  },
  {
    key: 'runtime-secrets',
    label: 'Runtime Secrets',
    description: 'Secret override UI and the protected secrets API.',
    hubPaths: ['/tools'],
    pathPrefixes: ['/tools/secrets', '/api/secrets'],
  },
  {
    key: 'resume-uploader',
    label: 'Resume Uploader',
    description: 'Legacy resume uploader and its upload API.',
    hubPaths: [],
    pathPrefixes: ['/projects/tools/resume', '/api/tools/resume'],
  },
] as const satisfies readonly AccessGrantOption[]

export type AccessGrantKey = (typeof ACCESS_GRANT_OPTIONS)[number]['key']

const ACCESS_GRANT_OPTIONS_BY_KEY = new Map(
  ACCESS_GRANT_OPTIONS.map((option) => [option.key, option] as const)
)

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }

  return pathname
}

function matchesPrefix(pathname: string, pathPrefix: string) {
  const normalizedPathname = normalizePath(pathname)
  const normalizedPrefix = normalizePath(pathPrefix)

  return (
    normalizedPathname === normalizedPrefix ||
    normalizedPathname.startsWith(`${normalizedPrefix}/`)
  )
}

export function isAccessGrantKey(value: string): value is AccessGrantKey {
  return ACCESS_GRANT_OPTIONS_BY_KEY.has(value as AccessGrantKey)
}

export function normalizeAccessGrantKeys(grantKeys: readonly string[]): AccessGrantKey[] {
  const normalized = new Set<AccessGrantKey>()

  for (const grantKey of grantKeys) {
    if (isAccessGrantKey(grantKey)) {
      normalized.add(grantKey)
    }
  }

  return Array.from(normalized)
}

export function getGrantedOptions(grantKeys: readonly string[]) {
  return normalizeAccessGrantKeys(grantKeys)
    .map((grantKey) => ACCESS_GRANT_OPTIONS_BY_KEY.get(grantKey))
    .filter((option): option is (typeof ACCESS_GRANT_OPTIONS)[number] => Boolean(option))
}

export function canAccessPath(grantKeys: readonly string[], pathname: string) {
  const normalizedPathname = normalizePath(pathname)

  if (grantKeys.length === 0) {
    return true
  }

  const grantedOptions = getGrantedOptions(grantKeys)

  if (normalizedPathname === '/projects' || normalizedPathname === '/tools') {
    return grantedOptions.some((option) => {
      const hubPaths: readonly string[] = option.hubPaths
      return hubPaths.includes(normalizedPathname)
    })
  }

  return grantedOptions.some((option) =>
    option.pathPrefixes.some((pathPrefix) => matchesPrefix(normalizedPathname, pathPrefix))
  )
}

export function getDefaultAuthorizedRedirect(grantKeys: readonly string[], pathname: string) {
  const normalizedPathname = normalizePath(pathname)
  const grantedOptions = getGrantedOptions(grantKeys)
  const projectHubAvailable = grantedOptions.some((option) => {
    const hubPaths: readonly string[] = option.hubPaths
    return hubPaths.includes('/projects')
  })
  const toolsHubAvailable = grantedOptions.some((option) => {
    const hubPaths: readonly string[] = option.hubPaths
    return hubPaths.includes('/tools')
  })

  if (normalizedPathname.startsWith('/tools')) {
    return toolsHubAvailable ? '/tools' : projectHubAvailable ? '/projects' : '/'
  }

  if (
    normalizedPathname.startsWith('/api/logins') ||
    normalizedPathname.startsWith('/api/secrets') ||
    normalizedPathname.startsWith('/api/notes')
  ) {
    return toolsHubAvailable ? '/tools' : projectHubAvailable ? '/projects' : '/'
  }

  return projectHubAvailable ? '/projects' : toolsHubAvailable ? '/tools' : '/'
}
// Load the real TypeScript routes with only external auth/secrets replaced.
// All SQL runs against a temporary local libSQL database, never production.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createClient } = require('@libsql/client')
const root = path.resolve(__dirname, '..')
const key = 'test-only-'.repeat(8)
let session = null
let authConfig
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-api-'))
const db = createClient({ url: `file:${path.join(dir, 'jobs.db')}` })
const mocks = {
  '@/auth': { auth: async () => session },
  '@/lib/secrets': { getSecret: async name => name === 'JOBS_API_KEY' ? key : undefined },
  'next-auth': { __esModule: true, default: config => { authConfig = config; return {} } },
  'next-auth/providers/google': { __esModule: true, default: () => ({}) },
  '@/lib/db': { isEmailApproved: async () => false },
  '@/lib/accessGrants': { canAccessPath: () => false },
}
const cache = new Map()
function load(relative) {
  const filename = path.join(root, relative)
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  function resolve(name) {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    if (name.startsWith('.')) { const relative = path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)); const alias = '@/'+relative.replace(/^src\//,'').replace(/\.ts$/,''); return mocks[alias] || load(relative) }
    return require(name)
  }
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(resolve, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
function request(method, pathname = '/api/jobs', body, headers = {}) {
  return new Request(`http://localhost${pathname}`, { method, headers: { Authorization: `Bearer ${key}`, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

test('tracker authentication, writes, retries, and browser compatibility', async () => {
  try {
    // Exercise migration from the original tracker schema.
    await db.execute('CREATE TABLE job_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, role TEXT NOT NULL, description TEXT, date TEXT NOT NULL, source TEXT, type TEXT, cover_letter TEXT, resume_type TEXT, interviewed INTEGER NOT NULL DEFAULT 0)')
    const schema = load('src/lib/jobsDb.ts')
    await schema.ensureJobsSchema(db)
    mocks['@/lib/jobsDb'] = { ...schema, getJobsDb: async () => db }
    const { matchesJobsApiKey, isJobsAgentRequest } = load('src/lib/jobsApiKey.ts')
    assert.equal(matchesJobsApiKey(`Bearer ${key}`, key), true)
    for (const header of [null, '', 'Basic abc', 'Bearer wrong', `Bearer ${key} extra`]) assert.equal(matchesJobsApiKey(header, key), false)
    assert.equal(matchesJobsApiKey('Bearer short', 'short'), false)
    assert.equal(matchesJobsApiKey(`Bearer ${key}`, undefined), false)
    for (const pathname of ['/api/jobs/parse', '/api/jobs/stats', '/api/secrets', '/tools', '/api/jobs/1/other']) assert.equal(isJobsAgentRequest(pathname, 'POST'), false)
    // Exercise the actual proxy authorization callback as well as route guards.
    load('src/auth.ts')
    const { callbacks } = authConfig
    const authorize = (pathname, method = 'GET', token = key) => callbacks.authorized({ auth: null, request: { url: `http://localhost${pathname}`, nextUrl: new URL(`http://localhost${pathname}`), method, headers: new Headers({ Authorization: `Bearer ${token}` }) } })
    assert.equal(await authorize('/api/jobs'), true)
    assert.equal((await authorize('/api/jobs', 'GET', 'wrong')).status, 401)
    for (const p of ['/api/secrets', '/api/jobs/parse', '/api/jobs/stats']) assert.equal((await authorize(p)).status, 401)

    const { GET, POST } = load('src/app/api/jobs/route.ts')
    const { PATCH } = load('src/app/api/jobs/[id]/route.ts')
    const payload = { company: 'Example', role: 'Intern', date: '2026-09-04', cover_letter: 'no' }
    assert.equal((await POST(request('POST', '/api/jobs', payload, { Authorization: 'Bearer wrong' }))).status, 401)
    assert.equal((await POST(request('POST', '/api/jobs', payload))).status, 400)
    const insert = (body = payload, retryKey = 'application-1') => POST(request('POST', '/api/jobs', body, { 'Idempotency-Key': retryKey }))
    const first = await insert()
    assert.equal(first.status, 201)
    const { id } = await first.json()
    const replay = await insert()
    assert.equal(replay.status, 200)
    assert.deepEqual(await replay.json(), { id, message: 'Already created', replayed: true })
    assert.equal((await insert({ ...payload, role: 'Different' })).status, 409)
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM job_applications')).rows[0].n, 1)
    assert.equal((await insert({ ...payload, date: '2026-02-30' }, 'bad-date')).status, 400)
    assert.equal((await insert({ ...payload, company: [] }, 'bad-type')).status, 400)
    assert.equal((await insert({ ...payload, extra: 'bad' }, 'bad-field')).status, 400)
    assert.equal((await insert(payload, 'bad key')).status, 400)
    assert.equal((await POST(new Request('http://localhost/api/jobs', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: '{' }))).status, 400)
    const list = await GET(request('GET', '/api/jobs?q=Example'))
    assert.equal((await list.json()).total, 1)
    assert.equal((await GET(request('GET', '/api/jobs?offset=-1'))).status, 400)
    const update = await PATCH(request('PATCH', `/api/jobs/${id}`, { interviewed: true }), { params: Promise.resolve({ id: String(id) }) })
    assert.equal(update.status, 200)
    assert.equal((await db.execute('SELECT interviewed FROM job_applications')).rows[0].interviewed, 1)
    assert.equal((await insert()).status, 200)
    assert.equal((await db.execute('SELECT interviewed FROM job_applications')).rows[0].interviewed, 1)
    assert.equal((await PATCH(request('PATCH', '/api/jobs/999', { interviewed: true }), { params: Promise.resolve({ id: '999' }) })).status, 404)
    const detail = load('src/app/api/jobs/[id]/route.ts').GET
    const extra = { ...payload, status: 'blocked', external_id: 'scout:attempt-52',
      started_at: '2026-09-07T11:00:00-04:00', completed_at: null, duration_seconds: 0,
      other_details: '  '+ 'x'.repeat(999996) + '  ', evidence_refs: '["receipt.png"]', blocker: 'MFA required' }
    const added = await insert(extra, 'extra-fields')
    assert.equal(added.status, 201)
    const extraId = String((await added.json()).id)
    const read = async () => (await (await detail(request('GET', `/api/jobs/${extraId}`), { params: Promise.resolve({ id: extraId }) })).json()).job
    let saved = await read()
    for (const [field, value] of Object.entries(extra)) assert.deepEqual(saved[field], value)
    assert.equal(saved.request_key, undefined)
    assert.equal((await insert(extra, 'extra-fields')).status, 200)
    assert.equal((await insert({ ...extra, duration_seconds: 1 }, 'extra-fields')).status, 409)
    assert.equal((await insert({ ...payload, other_details: 'x'.repeat(1000001) }, 'oversize')).status, 400)
    for (const invalid of [-1, '12', {}, true]) assert.equal((await insert({ ...payload, duration_seconds: invalid }, 'bad-duration')).status, 400)
    assert.equal((await insert({ ...payload, started_at: '2026-02-30T00:00:00Z' }, 'bad-time')).status, 400)
    const changed = await PATCH(request('PATCH', `/api/jobs/${extraId}`, { other_details: null, duration_seconds: null, status: 'submitted' }), { params: Promise.resolve({ id: extraId }) })
    assert.equal(changed.status, 200)
    saved = await read()
    assert.equal(saved.other_details, null)
    assert.equal(saved.duration_seconds, null)
    assert.equal(saved.status, 'submitted')
    assert.equal(saved.blocker, extra.blocker)
    const summaries = await (await GET(request('GET', '/api/jobs'))).json()
    assert.equal('other_details' in summaries.jobs[0], false)
    assert.equal('evidence_refs' in summaries.jobs[0], false)
    assert.equal((await detail(request('GET', '/api/jobs/999'), { params: Promise.resolve({ id: '999' }) })).status, 404)
    assert.equal((await detail(request('GET', `/api/jobs/${extraId}`, undefined, { Authorization: 'Bearer wrong' }), { params: Promise.resolve({ id: extraId }) })).status, 401)
    // A previously deployed payload hash remains valid after adding optional columns.
    const { createHash } = require('node:crypto')
    const legacyFields = ['company','role','description','date','source','type','cover_letter','resume_type','location','work_mode']
    const legacyHash = createHash('sha256').update(JSON.stringify(legacyFields.map(f => [f,payload[f] || null]))).digest('hex')
    await db.execute({ sql: 'UPDATE job_applications SET request_hash = ? WHERE id = ?', args: [legacyHash,id] })
    assert.equal((await insert()).status, 200)
    // Existing UI sends interviewed as 0/1 and inserts without a retry key.
    session = { user: { email: 'owner@example.com' } }
    assert.equal((await POST(request('POST', '/api/jobs', payload, { Authorization: 'Bearer wrong' }))).status, 401)
    const browser = (method, body, pathname = '/api/jobs') => new Request(`http://localhost${pathname}`, { method, body: JSON.stringify(body) })
    assert.equal((await POST(browser('POST', payload))).status, 201)
    assert.equal((await PATCH(browser('PATCH', { interviewed: 0 }, `/api/jobs/${id}`), { params: Promise.resolve({ id: String(id) }) })).status, 200)
    session = null
    assert.equal((await POST(browser('POST', payload))).status, 401)
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => insert(payload, 'concurrent')))
    assert.equal(concurrent.filter(response => response.status === 201).length, 1)
    assert.equal(concurrent.filter(response => response.status === 200).length, 4)
    // The site view and stats exclude non-submissions before counting/pagination.
    const today = new Date().toISOString().slice(0, 10)
    const statuses = [null, '', 'submitted', 'applied', ' SUBMITTED ', 'blocked', 'skipped', 'captcha', 'submitted_unverified', 'pending']
    for (const status of statuses) await db.execute({ sql: 'INSERT INTO job_applications (company,role,date,status,submitted_at) VALUES (?, ?, ?, ?, ?)', args: ['Filter Fixture','Intern',today,status,'2026-09-08T00:00:00Z'] })
    const appliedList = await (await GET(request('GET', '/api/jobs?view=applied&q=Filter%20Fixture&limit=2'))).json()
    assert.equal(appliedList.total,5)
    assert.equal(appliedList.jobs.length,2)
    const nextApplied = await (await GET(request('GET', '/api/jobs?view=applied&q=Filter%20Fixture&limit=2&offset=2'))).json()
    assert.equal(nextApplied.total,5)
    assert.ok(nextApplied.jobs.every(job => !appliedList.jobs.some(first => first.id === job.id)))
    const allFixture = await (await GET(request('GET','/api/jobs?q=Filter%20Fixture'))).json()
    assert.equal(allFixture.total,10)
    assert.equal((await GET(request('GET','/api/jobs?view=unknown'))).status,400)
    const filtered = await (await GET(request('GET','/api/jobs?view=applied&limit=200'))).json()
    assert.ok(filtered.jobs.every(job => !job.status?.trim() || ['submitted','applied'].includes(job.status.trim().toLowerCase())))
    session = {user:{email:'owner@example.com'}}
    const stats = await (await load('src/app/api/jobs/stats/route.ts').GET()).json()
    assert.equal(stats.total,filtered.total)
    const localDay=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))
    assert.equal(stats.today,filtered.jobs.filter(job => (job.submitted_at?localDay(job.submitted_at):job.date) === localDay(new Date())).length)
    session = null
    // A failed insert does not reserve its key; the key can subsequently be used.
    await db.execute("CREATE TRIGGER fail_insert BEFORE INSERT ON job_applications WHEN NEW.company = 'Fail' BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    const { insertJob } = load('src/lib/jobWrites.ts')
    await assert.rejects(insertJob(db, { ...payload, company: 'Fail' }, 'rollback'))
    assert.equal((await insertJob(db, payload, 'rollback')).replayed, false)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

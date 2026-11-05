// Real routes, auth and SQL; only external session/secrets and the DB factory are replaced.
// The database is a disposable local libSQL file. No production configuration is loaded.
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createClient } = require('@libsql/client')
const root = path.resolve(__dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-accounts-'))
const db = createClient({ url: `file:${path.join(dir, 'accounts.db')}` })
const keys = {
  JOBS_API_KEY: 'test-agent-'.repeat(8),
  JOBS_READ_API_KEY: 'test-reader-'.repeat(8),
  JOBS_EXTENSION_API_KEY: 'test-extension-'.repeat(8),
}
let session = null
const mocks = {
  '@/auth': { auth: async () => session },
  '@/lib/secrets': { getSecret: async name => keys[name] },
  '@/lib/jobsDb': { getJobsDb: async () => db },
}
const cache = new Map()
function load(relative) {
  const filename = path.join(root, relative)
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  function resolve(name) {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    if (name.startsWith('.')) {
      const relative = path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))
      const alias = '@/'+relative.replace(/^src\//, '').replace(/\.ts$/, '')
      return mocks[alias] || load(relative)
    }
    return require(name)
  }
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(resolve, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const collection = load('src/app/api/ats-accounts/route.ts')
const detail = load('src/app/api/ats-accounts/[id]/route.ts')
const lib = load('src/lib/atsAccounts.ts')
const base = '/api/ats-accounts'
const context = id => ({ params: Promise.resolve({ id }) })
function request(method, pathname = base, body, key = keys.JOBS_API_KEY) {
  return new Request(`http://localhost${pathname}`, {
    method, headers: key === null ? {} : { Authorization: `Bearer ${key}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const proof = { kind: 'email', at: '2026-11-05T12:00:00.000Z', ref: 'fixture-message', note: 'Synthetic account confirmation' }
const payload = () => ({ provider: 'workday', tenant: 'litera', login_email: 'Applicant@Example.COM', status: 'exists', evidence: [proof] })
const post = body => collection.POST(request('POST', base, body))
const count = async () => Number((await db.execute('SELECT COUNT(*) AS n FROM ats_accounts')).rows[0].n)
const snapshot = async () => (await db.execute('SELECT * FROM ats_accounts ORDER BY id')).rows.map(row => ({ ...row }))
async function create(body = payload()) {
  const response = await post(body)
  assert.equal(response.status, 201)
  return response.json()
}

before(async () => { await lib.ensureAtsAccountsSchema(db) })
beforeEach(async () => { session = null; await db.execute('DELETE FROM ats_accounts') })
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }) })

test('unauthenticated requests return 401 and store nothing', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  assert.equal((await collection.GET(request('GET', base, undefined, null))).status, 401)
  assert.equal((await collection.POST(request('POST', base, payload(), null))).status, 401)
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    assert.equal((await detail[method](request(method, `${base}/${id}`, method === 'PATCH' ? { version: 1 } : undefined, null), context(id))).status, 401)
  }
  assert.equal(await count(), 0)
})

test('create returns 201, lowercase identity, optional fields and a secret-free schema', async () => {
  const row = await create({ ...payload(), tenant: 'LITERA', host: 'litera.wd12.myworkdayjobs.com', employer: 'Synthetic Employer', credential_ref: 'generic_ats', notes: 'Synthetic fixture', first_seen_at: proof.at, last_verified_at: proof.at })
  assert.match(row.id, /^[0-9a-f-]{36}$/)
  assert.equal(row.tenant, 'litera')
  assert.equal(row.login_email, 'applicant@example.com')
  assert.equal(row.version, 1)
  assert.equal(row.credential_ref, 'generic_ats')
  assert.equal(row.created_at, row.updated_at)
  assert.ok(Number.isFinite(Date.parse(row.created_at)))
  const read = await detail.GET(request('GET', `${base}/${row.id}`), context(row.id))
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), row)
  const columns = (await db.execute('PRAGMA table_info(ats_accounts)')).rows.map(column => column.name)
  assert.equal(columns.some(name => /pass|secret|token|otp|cookie/i.test(name)), false)
  assert.equal((await snapshot())[0].login_email, 'applicant@example.com')
})

test('repeat POST updates supplied fields, keeps one row and appends deduplicated evidence', async () => {
  const first = await create({ ...payload(), employer: 'Preserved Employer', notes: 'Original' })
  const login = { kind: 'login', at: proof.at, ref: proof.ref }
  const result = await post({ ...payload(), login_email: 'APPLICANT@example.com', notes: 'Updated', evidence: [proof, proof, login] })
  assert.equal(result.status, 200)
  const updated = await result.json()
  assert.equal(updated.id, first.id)
  assert.equal(updated.version, 2)
  assert.equal(updated.employer, 'Preserved Employer')
  assert.equal(updated.notes, 'Updated')
  assert.equal(updated.created_at, first.created_at)
  assert.deepEqual(updated.evidence, [proof, login])
  assert.equal(await count(), 1)
})

test('GET filters by provider, tenant and status', async () => {
  const first = await create()
  await create({ ...payload(), provider: 'greenhouse' })
  await create({ ...payload(), tenant: 'mastercard', status: 'unknown' })
  const response = await collection.GET(request('GET', `${base}?provider=workday&tenant=LITERA`))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).items.map(row => row.id), [first.id])
  const unknown = await collection.GET(request('GET', `${base}?status=unknown`))
  assert.equal((await unknown.json()).items.length, 1)
  const empty = await collection.GET(request('GET', `${base}?provider=lever&tenant=litera`))
  assert.deepEqual(await empty.json(), { items: [] })
  for (const query of ['provider=invalid', 'status=invalid', 'tenant=invalid%20slug']) {
    assert.equal((await collection.GET(request('GET', `${base}?${query}`))).status, 400)
  }
})

test('PATCH requires a numeric current version and bumps it on success', async () => {
  const row = await create()
  const patch = body => detail.PATCH(request('PATCH', `${base}/${row.id}`, body), context(row.id))
  const original = await snapshot()
  assert.equal((await patch({ version: 2, notes: 'Stale' })).status, 409)
  for (const version of [undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await patch({ version, notes: 'Invalid' })).status, 400)
  }
  assert.deepEqual(await snapshot(), original)
  const result = await patch({ version: 1, status: 'likely_exists', login_email: 'UPDATED@EXAMPLE.COM', notes: null })
  assert.equal(result.status, 200)
  const updated = await result.json()
  assert.equal(updated.version, 2)
  assert.equal(updated.status, 'likely_exists')
  assert.equal(updated.login_email, 'updated@example.com')
  assert.equal(updated.notes, null)
  assert.deepEqual(updated.evidence, [proof])
  assert.equal((await patch({ version: 1, notes: 'Stale again' })).status, 409)
})

test('DELETE rejects wrong or missing versions and removes only the matching row', async () => {
  const row = await create()
  const remove = version => detail.DELETE(request('DELETE', `${base}/${row.id}${version === undefined ? '' : `?version=${version}`}`), context(row.id))
  assert.equal((await remove(2)).status, 409)
  for (const version of [undefined, 'abc', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await remove(version)).status, 400)
  assert.equal(await count(), 1)
  assert.equal((await remove(1)).status, 204)
  assert.equal(await count(), 0)
  assert.equal((await detail.GET(request('GET', `${base}/${row.id}`), context(row.id))).status, 404)
  assert.equal((await remove(1)).status, 404)
})

test('reader-key writes return 401 without storing changes; reads return 200', async () => {
  const reader = keys.JOBS_READ_API_KEY
  assert.equal((await collection.POST(request('POST', base, payload(), reader))).status, 401)
  assert.equal(await count(), 0)
  const row = await create()
  const original = await snapshot()
  assert.equal((await detail.PATCH(request('PATCH', `${base}/${row.id}`, { version: 1, notes: 'Blocked' }, reader), context(row.id))).status, 401)
  assert.equal((await detail.DELETE(request('DELETE', `${base}/${row.id}?version=1`, undefined, reader), context(row.id))).status, 401)
  assert.deepEqual(await snapshot(), original)
  assert.equal((await collection.GET(request('GET', base, undefined, reader))).status, 200)
  assert.equal((await detail.GET(request('GET', `${base}/${row.id}`, undefined, reader), context(row.id))).status, 200)
})

test('credential keys at any depth return 400 without storage, echoing or logging', async t => {
  const logs = ['log', 'warn', 'error', 'info', 'debug'].map(method => t.mock.method(console, method, () => {}))
  const forbidden = [
    { password: 'fixture-sensitive-value' },
    { evidence: [{ note: 'x', token: 'y' }] },
    { nested: [{ deeper: { apiSECRET: 'fixture-sensitive-value' } }] },
    { evidence: [{ ...proof, sessionCookie: 'fixture-sensitive-value' }] },
    { OTP: 'fixture-sensitive-value' },
    { bypass: 'fixture-sensitive-value' },
  ]
  for (const extra of forbidden) {
    const response = await post({ ...payload(), ...extra })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Credential fields are not allowed' })
    assert.equal(await count(), 0)
  }
  const row = await create()
  const original = await snapshot()
  for (const extra of forbidden) {
    const response = await detail.PATCH(request('PATCH', `${base}/${row.id}`, { version: 1, ...extra }), context(row.id))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Credential fields are not allowed' })
  }
  assert.equal((await detail.DELETE(request('DELETE', `${base}/${row.id}?version=1`, { password: 'fixture-sensitive-value' }), context(row.id))).status, 400)
  assert.deepEqual(await snapshot(), original)
  for (const log of logs) assert.equal(log.mock.callCount(), 0)
})

test('validates enums, references, field types, lengths and evidence before storing', async () => {
  const invalid = [
    { provider: 'invalid' }, { status: 'invalid' }, { credential_ref: 'file/path' },
    { credential_ref: 'a'.repeat(65) }, { credential_ref: 'UPPER' },
    { login_email: 'invalid' }, { tenant: 'bad slug' }, { host: 'https://example.com' },
    { notes: 42 }, { employer: {} }, { notes: 'x'.repeat(501) }, { status: null },
    { first_seen_at: 'yesterday' }, { last_verified_at: '2026-02-30T00:00:00Z' },
    { evidence: {} }, { evidence: null }, { evidence: Array.from({ length: 51 }, () => proof) },
    { evidence: [{ ...proof, kind: 'other' }] }, { evidence: [{ ...proof, ref: 5 }] },
    { evidence: [{ ...proof, note: 'x'.repeat(501) }] }, { evidence: [{ ...proof, at: 'invalid' }] },
    { evidence: [{ ...proof, extra: true }] }, { evidence: [null] },
    { unknown: 'field' }, { id: 'user-assigned' }, { version: 1 },
  ]
  for (const extra of invalid) assert.equal((await post({ ...payload(), ...extra })).status, 400, JSON.stringify(extra))
  for (const body of [null, [], 'text', {}, { provider: 'workday' }]) assert.equal((await post(body)).status, 400)
  assert.equal((await collection.POST(new Request(`http://localhost${base}`, { method: 'POST', headers: { Authorization: `Bearer ${keys.JOBS_API_KEY}` }, body: '{' }))).status, 400)
  assert.equal(await count(), 0)
  const row = await create({ ...payload(), credential_ref: null, notes: 'x'.repeat(500), evidence: [] })
  assert.equal(row.credential_ref, null)
  assert.deepEqual(row.evidence, [])
})

test('merged evidence stays within 50 items and failed updates leave the account unchanged', async () => {
  const evidence = Array.from({ length: 50 }, (_, i) => ({ ...proof, ref: `fixture-${i}` }))
  const row = await create({ ...payload(), evidence })
  const original = await snapshot()
  assert.equal((await post(payload())).status, 400)
  assert.equal((await detail.PATCH(request('PATCH', `${base}/${row.id}`, { version: 1, evidence: [proof] }), context(row.id))).status, 400)
  assert.deepEqual(await snapshot(), original)
  const retry = await post({ ...payload(), evidence: [evidence[0]] })
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).evidence.length, 50)
})

test('Kevin session and extension credentials can create, patch and delete accounts', async () => {
  for (const key of [null, keys.JOBS_EXTENSION_API_KEY]) {
    session = key === null ? { user: { email: 'owner@example.com' } } : null
    const response = await collection.POST(request('POST', base, payload(), key))
    assert.equal(response.status, 201)
    const row = await response.json()
    assert.equal((await detail.PATCH(request('PATCH', `${base}/${row.id}`, { version: 1, status: 'unknown' }, key), context(row.id))).status, 200)
    assert.equal((await detail.DELETE(request('DELETE', `${base}/${row.id}?version=2`, undefined, key), context(row.id))).status, 204)
  }
})

test('agent allowlist admits only the specified ATS routes and methods', () => {
  const { isJobsAgentRequest } = load('src/lib/jobsApiKey.ts')
  const item = `${base}/00000000-0000-4000-8000-000000000001`
  for (const method of ['GET', 'POST']) assert.equal(isJobsAgentRequest(base, method), true)
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal(isJobsAgentRequest(item, method), true)
  for (const [pathname, method] of [[base, 'PATCH'], [base, 'DELETE'], [item, 'POST'], [item, 'PUT'], [`${base}/invalid`, 'GET'], [`${item}/extra`, 'GET']]) {
    assert.equal(isJobsAgentRequest(pathname, method), false)
  }
})

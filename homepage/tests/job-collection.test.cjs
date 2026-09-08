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
const readerKey = 'read-only-'.repeat(8)
const extensionKey = 'extension-'.repeat(8)
let session = null
let authConfig
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-api-'))
const db = createClient({ url: `file:${path.join(dir, 'jobs.db')}` })
const mocks = {
  '@/auth': { auth: async () => session },
  '@/lib/secrets': { getSecret: async name => ({JOBS_API_KEY:key,JOBS_READ_API_KEY:readerKey,JOBS_EXTENSION_API_KEY:extensionKey})[name] },
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

test('collection API preserves jobs, handles identities, filters, claims, and reader scopes', async () => {
 try {
  const schema=load('src/lib/jobsDb.ts')
  await schema.ensureJobsSchema(db)
  mocks['@/lib/jobsDb']={...schema,getJobsDb:async()=>db}
  const {ensureCollectionSchema}=load('src/lib/jobCollectionSchema.ts')
  // Simulate the extension's already-applied 29-column table before our additive migration.
  const schemaSource=fs.readFileSync(path.join(root,'src/lib/jobCollectionSchema.ts'),'utf8')
  await db.executeMultiple(schemaSource.split('await db.executeMultiple(`')[1].split('`)')[0])
  assert.equal((await db.execute('PRAGMA table_info(job_collection)')).rows.length,29)
  await ensureCollectionSchema(db)
  assert.equal((await db.execute('PRAGMA table_info(job_collection)')).rows.length,35)
  await ensureCollectionSchema(db)
  const routes=load('src/app/api/job-collection/route.ts')
  const item=load('src/app/api/job-collection/[id]/route.ts')
  const exporter=load('src/app/api/job-collection/export/route.ts')
  const {randomUUID}=require('node:crypto')
  const payload={id:randomUUID(),identity_key:'linkedin:123',source:'linkedin',source_job_id:'123',source_url:'https://example.com/jobs/123',company:'Example',role:'Cloud Engineer',type:'cloud',employment_type:'internship',work_mode:'remote',description:'Complete description',description_status:'full',first_seen_at:'2026-09-01T10:00:00Z',last_seen_at:'2026-09-07T10:00:00Z',metadata_json:{schema_version:1,provenance:{adapter:'v1'}},role_tags_json:['cloud','backend']}
  const post=(body=payload,token=key)=>routes.POST(request('POST','/api/job-collection',body,{Authorization:`Bearer ${token}`}))
  const patch=(body,version=1,id=payload.id,token=key)=>item.PATCH(request('PATCH',`/api/job-collection/${id}`,body,{Authorization:`Bearer ${token}`,'If-Match':`"${version}"`}),{params:Promise.resolve({id})})
  const get=(id=payload.id,token=key)=>item.GET(request('GET',`/api/job-collection/${id}`,undefined,{Authorization:`Bearer ${token}`}),{params:Promise.resolve({id})})
  assert.equal((await post(payload,'wrong')).status,401)
  assert.equal((await post(payload,readerKey)).status,401)
  const created=await post(payload,extensionKey)
  assert.equal(created.status,201)
  assert.equal(created.headers.get('etag'),'"1"')
  const first=(await created.json()).job
  assert.equal(first.status,'pending')
  assert.equal(first.metadata_json.provenance.adapter,'v1')
  assert.equal(first.first_seen_at,'2026-09-01T10:00:00.000Z')
  assert.equal((await post()).status,200)
  const duplicate=await post({...payload,id:randomUUID(),identity_key:'another-source-key',description:'Preview',description_status:'partial'})
  assert.equal(duplicate.status,200)
  assert.equal((await duplicate.json()).job.description_status,'full')
  assert.equal((await post({...payload,identity_key:'wrong-reuse'})).status,409)
  assert.equal((await get(payload.id,readerKey)).status,200)
  assert.equal((await patch({status:'blocked'},1,payload.id,readerKey)).status,401)
  assert.equal((await item.PATCH(request('PATCH',`/api/job-collection/${payload.id}`,{status:'blocked'}),{params:Promise.resolve({id:payload.id})})).status,428)
  const claimed=await Promise.all([patch({status:'in_progress'}),patch({status:'in_progress'})])
  assert.deepEqual(claimed.map(r=>r.status).sort(),[200,412])
  assert.equal((await patch({description:'preview',description_status:'partial'},2)).status,409)
  assert.equal((await patch({last_seen_at:'2026-09-01T11:00:00Z'},2)).status,409)
  assert.equal((await patch({status:'blocked',status_notes:'Requires MFA',metadata_json:{provenance:{model:'Astra'}}},2)).status,200)
  let current=(await (await get()).json()).job
  assert.equal(current.status_history_json.length,3)
  assert.deepEqual(current.metadata_json.provenance,{adapter:'v1',model:'Astra'})
  assert.equal((await patch({status:'N/A'},3)).status,200)
  assert.equal((await patch({status:'skipped'},4)).status,200)
  assert.equal((await patch({status:'applied',application_ids_json:[999]},5)).status,400)
  const app=await db.execute("INSERT INTO job_applications (company,role,date) VALUES ('Example','Cloud Engineer','2026-09-07')")
  assert.equal((await patch({status:'applied',application_ids_json:[Number(app.lastInsertRowid)]},5)).status,200)
  assert.equal((await db.execute('SELECT COUNT(*) AS n FROM job_collection')).rows[0].n,1)
  assert.equal((await db.execute('SELECT COUNT(*) AS n FROM job_applications')).rows[0].n,1)
  assert.equal((await patch({status:'deleted'},6)).status,400)
  assert.equal((await patch({metadata_json:'not json'},6)).status,400)
  assert.equal((await post({...payload,id:randomUUID(),identity_key:'x',source_url:'javascript:alert(1)'})).status,400)
  assert.equal((await patch({role_tags_json:[{}]},6)).status,400)
  assert.equal((await patch({sources_json:[{source:'bad',source_url:'file:///secret'}]},6)).status,400)
  assert.equal((await patch({updated_at:'2026-09-07T00:00:00Z'},6)).status,400)
  assert.equal((await patch({archived_at:'2026-09-07T12:00:00Z'},6)).status,200)
  let listed=await routes.GET(request('GET','/api/job-collection?status=applied&archived=all'))
  assert.equal((await listed.json()).total,1)
  assert.equal((await (await routes.GET(request('GET','/api/job-collection'))).json()).total,0)
  assert.equal((await patch({archived_at:null,status:'pending'},7)).status,200)
  // Aliases participate in atomic insert deduplication too.
  assert.equal((await patch({sources_json:[{source:'other',source_job_id:'456',source_url:'https://other.example/jobs/456',identity_key:'other:456'}]},8)).status,200)
  const alias=await post({...payload,id:randomUUID(),identity_key:'other:456',source:'other',source_job_id:'456',source_url:'https://other.example/jobs/456'})
  assert.equal(alias.status,200); assert.equal((await alias.json()).job.id,payload.id)
  // A later source identity cannot silently merge two independently stored rows.
  const second={...payload,id:randomUUID(),identity_key:'linkedin:second',source_job_id:'second',source_url:'https://example.com/jobs/second',canonical_url:'https://employer.example/jobs/second'}
  assert.equal((await post(second)).status,201)
  assert.equal((await patch({canonical_url:second.canonical_url},9)).status,409)
  const racePayload={...payload,id:randomUUID(),identity_key:'race',source_job_id:null,source_url:'https://example.com/jobs/race'}
  const race=await Promise.all(Array.from({length:5},(_,i)=>post({...racePayload,id:randomUUID(),identity_key:`race-${i}`})))
  assert.equal(race.filter(r=>r.status===201).length,1)
  assert.equal(race.filter(r=>r.status===200).length,4)
  const listUrl='/api/job-collection?status=pending&type=cloud&work_mode=remote&collected_since=2026-09-01&limit=1'
  const page1=(await (await routes.GET(request('GET',listUrl,undefined,{Authorization:`Bearer ${readerKey}`}))).json())
  assert.equal(page1.total,3);assert.equal(page1.jobs.length,1);assert.ok(page1.next_cursor)
  assert.equal('description' in page1.jobs[0],false);assert.equal('metadata_json' in page1.jobs[0],false)
  const page2=(await (await routes.GET(request('GET',`${listUrl}&cursor=${page1.next_cursor}`))).json())
  assert.notEqual(page1.jobs[0].id,page2.jobs[0].id)
  assert.equal((await routes.GET(request('GET','/api/job-collection?limit=10000'))).status,400)
  assert.equal((await routes.GET(request('GET','/api/job-collection?cursor=broken'))).status,400)
  assert.equal((await routes.GET(request('GET','/api/job-collection?sql=DELETE'))).status,400)
  assert.equal((await (await routes.GET(request('GET','/api/job-collection?q=%25'))).json()).total,0)
  const exported=(await (await exporter.GET(request('GET','/api/job-collection/export?status=pending'))).json())
  assert.equal(exported.jobs.length,3);assert.equal('metadata_json' in exported.jobs[0],false)
  const oversized=await routes.POST(new Request('http://localhost/api/job-collection',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:'x'.repeat(2*1024*1024+1)}))
  assert.equal(oversized.status,413)
  assert.equal(routes.DELETE,undefined);assert.equal(item.DELETE,undefined)
  load('src/auth.ts')
  const authorize=(pathname,method,token)=>authConfig.callbacks.authorized({auth:null,request:{url:`http://localhost${pathname}`,nextUrl:new URL(`http://localhost${pathname}`),method,headers:new Headers({Authorization:`Bearer ${token}`})}})
  assert.equal(await authorize('/api/job-collection','GET',readerKey),true)
  assert.equal((await authorize('/api/job-collection','POST',readerKey)).status,401)
  assert.equal(await authorize('/api/jobs/1','GET',readerKey),true)
  assert.equal((await authorize('/api/jobs/1','PATCH',readerKey)).status,401)
  assert.equal((await authorize('/api/secrets','GET',extensionKey)).status,401)
 } finally {db.close();fs.rmSync(dir,{recursive:true,force:true})}
})

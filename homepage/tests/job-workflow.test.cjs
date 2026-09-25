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

test('shared workflow: claims, blockers, capture revisions, manual completion, and permissions', async () => {
 try {
  const {randomUUID}=require('node:crypto')
  const schema=load('src/lib/jobsDb.ts');await schema.ensureJobsSchema(db)
  mocks['@/lib/jobsDb']={...schema,getJobsDb:async()=>db}
  await load('src/lib/jobCollectionSchema.ts').ensureCollectionSchema(db)
  const w=load('src/lib/jobWorkflow.ts'),ws=load('src/lib/jobWorkflowSchema.ts')
  await ws.ensureWorkflowSchema(db);await ws.ensureWorkflowSchema(db)
  for(const table of ['job_attempts','job_blockers','job_form_captures'])assert.ok((await db.execute(`PRAGMA table_info(${table})`)).rows.length>0)
  const collection=load('src/lib/jobCollection.ts')
  const job={id:randomUUID(),identity_key:'test:workflow',source:'test',source_url:'https://example.com/jobs/1',company:'Example',role:'Cloud Engineer'}
  await collection.createCollection(db,collection.validateCollection(job),'test')
  const claim={id:randomUUID(),collection_id:job.id,version:1,claim_token:randomUUID()+randomUUID(),worker_id:'hermes',agent_model:'recorded-model'}
  await w.claimAttempt(db,claim,'tracker-agent')
  assert.equal((await w.claimAttempt(db,claim,'tracker-agent')).replayed,true)
  await assert.rejects(w.claimAttempt(db,{...claim,id:randomUUID()},'tracker-agent'),/changed|owns/)
  await assert.rejects(w.heartbeat(db,claim.id,{claim_token:'wrong'.repeat(10)},'tracker-agent'),/another worker/)
  const capture={id:randomUUID(),capture_session_id:randomUUID(),revision:1,collection_id:job.id,attempt_id:claim.id,state:'finished',captured_at:new Date().toISOString(),document:{schema_version:1,pages:[{title:'Questions',fields:[{label:'Why this role?',answer:'My exact answer',control_type:'textarea'}]}]}}
  await w.saveCapture(db,capture,'tracker-agent');assert.equal((await w.saveCapture(db,capture,'tracker-agent')).replayed,true)
  await assert.rejects(w.saveCapture(db,{...capture,document:{different:true}},'tracker-agent'),/conflict/)
  await assert.rejects(w.saveCapture(db,{...capture,id:randomUUID(),revision:2,document:{fields:[{control_type:'password',answer:'do not store'}]}},'tracker-agent'),/security/)
  const outcome={claim_token:claim.claim_token,outcome:'blocked',reason_code:'captcha',notes:'Needs human CAPTCHA completion',details:{page:'https://example.com/apply'}}
  await w.finishOutcome(db,claim.id,outcome,'tracker-agent');assert.equal((await w.finishOutcome(db,claim.id,outcome,'tracker-agent')).replayed,true)
  let d=await w.workflowDetail(db,job.id);assert.equal(d.blockers.length,1);assert.equal(d.attempts[0].outcome,'blocked');assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,0)
  await assert.rejects(w.claimAttempt(db,{...claim,id:randomUUID(),version:d.job.version},'tracker-agent'),/blockers/)
  const manual={id:randomUUID(),collection_id:job.id,version:d.job.version,claim_token:randomUUID()+randomUUID(),manual:true,parent_attempt_id:claim.id}
  await w.claimAttempt(db,manual,'user@example.com')
  const complete={claim_token:manual.claim_token,confirmed:true,confirmation_kind:'user_confirmed',submitted_at:new Date().toISOString(),capture_id:capture.id,resolve_blocker_ids:[d.blockers[0].id]}
  await assert.rejects(w.completeAttempt(db,manual.id,{...complete,confirmed:false},'user@example.com'),/confirmation/)
  const result=await w.completeAttempt(db,manual.id,complete,'user@example.com')
  assert.equal((await w.completeAttempt(db,manual.id,complete,'user@example.com')).application_id,result.application_id)
  await assert.rejects(w.completeAttempt(db,manual.id,{...complete,evidence:['different']},'user@example.com'),/differently/)
  d=await w.workflowDetail(db,job.id);assert.equal(d.job.status,'applied');assert.equal(d.blockers[0].status,'resolved');assert.equal(d.attempts.filter(a=>a.outcome==='blocked').length,1)
  assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,1)
  assert.equal(JSON.parse((await db.execute('SELECT other_details FROM job_applications')).rows[0].other_details).pages[0].fields[0].answer,'My exact answer')
  const metrics=await w.workflowMetrics(db);assert.equal(metrics.total,1);assert.equal(metrics.today,1);assert.equal(metrics.timezone,'America/New_York')
  // A separate blocked job can be resolved/requeued without adding any application.
  const job2={...job,id:randomUUID(),identity_key:'test:second',source_url:'https://example.com/jobs/2'};await collection.createCollection(db,collection.validateCollection(job2),'test')
  const c2={...claim,id:randomUUID(),collection_id:job2.id};await w.claimAttempt(db,c2,'tracker-agent');await w.finishOutcome(db,c2.id,outcome,'tracker-agent');let d2=await w.workflowDetail(db,job2.id)
  await w.resolveBlocker(db,d2.blockers[0].id,{version:1,action:'retry',notes:'Human completed the CAPTCHA'},'user@example.com');d2=await w.workflowDetail(db,job2.id);assert.equal(d2.job.status,'pending');assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,1)
  const statistics=load('src/lib/jobStats.ts')
  assert.equal(statistics.statsFromRows([{date:'2026-09-08',submitted_at:'2026-09-08T00:00:00Z'}],new Date('2026-09-08T00:01:00Z')).today,1)
  assert.equal(statistics.statsFromRows([{date:'2026-11-01',submitted_at:'2026-11-01T05:30:00Z'},{date:'2026-11-01',submitted_at:'2026-11-01T06:30:00Z'}],new Date('2026-11-01T15:00:00Z')).today,2)
  const c3={...claim,id:randomUUID(),collection_id:job2.id,version:d2.job.version};await w.claimAttempt(db,c3,'tracker-agent');await w.heartbeat(db,c3.id,{claim_token:c3.claim_token,stage:'submit_started'},'tracker-agent')
  await db.execute({sql:'UPDATE job_attempts SET lease_expires_at=? WHERE id=?',args:['2000-01-01T00:00:00Z',c3.id]})
  const a3=(await w.workflowDetail(db,job2.id)).attempts.find(a=>a.id===c3.id)
  await w.recoverAttempt(db,c3.id,{version:a3.version},'user@example.com')
  const unknown=await w.workflowDetail(db,job2.id);assert.equal(unknown.job.status,'blocked');assert.ok(unknown.blockers.some(b=>b.reason_code==='submission_unknown'))
  await assert.rejects(w.claimAttempt(db,{...c3,id:randomUUID(),version:unknown.job.version},'tracker-agent'),/blockers/)
  // HTTP handlers enforce the existing writer/reader keys on the new routes.
  const route=load('src/app/api/job-workflow/[...path]/route.ts')
  const get=(path,token=key)=>route.GET(request('GET','/api/job-workflow/'+path,undefined,{Authorization:`Bearer ${token}`}),{params:Promise.resolve({path:path.split('/')})})
  assert.equal((await get('connection')).status,200);assert.equal((await get('metrics',readerKey)).status,200);assert.equal((await get('connection','wrong')).status,401)
  assert.equal((await route.POST(request('POST','/api/job-workflow/attempts',claim,{Authorization:`Bearer ${readerKey}`}),{params:Promise.resolve({path:['attempts']})})).status,401)
 } finally {db.close();fs.rmSync(dir,{recursive:true,force:true})}
})

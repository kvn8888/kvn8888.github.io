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


test('atomic queued handoffs, human ownership, completion and expiry preserve history', async()=>{
 const {randomUUID}=require('node:crypto');
 try{
  const schema=load('src/lib/jobsDb.ts');await schema.ensureJobsSchema(db);mocks['@/lib/jobsDb']={...schema,getJobsDb:async()=>db};
  await load('src/lib/jobCollectionSchema.ts').ensureCollectionSchema(db);await load('src/lib/jobWorkflowSchema.ts').ensureWorkflowSchema(db);
  const c=load('src/lib/jobCollection.ts'),w=load('src/lib/jobWorkflow.ts'),h=load('src/lib/jobHandoffs.ts');
  async function job(n){const j={id:randomUUID(),identity_key:'handoff:'+n,source:'fixture',source_url:'https://example.com/jobs/'+n,company:'Synthetic',role:'Engineer'};await c.createCollection(db,c.validateCollection(j),'test');return j;}
  async function claim(j){const b={id:randomUUID(),collection_id:j.id,version:1,claim_token:randomUUID()+randomUUID()};await w.claimAttempt(db,b,'tracker-agent');return b;}
  const j=await job(1),a=await claim(j),packet={schema_version:'1.0',id:randomUUID(),created_at:new Date().toISOString(),application_url:j.source_url,status:'captcha_blocked',fields:[{label:'Full name',type:'text',value:'Synthetic Applicant'}]};
  const body={id:randomUUID(),claim_token:a.claim_token,reason_code:'captcha',notes:'Human gate observed',packets:[packet],gaps:['Only step 1 observed']};
  await assert.rejects(h.queueHandoff(db,a.id,{...body,packets:[{...packet,fields:[{label:'password',value:'bad',type:'text'}]}]},'tracker-agent'),/Invalid handoff/);
  await db.execute("CREATE TRIGGER fail_handoff BEFORE INSERT ON job_blockers BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(h.queueHandoff(db,a.id,body,'tracker-agent'),/fixture failure/);
  assert.equal((await w.workflowDetail(db,j.id)).attempts[0].state,'running');assert.equal((await db.execute('SELECT count(*) n FROM job_form_captures')).rows[0].n,0);
  await db.execute('DROP TRIGGER fail_handoff');
  const q=await h.queueHandoff(db,a.id,body,'tracker-agent');assert.equal((await h.queueHandoff(db,a.id,body,'tracker-agent')).replayed,true);
  assert.equal((await h.listHandoffs(db,new URLSearchParams())).total,1);assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,0);
  assert.equal((await h.getHandoff(db,body.id)).document.packets[0].fields[0].value,'Synthetic Applicant');
  await assert.rejects(w.resolveBlocker(db,body.id,{version:1,action:'retry',notes:'Agent cannot bypass the human queue'},'tracker-agent'),/Human-gated/);
  const history=await w.workflowDetail(db,j.id),manual={id:randomUUID(),version:history.job.version,claim_token:randomUUID()+randomUUID()};
  await assert.rejects(h.claimHandoff(db,body.id,manual,'tracker-agent'),/extension credential/);
  await assert.rejects(w.claimAttempt(db,{...manual,collection_id:j.id,manual:true},'tracker-agent'),/extension credential/);
  await h.claimHandoff(db,body.id,manual,'tracker-extension');
  await assert.rejects(h.claimHandoff(db,body.id,{...manual,id:randomUUID()},'user@example.com'),/changed|owns/);
  // Release before submit keeps the queued blocker and job consistent.
  await w.finishOutcome(db,manual.id,{claim_token:manual.claim_token,outcome:'cancelled',notes:'Back to queue'},'tracker-extension');
  assert.equal((await w.workflowDetail(db,j.id)).job.status,'blocked');
  const next={...manual,id:randomUUID(),version:(await w.workflowDetail(db,j.id)).job.version};await h.claimHandoff(db,body.id,next,'tracker-extension');
  await w.heartbeat(db,next.id,{claim_token:next.claim_token,stage:'submit_started'},'tracker-extension');
  await assert.rejects(h.postingAvailability(db,j.id,{version:(await w.workflowDetail(db,j.id)).job.version,claim_token:next.claim_token,notes:'closed',evidence:{url:j.source_url,observed_at:new Date().toISOString(),signal:'expired_notice',excerpt:'No longer accepting applications'}},'tracker-extension'),/Submission may/);
  const complete={claim_token:next.claim_token,confirmed:true,confirmation_kind:'user_confirmed',submitted_at:new Date().toISOString(),capture_id:q.handoff.handoff_capture_id};
  const result=await w.completeAttempt(db,next.id,complete,'tracker-extension');assert.equal((await w.completeAttempt(db,next.id,complete,'tracker-extension')).application_id,result.application_id);
  assert.equal((await h.listHandoffs(db,new URLSearchParams())).total,0);assert.equal((await w.workflowDetail(db,j.id)).blockers[0].status,'resolved');
  // Expired postings cannot be reclaimed, but applied records stay applied.
  const evidence={url:j.source_url,observed_at:new Date().toISOString(),signal:'expired_notice',excerpt:'No longer accepting applications'};
  await h.postingAvailability(db,j.id,{version:(await w.workflowDetail(db,j.id)).job.version,notes:'Posting closed',evidence},'tracker-agent');
  assert.equal((await w.workflowDetail(db,j.id)).job.status,'applied');
  const j2=await job(2),a2=await claim(j2);await h.postingAvailability(db,j2.id,{version:(await w.workflowDetail(db,j2.id)).job.version,claim_token:a2.claim_token,notes:'Posting closed',evidence:{...evidence,url:j2.source_url}},'tracker-agent');
  await assert.rejects(w.claimAttempt(db,{...a2,id:randomUUID(),version:(await w.workflowDetail(db,j2.id)).job.version},'tracker-agent'),/already/);
  assert.equal((await c.listCollection(db,new URLSearchParams({availability:'expired'}))).total,2);
  const j3=await job(3);await db.execute({sql:"INSERT INTO job_applications(company,role,status,application_url,date) VALUES(?,?,'submitted',?,'2026-10-02')",args:[j3.company,j3.role,j3.source_url]});
  await assert.rejects(claim(j3),/submitted application already exists/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

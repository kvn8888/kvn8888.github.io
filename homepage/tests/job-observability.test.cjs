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
let dbCalls=0; const events=[];let queryFails=false,queryApl;
const mocks = {
  '@/lib/jobsDb':{getJobsDb:async()=>{dbCalls++;throw Error('No job DB required')},ensureJobsSchema:async()=>{dbCalls++;throw Error('No migration required')}},
  '@/lib/axiom':{reportServerEvent:async event=>{events.push(event)},queryServerEvents:async args=>{queryApl=args.buildApl('synthetic-dataset');if(queryFails)throw Error('provider secret must not escape');return {result:{matches:[]}}}},
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

test('telemetry authentication, strict privacy, bounded batches and query fallback without job DB access',async()=>{
 const {randomUUID}=require('node:crypto');const client=randomUUID(),trace=randomUUID();
 const batch={client_id:client,client_version:'0.7.0',events:[{id:randomUUID(),at:new Date().toISOString(),trace_id:trace,name:'scan_finished',source:'jobright',found:1,queued:1,skipped:0}]};
 const route=load('src/app/api/job-workflow/[...path]/route.ts');const context={params:Promise.resolve({path:['events']})};
 const call=(method,body,headers={},query='')=>route[method](request(method,'/api/job-workflow/events'+query,body,headers),context);
 assert.equal((await call('POST',batch,{Authorization:''})).status,401);
 assert.equal((await call('POST',batch,{Authorization:'Bearer '+readerKey})).status,401);
 assert.equal((await call('POST',batch,{Authorization:'Bearer '+extensionKey})).status,200);
 assert.equal((await call('POST',batch)).status,200);
 for(const extra of [{apiKey:'secret'},{url:'https://example.com/private'},{answers:['personal']},{message:'private error'}]){
  assert.equal((await call('POST',{...batch,...extra})).status,400);
  assert.equal((await call('POST',{...batch,events:[{...batch.events[0],...extra}]})).status,400);
 }
 assert.equal((await call('POST',{...batch,events:Array(26).fill(batch.events[0])})).status,400);
 assert.equal((await call('POST',{...batch,oversized:'x'.repeat(33000)})).status,413);
 const saved=events.filter(e=>e.event==='jobs.client.events');assert.equal(saved.length,2);assert.deepEqual(saved[0].data,batch);
 let response=await call('GET',undefined,{Authorization:'Bearer '+readerKey},'?client_id='+client+'&trace_id='+trace+'&limit=5');assert.equal(response.status,200);assert.equal((await response.json()).backend,'axiom');assert.ok(queryApl.includes(client));assert.ok(queryApl.includes(trace));assert.ok(queryApl.endsWith('limit 5'));assert.ok(queryApl.includes('["data.client_id"]'));assert.ok(queryApl.includes('tostring(["data.events"])'));assert.ok(!queryApl.includes('tostring(data.events)')); 
 assert.equal((await call('GET',undefined,{},'?client_id=bad')).status,400);
 assert.equal((await call('GET',undefined,{},'?limit=101')).status,400);
 queryFails=true;response=await call('GET');const fallback=await response.json();assert.equal(fallback.backend,'server_logs');assert.ok(!JSON.stringify(fallback).includes('provider secret'));
 assert.equal(dbCalls,0);fs.rmSync(dir,{recursive:true,force:true});
});
test('request telemetry keeps templates and safe correlation values without URL or header secrets',async()=>{
 const {jobRequestMetadata,observeJobRequest}=load('src/lib/jobObservability.ts');const {randomUUID}=require('node:crypto'),id=randomUUID();
 const meta=jobRequestMetadata(request('PATCH','/api/job-collection/'+id+'?apiKey=secret',{}, {'X-Jobs-Trace-Id':id,'X-Jobs-Client-Id':'secret'}),412,12);
 assert.equal(meta.route,'/api/job-collection/{id}');assert.equal(meta.requestId,id);assert.equal(meta.client_id,undefined);assert.ok(!JSON.stringify(meta).includes('secret'));
 const bad=jobRequestMetadata(request('POST','/api/job-workflow/secret'),400,5);assert.equal(bad.route,'unrecognized_jobs_route');
 const response=await observeJobRequest(request('POST','/api/job-collection'),async()=>new Response('{}',{status:201}));assert.equal(response.status,201);assert.ok(response.headers.get('X-Jobs-Request-Id'));
});

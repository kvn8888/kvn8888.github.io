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
let databaseCalls=0, authCalls=0
const db = {close(){}}
const mocks = {
  '@/auth': { auth: async () => session },
  '@/lib/jobsRequestAuth': {getJobsIdentity:async()=>{authCalls++;return null}},
  '@/lib/jobsDb': {getJobsDb:async()=>{databaseCalls++;throw Error('No database allowed')},ensureJobsSchema:async()=>{databaseCalls++;throw Error('No migration allowed')}},
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

test('public resources are anonymous, conditional and database-free; data stays private', async()=>{
 const original=global.fetch;global.fetch=async()=>new Response('{}',{status:404});
 try{
  const routes=load('src/app/api/job-workflow/[...path]/route.ts')
  for(const resource of ['discovery','openapi.json','guide','changes','releases']){
   const req=new Request('http://localhost/api/job-workflow/'+resource)
   const response=await routes.GET(req,{params:Promise.resolve({path:[resource]})})
   assert.equal(response.status,200);assert.ok(response.headers.get('etag'))
   const contents=await response.text();assert.ok(!contents.includes('/Users/'));assert.ok(!contents.includes('libsql://'))
   const cached=await routes.GET(new Request(req.url,{headers:{'If-None-Match':response.headers.get('etag')}}),{params:Promise.resolve({path:[resource]})})
   assert.equal(cached.status,304)
   const head=await routes.HEAD(new Request(req.url,{method:'HEAD'}),{params:Promise.resolve({path:[resource]})});assert.equal(head.status,200);assert.equal(await head.text(),'')
  }
  assert.equal(authCalls,0);assert.equal(databaseCalls,0)
  const data=await routes.GET(new Request('http://localhost/api/job-workflow/metrics'),{params:Promise.resolve({path:['metrics']})});assert.equal(data.status,401);assert.equal(databaseCalls,0)
  const post=await routes.POST(new Request('http://localhost/api/job-workflow/guide',{method:'POST'}),{params:Promise.resolve({path:['guide']})});assert.equal(post.status,401)
  load('src/auth.ts');assert.equal(await authConfig.callbacks.authorized({auth:null,request:{method:'GET',nextUrl:new URL('http://localhost/api/job-workflow/discovery')}}),true)
 }finally{global.fetch=original;fs.rmSync(dir,{recursive:true,force:true})}
})

test('only complete verified release manifests are advertised and satisfy public response schemas',async()=>{
 const original=global.fetch;
 const published=load('src/lib/jobWorkflowPublished.ts').published;
 const defs=load('src/lib/jobApiDefinition.ts');
 const publicApi=load('src/lib/jobWorkflowPublic.ts');
 const release={version:published.client_version,api_version:published.api_version,contract_hash:published.contract_hash,source_commit:'a'.repeat(40),build_hash:'b'.repeat(64),storage_schema:1,verified:true,verified_at:'2026-10-04T12:00:00.000Z',artifacts:['cli','extension'].map(kind=>({kind,name:kind+'.json',url:`https://github.com/kvn8888/kvn8888.github.io/releases/download/jobs-v${published.client_version}/${kind}.json`,size:100,sha256:'c'.repeat(64)}))};
 try {
  for(const candidate of [{...release,verified_at:undefined},{...release,verified_at:'invalid-date'},{...release,build_hash:undefined},{...release,artifacts:[]},{...release,verified:false}]){
   global.fetch=async()=>new Response(JSON.stringify(candidate));
   assert.deepEqual(await publicApi.verifiedReleases(),[]);
   const response=await publicApi.publicWorkflowResponse(new Request('http://localhost/api/job-workflow/discovery'),'discovery');
   const d=await response.json();assert.equal(d.latest_compatible_release,null);defs.responseSchemas.discovery.parse(d);
  }
  global.fetch=async()=>new Response(JSON.stringify(release));
  const response=await publicApi.publicWorkflowResponse(new Request('http://localhost/api/job-workflow/discovery'),'discovery');
  const d=await response.json();assert.equal(d.latest_compatible_release.verified_at,release.verified_at);defs.responseSchemas.discovery.parse(d);
 }finally{global.fetch=original;}
});

import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const token='a'.repeat(64),muse='b'.repeat(64);
const mf=new Miniflare(convertV4MiniflareOptions({modules:['worker.mjs','openapi.mjs'].map(name=>({type:'ESModule',path:new URL(name,import.meta.url).pathname})),compatibilityDate:'2026-10-02',compatibilityFlags:['nodejs_compat'],r2Buckets:['DOCUMENTS'],bindings:{BUILD:'test',OPENAPI:'{}',PRINCIPALS:JSON.stringify([{actor:'owner',role:'owner',hash:createHash('sha256').update(token).digest('hex')},{actor:'muse',role:'agent',hash:createHash('sha256').update(muse).digest('hex')}])}}));
const req=(path,method='GET',body,headers={},key=token)=>mf.dispatchFetch('https://test'+path,{method,headers:{authorization:'Bearer '+key,...headers},...(body?{body:JSON.stringify(body)}:{})});
try{
assert.equal((await req('/v1/documents','GET',null,{},'invalid')).status,401);
assert.equal((await req('/discovery','GET',null,{},'invalid')).status,200);
const body={content:'# Test',reason:'Synthetic test source'};
assert.equal((await req('/v1/documents/README.md','PUT',body)).status,428);
let r=await req('/v1/documents/README.md','PUT',body,{'If-None-Match':'*'});assert.equal(r.status,201);let tag=r.headers.get('etag');
assert.equal((await req('/v1/documents/README.md','PUT',body,{'If-None-Match':'*'})).status,412);
const race=await Promise.all([req('/v1/documents/README.md','PUT',{...body,content:'one'},{'If-Match':tag}),req('/v1/documents/README.md','PUT',{...body,content:'two'},{'If-Match':tag})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);
let history=await (await req('/v1/documents/README.md?history=1')).json();assert.equal(history.revisions.length,2);
assert.equal((await req('/v1/documents/automation/agents/hermes.md','PUT',body,{'If-None-Match':'*'},muse)).status,403);
assert.equal((await req('/v1/documents/automation/agents/muse.md','PUT',body,{'If-None-Match':'*'},muse)).status,201);
assert.equal((await req('/v1/documents/archive-old/example.md','PUT',body,{'If-None-Match':'*'},muse)).status,403);
assert.equal((await req('/v1/documents/huge.md','PUT',{...body,content:'x'.repeat(270000)},{'If-None-Match':'*'})).status,413);
assert.equal((await req('/v1/documents/bad.txt','PUT',body,{'If-None-Match':'*'})).status,400);
assert.equal((await req('/v1/documents/README.md','DELETE')).status,405);
assert.equal((await req('/v1/documents/README.md?revision='+history.revisions[1].revision)).status,200);
console.log('PASS: private reads, metadata, required versions, create races, concurrent updates, committed-only history, ownership, archives, size/path limits, no deletion, historical read');
}finally{await mf.dispose();}

#!/usr/bin/env python3
import concurrent.futures,hashlib,json,subprocess,urllib.request,urllib.error,uuid
BASE='https://job-search-workspace.kvn-c8888.workers.dev'
def secret(name):return subprocess.run(['doppler','secrets','get',name,'--plain','--project','personal','--config','dev_personal'],capture_output=True,text=True,check=True).stdout.strip()
def call(path,key=None,method='GET',body=None,extra=None):
 h={'User-Agent':'JobSearchVerification/1.0','Content-Type':'application/json',**(extra or {})}
 if key:h['Authorization']='Bearer '+key
 q=urllib.request.Request(BASE+path,headers=h,method=method,data=None if body is None else json.dumps(body).encode())
 try:
  with urllib.request.urlopen(q,timeout=30) as r:return r.status,json.load(r),r.headers
 except urllib.error.HTTPError as e:return e.code,None,e.headers
assert call('/v1/documents')[0]==401
assert call('/v1/documents/personal/demographics.md')[0]==401
assert call('/discovery')[0]==200
run=uuid.uuid4().hex
for actor in ['owner','codex','hermes','muse','grok']:
 key=secret('JOB_SEARCH_'+actor.upper()+'_TOKEN')
 status,identity,_=call('/v1/connection',key);assert status==200 and identity['actor']==actor
 path='/v1/documents/tests/'+actor+'/'+run+'.md';body={'content':'Synthetic credential verification only.','reason':'Migration smoke test; no private data'}
 status,doc,h=call(path,key,'PUT',body,{'If-None-Match':'*'});assert status==201,(actor,status)
 etag=h['ETag'];assert call(path,key)[1]['content']==body['content']
 with concurrent.futures.ThreadPoolExecutor(2) as ex:
  futures=[ex.submit(call,path,key,'PUT',{**body,'content':'Synthetic '+str(i)},{'If-Match':etag}) for i in range(2)]
  statuses=sorted(f.result()[0] for f in futures);assert statuses==[200,412],statuses
 assert call(path+'?history=1',key)[1]['revisions'].__len__()==2
 if actor!='owner':
  assert call('/v1/documents/automation/agents/other.md',key,'PUT',body,{'If-None-Match':'*'})[0]==403
  assert call('/v1/documents/archive-test/test.md',key,'PUT',body,{'If-None-Match':'*'})[0]==403
 print(actor+': live read/write, conflict and scope checks passed',flush=True)
print('Private data denied without auth; all 5 credentials verified. Remote agent harness adoption not tested.')

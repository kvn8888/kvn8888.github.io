#!/usr/bin/env python3
"""Import an explicit private Drive export. Reads JOB_SEARCH_OWNER_TOKEN from Doppler; never prints data or keys."""
import argparse,hashlib,json,subprocess,urllib.request,urllib.error
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('export_file');p.add_argument('--base',default='https://job-search-workspace.kvn-c8888.workers.dev');p.add_argument('--report',required=True);a=p.parse_args()
if not a.base.startswith('https://'):raise SystemExit('HTTPS required')
token=subprocess.run(['doppler','secrets','get','JOB_SEARCH_OWNER_TOKEN','--plain','--project','personal','--config','dev_personal'],capture_output=True,text=True,check=True).stdout.strip()
def request(path,method='GET',body=None,headers=None):
 h={'Authorization':'Bearer '+token,'User-Agent':'JobSearchMigration/1.0','Content-Type':'application/json',**(headers or {})}
 r=urllib.request.Request(a.base+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
 try:
  with urllib.request.urlopen(r,timeout=30) as response:return response.status,json.load(response),response.headers
 except urllib.error.HTTPError as e:
  raw=e.read()
  try: payload=json.loads(raw)
  except ValueError: payload={'error':'Non-JSON HTTP response','status':e.code,'type':e.headers.get('content-type'),'summary':raw[:160].decode(errors='replace')}
  return e.code,payload,e.headers
rows=json.loads(Path(a.export_file).read_text());seen=set();report=[]
for row in rows:
 path=row['path']
 if path in seen:raise SystemExit('Duplicate export path')
 seen.add(path);url='/v1/documents/'+urllib.parse.quote(path,safe='/')
 status,current,headers=request(url)
 if status==404:
  status,current,headers=request(url,'PUT',{'content':row['content'],'reason':'Migration from Drive file '+row['source_id']+'; preserve source bytes and attribution.'},{'If-None-Match':'*'})
 elif status==200 and current['content']!=row['content']:
  raise SystemExit('Existing document differs; refusing to overwrite: '+path)
 if status not in (200,201):raise SystemExit('Import failed '+str(status)+' '+path+' '+str(current.get('error'))+' '+str(current.get('summary','')))
 status,readback,_=request(url)
 checksum=hashlib.sha256(row['content'].encode()).hexdigest()
 if status!=200 or readback['sha256']!=checksum or readback['content']!=row['content']:raise SystemExit('Readback mismatch '+path)
 report.append({'path':path,'source_id':row['source_id'],'sha256':checksum,'revision':readback['revision']})
 print('Verified '+path,flush=True)
Path(a.report).write_text(json.dumps({'documents':report,'count':len(report)},indent=2)+'\n')

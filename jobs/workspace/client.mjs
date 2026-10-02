#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
const [command,path,...rest]=process.argv.slice(2);
const base=process.env.JOB_SEARCH_API_URL||'https://job-search-workspace.kvn-c8888.workers.dev';
if(!base.startsWith('https://'))throw Error('HTTPS required');
const token=process.env.JOB_SEARCH_TOKEN;if(!token)throw Error('Set JOB_SEARCH_TOKEN from your private credential store');
let route='/v1/documents',options={method:'GET',headers:{Authorization:'Bearer '+token}};
if(command==='get'||command==='history'){if(!path)throw Error('Document path required');route+='/'+path+(command==='history'?'?history=1':'');}
else if(command==='put'){
 const [file,etag,reason]=rest;if(!path||!file||!etag||!reason)throw Error('put <path> <file> <etag|new> <reason>');
 route+='/'+path;options={method:'PUT',headers:{...options.headers,'Content-Type':'application/json',...(etag==='new'?{'If-None-Match':'*'}:{'If-Match':etag})},body:JSON.stringify({content:await readFile(file,'utf8'),reason})};
}else if(command!=='list')throw Error('Commands: list | get <path> [output.json] | history <path> | put <path> <file> <etag|new> <reason>');
const r=await fetch(base+route,options);const data=await r.json();if(!r.ok){console.error(JSON.stringify({status:r.status,...data}));process.exit(1);}
const result=JSON.stringify({etag:r.headers.get('etag'),...data},null,2)+'\n';
if(command==='get'&&rest[0])await writeFile(rest[0],result,{mode:0o600});else process.stdout.write(result);

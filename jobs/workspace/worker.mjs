import { timingSafeEqual } from 'node:crypto';
import openapi from './openapi.mjs';
const MAX=262144;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const err=(status,message)=>json({error:message},status);
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const validPath=p=>p.length<=240 && /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.md$/.test(p);
function writable(actor,path){
 if(actor.role==='owner')return true;
 if(path.startsWith('archive-')||path.startsWith('snapshots/'))return false;
 if(path.startsWith('automation/agents/'))return path===`automation/agents/${actor.actor==='grok'?'grok-bot':actor.actor}.md`;
 return !path.startsWith('tests/')||path.startsWith(`tests/${actor.actor}/`);
}
async function limitedBody(request){
 const reader=request.body?.getReader(); if(!reader)return null;
 let size=0;const parts=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();throw new Error('too_large');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return null;}
}
async function principal(request,env){
 const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,160})$/)?.[1];if(!token)return null;
 const hash=await sha(token);const candidate=Buffer.from(hash,'hex');
 return JSON.parse(env.PRINCIPALS).find(p=>/^[a-f0-9]{64}$/.test(p.hash)&&timingSafeEqual(candidate,Buffer.from(p.hash,'hex')))??null;
}
const quote=v=>'"'+v+'"';
async function route(request,env){
 const url=new URL(request.url);const method=request.method;
 if(method==='GET'&&url.pathname==='/discovery')return json({name:'Job search workspace',api_version:'1.0.0',build:env.BUILD,storage:'private-r2',authentication:'Bearer token',links:{openapi:url.origin+'/openapi.json',documents:url.origin+'/v1/documents',start:url.origin+'/v1/documents/README.md',workflow:'https://www.kevinc.dev/api/job-workflow/discovery'},limits:{max_request_bytes:MAX},write_protocol:'Read ETag, PUT with If-Match; new documents use If-None-Match: *. 412 means reread and merge. Each save requires a sourced change reason. No delete operation.'});
 if(method==='GET'&&url.pathname==='/openapi.json')return json(openapi);
 const actor=await principal(request,env);if(!actor)return err(401,'Unauthorized');
 if(url.pathname==='/v1/connection'&&method==='GET')return json({actor:actor.actor,role:actor.role});
 if(url.pathname==='/v1/documents'&&method==='GET'){
  const prefix=url.searchParams.get('prefix')||'';if(prefix.includes('..')||prefix.startsWith('/'))return err(400,'Invalid prefix');
  const page=await env.DOCUMENTS.list({prefix:'heads/'+prefix,limit:100,cursor:url.searchParams.get('cursor')||undefined});
  return json({documents:page.objects.map(o=>({path:o.key.slice(6)})),cursor:page.truncated?page.cursor:null});
 }
 if(!url.pathname.startsWith('/v1/documents/'))return err(404,'Not found');
 let path;try{path=decodeURIComponent(url.pathname.slice(14));}catch{return err(400,'Invalid path');}
 if(!validPath(path))return err(400,'Invalid document path');
 const key='heads/'+path;const head=await env.DOCUMENTS.get(key);const current=head?await head.json():null;
 if(method==='GET'){
  if(!current)return err(404,'Document not found');
  const target=url.searchParams.get('revision');let rev=current.revision;
  const history=url.searchParams.get('history')==='1';const items=[];let found=null;
  // Bounded traversal. Orphan revisions from losing writers are never exposed.
  for(let i=0;rev&&i<100;i++){
   const obj=await env.DOCUMENTS.get('versions/'+path+'/'+rev);if(!obj)return err(503,'Revision unavailable');
   const value=await obj.json();if(history){const {content,...meta}=value;items.push(meta);}else if(!target||target===rev){found=value;break;}rev=value.parent;
  }
  if(history)return json({revisions:items,truncated:!!rev,etag:quote(head.etag)});
  if(!found)return err(404,'Revision not found in latest 100 revisions');
  return json(found,200,{ETag:quote(head.etag)});
 }
 if(method!=='PUT')return err(405,'Method not allowed');
 if(!writable(actor,path))return err(403,'Path is not writable by this agent');
 const match=request.headers.get('if-match'),none=request.headers.get('if-none-match');
 if(current ? match!==quote(head.etag)||!!none : none!=='*'||!!match)return err(match||none?412:428,'Read current version before writing; use If-Match or If-None-Match: *');
 let body;try{body=await limitedBody(request);}catch(e){if(e.message==='too_large')return err(413,'Document too large');throw e;}
 if(!body||typeof body.content!=='string'||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)return err(400,'content and a sourced reason are required');
 const revision=crypto.randomUUID();const entry={path,revision,parent:current?.revision??null,actor:actor.actor,updated_at:new Date().toISOString(),reason:body.reason,content:body.content,sha256:await sha(body.content)};
 await env.DOCUMENTS.put('versions/'+path+'/'+revision,JSON.stringify(entry),{onlyIf:{etagDoesNotMatch:'*'}});
 const updated=await env.DOCUMENTS.put(key,JSON.stringify({revision}),{onlyIf:head?{etagMatches:head.etag}:{etagDoesNotMatch:'*'}});
 if(!updated)return err(412,'Concurrent update; reread and merge');
 return json(entry,head?200:201,{ETag:quote(updated.etag)});
}
export default {async fetch(request,env){try{return await route(request,env);}catch{return err(503,'Workspace temporarily unavailable');}}};

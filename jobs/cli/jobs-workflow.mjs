#!/usr/bin/env node
// jobs-workflow managed CLI
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const VERSION='0.3.0';
const BASE='https://www.kevinc.dev';
const REPOSITORY='https://github.com/kvn8888/kvn8888.github.io/releases/download/';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
const exists=async p=>{try{await fs.access(p);return true}catch{return false}};
const readJson=async(p,fallback)=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e}};
async function saveJson(p,value){await fs.mkdir(path.dirname(p),{recursive:true,mode:0o700});const temp=p+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(temp,p)}
export function compatible(d,kind='cli',version=VERSION){const rule=d?.supported_clients?.[kind];const parts=v=>String(v).split('.').map(Number);if(!rule||!/^\d+\.\d+\.\d+$/.test(version))return false;const a=parts(version),b=parts(rule.min);return a[0]<=rule.max_major&&(a[0]>b[0]||a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>=b[2]))}
async function bounded(response,max=20000000){if(!response.ok)throw Error(`HTTP ${response.status}`);const chunks=[];let n=0;for await(const chunk of response.body){n+=chunk.length;if(n>max)throw Error('Download exceeds size limit');chunks.push(chunk)}return Buffer.concat(chunks)}
export async function syncDocs(home,base=BASE,fetcher=fetch){
 const dir=path.join(home,'cache');const old=await readJson(path.join(dir,'discovery.json'),{});
 const etags=await readJson(path.join(dir,'etags.json'),{});
 async function resource(name,url,max){const response=await fetcher(url,{headers:etags[name]?{'If-None-Match':etags[name]}:{},signal:AbortSignal.timeout(15000)});if(response.status===304)return name==='guide'?await fs.readFile(path.join(dir,'guide.md'),'utf8'):await readJson(path.join(dir,name+'.json'));const bytes=await bounded(response,max);const tag=response.headers.get('etag');if(tag)etags[name]=tag;return name==='guide'?bytes.toString():JSON.parse(bytes.toString())}
 let d;
 try{d=await resource('discovery',base+'/api/job-workflow/discovery',2000000);if(typeof d.revision!=='string'||typeof d.contract_hash!=='string'||!d.links)throw Error('Invalid discovery document');
  const resources={discovery:d};for(const name of ['guide','changes','openapi','releases']){const url=new URL(d.links[name]);if(url.origin!==new URL(base).origin)throw Error('Discovery link changed origin');resources[name]=await resource(name,url,5000000)}
  if(d.guide_hash&&sha256(resources.guide)!==d.guide_hash)throw Error('Guide changed during sync; retry');
  if(resources.changes.revision&&resources.changes.revision!==d.revision)throw Error('Release changed during sync; retry');
  if(resources.openapi.openapi&&sha256(JSON.stringify(resources.openapi,null,2)+'\n')!==d.contract_hash)throw Error('OpenAPI changed during sync; retry');
  for(const [name,value] of Object.entries(resources)){if(name==='guide'){await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.writeFile(path.join(dir,'guide.md'),value,{mode:0o600})}else await saveJson(path.join(dir,name+'.json'),value)}
  await saveJson(path.join(dir,'etags.json'),etags);
  await saveJson(path.join(dir,'status.json'),{checked_at:new Date().toISOString(),revision:d.revision});
  return {online:true,compatible:compatible(d),changed:old.revision!==d.revision,api_version:d.api_version,revision:d.revision,guide:path.join(dir,'guide.md'),changes:path.join(dir,'changes.json')};
 }catch(e){return {online:false,compatible:false,error:String(e.message),cached_guide:await exists(path.join(dir,'guide.md'))?path.join(dir,'guide.md'):null,action:'Read cached guidance if useful; do not start new remote work until sync succeeds.'}}
}
export async function discoverChrome(userHome=os.homedir()){
 const root=path.join(userHome,'Library/Application Support/Google/Chrome');const found=new Map();
 for(const profile of await fs.readdir(root,{withFileTypes:true}).catch(()=>[])){if(!profile.isDirectory())continue;
  for(const file of ['Preferences','Secure Preferences']){
   const data=await readJson(path.join(root,profile.name,file),{}).catch(()=>({}));
   for(const [id,item] of Object.entries(data.extensions?.settings||{})){const m=item.manifest||{};if(m.name!=='JobsUtilityExtension'&&!String(item.path||'').toLowerCase().includes('jobsutilityextension'))continue;
    if(!path.isAbsolute(item.path||''))continue;const manifest=await readJson(path.join(item.path,'manifest.json'),{}).catch(()=>({}));if(manifest.name!=='JobsUtilityExtension')continue;
    found.set(profile.name+id,{profile:profile.name,extension_id:id,path:item.path,version:manifest.version,verification:'profile_metadata_only'});
   }
  }
 }
 return [...found.values()];
}
export function validateBundle(bytes,artifact){
 if(bytes.length!==artifact.size||sha256(bytes)!==artifact.sha256)throw Error('Release checksum/size mismatch');
 const b=JSON.parse(bytes.toString());if(b.format!==1||!/^\d+\.\d+\.\d+$/.test(b.version)||!/^[a-f0-9]{64}$/.test(b.build_hash)||!b.files||typeof b.files!=='object')throw Error('Invalid extension bundle');
 let size=0;const files={};
 for(const [name,encoded] of Object.entries(b.files)){
  if(typeof encoded!=='string'||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').some(x=>!x||x==='.'||x==='..')||/(^|\/)(\.env|\.git|node_modules)(\/|$|\.)/.test(name))throw Error('Unsafe archive path');
  if(Object.keys(files).length>=200)throw Error('Too many archive files');const data=Buffer.from(encoded,'base64');size+=data.length;if(size>20000000)throw Error('Expanded bundle too large');files[name]=data;
 }
 const m=JSON.parse(files['manifest.json']?.toString()||'null');const info=JSON.parse(files['build-info.json']?.toString()||'null');
 if(m?.name!=='JobsUtilityExtension'||m.version!==b.version||info?.build_hash!==b.build_hash||info?.version!==b.version)throw Error('Bundle identity mismatch');
 return {...b,files};
}
export function validateDiagnostics(report,{expectedId,version,buildHash,after,idle=false,now=Date.now()}={}){
 if(report?.schema_version!==1||!Number.isFinite(Date.parse(report.generated_at))||now-Date.parse(report.generated_at)>300000||Date.parse(report.generated_at)>now+10000)throw Error('Fresh diagnostics from the running extension are required (five-minute limit)');
 if(!/^[a-p]{32}$/.test(report.extension_id||''))throw Error('Invalid running extension identity');
 if(expectedId&&report.extension_id!==expectedId)throw Error('Diagnostics belong to a different extension');
 if(version&&report.version!==version||buildHash&&report.build_hash!==buildHash)throw Error('Running extension has not loaded the intended release');
 if(after&&Date.parse(report.generated_at)<Date.parse(after))throw Error('Download diagnostics after the reload');
 if(idle&&(report.safe_to_reload!==true||report.active_captures!==0||report.pending_queue!==0||report.active_attempts!==0||report.collection_sites!==0))throw Error('Extension is busy: pause collection and finish active captures/attempts and pending writes');
 return report;
}
async function assertDirectory(target){if(path.parse(target).root===target||target===os.homedir())throw Error('Unsafe installation directory');const stat=await fs.lstat(target).catch(()=>null);if(stat?.isSymbolicLink())throw Error('Installation path must not be a symlink');if(stat){const m=await readJson(path.join(target,'manifest.json'),{});if(m.name!=='JobsUtilityExtension')throw Error('Refusing to replace an unrelated directory')}}
export async function installBundle(target,bundle,{interruptAfterStage=false}={}){
 target=path.resolve(target);await assertDirectory(target);await fs.mkdir(path.dirname(target),{recursive:true});
 const lock=target+'.jobs-lock';await fs.mkdir(lock).catch(()=>{throw Error('Another update or interrupted updater owns the installation lock; inspect it before recovery')});
 const stage=target+'.jobs-stage-'+randomUUID(),backup=target+'.jobs-previous';let moved=false;
 try{
  await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,stage,backup}),{mode:0o600});await fs.mkdir(stage,{mode:0o700});
  for(const [name,bytes] of Object.entries(bundle.files)){const dest=path.join(stage,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes)}
  // Preserve an existing explicit manifest key; adding/changing it would change extension identity.
  const current=await readJson(path.join(target,'manifest.json'),{});if(current.key){const next=await readJson(path.join(stage,'manifest.json'));next.key=current.key;await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(next,null,2))}
  if(interruptAfterStage)throw Error('Simulated interrupted staging');
  if(await exists(target)){await assertDirectory(backup);await fs.rm(backup,{recursive:true,force:true});await fs.rename(target,backup);moved=true}
  await fs.rename(stage,target);return {path:target,backup:moved?backup:null,status:'reload_required',expected_version:bundle.version,expected_build_hash:bundle.build_hash};
 }catch(e){if(moved&&!await exists(target))await fs.rename(backup,target);throw e}finally{await fs.rm(stage,{recursive:true,force:true});await fs.rm(lock,{recursive:true,force:true})}
}
const skill=`---\nname: jobs-workflow\ndescription: Use for Kevin's job collection, applications, tracker API, captures, blockers, and JobsUtilityExtension installation or updates.\n---\n\n<!-- jobs-workflow:managed -->\n\nRun jobs-workflow sync at task start and before starting a new submission attempt. Read the returned canonical guide and changes when the revision changes. Discovery: ${BASE}/api/job-workflow/discovery\n\nUse jobs-workflow doctor for connectivity and compatibility, and the extension subcommands for guided Chrome installation/update. Never report an update complete from files alone; verify fresh running-extension diagnostics.\n\nKeep credentials in explicitly configured environment variables or protected files. This skill grants no permission to submit employer applications, solve CAPTCHAs, or take unrelated actions. If sync is offline/incompatible, preserve local work and reconcile before starting new remote activity.\n`;
export async function setupAgent(target,userHome=os.homedir(),cliSource=fileURLToPath(import.meta.url)){
 const locations={codex:['.codex/skills/jobs-workflow/SKILL.md','.codex/AGENTS.md'],claude:['.claude/skills/jobs-workflow/SKILL.md','.claude/CLAUDE.md'],hermes:['.hermes/skills/jobs-workflow/SKILL.md','.hermes/SOUL.md']};
 if(!locations[target])throw Error('target must be codex, claude, or hermes');
 const binary=path.join(userHome,'.local/bin/jobs-workflow');await fs.mkdir(path.dirname(binary),{recursive:true});if(await exists(binary)&&!(await fs.readFile(binary,'utf8')).includes('// jobs-workflow managed CLI'))throw Error('Existing jobs-workflow command is not managed by this installer');
 await fs.copyFile(cliSource,binary);await fs.chmod(binary,0o755);
 const [skillRel,instructionsRel]=locations[target],skillPath=path.join(userHome,skillRel),instructions=path.join(userHome,instructionsRel);await fs.mkdir(path.dirname(skillPath),{recursive:true});if(await exists(skillPath)&&!(await fs.readFile(skillPath,'utf8')).includes('<!-- jobs-workflow:managed -->'))throw Error('Existing bootstrap skill is not managed; preserve and reconcile it explicitly');await fs.writeFile(skillPath,skill.replaceAll('jobs-workflow sync',binary+' sync').replaceAll('jobs-workflow doctor',binary+' doctor'));
 const begin='<!-- jobs-workflow:start -->',end='<!-- jobs-workflow:end -->';const block=`${begin}\nFor job tracker, collection, application workflow, or JobsUtilityExtension tasks, read ${skillPath} and run ${binary} sync. Follow the current canonical guide; do not rely on copied endpoint instructions.\n${end}`;
 const old=await fs.readFile(instructions,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e});const start=old.indexOf(begin),finish=old.indexOf(end);if((start>=0)!==(finish>=0))throw Error('Incomplete managed instruction block; repair explicitly');
 const next=start>=0?old.slice(0,start)+block+old.slice(finish+end.length):old.trimEnd()+'\n\n'+block+'\n';await fs.mkdir(path.dirname(instructions),{recursive:true});if(next!==old)await fs.writeFile(instructions,next);
 return {target,command:binary,skill:skillPath,instructions,changed:next!==old,note:'Existing conversations may need to load the skill once. No shell profile was modified.'};
}
async function credential(){if(process.env.JOBS_API_KEY)return process.env.JOBS_API_KEY.trim();if(process.env.JOBS_WORKFLOW_KEY_FILE){const p=process.env.JOBS_WORKFLOW_KEY_FILE;const s=await fs.stat(p);if(s.mode&0o077)throw Error('Credential file must be owner-only');const value=(await fs.readFile(p,'utf8')).trim();return value.startsWith('JOBS_API_KEY=')?value.slice(13).trim():value}return null}
export async function main(args=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Node.js 20 or newer is required');
 const option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1]};
 const home=process.env.JOBS_WORKFLOW_HOME||path.join(os.homedir(),'.config/jobs-workflow');const configFile=path.join(home,'config.json');const config=await readJson(configFile,{});const base=config.base_url||BASE;
 if(new URL(base).origin!==BASE&&!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Only the canonical API or explicit localhost development is supported');
 const [command,sub]=args;let result;
 if(command==='sync')result=await syncDocs(home,base);
 else if(command==='doctor'){
  const sync=await syncDocs(home,base);let access='not_configured';const key=await credential();if(key&&sync.online){const r=await fetch(base+'/api/job-workflow/connection',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});access=r.ok?(await r.json()).access:`HTTP ${r.status}`}
  result={version:VERSION,node:process.versions.node,...sync,credential_access:access,extension:config.extension||null,chrome_candidates:process.platform==='darwin'?await discoverChrome():[]};
 }else if(command==='agent'&&sub==='setup')result=await setupAgent(option('target'));
 else if(command==='extension'){
  if(process.platform!=='darwin'&&!process.env.JOBS_WORKFLOW_TEST)throw Error('Chrome management currently supports macOS only; sync and agent setup work on Linux');
  const report=option('diagnostics')?await readJson(option('diagnostics')):null;
  if(sub==='verify'){
   const installation=config.extension;if(!installation)throw Error('No managed installation');validateDiagnostics(report,{expectedId:installation.extension_id,version:installation.expected_version,buildHash:installation.expected_build_hash,after:installation.updated_at});
   installation.extension_id=report.extension_id;installation.status='verified';installation.verified_at=new Date().toISOString();await saveJson(configFile,config);result=installation;
  }else if(sub==='install'||sub==='update'){
   const sync=await syncDocs(home,base);if(!sync.online||!sync.compatible)throw Error('Live compatible discovery is required before installation');
   const catalog=await readJson(path.join(home,'cache/releases.json'));const release=catalog.releases?.[0];if(!release?.verified)throw Error('No verified compatible release is advertised');const artifact=release.artifacts.find(a=>a.kind==='extension');
   if(!artifact||!artifact.url.startsWith(REPOSITORY)||!/^jobs-v[\d.]+\/[^/]+$/.test(artifact.url.slice(REPOSITORY.length)))throw Error('Untrusted release URL');
   const bytes=await bounded(await fetch(artifact.url,{signal:AbortSignal.timeout(30000)}));const bundle=validateBundle(bytes,artifact);
   await fs.mkdir(path.join(home,'staged'),{recursive:true,mode:0o700});await fs.writeFile(path.join(home,'staged',artifact.sha256+'.json'),bytes,{mode:0o600});
   let installation=config.extension;const candidates=await discoverChrome();
   if(!installation&&option('path')){if(!option('extension-id'))throw Error('--extension-id is required when adopting an existing path');installation={path:path.resolve(option('path')),extension_id:option('extension-id'),profile:option('profile')||null};await assertDirectory(installation.path)}
   if(!installation&&candidates.length===1)installation=candidates[0];
   if(!installation&&args.includes('--new')){if(candidates.length)throw Error('An existing installation was found; adopt it instead of making a duplicate');installation={path:path.join(os.homedir(),'Library/Application Support/JobsUtilityExtension/current'),extension_id:null,profile:option('profile')||null}}
   if(installation&&candidates.filter(c=>path.resolve(c.path)===path.resolve(installation.path)).length>1)throw Error('This code folder is loaded in multiple Chrome profiles; resolve all active installations before updating');
   if(!installation)result={status:'installation_selection_required',candidates,action:'Select Chrome profile/exact loaded path and extension ID, or confirm a fresh install with --new.'};
   else if(await exists(installation.path)&&!report&&!args.includes('--legacy-idle-confirmed'))result={status:'idle_diagnostics_required',installation,action:'Pause collection, finish active work and pending writes, download Diagnostics, rerun with --diagnostics <file>.'};
   else{
    if(await exists(installation.path)){
      const installed=await readJson(path.join(installation.path,'manifest.json'));
      if(!report&&args.includes('--legacy-idle-confirmed')&&installed.version==='0.2.0'){if(!installation.extension_id)throw Error('Legacy adoption requires the Chrome extension ID');}
      else validateDiagnostics(report,{expectedId:installation.extension_id,idle:true});
    }
    const installed=await installBundle(installation.path,bundle);config.extension={...installation,...installed,updated_at:new Date().toISOString()};await saveJson(configFile,config);result={...config.extension,action:'Use chrome://extensions to Load unpacked (fresh install) or Reload. Then download new Diagnostics and run extension verify.'};
   }
  }else if(sub==='rollback'){
   const installation=config.extension;if(!installation?.backup)throw Error('No previous release');validateDiagnostics(report,{expectedId:installation.extension_id,idle:true});
   const previous=await readJson(path.join(installation.backup,'build-info.json'));const current=await readJson(path.join(installation.path,'build-info.json'));if(previous.storage_schema!==current.storage_schema)throw Error('Storage schema differs; automatic rollback refused');
   const files={};for(const name of await fs.readdir(installation.backup)){const p=path.join(installation.backup,name);if(!(await fs.lstat(p)).isFile())throw Error('Unexpected backup entry');files[name]=await fs.readFile(p)}
   const done=await installBundle(installation.path,{...previous,files});config.extension={...installation,...done,updated_at:new Date().toISOString()};await saveJson(configFile,config);result=config.extension;
  }else throw Error('Use extension install, update, verify, or rollback');
 }else result={version:VERSION,commands:['doctor','sync','extension install [--new | --path <loaded path> --extension-id <id>]','extension update --diagnostics <fresh report>','extension verify --diagnostics <fresh report>','extension rollback --diagnostics <fresh report>','agent setup --target codex|claude|hermes'],discovery:BASE+'/api/job-workflow/discovery'};
 console.log(JSON.stringify(result,null,2));if(result.online===false||result.compatible===false)process.exitCode=2;return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=1});

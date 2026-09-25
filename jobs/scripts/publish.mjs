import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const mode=process.argv[2],dir='jobs/release',manifest=JSON.parse(await fs.readFile(dir+'/release.json','utf8')),tag='jobs-v'+manifest.version;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']});
if(git('rev-parse',tag+'^{commit}')!==manifest.source_commit)throw Error('Tag does not match artifact source commit');
for(const artifact of manifest.artifacts){const bytes=await fs.readFile(dir+'/'+artifact.name);if(bytes.length!==artifact.size||createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw Error('Artifact changed: '+artifact.name)}
if(mode==='prepare'){
 if(git('status','--porcelain','--untracked-files=no'))throw Error('Tracked working tree must be clean');
 const notes=dir+'/notes.md';await fs.writeFile(notes,`Jobs workflow ${manifest.version}\n\nAPI ${manifest.api_version}. Generated docs, CLI, Chrome diagnostics and guided updates.\nSource: ${manifest.source_commit}\n\nCanonical guide: https://www.kevinc.dev/jobs/docs\n`);
 gh('release','create',tag,'--draft','--verify-tag','--title','Jobs workflow '+manifest.version,'--notes-file',notes,...manifest.artifacts.map(a=>dir+'/'+a.name));
 console.log('Draft artifacts uploaded. Deploy and verify the backend before promote.');
}else if(mode==='promote'){
 const release=JSON.parse(gh('release','view',tag,'--json','isDraft'));if(!release.isDraft)throw Error('Published releases are immutable; refuse overwrite');
 const base='https://www.kevinc.dev';const discovery=await(await fetch(base+'/api/job-workflow/discovery')).json();
 if(discovery.contract_hash!==manifest.contract_hash||discovery.deployed_commit!==manifest.source_commit)throw Error('Deployed commit or contract differs from release');
 const spec=await(await fetch(base+'/api/job-workflow/openapi.json')).json();if(createHash('sha256').update(JSON.stringify(spec,null,2)+'\n').digest('hex')!==manifest.contract_hash)throw Error('Live OpenAPI differs');
 const key=process.env.JOBS_API_KEY;if(!key)throw Error('JOBS_API_KEY is required for private read verification; supply through the environment');
 const response=await fetch(base+'/api/job-workflow/connection',{headers:{Authorization:'Bearer '+key}});if(!response.ok)throw Error('Authenticated connection check failed');
 for(const route of ['/api/jobs?view=applied&limit=1','/api/job-collection?limit=1'])if(!(await fetch(base+route,{headers:{Authorization:'Bearer '+key}})).ok)throw Error('Authenticated read failed');
 manifest.verified=true;manifest.verified_at=new Date().toISOString();await fs.writeFile(dir+'/release.json',JSON.stringify(manifest,null,2)+'\n');
 gh('release','upload',tag,dir+'/release.json');gh('release','edit',tag,'--draft=false');console.log('Verified immutable release published. Discovery can now advertise it.');
}else throw Error('Use prepare or promote');

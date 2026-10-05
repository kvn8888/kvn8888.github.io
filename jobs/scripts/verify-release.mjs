#!/usr/bin/env node
// Read-only production verification; only the local unpublished manifest is modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {responseSchemas} from '../../homepage/src/lib/jobApiDefinition.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'jobs/release/release.json');
const manifest=JSON.parse(await fs.readFile(output,'utf8'));
const expected=process.argv[2];if(!/^[a-f0-9]{40}$/.test(expected||''))throw Error('Provide the expected deployed commit');
const key=process.env.JOBS_API_KEY;if(!key)throw Error('JOBS_API_KEY must be configured in the environment');
const base='https://www.kevinc.dev';
const discoveryResponse=await fetch(base+'/api/job-workflow/discovery');if(!discoveryResponse.ok)throw Error('Discovery unavailable');
const discovery=responseSchemas.discovery.parse(await discoveryResponse.json());
if(discovery.deployed_commit!==expected||discovery.contract_hash!==manifest.contract_hash)throw Error('Deployed revision or contract does not match');
const specResponse=await fetch(base+'/api/job-workflow/openapi.json');if(!specResponse.ok)throw Error('OpenAPI unavailable');
const spec=await specResponse.json();if(spec.info.version!==manifest.api_version)throw Error('API version mismatch');
const catalog=await fetch(base+'/api/job-workflow/releases');if(!catalog.ok)throw Error('Release catalog unavailable');responseSchemas.releases.parse(await catalog.json());
const connection=await fetch(base+'/api/job-workflow/connection',{headers:{Authorization:'Bearer '+key}});if(!connection.ok)throw Error('Authenticated connection failed');
const reads=await fetch(base+'/api/job-collection?limit=1',{headers:{Authorization:'Bearer '+key}});if(!reads.ok)throw Error('Authenticated read failed');await reads.json();
for(const artifact of manifest.artifacts){
 if(path.basename(artifact.name)!==artifact.name)throw Error('Invalid artifact filename');
 const bytes=await fs.readFile(path.join(root,'jobs/release',artifact.name));
 if(bytes.length!==artifact.size||createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw Error('Artifact checksum mismatch');
}
const verified={...manifest,verified:true,verified_at:new Date().toISOString()};responseSchemas.releases.parse({releases:[verified]});
await fs.writeFile(output,JSON.stringify(verified,null,2)+'\n');
console.log(JSON.stringify({verified:true,version:verified.version,verified_at:verified.verified_at,source_commit:verified.source_commit,deployed_commit:discovery.deployed_commit,contract_hash:discovery.contract_hash,production_writes:0}));

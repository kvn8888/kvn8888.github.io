import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import SwaggerParser from '@apidevtools/swagger-parser'
import {buildOpenApi,endpoints,requestSchemas,responseSchemas,jobWorkflowContract} from '../../homepage/src/lib/jobApiDefinition'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
await SwaggerParser.validate(buildOpenApi() as any)
const ids=new Set();for(const op of endpoints){if(ids.has(op.operationId))throw Error('Duplicate operation');ids.add(op.operationId);const route=op.path.startsWith('/api/job-workflow/')?'homepage/src/app/api/job-workflow/[...path]/route.ts':`homepage/src/app${op.path.replace('{id}','[id]')}/route.ts`;const source=await fs.readFile(path.join(root,route),'utf8');if(!new RegExp(`export (?:async function|const) ${op.method.toUpperCase()}`).test(source))throw Error(`Unimplemented operation ${op.operationId}`)}
for(const [name,entry] of Object.entries(jobWorkflowContract.writes)){const schema=requestSchemas[name as keyof typeof requestSchemas];for(const key of Object.keys(entry.body))if(!(key in schema.shape))throw Error('Legacy contract has undocumented field '+name+'.'+key)}
const uuid='830348da-e1fb-4b16-96da-be1081a9a270'
requestSchemas.claim.parse({id:uuid,collection_id:uuid,version:1,claim_token:'x'.repeat(32)})
requestSchemas.complete.parse({claim_token:'x'.repeat(32),confirmed:true,confirmation_kind:'user_confirmed',submitted_at:'2026-09-25T12:00:00Z'})
responseSchemas.applicationCreated.parse({id:1,message:'Created',replayed:false})
const docs=await fs.readFile(path.join(root,'homepage/src/lib/jobWorkflowPublished.ts'),'utf8');if(/\/Users\/|\/home\/pi\/|libsql:\/\/|JOBS_API_KEY=[^<>\s]/.test(docs))throw Error('Private source detail in public docs')
console.log(`Validated OpenAPI, ${endpoints.length} implemented operations, legacy guide fields, examples and sanitized public docs`)

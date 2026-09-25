import { z } from 'zod'
import { legacyWorkflowGuide } from './jobWorkflowGuide'

export const API_VERSION = '1.1.0'
export const CLIENT_VERSION = '0.3.0'
export const BASE_URL = 'https://www.kevinc.dev'
const text = z.string().max(2000)
const nullableText = text.nullable().optional()
const longText = z.string().max(50000).nullable().optional()
const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.string().max(40).describe('ISO timestamp with a timezone; validated and normalized by the service')
const json = z.unknown().describe('Arbitrary JSON value; transport accepts JSON only')
const jsonObject = z.record(z.string(), json)
const token = z.string().min(1).max(200).describe('Original private claim token; new claims require 32+ characters')
const maybe = <T extends z.ZodType>(schema: T) => schema.nullable().optional()
const strict = (shape: z.ZodRawShape) => z.strictObject(shape)

export const applicationShape = {
 company: text, role: text, description: longText, date: nullableText, source: nullableText,
 type: nullableText, cover_letter: longText, resume_type: nullableText, location: nullableText, work_mode: nullableText,
 status: nullableText, application_url: nullableText, external_id: nullableText, agent_model: nullableText,
 started_at: nullableText, completed_at: nullableText, submitted_at: nullableText,
 duration_seconds: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
 blocker: longText, evidence_refs: longText, other_details: z.string().max(1000000).nullable().optional(),
}
const collectionShape = {
 id, identity_key:text, company:nullableText, role:nullableText, description:longText,
 description_status:z.enum(['missing','partial','full']).optional(), source:text, source_job_id:nullableText,
 source_url:z.string().max(8000), application_url:maybe(z.string().max(8000)), canonical_url:maybe(z.string().max(8000)),
 ats_provider:nullableText,ats_tenant:nullableText,ats_job_id:nullableText,
 resolution_status:z.enum(['unresolved','resolved','in_board','unavailable']).optional(),
 type:nullableText,employment_type:nullableText,location:nullableText,work_mode:nullableText,
 posted_at:nullableText,posted_at_raw:nullableText,first_seen_at:timestamp.optional(),last_seen_at:timestamp.optional(),archived_at:maybe(timestamp),
 role_tags_json:z.union([z.array(z.string()),z.string()]).optional(),locations_json:z.union([z.array(jsonObject),z.string()]).optional(),
 sources_json:z.union([z.array(jsonObject),z.string()]).optional(),metadata_json:z.union([jsonObject,z.string()]).optional(),
 application_ids_json:z.union([z.array(version),z.string()]).optional(),status:text.optional(),status_notes:longText,
}
export const requestSchemas = {
 parse: z.object({text:z.string().min(1)}).passthrough(),
 applicationCreate:strict(applicationShape),
 applicationPatch:strict({...Object.fromEntries(Object.entries(applicationShape).map(([k,v])=>[k,v.optional()])),interviewed:z.union([z.boolean(),z.literal(0),z.literal(1)]).optional()}),
 collectionCreate:strict(collectionShape),
 collectionPatch:strict(Object.fromEntries(Object.entries(collectionShape).filter(([k])=>!['id','identity_key','source','first_seen_at'].includes(k)).map(([k,v])=>[k,v.optional()]))),
 claim:strict({id,collection_id:id,version,claim_token:token.min(32),worker_id:nullableText,agent_model:nullableText,parent_attempt_id:json.optional(),manual:json.optional()}),
 heartbeat:strict({claim_token:token,stage:z.union([z.enum(['filling','submit_started','receipt_seen']),z.literal(''),z.literal(0),z.literal(false),z.null()]).optional()}),
 recover:strict({version}),
 outcome:strict({claim_token:token,outcome:z.enum(['blocked','skipped','failed','cancelled','submission_unknown']),reason_code:maybe(z.string().max(100)),notes:z.string().max(50000),details:json.optional(),evidence:json.optional(),duration_seconds:maybe(z.number().nonnegative()),duration_scope:nullableText}),
 capture:strict({id,capture_session_id:id,revision:version,collection_id:id,attempt_id:json.optional(),schema_version:json.optional(),state:z.union([z.enum(['draft','finished','imported']),z.literal(''),z.literal(false),z.literal(0),z.null()]).optional(),captured_at:timestamp,document:jsonObject}),
 complete:strict({claim_token:token,confirmed:z.literal(true),confirmation_kind:z.enum(['ats_receipt','user_confirmed']),submitted_at:timestamp,capture_id:maybe(id),existing_application_id:maybe(z.number().int()),job:strict(Object.fromEntries(['company','role','description','type','source','location','work_mode','application_url'].map(k=>[k,k==='description'?longText:nullableText]))).optional(),resolve_blocker_ids:maybe(z.array(id).max(100)),evidence:json.optional()}),
 resolve:strict({version,action:z.enum(['retry','resolved','dismiss']),notes:z.string().max(50000),resolution:json.optional()}),
}
const row = z.looseObject({id:z.union([z.number(),z.string()])})
const application = z.looseObject({...Object.fromEntries(Object.entries(applicationShape).map(([k,v])=>[k,v.optional()])),id:z.number(),interviewed:z.boolean()})
const attempt = z.looseObject({id,collection_id:id,state:z.enum(['running','finished']),stage:z.string(),version:z.number(),lease_expires_at:z.string()})
const attemptResult = z.looseObject({attempt,replayed:z.boolean().optional()})
const collection = z.looseObject({id,identity_key:z.string(),source:z.string(),source_url:z.string(),version:z.number(),status:z.string()})
const artifactSchema=z.object({kind:z.enum(['cli','extension','zip']),name:z.string(),url:z.string().url(),size:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})
const releaseSchema=z.object({version:z.string(),api_version:z.string(),contract_hash:z.string(),source_commit:z.string(),build_hash:z.string(),storage_schema:z.number(),verified:z.literal(true),verified_at:z.string(),artifacts:z.array(artifactSchema)})
export const responseSchemas = {
 discovery:z.object({name:z.string(),api_version:z.string(),workflow_version:z.number(),contract_hash:z.string(),revision:z.string(),guide_hash:z.string(),deployed_commit:z.string().nullable(),supported_clients:z.object({cli:z.object({min:z.string(),max_major:z.number()}),extension:z.object({min:z.string(),max_major:z.number()})}),legacy_clients_supported:z.boolean(),links:z.object({openapi:z.string(),guide:z.string(),changes:z.string(),releases:z.string(),docs:z.string()}),latest_compatible_release:releaseSchema.nullable()}),
 releases:z.object({releases:z.array(releaseSchema)}),
 changes:z.object({revision:z.string(),changes:z.array(z.object({version:z.string(),client_version:z.string(),date:z.string(),breaking:z.boolean(),summary:z.string(),required_actions:z.array(z.string()),changes:z.array(z.string())}))}),
 publicDocument:jsonObject, guide:z.string(), parsedJob:z.looseObject({company:z.string(),role:z.string(),type:z.string(),location:z.string(),work_mode:z.string(),description:z.string()}),
 error:z.object({error:z.string(),details:json.optional()}).passthrough(),
 applicationList:z.object({jobs:z.array(application),total:z.number()}),application:z.object({job:application}),
 applicationCreated:z.object({id:z.number(),message:z.string(),replayed:z.boolean()}),applicationUpdated:z.object({message:z.string()}),
 collectionList:z.object({jobs:z.array(collection),total:z.number(),next_cursor:z.string().nullable()}),
 collection:z.object({job:collection,created:z.boolean().optional(),existing:z.boolean().optional()}),
 exported:z.object({jobs:z.array(z.looseObject({id,source_url:z.string(),status:z.string()})),total:z.number(),next_cursor:z.string().nullable()}),
 connection:z.object({ok:z.literal(true),workflow_version:z.number(),access:z.enum(['read','write'])}),
 claim:attemptResult,heartbeat:attemptResult,recover:attemptResult,outcome:attemptResult,
 capture:z.looseObject({capture:row,replayed:z.boolean().optional()}),resolve:z.object({blocker:row}),
 complete:z.looseObject({application_id:z.number(),replayed:z.boolean()}),
 history:z.object({job:collection,attempts:z.array(attempt),blockers:z.array(row),captures:z.array(row)}),
 workflowList:z.object({items:z.array(row),total:z.number(),offset:z.number()}),
 metrics:z.object({timezone:z.string(),today:z.number(),total:z.number(),legacy_date_records:z.number(),daily:z.array(z.object({date:z.string(),count:z.number()})),outcomes:z.array(jsonObject),open_blockers:z.array(jsonObject)}),
 stats:z.looseObject({total:z.number(),today:z.number(),thisWeek:z.number(),thisMonth:z.number()}),
 contract:z.object({version:z.number(),base_url:z.string(),authentication:z.string(),reads:z.record(z.string(),z.string()),writes:z.record(z.string(),jsonObject),rules:z.array(z.string())}),
}
export type Endpoint = {operationId:string;method:'get'|'post'|'patch';path:string;summary:string;request?:keyof typeof requestSchemas;response:keyof typeof responseSchemas;query?:string[];legacy?:boolean;sessionOnly?:boolean;success?:number[];header?:string;public?:boolean}
export const endpoints:Endpoint[] = [
 ...(['discovery','openapi.json','guide','changes','releases'] as const).map(name=>({operationId:'public_'+name.replace('.','_'),method:'get' as const,path:'/api/job-workflow/'+name,summary:'Public workflow '+name,response: name==='guide'?'guide' as const:name==='discovery'?'discovery' as const:name==='releases'?'releases' as const:name==='changes'?'changes' as const:'publicDocument' as const,public:true})),
 {operationId:'parseJobPosting',method:'post',path:'/api/jobs/parse',summary:'Website-only job posting extraction',request:'parse',response:'parsedJob',sessionOnly:true},
 {operationId:'listApplications',method:'get',path:'/api/jobs',summary:'Read application summaries; site uses view=applied',response:'applicationList',query:['q','view','limit','offset']},
 {operationId:'createLegacyApplication',method:'post',path:'/api/jobs',summary:'Compatibility insert; do not also use workflow completion for the same submission',request:'applicationCreate',response:'applicationCreated',legacy:true,success:[200,201],header:'Idempotency-Key'},
 {operationId:'getApplication',method:'get',path:'/api/jobs/{id}',summary:'Read full application',response:'application'},
 {operationId:'updateApplication',method:'patch',path:'/api/jobs/{id}',summary:'Correct application metadata',request:'applicationPatch',response:'applicationUpdated'},
 {operationId:'applicationStats',method:'get',path:'/api/jobs/stats',summary:'Submitted application statistics for the website',response:'stats',sessionOnly:true},
 {operationId:'listOpportunities',method:'get',path:'/api/job-collection',summary:'Search opportunities without deleting consumed rows',response:'collectionList',query:['q','company','type','role_type','work_mode','location','source','employment_type','status','collected_since','collected_until','updated_since','archived','cursor','limit']},
 {operationId:'collectOpportunity',method:'post',path:'/api/job-collection',summary:'Create or find a canonical opportunity',request:'collectionCreate',response:'collection',success:[200,201]},
 {operationId:'getOpportunity',method:'get',path:'/api/job-collection/{id}',summary:'Read full opportunity and version',response:'collection'},
 {operationId:'enrichOpportunity',method:'patch',path:'/api/job-collection/{id}',summary:'Version-checked enrichment; use workflow endpoints for attempted opportunities',request:'collectionPatch',response:'collection',header:'If-Match'},
 {operationId:'exportOpportunityUrls',method:'get',path:'/api/job-collection/export',summary:'Export paginated opportunity URLs',response:'exported',query:['q','company','type','role_type','work_mode','location','source','employment_type','status','collected_since','collected_until','updated_since','archived','cursor','limit']},
 {operationId:'connection',method:'get',path:'/api/job-workflow/connection',summary:'Check credential access',response:'connection'},
 {operationId:'contract',method:'get',path:'/api/job-workflow/contract',summary:'Legacy machine-readable integration guide',response:'contract'},
 {operationId:'metrics',method:'get',path:'/api/job-workflow/metrics',summary:'Workflow activity and confirmed submission metrics',response:'metrics'},
 {operationId:'history',method:'get',path:'/api/job-workflow/jobs/{id}',summary:'Opportunity attempts, blockers and immutable capture revisions',response:'history'},
 {operationId:'getCapture',method:'get',path:'/api/job-workflow/captures/{id}',summary:'Read exact captured answers',response:'capture'},
 {operationId:'listAttempts',method:'get',path:'/api/job-workflow/attempts',summary:'Read attempts',response:'workflowList',query:['collection_id','outcome','actor','offset']},
 {operationId:'listBlockers',method:'get',path:'/api/job-workflow/blockers',summary:'Read blockers needing attention',response:'workflowList',query:['collection_id','status','reason_code','offset']},
 ...(['claim','heartbeat','recover','outcome','capture','complete','resolve'] as const).map(name=>({operationId:name,method:'post' as const,path:({claim:'/api/job-workflow/attempts',heartbeat:'/api/job-workflow/attempts/{id}/heartbeat',recover:'/api/job-workflow/attempts/{id}/recover',outcome:'/api/job-workflow/attempts/{id}/outcome',capture:'/api/job-workflow/captures',complete:'/api/job-workflow/attempts/{id}/complete',resolve:'/api/job-workflow/blockers/{id}/resolve'})[name],summary:({claim:'Claim an opportunity with a five-minute lease',heartbeat:'Renew an owned lease; mark submit_started before employer submission',recover:'Recover an expired attempt without blindly resubmitting',outcome:'Record a non-submitted outcome and retain history',capture:'Save an immutable answer capture revision',complete:'Record confirmed submission and atomically create/link one application',resolve:'Resolve selected blockers with explicit human input'})[name],request:name,response:name})),
]
// The custom guide and OpenAPI are built from this same registry. Preserve its wire shape.
export const jobWorkflowContract = {...legacyWorkflowGuide,writes:Object.fromEntries(Object.entries(legacyWorkflowGuide.writes).map(([name,guide])=>{const op=endpoints.find(e=>e.operationId===name)!;return [name,{...guide,method:op.method.toUpperCase(),path:op.path.replace('{id}',name==='resolve'?'{id}':'{id}')}]}))}
export function buildOpenApi() {
 const schemas:Record<string,unknown>={}
 for(const [name,schema] of Object.entries(requestSchemas))schemas[name]=z.toJSONSchema(schema,{target:'draft-2020-12',io:'input'})
 for(const [name,schema] of Object.entries(responseSchemas))schemas[`${name}Response`]=z.toJSONSchema(schema,{target:'draft-2020-12'})
 for(const [name,schema] of Object.entries(schemas)) schemas[name]=JSON.parse(JSON.stringify(schema, (key,value)=>key==='$ref' && typeof value==='string' && value.startsWith('#/$defs/') ? `#/components/schemas/${name}/${value.slice(2)}` : value))
 const paths:Record<string,Record<string,unknown>>={}
 for(const op of endpoints){
  const parameters:unknown[]=[]
  if(op.path.includes('{id}'))parameters.push({name:'id',in:'path',required:true,schema:{type:'string'},description:op.path.startsWith('/api/jobs/')?'Numeric tracker ID':'Canonical UUID'})
  for(const name of op.query||[]){
   const collectionQuery=op.path.includes('job-collection');let schema:Record<string,unknown>={type:'string'};let description='Exact value filter';
   if(['q','company','location'].includes(name)){schema={type:'string',...(collectionQuery?{maxLength:2000}:{})};description=name==='q'?(collectionQuery?'Literal company/role substring':'Company search (SQLite LIKE wildcards are supported by this legacy endpoint)'):'Literal substring search'}
   if(name==='limit'){schema={type:'integer',minimum:1,default:collectionQuery?20:50,...(collectionQuery?{maximum:100}:{})};description=collectionQuery?'Page size, 1–100':'Page size; values above 200 are capped at 200'}
   if(name==='offset')schema={type:'integer',minimum:0,default:0};
   if(name==='view')schema={type:'string',enum:['all','applied'],default:'all'};
   if(name==='archived')schema={type:'string',enum:['false','true','all'],default:'false'};
   if(name==='work_mode')schema={type:'string',enum:['remote','hybrid','onsite']};
   if(name==='type'||name==='role_type')schema={type:'string',enum:['full_stack','cloud','ai_ml','backend','frontend','data','mobile','embedded','security','other']};
   if(name==='status'&&collectionQuery){schema={type:'string',enum:['pending','in_progress','skipped','blocked','applied','not_applicable','N/A']};description='Omit for all statuses; case is normalized'}
   if(name==='status'&&op.path.endsWith('/blockers'))schema={type:'string',enum:['open','resolved','dismissed']};
   if(['collected_since','collected_until','updated_since'].includes(name)){schema={anyOf:[{type:'string',format:'date'},{type:'string',format:'date-time'}]};description=name==='collected_until'?'Exclusive first-seen boundary; date-only means UTC midnight':'Inclusive timestamp boundary; date-only means UTC midnight'}
   if(name==='cursor'){schema={type:'string',maxLength:1000};description='Opaque next_cursor from the previous response; retain the same filters'}
   parameters.push({name,in:'query',schema,description});
  }
  if(op.header)parameters.push({name:op.header,in:'header',required:op.header==='If-Match',schema:op.header==='If-Match'?{type:'string',pattern:'^"[1-9]\\d*"$'}:{type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9._:-]+$'},description:op.header==='If-Match'?'Quoted current row version, e.g. "3"':'Stable per-attempt key; required for agent/extension inserts'})
  const responses:Record<string,unknown>={}
  for(const status of op.success||[200])responses[status]={description:'Success',content:{'application/json':{schema:{$ref:`#/components/schemas/${op.response}Response`}}}}
  if(op.public){responses[200]={description:'Public resource; supports ETag revalidation',headers:{ETag:{schema:{type:'string'}}},content:{[op.response==='guide'?'text/markdown':'application/json']:{schema:{$ref:`#/components/schemas/${op.response}Response`}}}};responses[304]={description:'Not modified'}}
  for(const status of (op.public?[]:[400,401,403,404,409,412,413,428,500]))responses[status]={description:({400:'Invalid request',401:'Authentication required',403:'Access denied',404:'Not found',409:'Conflict or lost lease; reconcile before retry',412:'Version changed; reload',413:'Size limit exceeded',428:'Version precondition required',500:'Server error'})[status],content:{'application/json':{schema:{$ref:'#/components/schemas/errorResponse'}}}}
  ;(paths[op.path]||={})[op.method]={operationId:op.operationId,summary:op.summary,tags:[op.path.includes('job-workflow')?'Workflow':op.path.includes('job-collection')?'Collection':'Applications'],...(op.legacy?{deprecated:true}:{}),security:op.public?[]:op.sessionOnly?[{browserSession:[]}]:[{bearerAuth:[]},{browserSession:[]}],parameters,...(op.request?{requestBody:{required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/${op.request}`}}}}}:{}),responses}
 }
 return {openapi:'3.1.0',info:{title:'Jobs Workflow API',version:API_VERSION,description:'Shared job collection, leased attempts, captures, blockers and confirmed submissions. Structural schemas are shared with runtime checks; contextual rules remain authoritative on the server.'},servers:[{url:BASE_URL}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',description:'Tracker writer/extension key, or a reader key for GET only'},browserSession:{type:'apiKey',in:'cookie',name:'authjs.session-token',description:'Website Auth.js session (secure deployments use the __Secure- prefix); browser-only routes require this session'}},schemas},paths}
}

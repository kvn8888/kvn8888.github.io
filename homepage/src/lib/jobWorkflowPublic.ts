import { createHash } from 'node:crypto'
import { published } from './jobWorkflowPublished'
import { workflowChanges } from './jobWorkflowChanges'

export const publicWorkflowResources = ['discovery','openapi.json','guide','changes','releases'] as const
export function isPublicWorkflowRequest(pathname: string, method: string) {
 return ['GET','HEAD'].includes(method) && publicWorkflowResources.some(name=>pathname===`/api/job-workflow/${name}`)
}
const releaseTag='jobs-v'+published.client_version
const releaseBase=`https://github.com/kvn8888/kvn8888.github.io/releases/download/${releaseTag}/`
export async function verifiedReleases() {
 try {
  const response=await fetch(releaseBase+'release.json',{cache:'no-store',signal:AbortSignal.timeout(4000)})
  if(!response.ok)return []
  const release=await response.json()
  if(release.verified!==true || release.version!==published.client_version || release.contract_hash!==published.contract_hash || !/^[a-f0-9]{40}$/.test(release.source_commit) || (!Array.isArray(release.artifacts) || !release.artifacts.some((a:{kind:string})=>a.kind==='cli') || !release.artifacts.some((a:{kind:string})=>a.kind==='extension')))return []
  if(!release.artifacts.every((a:{url:string;sha256:string;size:number;kind:string})=>typeof a.url==='string' && a.url.startsWith(releaseBase) && ['cli','extension','zip'].includes(a.kind) && /^[a-f0-9]{64}$/.test(a.sha256) && Number.isSafeInteger(a.size) && a.size>0 && a.size<20_000_000))return []
  return [release]
 }catch{return []}
}
export async function publicWorkflowResponse(request: Request, name: string) {
 if(!(publicWorkflowResources as readonly string[]).includes(name))return null
 let body:unknown
 const origin=published.base_url+'/api/job-workflow/'
 if(name==='guide')body=published.guide
 else if(name==='openapi.json')body=published.openapi
 else if(name==='changes')body={revision:published.revision,changes:workflowChanges}
 else if(name==='releases')body={releases:await verifiedReleases()}
 else body={name:'Jobs workflow',api_version:published.api_version,workflow_version:1,contract_hash:published.contract_hash,revision:published.revision,guide_hash:createHash('sha256').update(published.guide).digest('hex'),deployed_commit:process.env.VERCEL_GIT_COMMIT_SHA||null,supported_clients:{cli:{min:'0.3.0',max_major:0},extension:{min:'0.3.0',max_major:0}},legacy_clients_supported:true,links:{openapi:origin+'openapi.json',guide:origin+'guide',changes:origin+'changes',releases:origin+'releases',docs:published.base_url+'/jobs/docs'},latest_compatible_release:(await verifiedReleases())[0]||null}
 const text=typeof body==='string'?body:JSON.stringify(body)
 const etag='"'+createHash('sha256').update(text).digest('hex')+'"'
 const headers={'ETag':etag,'Cache-Control':'public, max-age=0, must-revalidate','Content-Type':name==='guide'?'text/markdown; charset=utf-8':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'}
 if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers})
 return new Response(request.method==='HEAD'?null:text,{headers})
}

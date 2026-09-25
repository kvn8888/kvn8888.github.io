import { CLIENT_VERSION } from './version'
export { CLIENT_VERSION } from './version'
type Discovery={revision:string;api_version:string;supported_clients:{extension:{min:string;max_major:number}};links:{changes:string;guide:string}}
let last: {base:string;at:number;data:Discovery}|undefined
export function supportsClient(d:Discovery){const rule=d?.supported_clients?.extension;if(!rule)return false;const a=CLIENT_VERSION.split('.').map(Number),b=rule.min.split('.').map(Number);return a[0]<=rule.max_major&&(a[0]>b[0]||a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>=b[2]))}
export async function preflight(base:string,force=false){
 if(!force&&last?.base===base&&Date.now()-last.at<60000)return last.data
 let data:Discovery
 try{const response=await fetch(base+'/api/job-workflow/discovery',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('HTTP '+response.status);data=await response.json()}catch{throw Error('Cannot verify workflow compatibility. Your local work is preserved; reconnect before starting new work.')}
 if(!supportsClient(data))throw Error('This extension is incompatible with the hosted workflow. Update it before starting new work; existing drafts are preserved.')
 last={base,at:Date.now(),data};return data
}
export function compatibilitySnapshot(){return last?{checked_at:new Date(last.at).toISOString(),api_version:last.data.api_version,revision:last.data.revision,compatible:Date.now()-last.at<60000}:null}

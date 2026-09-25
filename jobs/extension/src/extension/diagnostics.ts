const output=document.querySelector('pre')!
let report:unknown
async function refresh(){const response=await chrome.runtime.sendMessage({type:'diagnostics'});if(!response?.ok)throw Error(response?.error||'Diagnostics unavailable');report=response.data;output.textContent=JSON.stringify(report,null,2)}
document.querySelector('#refresh')!.addEventListener('click',()=>refresh().catch(e=>output.textContent=e.message))
document.querySelector('#download')!.addEventListener('click',async()=>{await refresh();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='jobs-workflow-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
void refresh().catch(e=>output.textContent=e.message)

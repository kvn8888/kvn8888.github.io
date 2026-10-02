import {parsePacket} from './packet.mjs';import {tab,runFrames} from './browser.mjs';
void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let serial=Promise.resolve();
async function state(){return {packets:[],selected:null,...await chrome.storage.local.get(['packets','selected'])}}

async function handle(m,sender){if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL(''))||sender.tab&&/^https?:/.test(sender.tab.url||''))throw Error('Only the extension UI may request a handoff action.');const s=await state();
 if(m.type==='state')return s;
 if(m.type==='import'){const packet=parsePacket(m.packet);const wrapper={packet,imported_at:new Date().toISOString(),local_status:'imported'};s.packets=[wrapper,...s.packets.filter(w=>w.packet.id!==packet.id)].slice(0,5);s.selected=packet.id;await chrome.storage.local.set(s);return s}
 if(m.type==='select'){if(!s.packets.some(w=>w.packet.id===m.id))throw Error('Unknown packet');await chrome.storage.local.set({selected:m.id});return true}
 if(m.type==='clear'){await chrome.storage.local.set({packets:[],selected:null});return true}
 const entry=s.packets.find(w=>w.packet.id===s.selected);
 if(m.type==='capture')return runFrames(await tab(m.tabId),'capture');
 if(!entry)throw Error('Import a packet first.');const packet=parsePacket(entry.packet);
 if(m.type==='open'){return chrome.tabs.create({url:packet.application_url,active:true})}
 if(m.type==='restore'){const t=await tab(m.tabId);if(['submitted','abandoned','expired'].includes(entry.local_status)||['submitted','abandoned','expired'].includes(packet.status))throw Error('This packet is closed; import an active capture to restore.');if(new URL(t.url).origin!==new URL(packet.application_url).origin)throw Error('Active page is on a different origin. Review the application URL before restoring.');if(new URL(t.url).pathname+new URL(t.url).search!==new URL(packet.application_url).pathname+new URL(packet.application_url).search&&!m.confirmPage)throw Error('Application path differs. Confirm this is the correct application page.');return runFrames(t,'restore',packet)}
 if(m.type==='submitted'){if(m.confirm!==true)throw Error('Confirm that you personally submitted the application.');entry.local_status='submitted';await chrome.storage.local.set(s);return {kind:'handoff_result',schema_version:'1.0',id:packet.id,application_url:packet.application_url,status:'submitted',marked_at:new Date().toISOString(),confirmation:'user_confirmed',note:'Local user assertion; no employer or tracker API was contacted.'}}
 throw Error('Unknown action');}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{const p=serial.then(()=>handle(m,sender));serial=p.catch(()=>{});p.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true});

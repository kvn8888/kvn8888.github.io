import validate from './generated-validator.mjs';
export function parsePacket(input){const raw=typeof input==='string'?input:JSON.stringify(input);if(new TextEncoder().encode(raw).length>2*1024*1024)throw Error('Packet exceeds 2 MiB; do not truncate answers silently.');let packet;try{packet=JSON.parse(raw)}catch{throw Error('Packet is not valid JSON.')}
 if(packet?.schema_version!=='1.0')throw Error(`Unsupported packet schema ${String(packet?.schema_version)}. This release supports 1.0; upgrade before importing newer formats.`);
 if(!validate(packet))throw Error(validate.errors.slice(0,6).map(e=>`${e.instancePath||'packet'} ${e.message}`).join('; '));
 for(const link of [packet.application_url,...(packet.fields||[]).map(f=>f.frame_url).filter(Boolean)]){const u=new URL(link);if(u.username||u.password)throw Error('URLs must not contain credentials.');for(const k of u.searchParams.keys())if(/^(access_token|id_token|refresh_token|password|otp|code|session|sessionid|csrf)$/i.test(k))throw Error('Use a reusable application URL without authentication/session parameters.')}
 return packet;
}
export function makePacket(capture){return parsePacket({schema_version:'1.0',id:crypto.randomUUID(),created_at:new Date().toISOString(),application_url:capture.url,status:capture.captcha_detected?'captcha_blocked':'ready_for_human',ats:'unknown',blocker:capture.captcha_detected?'captcha':'manual_handoff',fields:capture.fields,notes:capture.warnings||[]})}

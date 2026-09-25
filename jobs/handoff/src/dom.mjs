/** Self-contained: serialized for scripting.executeScript and CDP capture. Never clicks controls. */
export function domAction(input={action:'capture',walkFrames:true}) {
 if(input.expectedOrigin&&location.origin!==input.expectedOrigin)throw Error('Frame navigated; review the page and retry.');
 if(input.expectedPath&&location.pathname+location.search!==input.expectedPath)throw Error('Frame navigated; review the page and retry.');
 const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const gate=/recaptcha|hcaptcha|turnstile|challenges\.cloudflare|captcha|i(?:.?m| am) not a robot|human.?verification|verify.?you.?are.?human/i;
 const secret=/password|passcode|\botp\b|one[-_ ]?time[-_ ]?code|verification[-_ ]?code|csrf|xsrf|captcha|turnstile|(?:session|access|refresh|auth|id)[-_ ]?(?:token|cookie)|credit.?card|card.?number|\bcvv\b|\bcvc\b/i;
 const warn=[];const rows=[];const vendors=new Set();const fileInputs=[];
 const label=el=>[...(el.labels||[])].map(x=>x.textContent).join(' ').trim() || el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>el.ownerDocument.getElementById(id)?.textContent||'').join(' ').trim() || el.getAttribute('placeholder') || '';
 const roots=(doc)=>{const result=[doc];for(const root of result)for(const el of root.querySelectorAll('*'))if(el.shadowRoot)result.push(el.shadowRoot);return result};
 const controls=doc=>roots(doc).flatMap(root=>[...root.querySelectorAll('input,textarea,select')]);
 const safeUrl=value=>{const u=new URL(value);for(const key of [...u.searchParams.keys()])if(/^(access_token|id_token|refresh_token|password|otp|code|session|sessionid|csrf)$/i.test(key)){u.searchParams.delete(key);warn.push('Authentication parameter omitted from URL; review the reusable application URL.')}u.username='';u.password='';return u.href};
 const visibility=new WeakMap();const visible=el=>{if(visibility.has(el))return visibility.get(el);const win=el.ownerDocument.defaultView;let ok=el.isConnected&&!el.closest('[hidden],[aria-hidden="true"]');const rect=el.getClientRects()[0];ok=Boolean(ok&&rect&&rect.width>0&&rect.height>0);for(let node=el;ok&&node;node=node.parentElement){const style=win.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')ok=false}visibility.set(el,ok);return ok};
 const eligible=el=>{const type=(el.type||'').toLowerCase();return !el.disabled&&!el.matches(':disabled')&&el.getAttribute('aria-disabled')!=='true'&&el.isConnected&&(!el.readOnly||input.action==='capture')&&visible(el)&&!['hidden','password','submit','button','reset','image'].includes(type)&&!secret.test([el.name,el.id,label(el),el.autocomplete].join(' '))&&!gate.test([el.name,el.id,label(el)].join(' '))&&!/^(one-time-code|cc-)/i.test(el.autocomplete||'')&&!el.closest('[data-sitekey],.g-recaptcha,.h-captcha,.cf-turnstile,[id*="captcha" i],[class*="captcha" i],[id*="turnstile" i],[class*="turnstile" i]')};
 const docs=[];
 function walk(doc,hint=''){
  if(gate.test(doc.location?.href||'')){warn.push('CAPTCHA frame skipped');return}
  docs.push({doc,hint,url:safeUrl(doc.location.href)});
  for(const root of roots(doc)){
   for(const widget of root.querySelectorAll('[data-sitekey],.g-recaptcha,.h-captcha,.cf-turnstile,[role="checkbox"],input[type="checkbox"]')){const text=[widget.className,widget.id,widget.getAttribute('aria-label'),label(widget),widget.textContent].join(' ');if(gate.test(text)){vendors.add(/hcaptcha|h-captcha/i.test(text)?'hcaptcha':/turnstile/i.test(text)?'turnstile':/recaptcha/i.test(text)?'recaptcha':'unknown')}}
   for(const frame of root.querySelectorAll('iframe')){
    const src=frame.getAttribute('src')||'';if(gate.test(src+' '+frame.title)){vendors.add(/hcaptcha/i.test(src)?'hcaptcha':/turnstile/i.test(src)?'turnstile':/cloudflare/i.test(src)?'cloudflare':/recaptcha/i.test(src)?'recaptcha':'unknown');continue}
    if(input.walkFrames){try{if(frame.contentDocument)walk(frame.contentDocument,frame.id||frame.name||'same-origin-frame');else warn.push('Cross-origin or inaccessible frame was not captured.')}catch{warn.push('Cross-origin or inaccessible frame was not captured.')}}
   }
  }
 }
 walk(document,input.frameHint||'');
 const fieldType=el=>el.tagName==='TEXTAREA'?'textarea':el.tagName==='SELECT'?'select':['text','email','tel','checkbox','radio','date','file','hidden'].includes(el.type)?el.type:'other';
 const quote=s=>JSON.stringify(String(s));
 function selectors(el){const list=[];if(el.id)list.push('#'+CSS.escape(el.id));if(el.name){let selector=el.tagName.toLowerCase()+'[name='+quote(el.name)+']';if(['radio','checkbox'].includes(el.type))selector+='[value='+quote(el.value)+']';list.push(selector)}return list.filter(s=>{try{return el.getRootNode().querySelectorAll(s).length===1}catch{return false}})}
 if(input.action==='capture'){
  for(const {doc,hint,url} of docs)for(const el of controls(doc)){
   const type=fieldType(el);if(type==='file'&&!el.disabled&&!secret.test([el.name,el.id,label(el)].join(' '))){fileInputs.push({name:el.name||label(el),has_file:Boolean(el.files?.length)});continue}
   if(!eligible(el))continue;
   const loc=selectors(el),name=el.name||'',text=label(el),placeholder=el.getAttribute('placeholder')||'';
   if(!loc.length&&!name&&!text&&!placeholder){warn.push('An unlabeled control has no stable locator and was omitted.');continue}
   rows.push({...(name?{name}:{}),...(text?{label:text}:{}),...(placeholder?{placeholder}:{}),selectors:loc,type,value:type==='checkbox'||type==='radio'?el.checked:el.tagName==='SELECT'&&el.multiple?[...el.selectedOptions].map(o=>o.value):el.value,...(['radio','checkbox'].includes(type)?{option_value:el.value}:{}),...(hint?{frame_hint:hint}:{}),frame_url:url,required:el.required||el.getAttribute('aria-required')==='true',confidence:loc.length?1:0.7});
  }
  return {url:safeUrl(location.href),title:document.title,fields:rows,captcha_detected:vendors.size>0,captcha_vendors:[...vendors],file_inputs:fileInputs,warnings:warn};
 }
 const result={filled:0,skipped:0,missing:0,warnings:warn,results:[],missing_required:[],file_inputs:[]};
 const aliases={first:['firstname','givenname','first'],last:['lastname','surname','familyname','last'],full_name:['fullname','yourname','name'],email:['email','emailaddress'],phone:['phone','phonenumber','telephone','mobile'],address:['address','streetaddress','addressline1'],address_line2:['addressline2','apartment'],city:['city'],state:['state','province','region'],zip:['zip','zipcode','postalcode'],country:['country'],website:['website','portfolio','personalwebsite'],linkedin:['linkedin','linkedinurl'],github:['github','githuburl'],school:['school','university','college'],degree:['degree'],major:['major','fieldofstudy'],graduation_year:['graduationyear'],salary:['salary','expectedsalary','salaryexpectation']};
 const packet=input.packet||{};let fields=[...(packet.fields||[])];const profile=packet.profile_overlay||{};
 if(Object.keys(profile).length){const p={...profile,phone:profile.phone_formatted||profile.phone,address:profile.address_line1||profile.address,full_name:profile.full_name||[profile.first,profile.last].filter(Boolean).join(' ')};fields=fields.concat(Object.entries(aliases).filter(([k])=>p[k]!=null&&p[k]!=='').map(([k,names])=>({label:names[0],value:p[k],aliases:names,profile:true})))}
 if(!fields.length)warn.push('Notes-only packet: no captured fields or supplied profile values to restore.');
 const all=docs.flatMap(d=>controls(d.doc).map(el=>({...d,el})));const touched=new Set();
 function candidates(field){let pool=all.filter(x=>eligible(x.el));
  if(field.frame_url)pool=pool.filter(x=>{try{const a=new URL(field.frame_url),b=new URL(x.url);return a.origin===b.origin&&a.pathname===b.pathname}catch{return false}});
  if(field.frame_hint&&!field.frame_url){const subset=pool.filter(x=>x.hint===field.frame_hint||x.doc.defaultView?.name===field.frame_hint);pool=subset}
  for(const selector of field.selectors||[]){let matches=[];try{matches=pool.filter(x=>x.el.matches(selector))}catch{warn.push('Invalid selector skipped')};if(matches.length===1)return matches;if(matches.length>1)return []}
  if(field.name){const matches=pool.filter(x=>x.el.name===field.name);pool=matches.length?matches:pool;if(matches.length===1&&field.option_value==null&&!(field.type==='radio'&&typeof field.value==='string'))return matches}
  if(field.option_value!=null)pool=pool.filter(x=>x.el.value===String(field.option_value));
  if(field.type==='radio'&&typeof field.value==='string')pool=pool.filter(x=>norm(x.el.value)===norm(field.value)||norm(label(x.el))===norm(field.value));
  if(pool.length===1&&field.name&&pool[0].el.name===field.name)return pool;
  const targets=(field.aliases||[field.label,field.placeholder]).filter(Boolean).map(x=>norm(x).replaceAll(' ',''));
  return pool.filter(x=>[label(x.el),x.el.getAttribute('placeholder'),...(field.profile?[x.el.name,x.el.id]:[])].some(s=>targets.includes(norm(s).replaceAll(' ',''))));
 }
 for(const [index,field] of fields.entries()){
  if(input.allowedIndices&&!input.allowedIndices.includes(index))continue;
  const record={index,label:field.label||field.name||'Field',status:'missing'};
  if(['hidden','file'].includes(field.type)||secret.test([field.name,field.label,(field.selectors||[]).join(' ')].join(' '))){result.skipped++;record.status='skipped';result.results.push(record);continue}
  const matches=candidates(field);if(field.profile&&matches.length===0){result.skipped++;record.status='skipped';record.reason='No matching profile field on this page';result.results.push(record);continue}if(matches.length!==1){result.missing++;record.reason=matches.length?'Ambiguous match; choose a unique selector':'No safe unique control found';result.results.push(record);continue}
  if(input.action==='probe'){record.status='ready';result.results.push(record);continue}
  const el=matches[0].el;const win=el.ownerDocument.defaultView;const type=fieldType(el);
  if(type==='file'||touched.has(el)){result.skipped++;record.status='skipped';record.reason='File or duplicate target';result.results.push(record);continue}touched.add(el);
  const old=type==='checkbox'||type==='radio'?el.checked:el.tagName==='SELECT'&&el.multiple?[...el.selectedOptions].map(o=>o.value):el.value;
  let desired=field.value;
  if(field.profile&&String(old).trim()&&String(old)!==String(desired)){
   const current=norm(old);const lies=profile.autofill_lies_to_overwrite||[];const known=lies.some(l=>{const bad=norm(l);return current&&current.length>=2&&(bad===current||bad.startsWith(current+' ')||bad.endsWith(' '+current)||norm(String(old).replace(/^https?:\/\//,'').replace(/\/$/,''))===bad)});
   if(!known){result.skipped++;record.status='skipped';record.reason='Kept existing value; profile fallback only replaces known incorrect autofill';result.results.push(record);continue}
  }
  try{
   if(type==='checkbox'||type==='radio'){
    if(type==='radio'&&field.option_value!=null&&String(field.option_value)!==el.value)throw Error('Radio option changed; review the option before restoring');
    if(type==='radio'&&typeof desired==='string'){if(norm(el.value)!==norm(desired)&&norm(label(el))!==norm(desired))throw Error('Requested radio option is unavailable');desired=true;}
    if(typeof desired!=='boolean')throw Error('Checkbox/radio value must be boolean or a radio option label');
    if(old===desired){result.skipped++;record.status='unchanged';result.results.push(record);continue}
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'checked').set.call(el,desired);
   }else if(el.tagName==='SELECT'){
    const values=Array.isArray(desired)?desired:[desired];const options=values.map(v=>{const exact=[...el.options].filter(o=>!o.disabled&&o.value===String(v));const byLabel=exact.length?exact:[...el.options].filter(o=>!o.disabled&&norm(o.label)===norm(v));return byLabel.length===1?byLabel[0]:null});
    if(options.some(o=>!o)||(!el.multiple&&options.length!==1))throw Error('Requested option is unavailable or ambiguous');
    const next=el.multiple?[...el.options].filter(o=>options.includes(o)).map(o=>o.value):options[0].value;
    if(JSON.stringify(old)===JSON.stringify(next)){result.skipped++;record.status='unchanged';result.results.push(record);continue}
    if(el.multiple)for(const option of el.options)option.selected=options.includes(option);else Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype,'value').set.call(el,next);
   }else{
    if(desired===null||Array.isArray(desired)||typeof desired==='object'||typeof desired==='boolean')throw Error('Text control requires text or number');desired=String(desired);
    if(el.type==='number'&&desired!==''&&!Number.isFinite(Number(desired)))throw Error('Number input cannot accept the requested text');
    if(String(old)===desired){result.skipped++;record.status='unchanged';result.results.push(record);continue}
    const proto=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(el,desired);if(el.value!==desired){setter.call(el,old);throw Error('Control rejected the requested value')}
   }
   el.dispatchEvent(new win.Event('input',{bubbles:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));result.filled++;record.status='filled';
  }catch(error){result.missing++;record.reason=error.message;warn.push(`${record.label}: ${error.message}`)}result.results.push(record);
 }
 for(const {el} of all){
  if(el.type==='file'&&!el.disabled&&!secret.test([el.name,el.id,label(el)].join(' '))){const empty=!el.files?.length;result.file_inputs.push({name:el.name||label(el),has_file:!empty});if(empty)warn.push('Attach resume or requested document manually: '+(label(el)||el.name||'File'));continue}
  if(!eligible(el))continue;
  const missing=el.required?el.validity.valueMissing:el.getAttribute('aria-required')==='true'&&!(el.type==='checkbox'?el.checked:String(el.value).trim());
  if(missing)result.missing_required.push(label(el)||el.name||'Required field');
 }
 return result;
}

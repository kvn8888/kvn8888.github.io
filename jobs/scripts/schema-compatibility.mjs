// Conservative additive-schema comparison. Refuse removed properties/operations,
// new required inputs or tighter bounds; descriptions do not affect acceptance.
export function additiveSchema(old,next){
 if(JSON.stringify(old)===JSON.stringify(next))return true;
 if(!old||!next||typeof old!=='object'||typeof next!=='object'||Array.isArray(old)||Array.isArray(next))return false;
 const ignored=new Set(['description','title','examples','$id']);
 const keys=new Set([...Object.keys(old),...Object.keys(next)]);
 for(const key of keys){
  if(ignored.has(key))continue;
  if(key==='properties'){
   for(const [name,schema] of Object.entries(old.properties||{}))if(!(name in (next.properties||{}))||!additiveSchema(schema,next.properties[name]))return false;
   for(const name of Object.keys(next.properties||{}))if(!(name in (old.properties||{}))&&(next.required||[]).includes(name))return false;
  }else if(key==='required'){
   if((next.required||[]).some(name=>!(old.required||[]).includes(name)))return false;
  }else if(JSON.stringify(old[key])!==JSON.stringify(next[key]))return false;
 }
 return true;
}
export function additiveParameters(old=[],next=[]){
 return old.every(p=>next.some(n=>n.name===p.name&&n.in===p.in&&additiveSchema(p,n)))&&next.every(p=>old.some(o=>o.name===p.name&&o.in===p.in)||!p.required);
}

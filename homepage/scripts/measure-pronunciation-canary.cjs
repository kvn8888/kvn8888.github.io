// Use Doppler or another local secret manager to supply Azure Speech credentials.
// The output is a synthetic fixture's measured baseline, not a human threshold.
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const root=path.resolve(__dirname,'..')
process.chdir(root)
const cache=new Map()
function load(relative) {
  const filename=path.join(root,relative)
  if(cache.has(filename))return cache.get(filename)
  const module={exports:{}}
  cache.set(filename,module.exports)
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const resolve=name=>name==='@/lib/secrets'?{getSecret:async key=>process.env[key]}:name==='@/lib/turso'?{getTursoClient:()=>null}:name==='@/lib/axiom'?{reportServerEvent:async()=>{}}:name==='@/lib/speechStorage'?{}:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):require(name)
  new Function('require','module','exports',source)(resolve,module,module.exports)
  return module.exports
}
load('src/lib/pronunciationCanary.ts').measurePronunciationCanary().then(result=>{
  const target=process.argv.includes('--establish-baseline')?path.join(root,'src/lib/fixtures/pronunciation-canary-baseline.json'):null
  if(target){fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');console.log('Baseline established:',result.scores,'phones:',result.phones.length)}
  else console.log(JSON.stringify(result,null,2))
}).catch(err=>{console.error(err.message);process.exitCode=1})

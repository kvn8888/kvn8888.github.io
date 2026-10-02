import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const output=path.join(root,'jobs/release');await fs.mkdir(output,{recursive:true});
const source=path.join(root,'jobs/extension/dist/extension');const info=JSON.parse(await fs.readFile(path.join(source,'build-info.json'),'utf8'));const files={};
for(const name of (await fs.readdir(source)).sort())files[name]=(await fs.readFile(path.join(source,name))).toString('base64');
const bundle={format:1,...info,files};await fs.writeFile(path.join(output,'extension.bundle.json'),JSON.stringify(bundle));await fs.copyFile(path.join(root,'jobs/cli/jobs-workflow.mjs'),path.join(output,'jobs-workflow.mjs'));
const sha=data=>createHash('sha256').update(data).digest('hex');const spec=await fs.readFile(path.join(root,'jobs/generated/openapi.json'));const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const zipName='jobs-utility-'+info.version+'.zip';
execFileSync('python3',['-c',`import pathlib,sys,zipfile
src=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as archive:
 for file in sorted(src.iterdir()):
  if file.is_file():
   entry=zipfile.ZipInfo('extension/'+file.name,date_time=(1980,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o644<<16;archive.writestr(entry,file.read_bytes())`,source,path.join(output,zipName)]);
const tag='jobs-v'+info.version;const artifacts=[];for(const [kind,name] of [['cli','jobs-workflow.mjs'],['extension','extension.bundle.json'],['zip',zipName]]){const data=await fs.readFile(path.join(output,name));artifacts.push({kind,name,url:`https://github.com/kvn8888/kvn8888.github.io/releases/download/${tag}/${name}`,size:data.length,sha256:sha(data)})}
const release={version:info.version,api_version:JSON.parse(spec).info.version,contract_hash:sha(spec),source_commit:commit,build_hash:info.build_hash,storage_schema:1,verified:false,artifacts};await fs.writeFile(path.join(output,'release.json'),JSON.stringify(release,null,2)+'\n');console.log(JSON.stringify(release,null,2));

import {execFileSync} from 'node:child_process';import fs from 'node:fs';
const current=JSON.parse(fs.readFileSync('jobs/generated/openapi.json','utf8'));
let old;try{old=JSON.parse(execFileSync('git',['show','HEAD~1:jobs/generated/openapi.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}))}catch{console.log('First versioned job contract; existing handler compatibility tests are required.');process.exit(0)}
const changed=execFileSync('git',['diff','--name-only','HEAD~1','HEAD'],{encoding:'utf8'});
if((JSON.stringify(old)!==JSON.stringify(current)||/jobs\/guide.md|homepage\/src\/lib\/job(?:Workflow|Writes|Collection)\.ts/.test(changed))&&!changed.includes('homepage/src/lib/jobWorkflowChanges.ts'))throw Error('Contract change requires a changelog entry');
const breaking=[];
for(const [route,methods] of Object.entries(old.paths))for(const [method,operation] of Object.entries(methods)){const next=current.paths[route]?.[method];if(!next)breaking.push(`${method} ${route} removed`);else if(JSON.stringify(operation.requestBody)!==JSON.stringify(next.requestBody)||JSON.stringify(operation.parameters)!==JSON.stringify(next.parameters))breaking.push(`${method} ${route} request changed`)}
// Conservatively require review/major bump for changed existing schema contracts.
for(const [name,schema] of Object.entries(old.components.schemas))if(JSON.stringify(schema)!==JSON.stringify(current.components.schemas[name]))breaking.push(`Schema changed: ${name}`);
if(breaking.length&&Number(current.info.version.split('.')[0])<=Number(old.info.version.split('.')[0]))throw Error('Potentially breaking contract changes require a major version and migration entry: '+breaking.join(', '));
if(breaking.length&&!fs.readFileSync('homepage/src/lib/jobWorkflowChanges.ts','utf8').includes('migration'))throw Error('Breaking release needs migration guidance');
console.log('Contract change has a changelog and compatible version policy');

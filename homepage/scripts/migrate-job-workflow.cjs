const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{createClient}=require('@libsql/client')
const expected='libsql://resume-tracker-kvn8888.aws-us-east-1.turso.io'
if(process.env.TURSO_DB_URL!==expected||!process.env.TURSO_DB_TOKEN)throw Error('Expected jobs database credentials')
const filename=path.resolve(__dirname,'../src/lib/jobWorkflowSchema.ts'),moduleObject={exports:{}}
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',js)(require,moduleObject,moduleObject.exports)
const db=createClient({url:expected,authToken:process.env.TURSO_DB_TOKEN})
;(async()=>{try{
 const before=(await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n
 const original=(await db.execute('PRAGMA table_info(job_applications)')).rows.map(r=>r.name)
 const collection=(await db.execute('PRAGMA table_info(job_collection)')).rows
 if(collection.length!==35)throw Error('Unexpected collection schema; review before migration')
 if(process.argv.includes('--apply'))await moduleObject.exports.ensureWorkflowSchema(db)
 const tables={};for(const table of ['job_collection','job_applications','job_attempts','job_blockers','job_form_captures'])tables[table]=(await db.execute(`PRAGMA table_info(${table})`)).rows.map(r=>r.name)
 if(process.argv.includes('--apply')&&(!tables.job_attempts.length||!tables.job_blockers.length||!tables.job_form_captures.length||!original.every(c=>tables.job_applications.includes(c))))throw Error('Migration verification failed')
 const after=(await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),checked_at:new Date().toISOString(),application_rows_before:before,application_rows_after:after,original_application_columns_preserved:original.every(c=>tables.job_applications.includes(c)),tables},null,2))
 }finally{db.close()}})().catch(e=>{console.error('Migration failed',e.code||e.message);process.exitCode=1})

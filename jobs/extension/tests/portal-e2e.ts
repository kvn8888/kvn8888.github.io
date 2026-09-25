import {chromium} from 'playwright'
import {createClient} from '@libsql/client'
import {createRequire} from 'node:module'
import {mkdtemp,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const makeFixture=createRequire(import.meta.url)('./hosted-fixture.cjs')
const dir=await mkdtemp('/tmp/job-portal-test-'),db=createClient({url:`file:${dir}/jobs.db`})
const key='t'.repeat(64);const makeServer=await makeFixture(db,key,'r'.repeat(64)),server=makeServer();await new Promise<void>(r=>server.listen(43128,'127.0.0.1',r))
const request=async(path:string,body?:unknown)=>{const r=await fetch('http://127.0.0.1:43128'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data}
const id=crypto.randomUUID(),attempt=crypto.randomUUID(),claim_token=crypto.randomUUID()+crypto.randomUUID()
await request('/api/job-collection',{id,identity_key:'portal-fixture',company:'Example Company',role:'Cloud Engineer',source:'fixture',source_url:'https://example.com/jobs/123',description:'Build cloud services. This is a test opportunity.',description_status:'full'})
await request('/api/job-workflow/attempts',{id:attempt,collection_id:id,version:1,claim_token,worker_id:'hermes-test'})
await request('/api/job-workflow/captures',{id:crypto.randomUUID(),capture_session_id:crypto.randomUUID(),revision:1,collection_id:id,attempt_id:attempt,captured_at:new Date().toISOString(),state:'finished',document:{pages:[{title:'Screening',fields:[{label:'Why this role?',answer:'I enjoy building useful tools.',control_type:'textarea'}]}]}})
await request(`/api/job-workflow/attempts/${attempt}/outcome`,{claim_token,outcome:'blocked',reason_code:'captcha',notes:'CAPTCHA needs manual completion',details:{question:'Complete CAPTCHA in the application browser'}})
const context=await chromium.launchPersistentContext(dir+'/browser',{channel:'chromium',headless:true,args:['--remote-debugging-port=9338'],viewport:{width:1280,height:1050}})
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
await context.route(url=>url.origin==='http://127.0.0.1:43130'&&url.pathname.startsWith('/api/job'),async route=>{const req=route.request(),u=new URL(req.url());const response=await fetch('http://127.0.0.1:43128'+u.pathname+u.search,{method:req.method(),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:req.postData()||undefined});await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()})})
try{
 await page.goto('http://127.0.0.1:43130/projects/job-tracker',{timeout:120000})
 await page.getByRole('button',{name:'Needs attention',exact:true}).click()
 await page.getByRole('button',{name:/Example Company.*Cloud Engineer/}).click()
 await page.getByRole('button',{name:'I submitted it manually',exact:true}).waitFor()
 await page.getByText(/Revision 1/).click();await page.getByText('I enjoy building useful tools.',{exact:true}).waitFor()
 await mkdir('.test-output',{recursive:true});await page.screenshot({path:'.test-output/portal-blocker.png',fullPage:true})
 await page.getByRole('button',{name:'I submitted it manually',exact:true}).click()
 await page.getByLabel('Receipt or resolution notes').fill('Completed CAPTCHA and confirmed the employer receipt.')
 await page.getByRole('checkbox',{name:'I submitted this application and reviewed the job and date.',exact:true}).check()
 await page.getByRole('button',{name:'Save submitted application',exact:true}).click()
 await page.getByText('Tracker record #1',{exact:true}).waitFor({timeout:15000})
 assert.equal((await db.execute('SELECT count(*) n FROM job_applications')).rows[0].n,1)
 assert.equal((await db.execute('SELECT status FROM job_blockers')).rows[0].status,'resolved')
 assert.equal((await db.execute("SELECT count(*) n FROM job_attempts WHERE outcome='blocked'")).rows[0].n,1)
 await page.getByRole('button',{name:'Stats',exact:true}).click();await page.getByRole('heading',{name:'Submission activity'}).waitFor();await page.getByText('Last 14 days · America/New_York · Confirmed applications, not attempts').waitFor()
 await page.screenshot({path:'.test-output/portal-stats.png',fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS portal: Needs attention → captured answers → manual completion → one tracker row + retained blocked attempt → statistics; no page errors')
 if(process.env.KEEP_BROWSER==='1'){console.log('UI available for inspection on CDP 9338');await new Promise(r=>setTimeout(r,55000))}
}catch(e){console.log('UI failure:',await page.locator('body').innerText());await page.screenshot({path:'.test-output/portal-failure.png',fullPage:true});throw e}finally{await context.close();await new Promise<void>(r=>server.close(()=>r()));db.close()}

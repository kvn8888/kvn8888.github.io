const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createHmac,randomUUID}=require('node:crypto')
const {EventEmitter}=require('node:events')
const {requireSpeechAccess}=require('../dist/access.js')
const secret='unit-test-signing-key'
process.env.SPEECH_SERVICE_SECRET=secret
function token(scope,owner='a'.repeat(64),expiry=Math.floor(Date.now()/1000)+60) {
  const payload=Buffer.from(JSON.stringify({scope,sub:owner,exp:expiry,nonce:randomUUID()})).toString('base64url')
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')
}
function verify(scope,credential,hold=false){
  const res=new EventEmitter()
  res.statusCode=200;res.locals={};res.status=code=>{res.statusCode=code;return res};res.json=()=>{res.emit('finish')};res.setHeader=()=>{}
  requireSpeechAccess(scope)({get:()=>credential?'Bearer '+credential:undefined},res,()=>{if(!hold)res.emit('finish')})
  return res
}
test('speech operations require valid short-lived scoped authorization; health remains separate',()=>{
  assert.equal(verify('analyze-delivery').statusCode,401)
  assert.equal(verify('analyze-delivery',token('transcribe')).statusCode,401)
  assert.equal(verify('analyze-delivery',token('analyze-delivery','a'.repeat(64),0)).statusCode,401)
  const valid=token('analyze-delivery')
  assert.equal(verify('analyze-delivery',valid).statusCode,200)
  assert.equal(verify('analyze-delivery',valid).statusCode,401)
})
test('speech service bounds concurrent work and per-owner request bursts',()=>{
  const one=verify('transcribe',token('transcribe','b'.repeat(64)),true)
  const two=verify('analyze-delivery',token('analyze-delivery','c'.repeat(64)),true)
  assert.equal(verify('diarize',token('diarize','d'.repeat(64))).statusCode,429)
  one.emit('finish');two.emit('finish')
  for(let i=0;i<12;i++)assert.equal(verify('analyze-delivery',token('analyze-delivery','e'.repeat(64))).statusCode,200)
  assert.equal(verify('analyze-delivery',token('analyze-delivery','e'.repeat(64))).statusCode,429)
})

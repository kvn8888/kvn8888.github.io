import {test} from 'node:test';import assert from 'node:assert/strict';import {additiveSchema,additiveParameters} from '../scripts/schema-compatibility.mjs';
test('compatibility allows optional fields and optional query parameters, rejects narrowing/removal',()=>{
 const old={type:'object',properties:{id:{type:'string'}},required:['id']};
 assert.ok(additiveSchema(old,{...old,properties:{...old.properties,extra:{type:'string'}}}));
 assert.equal(additiveSchema(old,{...old,properties:{...old.properties,extra:{type:'string'}},required:['id','extra']}),false);
 assert.equal(additiveSchema(old,{...old,properties:{}}),false);
 assert.equal(additiveSchema({type:'string',maxLength:200},{type:'string',maxLength:20}),false);
 assert.ok(additiveParameters([],[{name:'availability',in:'query',required:false}]));
 assert.equal(additiveParameters([{name:'id',in:'path',required:true}],[]),false);
});

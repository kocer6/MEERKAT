import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IndexAdmission,IndexAdmissionError} from '../src/index-admission.js';

const a='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const b='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const c='0xcccccccccccccccccccccccccccccccccccccccc';

test('admission validates, deduplicates, queues and drains index jobs',async()=>{
 const releases=new Map<string,()=>void>(),started:string[]=[];
 const admission=new IndexAdmission(token=>new Promise<void>(resolve=>{started.push(token);releases.set(token,resolve);}),{maxActive:2,maxQueued:20,maxPerWindow:5,windowMs:600_000});
 assert.throws(()=>admission.admit('bad','client'),(error:IndexAdmissionError)=>error.status===400);
 assert.equal(admission.admit(a,'client').state,'started');
 assert.equal(admission.admit('0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa','client').state,'active');
 assert.equal(admission.admit(b,'client').state,'started');
 assert.equal(admission.admit(c,'client').state,'queued');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[a,b]);
 releases.get(a)!();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[a,b,c]);
 releases.get(b)!();releases.get(c)!();
 await new Promise(resolve=>setImmediate(resolve));
});

test('admission enforces per-client and global queue limits',()=>{
 const admission=new IndexAdmission(()=>new Promise<void>(()=>{}),{maxActive:1,maxQueued:1,maxPerWindow:2,windowMs:600_000});
 admission.admit(a,'client',0);
 admission.admit(b,'client',1);
 assert.throws(()=>admission.admit(c,'client',2),(error:IndexAdmissionError)=>error.status===429&&error.retryAfter===600);
 assert.throws(()=>admission.admit(c,'other',2),(error:IndexAdmissionError)=>error.status===429&&error.retryAfter===undefined);
});

test('a queued duplicate does not consume another client admission',()=>{
 const admission=new IndexAdmission(()=>new Promise<void>(()=>{}),{maxActive:1,maxQueued:2,maxPerWindow:2,windowMs:600_000});
 admission.admit(a,'other',0);
 assert.equal(admission.admit(b,'client',1).state,'queued');
 assert.equal(admission.admit(b,'client',2).state,'queued');
 assert.equal(admission.admit(c,'client',3).state,'queued');
});

test('a synchronous worker refusal frees the active slot',async()=>{
 const started:string[]=[];
 const admission=new IndexAdmission(token=>{started.push(token);if(token===a)throw new Error('stopped');return new Promise<void>(()=>{});},{maxActive:1,maxQueued:1,maxPerWindow:5,windowMs:600_000});
 assert.equal(admission.admit(a,'client').state,'started');
 assert.equal(admission.admit(b,'client').state,'queued');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[a,b]);
});

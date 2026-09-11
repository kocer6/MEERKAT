import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startObserver} from '../src/observer-server.js';
test('primary product is observer-only, starts empty, protects controls and exposes no paper endpoints',async()=>{
 const app=await startObserver({port:0,database:':memory:'});
 try{
  const html=await (await fetch(app.url)).text();assert.match(html,/No private key/);assert.doesNotMatch(html,/Run paper scenario|PAPER BALANCE/);
  const token=/name="control-token" content="([a-f0-9]+)"/.exec(html)![1]!;
  const state=await (await fetch(app.url+'/api/state')).json();assert.equal(state.mode,'observe');assert.deepEqual(state.watches,[]);assert.equal(state.account,undefined);
  assert.equal((await fetch(app.url+'/api/watch/add?token=bad',{method:'POST'})).status,403);
  assert.equal((await fetch(app.url+'/api/watch/add?token=bad',{method:'POST',headers:{'x-control-token':token}})).status,400);
  for(const path of ['/api/demo','/api/paper/buy','/api/paper/close'])assert.equal((await fetch(app.url+path,{method:'POST',headers:{'x-control-token':token}})).status,404);
 }finally{await app.close();}
});

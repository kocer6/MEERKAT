import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WatchStore,WatchService} from '../src/watch.js';
import type {MarketReader} from '../src/chain/market.js';
const token='0x1111111111111111111111111111111111111111';
let block=42n;
const reader:MarketReader={chainId:async()=>4663,block:async()=>({number:block,timestamp:BigInt(Math.floor(Date.now()/1000))}),record:async()=>({exists:true,curve:token,pairToken:'0x0000000000000000000000000000000000000000',phase:0}),metadata:async()=>({symbol:'TEST',decimals:18}),curve:async()=>({quoteReserve:10n**19n,tokenReserve:10n**27n,realQuoteReserve:10n**18n,sellableTokens:8n*10n**26n,feeBps:100n,creatorTaxBps:0n,openingTaxBps:0n,graduated:false,readyToGraduate:false})};
test('watch real token, record manual position, retain stale value on outage and archive without trading',async()=>{
 const store=new WatchStore(':memory:');let fail=false;const service=new WatchService(store,{...reader,chainId:async()=>{if(fail)throw new Error('RPC down');return 4663;}});
 try{
  const watch=await service.add(token,'1000','0.01');assert.equal(watch.quantity,'1000000000000000000000');assert.equal(store.items().length,1);assert.equal(watch.snapshot?.source,'chain');
  assert.equal((await service.add(token,'1000','0.01')).token,token);assert.equal(store.items().length,1);
  fail=true;await assert.rejects(service.refresh(token));assert.equal(store.items()[0]?.status,'error');assert.deepEqual(store.items()[0]?.snapshot,watch.snapshot);
  store.archive(token);assert.equal(store.items().length,0);assert.ok(store.events().every(e=>!e.kind.includes('filled')));
 }finally{store.close();}
});
test('invalid and unsupported tokens do not create watches',async()=>{
 const store=new WatchStore(':memory:');try{const service=new WatchService(store,reader);await assert.rejects(service.add('bad','',''));await assert.rejects(service.add(token,'1',''));assert.equal(store.items().length,0);}finally{store.close();}
});

test('reserve alerts are deduplicated and missing reads do not fabricate collapses',async()=>{
 let reserve=10n**18n,fail=false;const store=new WatchStore(':memory:');const service=new WatchService(store,{...reader,curve:async(a,b)=>{if(fail)throw new Error('offline');return {...await reader.curve(a,b),realQuoteReserve:reserve};}});
 try{block=42n;await service.add(token,'','');block++;reserve=7n*10n**17n;await service.refresh(token);await service.refresh(token);assert.equal(store.events().filter(e=>e.kind==='reserve-warning').length,1);
 fail=true;await assert.rejects(service.refresh(token));block++;reserve=1n;fail=false;await service.refresh(token);assert.equal(store.events().filter(e=>e.kind==='reserve-warning').length,1);
 }finally{store.close();}
});
test('watchlist and manual amounts survive database restart',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const dir=mkdtempSync(join(tmpdir(),'meerkat-watch-'));const file=join(dir,'watch.sqlite');
 try{let store=new WatchStore(file);try{await new WatchService(store,reader).add(token,'1000','0.01');}finally{store.close();}store=new WatchStore(file);try{assert.equal(store.items()[0]?.costWei,'10000000000000000');assert.equal(store.events()[0]?.kind,'watch-added');}finally{store.close();}}finally{rmSync(dir,{recursive:true,force:true});}
});

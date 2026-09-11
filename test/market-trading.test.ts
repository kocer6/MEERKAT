import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';
import { PaperEngine } from '../src/paper.js';
import { defaultRules } from '../src/rules.js';
import { MarketTrading } from '../src/market-trading.js';
import type { MarketReader } from '../src/chain/market.js';
const token = '0x1111111111111111111111111111111111111111';
const reader = (patch: Partial<MarketReader> = {}): MarketReader => ({
 chainId: async () => 4663, block: async () => ({number: 42n,timestamp: BigInt(Math.floor(Date.now()/1000))}),
 record: async () => ({exists:true,curve:'0x2222222222222222222222222222222222222222',pairToken:'0x0000000000000000000000000000000000000000',phase:0}),
 metadata: async () => ({symbol:'TEST',decimals:18}),
 curve: async () => ({quoteReserve:10n**19n,tokenReserve:10n**27n,realQuoteReserve:10n**18n,sellableTokens:8n*10n**26n,feeBps:100n,creatorTaxBps:0n,openingTaxBps:0n,graduated:false,readyToGraduate:false}), ...patch
});
test('market paper entry and full exit use chain quotes, debit modeled gas and persist evidence', async () => {
 const ledger = new Ledger(':memory:',10n**18n,5n*10n**17n);
 const timestamp=BigInt(Math.floor(Date.now()/1000));
 try { const service = new MarketTrading(new PaperEngine(ledger,defaultRules),reader({block:async()=>({number:42n,timestamp})}));
 const p = await service.buy(token,10n**16n,'order-1'); assert.equal(p.source,'chain'); assert.equal(p.costWei,'10100000000000000');
 assert.equal((await service.buy(token,10n**16n,'order-1')).id,p.id);
 const closed = await service.close(p.id); assert.equal(closed.status,'closed'); assert.equal(closed.exitReason,'manual');
 assert.equal(ledger.events().filter(x=>x.kind==='entry-filled').length,1);
 assert.ok(ledger.events().some(x=>x.kind==='entry-reserved' && JSON.stringify(x.detail).includes('blockNumber')));
 } finally { ledger.close(); }
});

test('reserve warning persists while a healthy paper valuation remains open; outage breaks comparison',async()=>{
 let block=42n,reserve=10n**18n,outage=false;const base=reader();
 const market=reader({block:async()=>({number:block,timestamp:BigInt(Math.floor(Date.now()/1000))}),curve:async(a,b)=>{if(outage)throw new Error('offline');return {...await base.curve(a,b),realQuoteReserve:reserve};}});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{
  const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'reserve-1');
  block++;reserve=7n*10n**17n;await service.observe(p.id);
  assert.equal(ledger.position(p.id)?.status,'open');assert.equal(ledger.reserveWatches()[p.id]?.lastWarning?.dropBps,3000);
  outage=true;await assert.rejects(service.observe(p.id));assert.equal(ledger.reserveWatches()[p.id]?.reserveWei,null);
  outage=false;block++;reserve=3n*10n**17n;await service.observe(p.id);
  assert.equal(ledger.events().filter(e=>e.kind==='reserve-warning').length,1);assert.equal(ledger.position(p.id)?.status,'open');
 }finally{ledger.close();}
});
test('unknown tax and oversized share of liquidity cannot reserve money',async()=>{
 for (const patch of [{curve:async()=>({...await reader().curve('',0n),openingTaxBps:null})},{curve:async()=>({...await reader().curve('',0n),realQuoteReserve:10n**16n})}]) {
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try {await assert.rejects(new MarketTrading(new PaperEngine(ledger,defaultRules),reader(patch)).buy(token,10n**16n,'x'));assert.equal(ledger.account().reservedWei,'0');assert.equal(ledger.positions().length,0);}finally{ledger.close();}
 }
});
test('phase change and RPC outage retain open position instead of inventing an exit',async()=>{
 let fail=false; const base=reader(); const market=reader({record:async(t,b)=>({...await base.record(t,b),phase:fail?2:0})});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'x');fail=true;
 await assert.rejects(service.close(p.id),/phase/);assert.equal(ledger.position(p.id)?.status,'open');
 await assert.rejects(service.observe(p.id));assert.equal(ledger.position(p.id)?.lastValueWei,p.lastValueWei);
 }finally{ledger.close();}
});

test('position update triggers take-profit from fresh sell valuation and prevents duplicate exits',async()=>{
 let boosted=false; const base=reader(); const market=reader({curve:async(a,b)=>({...await base.curve(a,b),quoteReserve:boosted?20n*10n**18n:10n**19n})});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'update-1');boosted=true;
 const results=await Promise.allSettled([service.observe(p.id),service.close(p.id)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(ledger.position(p.id)?.exitReason,'take-profit');assert.equal(ledger.events().filter(x=>x.kind==='exit-filled').length,1);
 }finally{ledger.close();}
});
test('reserve RPC outage during exit preserves the balance, quantity and open status',async()=>{
 let outage=false;const base=reader();const market=reader({curve:async(a,b)=>{if(outage)throw new Error('RPC unavailable');return base.curve(a,b);}});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'outage-1');const balance=ledger.account().balanceWei;outage=true;
 await assert.rejects(service.close(p.id),/RPC unavailable/);assert.equal(ledger.account().balanceWei,balance);assert.equal(ledger.position(p.id)?.quantity,p.quantity);assert.equal(ledger.position(p.id)?.status,'open');
 }finally{ledger.close();}
});

test('a market value below exit gas still triggers stop-loss and accounts for negative proceeds',async()=>{
 let collapsed=false;const base=reader();const market=reader({curve:async(a,b)=>({...await base.curve(a,b),quoteReserve:collapsed?1000n:10n**19n})});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'collapse-1');collapsed=true;
 const result=await service.observe(p.id);assert.equal(result.status,'closed');assert.equal(result.exitReason,'stop-loss');assert.ok(BigInt(result.realizedPnlWei)<-BigInt(p.costWei));
 }finally{ledger.close();}
});

test('paper position survives graduation and closes using pool output with journal evidence',async()=>{
 let phase=0,fail=false;const base=reader();
 const market=reader({record:async(t,b)=>({...await base.record(t,b),phase,tickSpacing:200}),poolSell:async(t,spacing,quantity)=>{if(fail)throw new Error('pool unavailable');assert.equal(t,token);assert.ok(quantity>0n);return 99n*10n**14n;}});
 const ledger=new Ledger(':memory:',10n**18n,10n**18n);
 try{
  const service=new MarketTrading(new PaperEngine(ledger,defaultRules),market);const p=await service.buy(token,10n**16n,'graduate-1');phase=2;fail=true;
  await assert.rejects(service.observe(p.id),/pool unavailable/);assert.equal(ledger.position(p.id)?.status,'open');
  fail=false;await service.observe(p.id);assert.equal(ledger.position(p.id)?.status,'open');
  const closed=await service.close(p.id);assert.equal(closed.status,'closed');assert.equal(closed.lastValueWei,'9800000000000000');
  const exit=ledger.events().find(e=>e.kind==='exit-filled');assert.equal((exit?.detail.quote as {phase:number}).phase,2);
  assert.equal(ledger.events().filter(e=>e.kind==='reserve-warning').length,0);
 }finally{ledger.close();}
});

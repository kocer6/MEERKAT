import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findLaunchBlock,HistoryStore,rpcReadWithRetry,summarizeWallets,TokenHistory,type HistoryState,type TokenEvent} from '../src/token-history.js';
const trade=(side:'buy'|'sell',at:number):TokenEvent=>({id:String(at),kind:side,venue:'curve',blockNumber:'1',blockHash:'0xabc',txHash:'0xabc',logIndex:0,at,initiator:'0xalice',actor:'0xrouter',recipient:'0xalice',tokens:'100',quote:'10'});
test('wallet behavior uses evidenced timing, does not claim smart money or realized PnL',()=>{
 const wallets=summarizeWallets([trade('buy',101000),trade('sell',150000)],100000);
 assert.equal(wallets[0]?.address,'0xalice');assert.equal(wallets[0]?.earlyBuyer,true);assert.equal(wallets[0]?.fastExit,true);assert.equal(wallets[0]?.smartStatus,'insufficient cross-token evidence');assert.equal(wallets[0]?.realizedPnl,null);
});
test('transfers and missing initiators never turn into attributed trades',()=>{
 const event={...trade('buy',101000),initiator:null};assert.equal(summarizeWallets([event],100000).length,0);
});
test('launch lookup uses the indexed factory event instead of historical contract state',async()=>{
 const calls:Array<[bigint,bigint]>=[];
 const block=await findLaunchBlock(60_000_000n,async(from,to)=>{calls.push([from,to]);return [{blockNumber:59_283_454n}];});
 assert.equal(block,59_283_454n);
 assert.deepEqual(calls,[[0n,60_000_000n]]);
});
test('launch lookup rejects a missing or ambiguous factory event',async()=>{
 await assert.rejects(()=>findLaunchBlock(10n,async()=>[]),/could not be verified/);
 await assert.rejects(()=>findLaunchBlock(10n,async()=>[{blockNumber:1n},{blockNumber:2n}]),/could not be verified/);
});
test('RPC enrichment survives a sustained rate-limit window with bounded backoff',async()=>{
 let attempts=0;const waits:number[]=[];
 const value=await rpcReadWithRetry(async()=>{attempts++;if(attempts<6)throw Object.assign(new Error('Too Many Requests'),{code:429});return 'ok';},async ms=>{waits.push(ms);});
 assert.equal(value,'ok');assert.equal(attempts,6);assert.deepEqual(waits,[2000,4000,8000,16000,30000]);
 await assert.rejects(()=>rpcReadWithRetry(async()=>{throw Object.assign(new Error('bad request'),{code:-32602});},async()=>{}),/bad request/);
});
test('wallet behavior falls back to exact block distance when event timestamps are unavailable',()=>{
 const buy={...trade('buy',101000),at:null,blockNumber:'11'},sell={...trade('sell',150000),at:null,blockNumber:'20'};
 const wallet=summarizeWallets([buy,sell],100000,'10')[0]!;
 assert.equal(wallet.earlyBuyer,true);assert.equal(wallet.fastExit,true);
});
test('an interrupted history resumes from its saved profile and 64-block overlap without repeating discovery',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 const store=new HistoryStore(':memory:');
 const saved:HistoryState={profile:{token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'0',birthAt:0,head:'105',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null},cursor:'100',status:'error',error:'rate limited',updatedAt:1};
 store.save(saved);const chunks:Array<[bigint,bigint]>=[];
 const history=new TokenHistory(store,{profile:async()=>{throw new Error('profile discovery must not repeat on resume');},chunk:async(_profile,from,to)=>{chunks.push([from,to]);return [];}});
 history.start(token);
 for(let attempt=0;attempt<50&&store.state(token)?.status!=='ready';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(store.state(token)?.status,'ready');assert.equal(store.state(token)?.error,null);assert.deepEqual(chunks,[[37n,105n]]);
 await history.close();
});
test('token history result includes a bounded relationship graph from persisted evidence',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',deployer='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',buyer='0x1111111111111111111111111111111111111111';
 const store=new HistoryStore(':memory:'),profile={token,name:'Token',symbol:'TKN',decimals:18,curve:deployer,deployer,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'10',birthAt:0,head:'20',poolId:null,poolManager:deployer,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 const state:HistoryState={profile,cursor:'20',status:'ready',error:null,updatedAt:1};
 store.chunk(state,10n,20n,[{...trade('buy',0),id:'buy',blockNumber:'11',initiator:buyer,actor:buyer,recipient:buyer}]);
 const history=new TokenHistory(store),result=history.result(token);
 assert.equal(result.relationships?.edges.find(edge=>edge.kind==='curve buy')?.from,buyer);
 await history.close();
});

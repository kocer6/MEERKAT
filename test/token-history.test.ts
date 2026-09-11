import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodedLogToTokenEvent,findLaunchBlock,HistoryStore,readLogsAdaptive,rpcReadWithRetry,summarizeWallets,TokenHistory,type HistoryState,type TokenEvent} from '../src/token-history.js';
const trade=(side:'buy'|'sell',at:number):TokenEvent=>({id:String(at),kind:side,venue:'curve',blockNumber:'1',blockHash:'0xabc',txHash:'0xabc',logIndex:0,at,initiator:'0xalice',actor:'0xrouter',recipient:'0xalice',tokens:'100',quote:'10'});
test('wallet behavior uses evidenced timing, does not claim smart money or realized PnL',()=>{
 const wallets=summarizeWallets([trade('buy',101000),trade('sell',150000)],100000);
 assert.equal(wallets[0]?.address,'0xalice');assert.equal(wallets[0]?.earlyBuyer,true);assert.equal(wallets[0]?.fastExit,true);assert.equal(wallets[0]?.smartStatus,'insufficient cross-token evidence');assert.equal(wallets[0]?.realizedPnl,null);
});
test('transfers and missing initiators never turn into attributed trades',()=>{
 const event={...trade('buy',101000),initiator:null};assert.equal(summarizeWallets([event],100000).length,0);
});
test('decoded transfers retain their token quantity for holder reconstruction',()=>{
 const from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222';
 const result=decodedLogToTokenEvent({blockNumber:12n,blockHash:'0xblock',transactionHash:'0xtx',logIndex:3,eventName:'Transfer',args:{from,to,value:123n}});
 assert.equal(result?.kind,'Transfer');assert.equal(result?.actor,from);assert.equal(result?.recipient,to);assert.equal(result?.tokens,'123');assert.equal(result?.initiator,null);
});
test('decoded fee events retain payout amounts and recipient changes',()=>{
 const previous='0x1111111111111111111111111111111111111111',next='0x2222222222222222222222222222222222222222';
 const curve=decodedLogToTokenEvent({blockNumber:12n,blockHash:'0xblock',transactionHash:'0xcurve',logIndex:1,eventName:'FeesSwept',args:{protocolAmount:10n,buybackAmount:20n,creatorAmount:30n}})!;
 const pool=decodedLogToTokenEvent({blockNumber:13n,blockHash:'0xblock',transactionHash:'0xpool',logIndex:2,eventName:'PoolFeesSwept',args:{poolId:'0xpool',protocolAmount:40n,buybackAmount:0n,creatorAmount:50n,tokensLocked:0n}})!;
 const change=decodedLogToTokenEvent({blockNumber:14n,blockHash:'0xblock',transactionHash:'0xchange',logIndex:3,eventName:'CreatorFeeRecipientUpdated',args:{token:'0xtoken',previousRecipient:previous,newRecipient:next}})!;
 assert.equal(curve.venue,'curve');assert.equal(curve.details?.creatorAmount,'30');
 assert.equal(pool.venue,'pool');assert.equal(pool.details?.creatorAmount,'50');
 assert.equal(change.venue,'factory');assert.equal(change.actor,previous);assert.equal(change.recipient,next);
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
test('launch lookup adaptively splits RPC ranges that exceed provider limits',async()=>{
 const calls:Array<[bigint,bigint]>=[];
 const block=await findLaunchBlock(15n,async(from,to)=>{calls.push([from,to]);if(to-from>3n)throw new Error('maximum block range exceeded');return from<=9n&&to>=9n?[{blockNumber:9n}]:[];});
 assert.equal(block,9n);
 assert.ok(calls.length>1);
});
test('RPC enrichment survives a sustained rate-limit window with bounded backoff',async()=>{
 let attempts=0;const waits:number[]=[];
 const value=await rpcReadWithRetry(async()=>{attempts++;if(attempts<6)throw Object.assign(new Error('Too Many Requests'),{code:429});return 'ok';},async ms=>{waits.push(ms);});
 assert.equal(value,'ok');assert.equal(attempts,6);assert.deepEqual(waits,[2000,4000,8000,16000,30000]);
 await assert.rejects(()=>rpcReadWithRetry(async()=>{throw Object.assign(new Error('bad request'),{code:-32602});},async()=>{}),/bad request/);
});
test('dense log ranges split recursively instead of failing the entire token index',async()=>{
 const calls:Array<[bigint,bigint]>=[];
 const logs=await readLogsAdaptive(0n,7n,async(from,to)=>{calls.push([from,to]);if(to-from>3n)throw Object.assign(new Error('Missing or invalid parameters'),{details:'logs matched by query exceeds limit of 10000'});if(to-from>1n)throw Object.assign(new Error('Missing or invalid parameters'),{details:'log query timed out'});return Array.from({length:Number(to-from+1n)},(_,offset)=>Number(from)+offset);});
 assert.deepEqual(logs,[0,1,2,3,4,5,6,7]);
 assert.ok(calls.some(([from,to])=>from===0n&&to===3n));
});
test('wallet behavior falls back to exact block distance when event timestamps are unavailable',()=>{
 const buy={...trade('buy',101000),at:null,blockNumber:'11'},sell={...trade('sell',150000),at:null,blockNumber:'20'};
 const wallet=summarizeWallets([buy,sell],100000,'10')[0]!;
 assert.equal(wallet.earlyBuyer,true);assert.equal(wallet.fastExit,true);
});
test('an interrupted history resumes from its saved profile and 64-block overlap without repeating discovery',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 const store=new HistoryStore(':memory:');
 const saved:HistoryState={profile:{token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'0',birthAt:0,head:'105',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null},cursor:'100',status:'error',error:'rate limited',updatedAt:1,indexVersion:2};
 store.save(saved);const chunks:Array<[bigint,bigint]>=[];
 const history=new TokenHistory(store,{profile:async()=>{throw new Error('profile discovery must not repeat on resume');},chunk:async(_profile,from,to)=>{chunks.push([from,to]);return [];}});
 history.start(token);
 for(let attempt=0;attempt<50&&store.state(token)?.status!=='ready';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(store.state(token)?.status,'ready');assert.equal(store.state(token)?.error,null);assert.deepEqual(chunks,[[37n,105n]]);
 await history.close();
});
test('an index schema upgrade clears stale events before rebuilding history',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 const store=new HistoryStore(':memory:'),profile={token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'10',birthAt:0,head:'20',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 store.chunk({profile,cursor:'20',status:'ready',error:null,updatedAt:1,indexVersion:1},10n,20n,[{...trade('buy',0),id:'stale',blockNumber:'12'}]);
 let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
 const history=new TokenHistory(store,{profile:async()=>profile,chunk:async()=>{await blocked;return [];}});
 history.start(token);
 for(let attempt=0;attempt<50&&store.state(token)?.status!=='indexing';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 try{assert.equal(store.events(token).length,0);}finally{release();await history.close();}
});
test('an index schema upgrade withholds legacy score and fee flow before profile refresh completes',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 const store=new HistoryStore(':memory:'),profile={token,name:'Legacy',symbol:'OLD',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:2,birthBlock:'1',birthAt:0,head:'2',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 store.save({profile,cursor:'2',status:'ready',error:null,updatedAt:1});let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
 const history=new TokenHistory(store,{profile:async()=>{await blocked;return profile;},chunk:async()=>[]});history.start(token);
 try{const result=history.result(token);assert.equal(result.running,true);assert.equal(result.score?.value,null);assert.equal(result.feeFlow,null);}finally{release();await history.close();}
});
test('a successful retry clears the previous first-profile failure',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',store=new HistoryStore(':memory:');let calls=0;
 const profile={token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'1',birthAt:0,head:'1',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 const history=new TokenHistory(store,{profile:async()=>{if(++calls===1)throw new Error('first RPC failed');return profile;},chunk:async()=>[]});history.start(token);
 for(let attempt=0;attempt<50&&!history.error(token);attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 history.start(token);for(let attempt=0;attempt<50&&store.state(token)?.status!=='ready';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(history.error(token),null);await history.close();
});
test('wallet event lookup uses normalized address columns and returns only matching evidence',()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',other='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',wallet='0x1111111111111111111111111111111111111111',store=new HistoryStore(':memory:');
 const profile={token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'1',birthAt:0,head:'2',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 store.chunk({profile,cursor:'2',status:'ready',error:null,updatedAt:1,indexVersion:2},1n,2n,[{...trade('buy',0),id:'match',initiator:wallet,actor:wallet,recipient:wallet},{...trade('buy',1),id:'other',initiator:other,actor:other,recipient:other}]);
 assert.deepEqual(store.walletEvents(wallet).map(value=>value.event.id),['match']);store.close();
});
test('token history result includes a bounded relationship graph from persisted evidence',async()=>{
 const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',deployer='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',buyer='0x1111111111111111111111111111111111111111';
 const store=new HistoryStore(':memory:'),profile={token,name:'Token',symbol:'TKN',decimals:18,curve:deployer,deployer,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'10',birthAt:0,head:'20',poolId:null,poolManager:deployer,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
 const state:HistoryState={profile,cursor:'20',status:'ready',error:null,updatedAt:1,indexVersion:2};
 store.chunk(state,10n,20n,[{...trade('buy',0),id:'buy',blockNumber:'11',initiator:buyer,actor:buyer,recipient:buyer}]);
 const history=new TokenHistory(store),result=history.result(token);
 assert.equal(result.relationships?.edges.find(edge=>edge.kind==='curve buy')?.from,token);
 assert.equal(result.relationships?.edges.find(edge=>edge.kind==='curve buy')?.to,buyer);
 assert.equal(result.relationships?.summary.holdersComplete,true);
 await history.close();
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findLaunchBlock,rpcReadWithRetry,summarizeWallets,type TokenEvent} from '../src/token-history.js';
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
test('RPC enrichment retries only bounded rate-limit failures',async()=>{
 let attempts=0;const waits:number[]=[];
 const value=await rpcReadWithRetry(async()=>{attempts++;if(attempts<3)throw Object.assign(new Error('Too Many Requests'),{code:429});return 'ok';},async ms=>{waits.push(ms);});
 assert.equal(value,'ok');assert.equal(attempts,3);assert.deepEqual(waits,[1000,2000]);
 await assert.rejects(()=>rpcReadWithRetry(async()=>{throw Object.assign(new Error('bad request'),{code:-32602});},async()=>{}),/bad request/);
});
test('wallet behavior falls back to exact block distance when event timestamps are unavailable',()=>{
 const buy={...trade('buy',101000),at:null,blockNumber:'11'},sell={...trade('sell',150000),at:null,blockNumber:'20'};
 const wallet=summarizeWallets([buy,sell],100000,'10')[0]!;
 assert.equal(wallet.earlyBuyer,true);assert.equal(wallet.fastExit,true);
});

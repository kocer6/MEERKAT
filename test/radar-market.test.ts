import assert from 'node:assert/strict';
import test from 'node:test';
import {marketReader} from '../src/radar/market.js';
const token='0x0000000000000000000000000000000000000011';
test('market lookup verifies network/address and preserves missing price separately from FDV',async()=>{
 const fetcher=async(url:any)=>new Response(JSON.stringify(String(url).includes('geckoterminal')?{data:[{id:`robinhood_${token}`,attributes:{address:token,name:'Test',symbol:'TEST',price_usd:null,fdv_usd:'1000',market_cap_usd:null,total_reserve_in_usd:'20'}}]}:[{chainId:'base',baseToken:{address:token},priceUsd:'9'}]),{status:200});
 const result=await marketReader(fetcher as typeof fetch)([token]);assert.equal(result[0]?.priceUsd,null);assert.equal(result[0]?.marketCapUsd,null);assert.equal(result[0]?.fdvUsd,1000);assert.equal(result[0]?.liquidityUsd,20);
});
test('market lookup falls back when primary is down without accepting a different token',async()=>{
 const fetcher=async(url:any)=>{if(String(url).includes('geckoterminal'))return new Response('',{status:503});return new Response(JSON.stringify([{chainId:'robinhood',baseToken:{address:token,symbol:'T'},priceUsd:'2',liquidity:{usd:50}},{chainId:'robinhood',baseToken:{address:'0x0000000000000000000000000000000000000099'},priceUsd:'999'}]));};
 const result=await marketReader(fetcher as typeof fetch)([token]);assert.equal(result.length,1);assert.equal(result[0]?.priceUsd,2);assert.equal(result[0]?.source,'dexscreener');
});
test('both unavailable providers report failure instead of an empty successful lookup',async()=>{
 await assert.rejects(marketReader((async()=>new Response('',{status:429})) as typeof fetch)([token]),/unavailable/);
});

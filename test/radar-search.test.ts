import assert from 'node:assert/strict';
import test from 'node:test';
import {startObserver} from '../src/observer-server.js';
import type {RadarReader} from '../src/radar/reader.js';
import type {RadarLaunch,RadarProfile} from '../src/radar/types.js';

const token='0x0000000000000000000000000000000000000011';
const curve='0x0000000000000000000000000000000000000022';
const wallet='0x0000000000000000000000000000000000000044';
const profile:RadarProfile={name:'Test Token',symbol:'TEST',decimals:18,phase:0,creatorTaxBps:100,creatorFeeRecipient:wallet,totalSupply:'1000',deployerBalance:'100',holderCount:null,metadataComplete:true,profiledAtBlock:'500',profiledAt:1};
const launch:RadarLaunch={token,curve,deployer:'0x0000000000000000000000000000000000000033',pairToken:'0x0000000000000000000000000000000000000000',launchBlock:'450',blockHash:'0x450',txHash:'0xlaunch',logIndex:0,state:'discovered',profile:null,profileError:null,updatedAt:1};
const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[],profile:async()=>profile,quoteSell:async()=>null};

test('serves cached radar routes and classifies registered addresses',async()=>{
 const app=await startObserver({port:0,database:':memory:',radarReader:reader,radarAutoStart:false});
 try{
  await app.radarTick();
  assert.equal((await fetch(app.url+'/terminal/radar')).status,200);
  assert.equal((await fetch(app.url+'/api/radar/status')).status,200);
  const result=await (await fetch(app.url+`/api/radar/search?q=${token}`)).json();
  assert.deepEqual(result,{kind:'token',address:token,route:`/terminal/token/${token}`});
  const summary=await (await fetch(app.url+`/api/radar/token/${token}/summary`)).json();
  assert.equal(summary.launch.profile.symbol,'TEST');
 }finally{await app.close();}
});

test('does not silently classify an unknown contract-shaped address as a wallet',async()=>{
 const app=await startObserver({port:0,database:':memory:',radarReader:reader,radarAutoStart:false});
 try{
  const result=await (await fetch(app.url+`/api/radar/search?q=${wallet}`)).json();
  assert.deepEqual(result,{kind:'unclassified',address:wallet,choices:['wallet']});
 }finally{await app.close();}
});

test('rejects invalid radar enums and malformed search',async()=>{
 const app=await startObserver({port:0,database:':memory:',radarReader:reader,radarAutoStart:false});
 try{
  assert.equal((await fetch(app.url+'/api/radar/signals?feed=bad')).status,400);
  assert.equal((await fetch(app.url+'/api/radar/search?q=')).status,400);
 }finally{await app.close();}
});

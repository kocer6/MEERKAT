import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarIndexer,type RadarIndexerStatus} from '../src/radar/indexer.js';
import type {RadarReader} from '../src/radar/reader.js';
import {RadarStore} from '../src/radar/store.js';
import type {RadarEvent,RadarLaunch,RadarProfile} from '../src/radar/types.js';

const token='0x0000000000000000000000000000000000000011';
const curve='0x0000000000000000000000000000000000000022';
const wallet='0x0000000000000000000000000000000000000044';
const launch:RadarLaunch={token,curve,deployer:'0x0000000000000000000000000000000000000033',pairToken:'0x0000000000000000000000000000000000000000',launchBlock:'450',blockHash:'0x450',txHash:'0xlaunch',logIndex:0,state:'discovered',profile:null,profileError:null,updatedAt:1};
const buy:RadarEvent={id:'0xtrade:1',token:'',curve,wallet,kind:'buy',tokens:'100',quote:'10',blockNumber:'470',blockHash:'0x470',txHash:'0xtrade',logIndex:1,at:1470000,complete:true};
const profile:RadarProfile={name:'Test Token',symbol:'TEST',decimals:18,phase:0,creatorTaxBps:100,creatorFeeRecipient:wallet,totalSupply:'1000',deployerBalance:'100',holderCount:null,metadataComplete:true,profiledAtBlock:'500',profiledAt:1500000};

test('indexes verified curves, resumes with overlap, and coalesces concurrent ticks',async()=>{
 const calls:Array<[string,bigint,bigint]>=[];
 let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let first=true;
 const reader:RadarReader={
  chainId:async()=>4663,head:async()=>500n,
  block:async number=>({number,hash:`0x${number}`,timestamp:1000n+number}),
  factoryDeployment:async()=>100n,
  launches:async(from,to)=>{calls.push(['launches',from,to]);if(first){first=false;await gate;}return [launch];},
  trades:async(from,to)=>{calls.push(['trades',from,to]);return [buy,{...buy,id:'unknown',curve:'0x0000000000000000000000000000000000000099'}];},
  profile:async()=>profile,quoteSell:async()=>null,
 };
 const store=new RadarStore(':memory:');
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});
 const one=indexer.tick(),two=indexer.tick();
 assert.equal(one,two);
 release();await Promise.all([one,two]);
 assert.equal(store.eventsForToken(token).length,1);
 assert.equal(calls.filter(([kind])=>kind==='trades').length,1);
 await indexer.tick();
 assert.ok(calls.some(([kind,from])=>kind==='trades'&&from===437n));
 assert.equal(indexer.status().lastIndexedBlock,'500');
 await indexer.close();store.close();
});

test('wrong chain records a sanitized error without advancing cursors',async()=>{
 const reader={chainId:async()=>1,head:async()=>1n} as RadarReader;
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:0n});
 await indexer.tick();
 assert.match(indexer.status().error??'',/expected 4663/);
 assert.equal(store.cursor('market'),undefined);
 await indexer.close();store.close();
});

test('profiles one bounded wave per cycle so market indexing is not blocked by the full queue',async()=>{
 const launches=[1,2,3].map(index=>({...launch,token:`0x${index.toString(16).padStart(40,'0')}`,curve:`0x${(index+10).toString(16).padStart(40,'0')}`}));
 let profiles=0;
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>launches,trades:async()=>[],profile:async()=>{profiles++;return profile;},quoteSell:async()=>null};
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});
 await indexer.tick();
 assert.equal(profiles,1);
 assert.equal(store.cursor('market')?.blockNumber,'500');
 assert.equal(indexer.status().queueDepth,2);
 await indexer.close();store.close();
});

test('marks one bounded quote wave per cycle',async()=>{
 const buys=Array.from({length:6},(_,index)=>({...buy,id:`buy:${index}`,wallet:`0x${(index+100).toString(16).padStart(40,'0')}`}));let quotes=0;
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>buys,profile:async()=>profile,quoteSell:async()=>{quotes++;return 10n;}};
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});
 await indexer.tick();
 assert.equal(quotes,4);
 await indexer.close();store.close();
});

test('publishes durable status and materialized views after a cycle',async()=>{
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[buy],profile:async()=>profile,quoteSell:async()=>null};
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});
 await indexer.tick();
 assert.equal(store.view<RadarIndexerStatus>('indexer-status')?.value.state,'ready');
 assert.equal(store.view<unknown[]>('feed-rows')?.value.length,1);
 assert.ok(store.view<unknown[]>('leaderboard-all'));
 await indexer.close();store.close();
});

test('profile queue prioritizes launches with observed activity',async()=>{
 const active={...launch,token:'0x00000000000000000000000000000000000000a1',curve:'0x00000000000000000000000000000000000000a2',launchBlock:'100'},newer={...launch,token:'0x00000000000000000000000000000000000000b1',curve:'0x00000000000000000000000000000000000000b2',launchBlock:'200'};
 const store=new RadarStore(':memory:');store.saveLaunch(active);store.saveLaunch(newer);store.replaceEventRange('seed',100n,100n,100n,[{...buy,token:active.token,curve:active.curve,wallet:'0x00000000000000000000000000000000000000a3'}]);
 const profiled:string[]=[];const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[],trades:async()=>[],profile:async token=>{profiled.push(token);return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});await indexer.tick();
 assert.deepEqual(profiled,[active.token]);await indexer.close();store.close();
});

test('unchanged tokens are not rescored during an incremental tail cycle',async()=>{
 const untouched={...launch,token:'0x00000000000000000000000000000000000000c1',curve:'0x00000000000000000000000000000000000000c2',launchBlock:'100',state:'profiled' as const,profile};
 const store=new RadarStore(':memory:');store.saveLaunch(untouched);store.saveScore({subject:untouched.token,kind:'launch-quality',value:50,confidence:'low',modelVersion:'old',asOfBlock:'100',computedAt:1,components:[],unknownInputs:[],explanation:'old'});
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[buy],profile:async()=>profile,quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n,viewRefreshMs:300000});await indexer.tick();
 assert.equal(store.score(untouched.token,'launch-quality')?.computedAt,1);await indexer.close();store.close();
});

test('materialized views refresh at most once inside the configured interval',async()=>{
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[buy],profile:async()=>profile,quoteSell:async()=>null};
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n,viewRefreshMs:300000});await indexer.tick();const first=store.view('feed-rows')?.updatedAt;await indexer.tick();
 assert.equal(store.view('feed-rows')?.updatedAt,first);await indexer.close();store.close();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarIndexer} from '../src/radar/indexer.js';
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

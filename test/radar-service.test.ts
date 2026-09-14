import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarService} from '../src/radar/service.js';
import {RadarStore} from '../src/radar/store.js';
import type {RadarIndexerStatus} from '../src/radar/indexer.js';
import type {RadarLaunch,RadarProfile} from '../src/radar/types.js';

const token='0x0000000000000000000000000000000000000011';
const profile:RadarProfile={name:'Test Token',symbol:'TEST',decimals:18,phase:0,creatorTaxBps:100,creatorFeeRecipient:'0x0000000000000000000000000000000000000044',totalSupply:'1000',deployerBalance:'100',holderCount:null,metadataComplete:true,profiledAtBlock:'500',profiledAt:Date.now()};
const launch:RadarLaunch={token,curve:'0x0000000000000000000000000000000000000022',deployer:'0x0000000000000000000000000000000000000033',pairToken:'0x0000000000000000000000000000000000000000',launchBlock:'450',blockHash:'0x450',txHash:'0xlaunch',logIndex:0,state:'profiled',profile,profileError:null,updatedAt:Date.now()};
const status:RadarIndexerStatus={state:'ready',headBlock:'500',lastIndexedBlock:'500',lagBlocks:'0',updatedAt:Date.now(),queueDepth:0,error:null};

test('fresh feed exposes progressive launch states from cached rows',()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);
 const service=new RadarService(store,()=>status);
 const page=service.signals({feed:'fresh',window:'24h',cursor:null});
 assert.equal(page.items[0]?.state,'profiled');
 assert.equal(page.items[0]?.token,token);
 assert.equal(page.items[0]?.symbol,'TEST');
 assert.equal(page.nextCursor,null);
 store.close();
});

test('launch feed is bounded and rejects invalid cursors',()=>{
 const store=new RadarStore(':memory:');
 for(let index=0;index<55;index++)store.saveLaunch({...launch,token:`0x${(index+1).toString(16).padStart(40,'0')}`,curve:`0x${(index+101).toString(16).padStart(40,'0')}`,launchBlock:String(450+index),updatedAt:launch.updatedAt+index});
 const service=new RadarService(store,()=>status),first=service.signals({feed:'launches',window:'all',cursor:null});
 assert.equal(first.items.length,50);assert.ok(first.nextCursor);
 const second=service.signals({feed:'launches',window:'all',cursor:first.nextCursor});
 assert.equal(second.items.length,5);
 assert.throws(()=>service.signals({feed:'launches',window:'all',cursor:'bad'}),/Invalid radar cursor/);
 store.close();
});

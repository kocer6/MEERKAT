import assert from 'node:assert/strict';
import test from 'node:test';
import {applyPositionEvent,emptyPosition,markPosition} from '../src/radar/positions.js';
import {RadarStore} from '../src/radar/store.js';
import type {RadarEvent,RadarLaunch} from '../src/radar/types.js';

const wallet='0x0000000000000000000000000000000000000044';
const token='0x0000000000000000000000000000000000000011';
const curve='0x0000000000000000000000000000000000000022';
const zero='0x0000000000000000000000000000000000000000';
const event=(kind:RadarEvent['kind'],tokens:bigint,quote:bigint,block=1):RadarEvent=>({id:`0x${kind}:${block}`,token,curve,wallet,kind,tokens:tokens.toString(),quote:quote.toString(),blockNumber:String(block),blockHash:`0x${block}`,txHash:`0xtx${block}`,logIndex:0,at:block*1000,complete:true});

test('uses weighted average cost for a partial sell',()=>{
 let position=emptyPosition(wallet,token,zero);
 position=applyPositionEvent(position,event('buy',100n,10n,1));
 position=applyPositionEvent(position,event('buy',100n,30n,2));
 position=applyPositionEvent(position,event('sell',50n,15n,3));
 assert.equal(position.tokenBalance,'150');
 assert.equal(position.remainingCost,'30');
 assert.equal(position.realizedPnl,'5');
 assert.deepEqual(markPosition(position,45n),{currentValue:'45',openPnl:'15',totalPnl:'20',returnBps:5000});
});

test('unmatched transfer makes return incomplete',()=>{
 const transfer={...event('transfer',100n,0n),quote:null};
 const position=applyPositionEvent(emptyPosition(wallet,token,zero),transfer);
 assert.equal(position.complete,false);
 assert.deepEqual(markPosition(position,50n),{currentValue:'50',openPnl:null,totalPnl:null,returnBps:null});
});

test('overlap replacement rebuilds an affected wallet position',()=>{
 const store=new RadarStore(':memory:');
 const launch:RadarLaunch={token,curve,deployer:'0x0000000000000000000000000000000000000033',pairToken:zero,launchBlock:'1',blockHash:'0x1',txHash:'0xlaunch',logIndex:0,state:'discovered',profile:null,profileError:null,updatedAt:1};
 store.saveLaunch(launch);
 store.replaceEventRange('market',1n,3n,3n,[event('buy',100n,10n,1),event('sell',50n,10n,3)]);
 assert.equal(store.position(wallet,token)?.tokenBalance,'50');
 store.replaceEventRange('market',2n,3n,3n,[]);
 assert.equal(store.position(wallet,token)?.tokenBalance,'100');
 assert.equal(store.position(wallet,token)?.realizedPnl,'0');
 store.close();
});

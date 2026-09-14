import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarStore} from '../src/radar/store.js';
import type {RadarEvent,RadarLaunch} from '../src/radar/types.js';

const launch:RadarLaunch={
 token:'0x0000000000000000000000000000000000000011',
 curve:'0x0000000000000000000000000000000000000022',
 deployer:'0x0000000000000000000000000000000000000033',
 pairToken:'0x0000000000000000000000000000000000000000',
 launchBlock:'100',blockHash:'0xaaa',txHash:'0xbbb',logIndex:0,
 state:'discovered',profile:null,profileError:null,updatedAt:1,
};
const buy:RadarEvent={
 id:'0xaaa:0xccc:1',token:launch.token,curve:launch.curve,
 wallet:'0x0000000000000000000000000000000000000044',kind:'buy',
 tokens:'100',quote:'10',blockNumber:'110',blockHash:'0xaaa',txHash:'0xccc',
 logIndex:1,at:1000,complete:true,
};

test('overlap replacement removes orphaned events and keeps the cursor atomically',()=>{
 const store=new RadarStore(':memory:');
 store.replaceLaunchRange('factory',90n,120n,120n,[launch]);
 store.replaceEventRange('market',100n,120n,120n,[buy]);
 store.replaceEventRange('market',108n,130n,130n,[]);
 assert.equal(store.cursor('market')?.blockNumber,'130');
 assert.deepEqual(store.eventsForToken(launch.token),[]);
 assert.equal(store.launchByToken(launch.token)?.curve,launch.curve);
 store.close();
});

test('watchlist writes are idempotent and removal is exact',()=>{
 const store=new RadarStore(':memory:');
 const item={kind:'token' as const,address:launch.token,createdAt:10};
 store.watch(item);store.watch({...item,createdAt:20});
 assert.deepEqual(store.watchlist(),[item]);
 store.unwatch('wallet',launch.token);
 assert.equal(store.watchlist().length,1);
 store.unwatch('token',launch.token);
 assert.deepEqual(store.watchlist(),[]);
 store.close();
});

test('unchanged overlap preserves an executable mark and changed accounting clears it',()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);store.replaceEventRange('market',100n,120n,120n,[buy]);
 const position=store.position(buy.wallet!,launch.token)!;
 store.savePosition({...position,currentValue:'12',openPnl:'2',totalPnl:'2',returnBps:2000,markedAtBlock:'120'});
 store.replaceEventRange('market',108n,120n,120n,[buy]);
 assert.equal(store.position(buy.wallet!,launch.token)?.currentValue,'12');
 store.replaceEventRange('market',108n,120n,120n,[{...buy,quote:'11'}]);
 assert.equal(store.position(buy.wallet!,launch.token)?.currentValue,null);
 store.close();
});

test('materialized views replace atomically and counts stay in SQL',()=>{
 const store=new RadarStore(':memory:');
 store.saveLaunch(launch);store.replaceEventRange('market',100n,120n,120n,[buy]);
 store.saveView('feed-rows',[{token:launch.token,participants:1}],10);
 store.saveView('feed-rows',[{token:launch.token,participants:2}],20);
 assert.deepEqual(store.view<{token:string;participants:number}[]>('feed-rows'),{updatedAt:20,value:[{token:launch.token,participants:2}]});
 assert.deepEqual(store.counts(),{launches:1,events:1});
 store.close();
});

test('profile queue repairs scored launches whose metadata is missing',()=>{
 const store=new RadarStore(':memory:');
 store.saveLaunch({...launch,state:'scored',updatedAt:2});
 assert.deepEqual(store.profileCandidates(10).map(row=>row.token),[launch.token]);
 store.close();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarService} from '../src/radar/service.js';
import {RadarStore} from '../src/radar/store.js';
import type {RadarIndexerStatus} from '../src/radar/indexer.js';
import type {RadarLaunch,RadarProfile,ScoreSnapshot,WalletOutcome,WalletTokenPosition} from '../src/radar/types.js';

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

const wallet=(suffix:number)=>`0x${suffix.toString(16).padStart(40,'0')}`;
const outcome=(owner:string,index:number,pnl:bigint):WalletOutcome=>({wallet:owner,token:wallet(1000+index),closedAt:Date.now()-index,cost:'100',proceeds:(100n+pnl).toString(),pnl:pnl.toString(),returnBps:Number(pnl*100n),complete:true});
const position=(owner:string,complete=true):WalletTokenPosition=>({wallet:owner,token, pairToken:'0x0000000000000000000000000000000000000000',tokenBalance:'0',remainingCost:'0',realizedPnl:'0',observedProceeds:'0',buys:1,sells:1,firstBuyBlock:'1',lastTradeBlock:'2',complete,updatedAt:Date.now()});
const reputation=(owner:string,value:number):ScoreSnapshot=>({subject:owner,kind:'wallet-reputation',value,confidence:'medium',modelVersion:'test',asOfBlock:'500',computedAt:Date.now(),components:[],unknownInputs:[],explanation:'test evidence'});

test('eligible wallets outrank provisional wallets and ties are stable',()=>{
 const store=new RadarStore(':memory:'),service=new RadarService(store,()=>status),higher=wallet(70),tieA=wallet(71),tieB=wallet(72),provisional=wallet(73);
 for(const [owner,pnls] of [[higher,[40n,30n,20n]],[tieA,[20n,20n,20n]],[tieB,[30n,20n,10n]],[provisional,[999n]]] as const){const seed=parseInt(owner.slice(-2),16)*10;for(let index=0;index<pnls.length;index++)store.saveOutcome(outcome(owner,seed+index,pnls[index]!));store.saveScore(reputation(owner,75));}
 const rows=service.leaderboard({window:'30d',sort:'total-pnl',status:'all',cursor:null}).items;
 assert.deepEqual(rows.map(row=>row.wallet),[higher,tieA,tieB,provisional]);
 assert.equal(rows.at(-1)?.status,'provisional');store.close();
});

test('wallet with a material transfer gap is not PnL eligible',()=>{
 const store=new RadarStore(':memory:'),owner=wallet(80);for(let index=0;index<3;index++)store.saveOutcome(outcome(owner,index,10n));store.savePosition(position(owner,false));
 const row=new RadarService(store,()=>status).walletSummary(owner);
 assert.equal(row.leaderboardEligible,false);assert.ok(row.eligibilityReasons.includes('material transfer gap'));store.close();
});

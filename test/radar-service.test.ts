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

test('signals and exits use cached scores and events instead of empty placeholders',()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);store.saveScore({...reputation(token,82),kind:'radar-strength'});
 store.replaceEventRange('market',450n,500n,500n,[{id:'sell',token,curve:launch.curve,wallet:wallet(90),kind:'sell',tokens:'10',quote:'4',blockNumber:'500',blockHash:'0x500',txHash:'0xsell',logIndex:0,at:Date.now(),complete:true}]);
 const service=new RadarService(store,()=>status);assert.equal(service.signals({feed:'signals',window:'24h',cursor:null}).items[0]?.token,token);assert.equal(service.signals({feed:'exits',window:'24h',cursor:null}).items[0]?.sells,1);store.close();
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

test('wallet and leaderboard summaries expose profitable and losing outcomes',()=>{
 const store=new RadarStore(':memory:'),owner=wallet(81);store.saveOutcome(outcome(owner,1,20n));store.saveOutcome(outcome(owner,2,-10n));store.saveOutcome(outcome(owner,3,0n));
 const service=new RadarService(store,()=>status),summary=service.walletSummary(owner),ranked=service.leaderboard({window:'all',sort:'total-pnl',status:'all',cursor:null}).items[0]!;
 assert.deepEqual({wins:summary.profitablePositions,losses:summary.losingPositions,breakEven:summary.breakEvenPositions},{wins:1,losses:1,breakEven:1});
 assert.deepEqual({wins:ranked.wins,losses:ranked.losses},{wins:1,losses:1});store.close();
});

test('token summary includes participant reputation for score-colored intelligence tables',()=>{
 const store=new RadarStore(':memory:'),owner=wallet(82);store.saveLaunch(launch);store.savePosition(position(owner));store.saveScore(reputation(owner,76));
 const summary=new RadarService(store,()=>status).tokenSummary(token);
 assert.deepEqual(summary.participantScores,[{wallet:owner,reputation:76,confidence:'medium'}]);store.close();
});

test('watchlist is idempotent and activity is material-only',()=>{
 const store=new RadarStore(':memory:'),service=new RadarService(store,()=>status);
 service.watch({kind:'token',address:token,createdAt:1});service.watch({kind:'token',address:token,createdAt:2});
 store.saveActivity({id:'material',subject:token,subjectKind:'token',kind:'score-band-change',material:true,blockNumber:'500',blockHash:null,txHash:null,createdAt:1,summary:'score moved'});
 store.saveActivity({id:'cosmetic',subject:token,subjectKind:'token',kind:'refresh',material:false,blockNumber:'501',blockHash:null,txHash:null,createdAt:2,summary:'refreshed'});
 assert.equal(service.watchlist().items.length,1);assert.deepEqual(service.activity(null).items.map(row=>row.id),['material']);store.close();
});

test('feed and leaderboard use materialized rows when available',()=>{
 const store=new RadarStore(':memory:'),owner=wallet(91),service=new RadarService(store,()=>status);
 const feedRow={token,curve:launch.curve,name:'Cached',symbol:'CACHE',state:'scored' as const,pairToken:launch.pairToken,launchBlock:'450',updatedAt:Date.now(),ageMs:0,phase:0,participants:9,buys:4,sells:1,buyFlow:'10',sellFlow:'2',missingInputs:[],radarStrength:81};
 const leaderboardRow={wallet:owner,status:'eligible' as const,eligibilityReasons:[],completedPositions:3,wins:2,losses:1,winRate:2/3,realizedPnl:'50',openPnl:'10',totalPnl:'60',reputation:88,confidence:'high',activePositions:1};
 store.saveView('feed-rows',[feedRow]);store.saveView('leaderboard-all',[leaderboardRow]);
 assert.equal(service.signals({feed:'signals',window:'24h',cursor:null}).items[0]?.symbol,'CACHE');
 assert.equal(service.leaderboard({window:'all',sort:'total-pnl',status:'all',cursor:null}).items[0]?.wallet,owner);
 store.close();
});

test('read-only web service never runs expensive fallback before the first view',()=>{
 const store=new RadarStore(':memory:'),owner=wallet(92);for(let index=0;index<3;index++)store.saveOutcome(outcome(owner,index,10n));store.saveLaunch(launch);
 const service=new RadarService(store,()=>status,false);
 assert.deepEqual(service.signals({feed:'fresh',window:'24h',cursor:null}).items,[]);
 assert.deepEqual(service.leaderboard({window:'all',sort:'total-pnl',status:'all',cursor:null}).items,[]);
 store.close();
});

test('profile refresh patches names into the visible feed without rebuilding every view',()=>{
 const store=new RadarStore(':memory:'),service=new RadarService(store,()=>status),pending={token,curve:launch.curve,name:null,symbol:null,state:'scored' as const,pairToken:launch.pairToken,launchBlock:'450',updatedAt:1,ageMs:0,phase:null,participants:9,buys:4,sells:1,buyFlow:'10',sellFlow:'2',missingInputs:['token profile'],radarStrength:81};
 store.saveLaunch({...launch,state:'scored'});store.saveView('feed-rows',[pending],1);
 service.refreshFeedProfiles([token],2);
 const row=store.view<typeof pending[]>('feed-rows')?.value[0];
 assert.deepEqual({name:row?.name,symbol:row?.symbol,phase:row?.phase,missingInputs:row?.missingInputs},{name:'Test Token',symbol:'TEST',phase:0,missingInputs:[]});
 assert.equal(store.view('feed-rows')?.updatedAt,2);store.close();
});

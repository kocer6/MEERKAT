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

test('fresh launches receive profile capacity even while scored metadata is backlogged',async()=>{
 const store=new RadarStore(':memory:'),requested:string[]=[];
 const backlog=Array.from({length:8},(_,i)=>({...launch,token:`0x${(100+i).toString(16).padStart(40,'0')}`,curve:`0x${(200+i).toString(16).padStart(40,'0')}`,launchBlock:String(100+i)}));
 for(const row of backlog)store.saveLaunch(row);
 store.saveView('feed-rows',backlog.map(row=>({...row,radarStrength:90,missingInputs:['token profile']})),1);
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[],profile:async token=>{requested.push(token);return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,profileBatchSize:4,historyStartBlock:100n});
 await indexer.tick();assert.ok(requested.includes(token));assert.equal(requested.length,4);assert.ok(requested.some(address=>backlog.some(row=>row.token===address)));
 await indexer.close();store.close();
});

test('metadata patches cannot postpone an overdue leaderboard refresh',async()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);
 store.saveView('feed-rows',[{token,radarStrength:80,missingInputs:['token profile']}],1);store.saveView('leaderboard-all',[],1);
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[],profile:async()=>profile,quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});await indexer.tick();
 assert.ok(store.view('leaderboard-all')!.updatedAt>1);await indexer.close();store.close();
});

test('visible Fresh metadata is not starved by a continuous stream of newer launches',async()=>{
 const store=new RadarStore(':memory:'),requested:string[]=[];
 const visible={...launch,launchBlock:'100'};store.saveLaunch(visible);store.saveView('feed-rows',[{token,launchBlock:'100',radarStrength:null,missingInputs:['token profile']}],Date.now());store.saveView('leaderboard-all',[],Date.now());
 const newer=Array.from({length:8},(_,i)=>({...launch,token:`0x${(100+i).toString(16).padStart(40,'0')}`,curve:`0x${(200+i).toString(16).padStart(40,'0')}`,launchBlock:String(450+i)}));
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>newer,trades:async()=>[],profile:async address=>{requested.push(address);return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,profileBatchSize:4,historyStartBlock:100n});await indexer.tick();assert.ok(requested.includes(token));assert.ok(requested.some(address=>newer.some(row=>row.token===address)));await indexer.close();store.close();
});

test('failed profiles cool down so the next pass can name other tokens',async()=>{
 const store=new RadarStore(':memory:'),requested:string[]=[];
 const broken={...launch,launchBlock:'100'},other={...launch,token:'0x0000000000000000000000000000000000000099',curve:'0x0000000000000000000000000000000000000088',launchBlock:'101'};
 store.saveLaunch(broken);store.saveLaunch(other);store.saveView('feed-rows',[{token,radarStrength:90,missingInputs:['token profile']},{token:other.token,radarStrength:80,missingInputs:['token profile']}],Date.now());store.saveView('leaderboard-all',[],Date.now());
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[],trades:async()=>[],profile:async address=>{requested.push(address);if(address===token)throw new Error('temporary RPC failure');return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:1,profileBatchSize:1,historyStartBlock:100n});await indexer.tick();await indexer.tick();
 assert.deepEqual(requested,[token,other.token]);await indexer.close();store.close();
});

test('score updates do not extend the failed-profile retry clock',async()=>{
 const store=new RadarStore(':memory:'),requested:string[]=[];
 store.saveLaunch({...launch,launchBlock:'100',profileError:'RPC timeout',profileAttemptAt:1,updatedAt:Date.now()});
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[],trades:async()=>[],profile:async address=>{requested.push(address);return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});await indexer.tick();assert.deepEqual(requested,[token]);await indexer.close();store.close();
});

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

test('profile queue repairs the highest-scored visible token before the background backlog',async()=>{
 const active={...launch,token:'0x00000000000000000000000000000000000000a1',curve:'0x00000000000000000000000000000000000000a2',launchBlock:'100'},visible={...launch,token:'0x00000000000000000000000000000000000000b1',curve:'0x00000000000000000000000000000000000000b2',launchBlock:'200'};
 const store=new RadarStore(':memory:');store.saveLaunch(active);store.saveLaunch(visible);store.replaceEventRange('seed',100n,100n,100n,[{...buy,token:active.token,curve:active.curve,wallet:'0x00000000000000000000000000000000000000a3'}]);store.saveView('feed-rows',[{token:active.token,radarStrength:50},{token:visible.token,radarStrength:80}],1);
 const profiled:string[]=[];const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[],trades:async()=>[],profile:async token=>{profiled.push(token);return profile;},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:1,profileBatchSize:1,historyStartBlock:100n});await indexer.tick();
 assert.deepEqual(profiled,[visible.token]);await indexer.close();store.close();
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

test('collector advances events while metadata RPC is stalled; projector survives enrichment failure',{timeout:3000},async()=>{
 const store=new RadarStore(':memory:');let release!:()=>void,entered!:()=>void;
 const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[buy],profile:async()=>{entered();await gate;throw new Error('metadata unavailable');},quoteSell:async()=>null};
 store.replaceLaunchRange('factory',400n,500n,500n,[launch]);store.replaceEventRange('market',400n,500n,500n,[]);
 const options={rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n};
 const enrichment=new RadarIndexer(store,reader,{...options,mode:'enrich'}),collector=new RadarIndexer(store,reader,{...options,mode:'collect'}),projector=new RadarIndexer(store,reader,{...options,mode:'project'});
 const work=enrichment.tick();await waiting;
 try{await collector.tick();assert.equal(store.cursor('market')?.blockNumber,'500');assert.equal(store.eventsForToken(token).length,1);await projector.tick();assert.equal(projector.status().state,'ready');assert.equal(store.view<any[]>('feed-rows')?.value[0]?.token,token);assert.equal(store.pendingProjections(10).length,0);}finally{release();await work;await Promise.all([collector.close(),enrichment.close(),projector.close()]);store.close();}
});

test('durable projection revisions cannot acknowledge newer collected work',()=>{
 const store=new RadarStore(':memory:');store.queueProjection(token);const [first]=store.pendingProjections(10);store.queueProjection(token);store.finishProjection(first!);assert.equal(store.pendingProjections(10).length,1);store.finishProjection(store.pendingProjections(10)[0]!);assert.equal(store.pendingProjections(10).length,0);store.close();
});

test('a late quote cannot overwrite a position changed by the collector',()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);store.replaceEventRange('market',400n,500n,500n,[{...buy,token}]);const before=store.position(wallet,token)!;
 store.replaceEventRange('market',400n,500n,500n,[{...buy,token,tokens:'200',quote:'20'}]);
 assert.equal(store.savePositionIfUnchanged(before,{...before,currentValue:'99'}),false);assert.equal(store.position(wallet,token)?.tokenBalance,'200');store.close();
});

test('enrichment refreshes an existing profile without downgrading its scored state',async()=>{
 const store=new RadarStore(':memory:');store.replaceLaunchRange('factory',400n,500n,500n,[{...launch,state:'scored',profile}]);store.replaceEventRange('market',400n,500n,500n,[]);
 const reader={chainId:async()=>4663,profile:async()=>({...profile,phase:1,profiledAt:Date.now()}),quoteSell:async()=>null} as unknown as RadarReader;
 const worker=new RadarIndexer(store,reader,{mode:'enrich',rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});await worker.tick();assert.equal(store.launchByToken(token)?.profile?.phase,1);assert.equal(store.launchByToken(token)?.state,'scored');assert.equal(store.pendingProjections(10).length,1);await worker.close();store.close();
});

test('late metadata cannot resurrect a launch removed by overlap correction',async()=>{
 const store=new RadarStore(':memory:');store.replaceLaunchRange('factory',400n,500n,500n,[launch]);store.replaceEventRange('market',400n,500n,500n,[]);let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const reader={chainId:async()=>4663,profile:async()=>{entered();await gate;return profile;},quoteSell:async()=>null} as unknown as RadarReader;
 const worker=new RadarIndexer(store,reader,{mode:'enrich',rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});const work=worker.tick();await started;store.replaceLaunchRange('factory',400n,500n,500n,[]);release();await work;assert.equal(store.launchByToken(token),undefined);await worker.close();store.close();
});
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('projection permits concurrent database writes and retains work changed during its read snapshot',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'meerkat-project-')),file=join(directory,'radar.sqlite'),store=new RadarStore(file),other=new RadarStore(file);
 const worker=new RadarIndexer(store,{} as RadarReader,{mode:'project',rangeBlocks:200n,pollMs:5000,profileConcurrency:1,historyStartBlock:100n});
 try{
  store.replaceLaunchRange('factory',400n,500n,500n,[{...launch,profile}]);store.replaceEventRange('market',400n,500n,500n,[{...buy,token}]);
  const read=store.eventsForToken.bind(store);let written=false;
  store.eventsForToken=(address:string)=>{if(!written){written=true;other.transaction(()=>{other.saveLaunch({...launch,profile:{...profile,name:'Updated concurrently'}});other.queueProjection(token);});}return read(address);};
  await worker.tick();assert.equal(worker.status().state,'ready');assert.equal(store.launchByToken(token)?.profile?.name,'Updated concurrently');assert.equal(store.pendingProjections(10).length,1);await worker.tick();assert.equal(store.pendingProjections(10).length,0);
 }finally{await worker.close();store.close();other.close();rmSync(directory,{recursive:true,force:true});}
});

test('external enrichment continues when contract RPC is unavailable',async()=>{
 const store=new RadarStore(':memory:');store.replaceLaunchRange('factory',400n,500n,500n,[launch]);store.replaceEventRange('market',400n,500n,500n,[]);
 const worker=new RadarIndexer(store,{chainId:async()=>{throw new Error('RPC unavailable');}} as unknown as RadarReader,{mode:'enrich',rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n,marketRead:async()=>[{token,name:'External Test',symbol:'EXT',source:'geckoterminal',priceUsd:1,liquidityUsd:10,volume24hUsd:null,marketCapUsd:null,fdvUsd:null,fetchedAt:Date.now()}]});await worker.tick();assert.equal(store.market(token)?.data?.symbol,'EXT');assert.match(worker.status().error??'',/RPC unavailable/);await worker.close();store.close();
});

test('collector catches up in bounded ranges after an outage',async()=>{
 const store=new RadarStore(':memory:');store.replaceLaunchRange('factory',400n,500n,500n,[]);store.replaceEventRange('market',400n,500n,500n,[]);const ranges:Array<[bigint,bigint]>=[];
 const reader={chainId:async()=>4663,head:async()=>5000n,factoryDeployment:async()=>100n,block:async(number:bigint)=>({number,hash:'0xblock',timestamp:number}),launches:async(from:bigint,to:bigint)=>{ranges.push([from,to]);return [];},trades:async(from:bigint,to:bigint)=>{ranges.push([from,to]);return [];}} as unknown as RadarReader;
 const worker=new RadarIndexer(store,reader,{mode:'collect',rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});await worker.tick();assert.ok(ranges.every(([from,to])=>to-from+1n<=200n));assert.equal(store.cursor('market')?.blockNumber,'636');await worker.close();store.close();
});


test('batched enrichment bounds calls and saves successes despite a failed sibling',async()=>{
 const store=new RadarStore(':memory:'),rows=Array.from({length:45},(_,i)=>({...launch,token:`0x${(100+i).toString(16).padStart(40,'0')}`,curve:`0x${(200+i).toString(16).padStart(40,'0')}`,launchBlock:String(100+i)}));
 for(const row of rows)store.saveLaunch(row);store.replaceEventRange('market',500n,500n,500n,[],'0x500');
 const batches:number[]=[];
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:'0x1',timestamp:number}),factoryDeployment:async()=>0n,launches:async()=>[],trades:async()=>[],profile:async()=>{throw new Error('single-token path must not run');},profiles:async requested=>{batches.push(requested.length);return new Map(requested.map(row=>[row.token,row.token===rows[0]!.token?new Error('reverted'):profile]));},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{mode:'enrich',rangeBlocks:200n,pollMs:30000,profileConcurrency:2,profileBatchSize:45,historyStartBlock:0n});
 await indexer.tick();assert.deepEqual(batches,[20,20,5]);assert.equal(store.launches().filter(row=>row.profile).length,44);assert.match(store.launchByToken(rows[0]!.token)!.profileError!,/reverted/);assert.equal(store.projectionCount(),44);await indexer.close();store.close();
});


test('enrichment defers launches newer than its captured market block without marking failure',async()=>{
 const store=new RadarStore(':memory:');store.saveLaunch({...launch,launchBlock:'501'});store.replaceEventRange('market',500n,500n,500n,[],'0x500');let requested=0;
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:'0x1',timestamp:number}),factoryDeployment:async()=>0n,launches:async()=>[],trades:async()=>[],profile:async()=>{requested++;throw new Error('not registered at old block');},quoteSell:async()=>null};
 const indexer=new RadarIndexer(store,reader,{mode:'enrich',rangeBlocks:200n,pollMs:30000,profileConcurrency:2,profileBatchSize:4,historyStartBlock:0n});await indexer.tick();assert.equal(requested,0);assert.equal(store.launchByToken(token)!.profileError,null);await indexer.close();store.close();
});

test('collector publishes live feed before scoring or enrichment finishes',async()=>{
 const store=new RadarStore(':memory:');
 const reader:RadarReader={chainId:async()=>4663,head:async()=>500n,block:async number=>({number,hash:`0x${number}`,timestamp:number}),factoryDeployment:async()=>100n,launches:async()=>[launch],trades:async()=>[buy],profile:async()=>{throw new Error('must not enrich');},quoteSell:async()=>null};
 const worker=new RadarIndexer(store,reader,{mode:'collect',rangeBlocks:200n,pollMs:30000,profileConcurrency:1,historyStartBlock:100n});
 await worker.tick();const rows=store.view<any[]>('feed-rows')?.value;assert.equal(rows?.[0]?.token,token);assert.equal(rows?.[0]?.buys,1);assert.equal(store.score(token,'radar-strength'),undefined);await worker.close();store.close();
});

test('projector queues changed wallet dependencies instead of expanding the current batch',async()=>{
 const store=new RadarStore(':memory:'),other={...launch,token:'0x0000000000000000000000000000000000000099',curve:'0x0000000000000000000000000000000000000088'};
 store.replaceLaunchRange('factory',400n,500n,500n,[launch,other]);store.replaceEventRange('market',400n,500n,500n,[{...buy,token},{...buy,id:'other',token:other.token,curve:other.curve}]);
 for(const job of store.pendingProjections(10))store.finishProjection(job);
 store.queueProjection(token);store.saveView('leaderboard-all',[],Date.now());
 const worker=new RadarIndexer(store,{} as RadarReader,{mode:'project',rangeBlocks:200n,pollMs:5000,profileConcurrency:1,historyStartBlock:100n});
 await worker.tick();assert.equal(worker.status().state,'ready');assert.equal(store.score(other.token,'radar-strength'),undefined);assert.deepEqual(store.pendingProjections(10).map(job=>job.token),[other.token]);
 await worker.tick();assert.ok(store.score(other.token,'radar-strength'));assert.equal(store.projectionCount(),0);
 store.queueProjection(token);await worker.tick();assert.equal(store.projectionCount(),0);await worker.close();store.close();
});

test('live projection reserves capacity for new launches without starving old work',()=>{
 const store=new RadarStore(':memory:');
 for(let i=1;i<=8;i++){const address='0x'+i.toString(16).padStart(40,'0');store.saveLaunch({...launch,token:address,curve:'0x'+(i+100).toString(16).padStart(40,'0'),launchBlock:String(i)});store.queueProjection(address);}
 const jobs=store.liveProjectionJobs(4);assert.deepEqual(jobs.map(job=>Number(BigInt(job.token))),[8,7,1,2]);assert.equal(new Set(jobs.map(job=>job.token)).size,4);store.close();
});


test('metadata worker publishes each batch without waiting for slow enrichment',async()=>{
 const store=new RadarStore(':memory:');
 const rows=Array.from({length:21},(_,i)=>({...launch,token:`0x${(100+i).toString(16).padStart(40,'0')}`,curve:`0x${(200+i).toString(16).padStart(40,'0')}`}));
 for(const row of rows)store.saveLaunch(row);
 store.saveLaunch({...launch,launchBlock:'501'});store.replaceEventRange('market',500n,500n,500n,[]);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 const reader={chainId:async()=>4663,profiles:async(batch:RadarLaunch[])=>{if(++calls===2)await gate;return new Map(batch.map(row=>[row.token,profile]));}} as unknown as RadarReader;
 const worker=new RadarIndexer(store,reader,{mode:'metadata',rangeBlocks:200n,pollMs:5000,profileConcurrency:2,profileBatchSize:40,historyStartBlock:100n});
 const work=worker.tick();
 try{await new Promise(resolve=>setTimeout(resolve,20));assert.equal(store.view<any[]>('feed-rows')?.value.length,20);assert.equal(store.launchByToken(token)?.profile,null);}
 finally{release();await work;}
 assert.equal(worker.status().state,'ready');assert.equal(store.view<any[]>('feed-rows')?.value.length,21);assert.equal(store.view<any>('metadata-status')?.value.queueDepth,1);
 await worker.close();store.close();
});


test('separate enrichment leaves missing metadata to the fast worker',async()=>{
 const store=new RadarStore(':memory:');store.saveLaunch(launch);store.replaceEventRange('market',500n,500n,500n,[]);
 let calls=0;const reader={chainId:async()=>4663,profile:async()=>{calls++;return profile;}} as unknown as RadarReader;
 const worker=new RadarIndexer(store,reader,{mode:'enrich',separateMetadata:true,rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});
 await worker.tick();assert.equal(worker.status().state,'ready');assert.equal(calls,0);assert.equal(store.launchByToken(token)?.profile,null);await worker.close();store.close();
});

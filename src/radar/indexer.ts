import type {RadarMarket} from './market.js';
import type {RadarReader} from './reader.js';
import {RadarStore} from './store.js';
import type {RadarEvent,RadarLaunch,ScoreSnapshot,RadarActivity} from './types.js';
import {scoreLaunchQuality,scoreRadarStrength,scoreWalletReputation} from './scores.js';
import {markPosition} from './positions.js';
import {RadarService} from './service.js';

export interface RadarIndexerOptions {
 marketRead?:(tokens:string[])=>Promise<RadarMarket[]>;
 mode?:'combined'|'collect'|'enrich'|'project';
 rangeBlocks:bigint;
 pollMs:number;
 profileConcurrency:number;
 profileBatchSize?:number;
 viewRefreshMs?:number;
 historyStartBlock:bigint;
}

export interface RadarIndexerStatus {
 state:'idle'|'indexing'|'ready'|'error'|'stopped';
 headBlock:string|null;
 lastIndexedBlock:string|null;
 lagBlocks:string|null;
 updatedAt:number|null;
 queueDepth:number;
 error:string|null;
}

const sanitize=(error:unknown)=>(error instanceof Error?error.message:'Radar indexing failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,240);

export class RadarIndexer {
 private projectedScores:Map<string,ScoreSnapshot>|null=null;
 private projectedActivities:RadarActivity[]=[];
 private projectedTokens=new Set<string>();
 private pending:Promise<void>|null=null;
 private timer:NodeJS.Timeout|null=null;
 private stopped=false;
 private snapshot:RadarIndexerStatus={state:'idle',headBlock:null,lastIndexedBlock:null,lagBlocks:null,updatedAt:null,queueDepth:0,error:null};

 constructor(private store:RadarStore,private reader:RadarReader,private options:RadarIndexerOptions){}

 status():RadarIndexerStatus{return {...this.snapshot};}

 tick():Promise<void>{
  if(this.pending)return this.pending;
  if(this.stopped)return Promise.resolve();
  const work=this.options.mode==='enrich'||this.options.mode==='project'?this.runDerivedCycle():this.runCycle();
  this.pending=work.finally(()=>{this.pending=null;});
  return this.pending;
 }

 start(){if(!this.timer&&!this.stopped){if(this.options.mode==='project'){const run=async()=>{await this.tick();if(!this.stopped)this.timer=setTimeout(()=>void run(),this.options.pollMs);};this.timer=setTimeout(()=>void run(),0);}else{void this.tick();this.timer=setInterval(()=>void this.tick(),this.options.pollMs);}}}

 async close(){this.stopped=true;if(this.timer){clearInterval(this.timer);this.timer=null;}await this.pending;this.snapshot={...this.snapshot,state:'stopped'};}

 private async runCycle(){
  const started=Date.now();let checkpoint=started;
  const timing=(stage:string)=>{const now=Date.now();console.info(`Radar ${stage}: ${now-checkpoint}ms`);checkpoint=now;};
  this.snapshot={...this.snapshot,state:'indexing',error:null};this.publishStatus();
  try{
   const chainId=await this.reader.chainId();if(chainId!==4663)throw new Error(`wrong chain: ${chainId}; expected 4663`);
   const head=await this.reader.head(),deployment=await this.reader.factoryDeployment();
   const factoryRange=this.range('factory',head,deployment),launches=await this.reader.launches(factoryRange.from,factoryRange.to);
   const factoryBlock=await this.reader.block(factoryRange.to);
   this.store.replaceLaunchRange('factory',factoryRange.from,factoryRange.to,factoryRange.to,launches,factoryBlock.hash);
   timing('discovery');
   const collecting=this.options.mode==='collect',views=new RadarService(this.store,()=>this.status()),profiled=collecting?[]:await this.profileLaunches(head);if(!collecting)views.refreshFeedProfiles(profiled);
   timing(`profiles (${profiled.length})`);
   const marketRange=this.range('market',head,this.options.historyStartBlock>deployment?this.options.historyStartBlock:deployment),raw=await this.reader.trades(marketRange.from,marketRange.to),events:RadarEvent[]=[];
   for(const event of raw){const launch=this.store.launchByCurve(event.curve);if(launch)events.push({...event,token:launch.token});}
   const marketBlock=marketRange.to===factoryRange.to?factoryBlock:await this.reader.block(marketRange.to);
   this.store.replaceEventRange('market',marketRange.from,marketRange.to,marketRange.to,events,marketBlock.hash);
   timing(`market (${events.length} events)`);
   for(const token of new Set(events.map(event=>event.token))){const launch=this.store.launchByToken(token);if(launch?.profile&&launch.state==='profiled')this.store.saveLaunch({...launch,state:'tracking',updatedAt:Date.now()});}
   if(!collecting){
   await this.markPositions(head,[...new Set(events.map(event=>event.token))]);
   timing('marks');
   const changed=[...new Set([...profiled,...events.map(event=>event.token)])];this.store.transaction(()=>this.recomputeScores(head,changed));
   timing('scores');
   const lastView=this.store.view('leaderboard-all')?.updatedAt;if(!lastView||Date.now()-lastView>=(this.options.viewRefreshMs??300000))views.refreshViews();
   timing('views');}
   console.info(`Radar cycle: ${Date.now()-started}ms`);
   const cursor=this.store.cursor('market')!;
   this.snapshot={state:'ready',headBlock:head.toString(),lastIndexedBlock:cursor.blockNumber,lagBlocks:(head-BigInt(cursor.blockNumber)).toString(),updatedAt:Date.now(),queueDepth:this.store.launches().filter(row=>!row.profile).length,error:null};this.publishStatus();
  }catch(error){this.snapshot={...this.snapshot,state:'error',updatedAt:Date.now(),error:sanitize(error)};this.publishStatus();}
 }

 private async runDerivedCycle(){
  const started=Date.now(),mode=this.options.mode!;this.snapshot={...this.snapshot,state:'indexing',error:null};this.publishStatus();
  try{
   const cursor=this.store.cursor('market');if(!cursor){this.snapshot={...this.snapshot,state:'idle'};this.publishStatus();return;}
   const head=BigInt(cursor.blockNumber),views=new RadarService(this.store,()=>this.status());
   if(mode==='enrich'){
    if(await this.reader.chainId()!==4663)throw new Error('wrong enrichment chain; expected 4663');
    const results=await Promise.allSettled([this.profileLaunches(head),this.markPositions(head,[]),this.enrichMarket()]);
    const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
   }else{
    const jobs=this.store.pendingProjections(128);
    // Compute against a WAL read snapshot; collection and token history can keep writing.
    this.projectedScores=new Map();this.projectedActivities=[];this.projectedTokens.clear();
    let changed:string[];
    try{
     changed=this.store.readSnapshot(()=>this.recomputeScores(BigInt(this.store.cursor('market')!.blockNumber),jobs.map(job=>job.token)));
     this.store.transaction(()=>{
      for(const score of this.projectedScores!.values())this.store.saveScore(score);
      for(const activity of this.projectedActivities)this.store.saveActivity(activity);
      for(const token of this.projectedTokens){const launch=this.store.launchByToken(token);if(launch)this.store.saveLaunch({...launch,state:'scored',updatedAt:Date.now()});}
     });
    }finally{this.projectedScores=null;this.projectedActivities=[];this.projectedTokens.clear();}
    views.refreshFeedTokens(changed);
    // A crash before publication leaves the durable jobs available for another pass.
    this.store.transaction(()=>{for(const job of jobs)this.store.finishProjection(job);});
    const last= this.store.view('leaderboard-all')?.updatedAt;
    if(!last||Date.now()-last>=(this.options.viewRefreshMs??300000))views.refreshViews();
   }
   this.snapshot={state:'ready',headBlock:head.toString(),lastIndexedBlock:cursor.blockNumber,lagBlocks:null,updatedAt:Date.now(),queueDepth:mode==='project'?this.store.projectionCount():this.store.launches().filter(row=>!row.profile).length,error:null};
   console.info(`Radar ${mode} cycle: ${Date.now()-started}ms; pending ${this.snapshot.queueDepth}`);
  }catch(error){this.snapshot={...this.snapshot,state:'error',updatedAt:Date.now(),error:sanitize(error)};}
  this.publishStatus();
 }

 private async enrichMarket(){
  if(!this.options.marketRead)return;const tokens=this.store.marketCandidates();if(!tokens.length)return;
  try{const rows=await this.options.marketRead(tokens),byToken=new Map(rows.map(row=>[row.token,row]));this.store.transaction(()=>{for(const token of tokens){this.store.saveMarket(token,byToken.get(token)??null);this.store.queueProjection(token);}});}
  catch(error){this.store.transaction(()=>{for(const token of tokens)this.store.saveMarket(token,null,sanitize(error));});console.warn(`Radar market deferred: ${sanitize(error)}`);}
 }

 private async markPositions(head:bigint,tokens:string[]){
  const candidates=this.options.mode==='enrich'?this.store.markCandidates(4):tokens.flatMap(token=>this.store.positionsForToken(token));
  const jobs=candidates.sort((a,b)=>Number(BigInt(a.markedAtBlock??0)-BigInt(b.markedAtBlock??0))||a.wallet.localeCompare(b.wallet)).slice(0,4);let cursor=0;
  const work=async()=>{while(cursor<jobs.length){const position=jobs[cursor++];if(!position)continue;
   try{const balance=BigInt(position.tokenBalance),quote=!position.complete?null:balance===0n?0n:await this.reader.quoteSell(position.token,balance,head);
    const marked={...position,...(quote===null?{currentValue:null,openPnl:null,totalPnl:null,returnBps:null}:markPosition(position,quote)),markedAtBlock:head.toString(),markAttemptAt:Date.now()};
    this.store.transaction(()=>{if(this.store.savePositionIfUnchanged(position,marked))this.store.queueProjection(position.token);});
   }catch(error){this.store.savePositionIfUnchanged(position,{...position,markAttemptAt:Date.now()});console.warn(`Radar quote deferred: ${sanitize(error)}`);}
  }};
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},()=>work()));
 }


 private recomputeScores(head:bigint,tokens:string[]){
  const tokenSet=new Set(tokens),wallets=new Set<string>();
  for(const token of tokenSet){
   const launch=this.store.launchByToken(token);if(!launch)continue;const profile=launch.profile,events=this.store.eventsForToken(token),buys=events.filter(event=>event.kind==='buy'),sells=events.filter(event=>event.kind==='sell'),participants=new Set(events.map(event=>event.wallet).filter(Boolean)).size;for(const event of events)if(event.wallet)wallets.add(event.wallet);
   let exposure:number|null=null;if(profile&&BigInt(profile.totalSupply)>0n){const shareBps=Number(BigInt(profile.deployerBalance)*10000n/BigInt(profile.totalSupply));exposure=Math.max(0,100-shareBps/20);}
   const launchScore=scoreLaunchQuality({subject:launch.token,asOfBlock:head.toString(),historyMaturity:Math.min(1,events.length/20),deployerOutcomes:null,deployerExposure:exposure,holderBreadth:profile?.holderCount===null||profile===null?null:Math.min(100,profile.holderCount*4),creatorConfig:profile?Math.max(0,100-profile.creatorTaxBps/50):null,earlyMarket:events.length>=5?Math.min(100,participants*12+Math.max(0,buys.length-sells.length)*4):null,metadata:profile?profile.metadataComplete?100:0:null});
   this.persistScore(launchScore,head);
  }
  for(const wallet of wallets){
   const positions=this.store.positionsForWallet(wallet),outcomes=this.store.outcomesForWallet(wallet),complete=positions.filter(position=>position.complete),wins=outcomes.filter(outcome=>BigInt(outcome.pnl)>0n).length,positive=outcomes.filter(outcome=>BigInt(outcome.pnl)>0n).reduce((sum,row)=>sum+BigInt(row.pnl),0n),negative=outcomes.filter(outcome=>BigInt(outcome.pnl)<0n).reduce((sum,row)=>sum-BigInt(row.pnl),0n),coverage=positions.length?complete.length/positions.length:0;
   const walletScore=scoreWalletReputation({subject:wallet,asOfBlock:head.toString(),completed:outcomes.length,coverage,outcomeQuality:outcomes.length?wins/outcomes.length*100:null,profitQuality:outcomes.length?negative===0n?positive>0n?100:50:Math.min(100,Number(positive*100n/negative)):null,repeatability:outcomes.length?Math.min(100,outcomes.length*8):null,earlyEntry:null,exitBehavior:outcomes.length?Math.max(0,100-positions.filter(position=>position.sells>0&&position.buys===0).length*25):null,coverageIntegrity:positions.length?coverage*100:null});
   this.persistScore(walletScore,head);
   for(const position of positions)tokenSet.add(position.token);
  }
  for(const token of tokenSet){
   const launch=this.store.launchByToken(token);if(!launch)continue;const events=this.store.eventsForToken(token),walletsForToken=[...new Set(events.map(event=>event.wallet).filter((wallet):wallet is string=>wallet!==null))],qualified=walletsForToken.flatMap(wallet=>{const value=this.scoreSnapshot(wallet,'wallet-reputation')?.value;return value!==null&&value!==undefined&&value>=60?[value]:[];}),buys=events.filter(event=>event.kind==='buy'),sells=events.filter(event=>event.kind==='sell'),buyFlow=buys.reduce((sum,event)=>sum+BigInt(event.quote??0),0n),sellFlow=sells.reduce((sum,event)=>sum+BigInt(event.quote??0),0n),totalFlow=buyFlow+sellFlow,launchQuality=this.scoreSnapshot(launch.token,'launch-quality');
   const radarScore=scoreRadarStrength({subject:launch.token,asOfBlock:head.toString(),verified:true,recentMarketIndexed:true,nonInfrastructureEvents:events.length,qualifiedConviction:qualified.length?qualified.reduce((sum,value)=>sum+value**2/100,0)/qualified.length:null,qualifiedBreadth:qualified.length?Math.min(100,qualified.length*12):null,flowAcceleration:events.length>=5?Math.min(100,events.length*4):null,netBuyPressure:totalFlow>0n?Number(buyFlow*100n/totalFlow):null,freshness:events.length?100:null,launchQuality:launchQuality?.value??null,holderRetention:launch.profile?.holderCount===null||!launch.profile?null:Math.min(100,launch.profile.holderCount*4),riskPenalty:sellFlow>buyFlow&&totalFlow>0n?Math.min(25,Number((sellFlow-buyFlow)*25n/totalFlow)):0});
   this.persistScore(radarScore,head);if(radarScore.value!==null){if(this.projectedScores)this.projectedTokens.add(token);else this.store.saveLaunch({...launch,state:'scored',updatedAt:Date.now()});}
  }
 return [...tokenSet];
 }

 private scoreSnapshot(subject:string,kind:ScoreSnapshot['kind']){return this.projectedScores?.get(`${subject}:${kind}`)??this.store.score(subject,kind);}
 private persistActivity(activity:RadarActivity){if(this.projectedScores)this.projectedActivities.push(activity);else this.store.saveActivity(activity);}

 private persistScore(score:ReturnType<typeof scoreLaunchQuality>,head:bigint){
  const previous=this.store.score(score.subject,score.kind);if(this.projectedScores)this.projectedScores.set(`${score.subject}:${score.kind}`,score);else this.store.saveScore(score);
  const band=(value:number|null)=>value===null?'withheld':value<40?'low':value<60?'watch':value<75?'strong':'high';
  if(previous&&band(previous.value)!==band(score.value))this.persistActivity({id:`${score.subject}:${score.kind}:${head}:${band(score.value)}`,subject:score.subject,subjectKind:score.kind==='wallet-reputation'?'wallet':'token',kind:'score-band-change',material:true,blockNumber:head.toString(),blockHash:null,txHash:null,createdAt:Date.now(),summary:`${score.kind} changed from ${band(previous.value)} to ${band(score.value)}`});
 }

 private async profileLaunches(head:bigint){
  const limit=this.options.profileBatchSize??this.options.profileConcurrency,eligible=(row:RadarLaunch|undefined):row is RadarLaunch=>Boolean(row&&!row.profile&&(!row.profileError||Date.now()-(row.profileAttemptAt??row.updatedAt)>=300000));
  const cached=this.store.view<Array<{token:string;launchBlock?:string;radarStrength:number|null}>>('feed-rows')?.value??[],launches=this.store.launches(),byToken=new Map(launches.map(row=>[row.token,row]));
  const visibleFresh=cached.filter(row=>row.launchBlock!==undefined).sort((a,b)=>Number(BigInt(b.launchBlock!)-BigInt(a.launchBlock!))||a.token.localeCompare(b.token)).slice(0,50).map(row=>byToken.get(row.token)).filter(eligible),fresh=launches.filter(eligible),preferred=[...cached].filter(row=>row.radarStrength!==null).sort((a,b)=>(b.radarStrength??-1)-(a.radarStrength??-1)||a.token.localeCompare(b.token)).map(row=>byToken.get(row.token)).filter(eligible),seen=new Set<string>(),queue:RadarLaunch[]=[];
  const add=(rows:RadarLaunch[],capacity:number)=>{for(const row of rows)if(queue.length<capacity&&!seen.has(row.token)){seen.add(row.token);queue.push(row);}};
  add(visibleFresh,Math.floor(limit/4));add(fresh,Math.floor(limit/2));add(preferred,Math.max(1,Math.ceil(limit*0.75)));add(this.store.profileCandidates(limit),limit);add(fresh,limit);
  if(this.options.mode==='enrich')add(this.store.staleProfiles(Math.max(1,Math.floor(limit/4))),queue.length+Math.max(1,Math.floor(limit/4)));
  let cursor=0;const profiled:string[]=[];
  const worker=async()=>{while(cursor<queue.length){const row=queue[cursor++];if(!row)continue;
   try{const profile=await this.reader.profile(row.token,head);this.store.transaction(()=>{
    const latest=this.store.launchByToken(row.token);if(!latest||latest.curve!==row.curve||latest.txHash!==row.txHash)return;
    this.store.saveLaunch({...latest,state:latest.state==='scored'||latest.state==='tracking'?latest.state:'profiled',profile,profileError:null,profileAttemptAt:Date.now(),updatedAt:Date.now()});this.store.queueProjection(row.token);profiled.push(row.token);
   });}catch(error){this.store.transaction(()=>{const latest=this.store.launchByToken(row.token);if(!latest||latest.curve!==row.curve||latest.txHash!==row.txHash)return;this.store.saveLaunch({...latest,state:latest.profile?latest.state:'error',profileError:sanitize(error),profileAttemptAt:Date.now(),updatedAt:Date.now()});});}
  }};

  await Promise.all(Array.from({length:Math.min(this.options.profileConcurrency,queue.length)},()=>worker()));
  return profiled;
 }

 private range(name:string,head:bigint,floor:bigint){
  const cursor=this.store.cursor(name);if(!cursor){const from=head>=this.options.rangeBlocks-1n?head-this.options.rangeBlocks+1n:0n;return {from:from>floor?from:floor,to:head};}
  const saved=BigInt(cursor.blockNumber);if(head<saved)throw new Error('RPC head behind saved radar cursor');
  const from=saved>63n?saved-63n:0n;return {from:from>floor?from:floor,to:head};
 }

 private publishStatus(){this.store.saveView(this.options.mode==='enrich'?'enrich-status':this.options.mode==='project'?'project-status':'indexer-status',this.snapshot,this.snapshot.updatedAt??Date.now());}
}

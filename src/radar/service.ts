import type {RadarIndexerStatus} from './indexer.js';
import {RadarStore} from './store.js';
import type {Page,RadarLaunch,RadarStage,WatchKind,WatchlistItem} from './types.js';
import {isAddress} from 'viem';

export type RadarFeed='signals'|'fresh'|'exits'|'launches'|'wallets';
export type RadarWindow='24h'|'7d'|'30d'|'all';

export interface RadarFeedQuery {feed:RadarFeed;window:RadarWindow;cursor:string|null}
export interface RadarFeedRow {
 token:string;curve:string;name:string|null;symbol:string|null;state:RadarStage;
 pairToken:string;
 launchBlock:string;ageMs:number|null;phase:number|null;participants:number;
 buys:number;sells:number;buyFlow:string;sellFlow:string;missingInputs:string[];
 updatedAt:number;radarStrength:number|null;
}
export type LeaderboardSort='total-pnl'|'realized'|'open'|'win-rate'|'reputation';
export type LeaderboardStatus='eligible'|'provisional'|'all';
export interface LeaderboardRow {
 wallet:string;status:'eligible'|'provisional';eligibilityReasons:string[];completedPositions:number;
 wins:number;losses:number;winRate:number|null;realizedPnl:string;openPnl:string|null;totalPnl:string|null;
 reputation:number|null;confidence:string;activePositions:number;
}

interface LaunchCursor {block:string;token:string}
const windowMs:Record<Exclude<RadarWindow,'all'>,number>={
 '24h':24*60*60*1000,
 '7d':7*24*60*60*1000,
 '30d':30*24*60*60*1000,
};

export class RadarService {
 constructor(private store:RadarStore,private indexStatus:()=>RadarIndexerStatus,private allowExpensiveFallback=true){}

 status(){return {...this.indexStatus(),...this.store.counts()};}
 launches(cursor:string|null){return this.signals({feed:'launches',window:'all',cursor});}

 search(raw:string){
  const query=raw.trim();if(!query)throw new Error('Search query is required');
  if(isAddress(query)){const address=query.toLowerCase(),launch=this.store.launchByToken(address);return launch?{kind:'token' as const,address,route:`/terminal/token/${address}`}:{kind:'unclassified' as const,address,choices:['token','wallet'] as const};}
  const needle=query.toLowerCase(),matches=this.store.launches().filter(row=>row.profile&&(row.profile.symbol.toLowerCase()===needle||row.profile.name.toLowerCase().includes(needle))).slice(0,10).map(row=>({kind:'token' as const,address:row.token,name:row.profile!.name,symbol:row.profile!.symbol,score:this.store.score(row.token,'radar-strength')?.value??null,route:`/terminal/token/${row.token}`}));
  return {kind:'results' as const,query,items:matches};
 }

 tokenSummary(address:string){
  if(!isAddress(address))throw new Error('Invalid token address');const token=address.toLowerCase(),launch=this.store.launchByToken(token);if(!launch)throw new Error('Token is not registered in the Radar index');
  const positions=this.store.positionsForToken(token),events=this.store.eventsForToken(token),participantScores=positions.map(row=>{const score=this.store.score(row.wallet,'wallet-reputation');return {wallet:row.wallet,reputation:score?.value??null,confidence:score?.confidence??'provisional'};});
  return {launch,launchQuality:this.store.score(token,'launch-quality')??null,radarStrength:this.store.score(token,'radar-strength')??null,positions,events,participantScores};
 }

 walletSummary(address:string){
  if(!isAddress(address))throw new Error('Invalid wallet address');const wallet=address.toLowerCase();
  const positions=this.store.positionsForWallet(wallet),outcomes=this.store.outcomesForWallet(wallet),eligibilityReasons=this.eligibilityReasons(wallet,outcomes,positions),realized=positions.length?positions.reduce((sum,row)=>sum+BigInt(row.realizedPnl),0n):outcomes.reduce((sum,row)=>sum+BigInt(row.pnl),0n),active=positions.filter(row=>BigInt(row.tokenBalance)>0n),marked=active.every(row=>row.openPnl!==null&&row.openPnl!==undefined),open=marked?active.reduce((sum,row)=>sum+BigInt(row.openPnl!),0n):null,total=open===null?null:realized+open;
  return {address:wallet,reputation:this.store.score(wallet,'wallet-reputation')??null,positions,outcomes,events:this.store.eventsForWallet(wallet),leaderboardEligible:eligibilityReasons.length===0,eligibilityReasons,completedPositions:outcomes.length,profitablePositions:outcomes.filter(row=>BigInt(row.pnl)>0n).length,losingPositions:outcomes.filter(row=>BigInt(row.pnl)<0n).length,breakEvenPositions:outcomes.filter(row=>BigInt(row.pnl)===0n).length,tokenScores:positions.map(row=>({token:row.token,score:this.store.score(row.token,'radar-strength')?.value??null})),realizedPnl:realized.toString(),openPnl:open?.toString()??null,totalPnl:total?.toString()??null,activePositions:active.length};
 }

 leaderboard(query:{window:RadarWindow;sort:LeaderboardSort;status:LeaderboardStatus;cursor:string|null}){
  if(!['24h','7d','30d','all'].includes(query.window))throw new Error('Invalid leaderboard window');if(!['total-pnl','realized','open','win-rate','reputation'].includes(query.sort))throw new Error('Invalid leaderboard sort');if(!['eligible','provisional','all'].includes(query.status))throw new Error('Invalid leaderboard status');
  const cached=this.store.view<LeaderboardRow[]>(`leaderboard-${query.window}`)?.value,rows=cached??(this.allowExpensiveFallback?this.buildLeaderboardRows(query.window):[]);
  return this.rankLeaderboard(rows,query.sort,query.status);
 }

 refreshViews(updatedAt=Date.now()){
  const now=Date.now(),feed=this.store.launches().map(row=>this.feedRow(row,now));this.store.saveView('feed-rows',feed,updatedAt);
  for(const window of ['24h','7d','30d','all'] as const)this.store.saveView(`leaderboard-${window}`,this.buildLeaderboardRows(window),updatedAt);
 }

 refreshFeedProfiles(tokens:string[],updatedAt=Date.now()){
  const cached=this.store.view<RadarFeedRow[]>('feed-rows');if(!cached||tokens.length===0)return;
  const changed=new Set(tokens),rows=cached.value.map(row=>{
   if(!changed.has(row.token))return row;const launch=this.store.launchByToken(row.token);if(!launch?.profile)return row;
   return {...row,name:launch.profile.name,symbol:launch.profile.symbol,phase:launch.profile.phase,state:launch.state,updatedAt:launch.updatedAt,missingInputs:row.missingInputs.filter(input=>input!=='token profile')};
  });
  this.store.saveView('feed-rows',rows,updatedAt);
 }

 private buildLeaderboardRows(window:RadarWindow){
  const cutoff=window==='all'?null:Date.now()-windowMs[window],outcomes=this.store.outcomes(cutoff),wallets=[...new Set(outcomes.map(row=>row.wallet))],rows:LeaderboardRow[]=[];
  for(const wallet of wallets){const completed=outcomes.filter(row=>row.wallet===wallet&&row.complete),positions=this.store.positionsForWallet(wallet),reasons=this.eligibilityReasons(wallet,completed,positions),realized=completed.reduce((sum,row)=>sum+BigInt(row.pnl),0n),active=positions.filter(row=>BigInt(row.tokenBalance)>0n),marked=active.every(row=>row.openPnl!==null&&row.openPnl!==undefined),open=marked?active.reduce((sum,row)=>sum+BigInt(row.openPnl!),0n):null,reputation=this.store.score(wallet,'wallet-reputation'),wins=completed.filter(row=>BigInt(row.pnl)>0n).length,losses=completed.filter(row=>BigInt(row.pnl)<0n).length;rows.push({wallet,status:reasons.length?'provisional':'eligible',eligibilityReasons:reasons,completedPositions:completed.length,wins,losses,winRate:completed.length?wins/completed.length:null,realizedPnl:realized.toString(),openPnl:open?.toString()??null,totalPnl:open===null?null:(realized+open).toString(),reputation:reputation?.value??null,confidence:reputation?.confidence??'provisional',activePositions:active.length});}
  return rows;
 }

 private rankLeaderboard(rows:LeaderboardRow[],sort:LeaderboardSort,status:LeaderboardStatus){
  const filtered=rows.filter(row=>status==='all'||row.status===status),metric=(row:LeaderboardRow)=>sort==='reputation'?BigInt(row.reputation??-1):sort==='win-rate'?BigInt(row.winRate===null?-1:Math.round(row.winRate*10000)):sort==='open'?BigInt(row.openPnl??'-999999999999999999999999999999999999'):sort==='realized'?BigInt(row.realizedPnl):BigInt(row.totalPnl??'-999999999999999999999999999999999999');
  filtered.sort((a,b)=>a.status!==b.status?(a.status==='eligible'?-1:1):metric(a)!==metric(b)?(metric(a)>metric(b)?-1:1):b.completedPositions-a.completedPositions||a.wallet.localeCompare(b.wallet));return {items:filtered.slice(0,100),nextCursor:null};
 }
 activity(cursor:string|null){const page=this.store.activity(cursor);return {...page,items:page.items.filter(item=>item.material)};}
 watchlist(){return {items:this.store.watchlist(),nextCursor:null};}
 watch(item:WatchlistItem){this.store.watch(item);return item;}
 unwatch(kind:WatchKind,address:string){this.store.unwatch(kind,address);return {ok:true};}

 signals(query:RadarFeedQuery):Page<RadarFeedRow>{
  if(!['signals','fresh','exits','launches','wallets'].includes(query.feed))throw new Error('Invalid radar feed');
  if(!['24h','7d','30d','all'].includes(query.window))throw new Error('Invalid radar window');
  const after=query.cursor?this.decodeCursor(query.cursor):null,now=Date.now(),cutoff=query.window==='all'?null:now-windowMs[query.window];
  const cached=this.store.view<RadarFeedRow[]>('feed-rows')?.value;
  if(cached){let rows=cached.filter(row=>(cutoff===null||row.updatedAt>=cutoff)&&(!after||BigInt(row.launchBlock)<BigInt(after.block)||(row.launchBlock===after.block&&row.token>after.token)));if(query.feed==='signals')rows=rows.filter(row=>row.radarStrength!==null).sort((a,b)=>(b.radarStrength??-1)-(a.radarStrength??-1)||a.token.localeCompare(b.token));if(query.feed==='exits')rows=rows.filter(row=>row.sells>0).sort((a,b)=>Number(BigInt(b.launchBlock)-BigInt(a.launchBlock))||a.token.localeCompare(b.token));if(query.feed==='wallets')rows=rows.sort((a,b)=>b.participants-a.participants||a.token.localeCompare(b.token));const page=rows.slice(0,50),last=page.at(-1);return {items:page,nextCursor:rows.length>50&&last?Buffer.from(JSON.stringify({block:last.launchBlock,token:last.token} satisfies LaunchCursor)).toString('base64url'):null};}
  if(!this.allowExpensiveFallback)return {items:[],nextCursor:null};
  let launches=this.store.launches().filter(row=>(cutoff===null||row.updatedAt>=cutoff)&&(!after||BigInt(row.launchBlock)<BigInt(after.block)||(row.launchBlock===after.block&&row.token>after.token)));
  if(query.feed==='signals')launches=launches.filter(row=>this.store.score(row.token,'radar-strength')?.value!==null).sort((a,b)=>(this.store.score(b.token,'radar-strength')?.value??-1)-(this.store.score(a.token,'radar-strength')?.value??-1)||a.token.localeCompare(b.token));
  if(query.feed==='exits')launches=launches.filter(row=>this.store.eventsForToken(row.token).some(event=>event.kind==='sell'&&(cutoff===null||event.at===null||event.at>=cutoff))).sort((a,b)=>Number(BigInt(b.launchBlock)-BigInt(a.launchBlock))||a.token.localeCompare(b.token));
  if(query.feed==='wallets')launches=launches.sort((a,b)=>this.feedRow(b,now).participants-this.feedRow(a,now).participants||a.token.localeCompare(b.token));
  const page=launches.slice(0,50),hasMore=launches.length>50,last=page.at(-1);
  return {items:page.map(row=>this.feedRow(row,now)),nextCursor:hasMore&&last?Buffer.from(JSON.stringify({block:last.launchBlock,token:last.token} satisfies LaunchCursor)).toString('base64url'):null};
 }

 private feedRow(launch:RadarLaunch,now:number):RadarFeedRow{
  const events=this.store.eventsForToken(launch.token),wallets=new Set(events.map(event=>event.wallet).filter((wallet):wallet is string=>wallet!==null)),buys=events.filter(event=>event.kind==='buy'),sells=events.filter(event=>event.kind==='sell');
  const sum=(rows:typeof events)=>rows.reduce((total,event)=>total+BigInt(event.quote??0),0n).toString(),missingInputs:string[]=[];
  if(!launch.profile)missingInputs.push('token profile');
  if(!events.length)missingInputs.push('market activity');
  if(launch.profile?.holderCount===null)missingInputs.push('holder breadth');
  return {token:launch.token,curve:launch.curve,name:launch.profile?.name??null,symbol:launch.profile?.symbol??null,state:launch.state,pairToken:launch.pairToken,launchBlock:launch.launchBlock,ageMs:Math.max(0,now-launch.updatedAt),phase:launch.profile?.phase??null,participants:wallets.size,buys:buys.length,sells:sells.length,buyFlow:sum(buys),sellFlow:sum(sells),missingInputs,updatedAt:launch.updatedAt,radarStrength:this.store.score(launch.token,'radar-strength')?.value??null};
 }

 private eligibilityReasons(wallet:string,outcomes:ReturnType<RadarStore['outcomesForWallet']>,positions:ReturnType<RadarStore['positionsForWallet']>){
  const reasons:string[]=[];if(outcomes.filter(row=>row.complete).length<3)reasons.push('fewer than three completed positions');if(positions.some(row=>!row.complete))reasons.push('material transfer gap');const infrastructure=this.store.launches().some(row=>[row.token,row.curve,row.deployer].includes(wallet));if(infrastructure)reasons.push('infrastructure or deployer address');return reasons;
 }

 private decodeCursor(value:string):LaunchCursor{
  try{const cursor=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as Partial<LaunchCursor>;if(typeof cursor.block!=='string'||!/^[0-9]+$/.test(cursor.block)||typeof cursor.token!=='string'||!/^0x[a-f0-9]{40}$/.test(cursor.token))throw new Error();return {block:cursor.block,token:cursor.token};}catch{throw new Error('Invalid radar cursor');}
 }
}

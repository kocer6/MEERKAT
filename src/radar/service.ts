import type {RadarIndexerStatus} from './indexer.js';
import {RadarStore} from './store.js';
import type {Page,RadarLaunch,RadarStage,WatchKind,WatchlistItem} from './types.js';
import {isAddress} from 'viem';

export type RadarFeed='signals'|'fresh'|'exits'|'launches'|'wallets';
export type RadarWindow='24h'|'7d'|'30d'|'all';

export interface RadarFeedQuery {feed:RadarFeed;window:RadarWindow;cursor:string|null}
export interface RadarFeedRow {
 token:string;curve:string;name:string|null;symbol:string|null;state:RadarStage;
 launchBlock:string;ageMs:number|null;phase:number|null;participants:number;
 buys:number;sells:number;buyFlow:string;sellFlow:string;missingInputs:string[];
}
export type LeaderboardSort='total-pnl'|'realized'|'open'|'win-rate'|'reputation';
export type LeaderboardStatus='eligible'|'provisional'|'all';

interface LaunchCursor {block:string;token:string}
const windowMs:Record<Exclude<RadarWindow,'all'>,number>={
 '24h':24*60*60*1000,
 '7d':7*24*60*60*1000,
 '30d':30*24*60*60*1000,
};

export class RadarService {
 constructor(private store:RadarStore,private indexStatus:()=>RadarIndexerStatus){}

 status(){return {...this.indexStatus(),launches:this.store.launches().length,events:this.store.events().length};}
 launches(cursor:string|null){return this.signals({feed:'launches',window:'all',cursor});}

 search(raw:string){
  const query=raw.trim();if(!query)throw new Error('Search query is required');
  if(isAddress(query)){const address=query.toLowerCase(),launch=this.store.launchByToken(address);return launch?{kind:'token' as const,address,route:`/terminal/token/${address}`}:{kind:'unclassified' as const,address,choices:['wallet'] as const};}
  const needle=query.toLowerCase(),matches=this.store.launches().filter(row=>row.profile&&(row.profile.symbol.toLowerCase()===needle||row.profile.name.toLowerCase().includes(needle))).slice(0,10).map(row=>({kind:'token' as const,address:row.token,name:row.profile!.name,symbol:row.profile!.symbol,route:`/terminal/token/${row.token}`}));
  return {kind:'results' as const,query,items:matches};
 }

 tokenSummary(address:string){
  if(!isAddress(address))throw new Error('Invalid token address');const token=address.toLowerCase(),launch=this.store.launchByToken(token);if(!launch)throw new Error('Token is not registered in the Radar index');
  return {launch,launchQuality:this.store.score(token,'launch-quality')??null,radarStrength:this.store.score(token,'radar-strength')??null,positions:this.store.positionsForToken(token),events:this.store.eventsForToken(token)};
 }

 walletSummary(address:string){
  if(!isAddress(address))throw new Error('Invalid wallet address');const wallet=address.toLowerCase();
  return {address:wallet,reputation:this.store.score(wallet,'wallet-reputation')??null,positions:this.store.positionsForWallet(wallet),outcomes:this.store.outcomesForWallet(wallet),events:this.store.eventsForWallet(wallet)};
 }

 leaderboard(query:{window:RadarWindow;sort:LeaderboardSort;status:LeaderboardStatus;cursor:string|null}){if(!['24h','7d','30d','all'].includes(query.window))throw new Error('Invalid leaderboard window');if(!['total-pnl','realized','open','win-rate','reputation'].includes(query.sort))throw new Error('Invalid leaderboard sort');if(!['eligible','provisional','all'].includes(query.status))throw new Error('Invalid leaderboard status');return {items:[],nextCursor:null};}
 activity(cursor:string|null){return this.store.activity(cursor);}
 watchlist(){return {items:this.store.watchlist(),nextCursor:null};}
 watch(item:WatchlistItem){this.store.watch(item);return item;}
 unwatch(kind:WatchKind,address:string){this.store.unwatch(kind,address);return {ok:true};}

 signals(query:RadarFeedQuery):Page<RadarFeedRow>{
  if(!['signals','fresh','exits','launches','wallets'].includes(query.feed))throw new Error('Invalid radar feed');
  if(!['24h','7d','30d','all'].includes(query.window))throw new Error('Invalid radar window');
  if(query.feed==='signals'||query.feed==='exits'||query.feed==='wallets')return {items:[],nextCursor:null};
  const after=query.cursor?this.decodeCursor(query.cursor):null,now=Date.now(),cutoff=query.window==='all'?null:now-windowMs[query.window];
  const launches=this.store.launches().filter(row=>(cutoff===null||row.updatedAt>=cutoff)&&(!after||BigInt(row.launchBlock)<BigInt(after.block)||(row.launchBlock===after.block&&row.token>after.token)));
  const page=launches.slice(0,50),hasMore=launches.length>50,last=page.at(-1);
  return {items:page.map(row=>this.feedRow(row,now)),nextCursor:hasMore&&last?Buffer.from(JSON.stringify({block:last.launchBlock,token:last.token} satisfies LaunchCursor)).toString('base64url'):null};
 }

 private feedRow(launch:RadarLaunch,now:number):RadarFeedRow{
  const events=this.store.eventsForToken(launch.token),wallets=new Set(events.map(event=>event.wallet).filter((wallet):wallet is string=>wallet!==null)),buys=events.filter(event=>event.kind==='buy'),sells=events.filter(event=>event.kind==='sell');
  const sum=(rows:typeof events)=>rows.reduce((total,event)=>total+BigInt(event.quote??0),0n).toString(),missingInputs:string[]=[];
  if(!launch.profile)missingInputs.push('token profile');
  if(!events.length)missingInputs.push('market activity');
  if(launch.profile?.holderCount===null)missingInputs.push('holder breadth');
  return {token:launch.token,curve:launch.curve,name:launch.profile?.name??null,symbol:launch.profile?.symbol??null,state:launch.state,launchBlock:launch.launchBlock,ageMs:Math.max(0,now-launch.updatedAt),phase:launch.profile?.phase??null,participants:wallets.size,buys:buys.length,sells:sells.length,buyFlow:sum(buys),sellFlow:sum(sells),missingInputs};
 }

 private decodeCursor(value:string):LaunchCursor{
  try{const cursor=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as Partial<LaunchCursor>;if(typeof cursor.block!=='string'||!/^[0-9]+$/.test(cursor.block)||typeof cursor.token!=='string'||!/^0x[a-f0-9]{40}$/.test(cursor.token))throw new Error();return {block:cursor.block,token:cursor.token};}catch{throw new Error('Invalid radar cursor');}
 }
}

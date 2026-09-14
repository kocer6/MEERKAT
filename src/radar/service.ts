import type {RadarIndexerStatus} from './indexer.js';
import {RadarStore} from './store.js';
import type {Page,RadarLaunch,RadarStage} from './types.js';

export type RadarFeed='signals'|'fresh'|'exits'|'launches'|'wallets';
export type RadarWindow='24h'|'7d'|'30d'|'all';

export interface RadarFeedQuery {feed:RadarFeed;window:RadarWindow;cursor:string|null}
export interface RadarFeedRow {
 token:string;curve:string;name:string|null;symbol:string|null;state:RadarStage;
 launchBlock:string;ageMs:number|null;phase:number|null;participants:number;
 buys:number;sells:number;buyFlow:string;sellFlow:string;missingInputs:string[];
}

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

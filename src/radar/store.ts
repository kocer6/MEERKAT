import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {RadarMarket} from './market.js';
import {applyPositionEvent,emptyPosition} from './positions.js';
import type {Page,RadarActivity,RadarCursor,RadarEvent,RadarLaunch,ScoreSnapshot,WalletOutcome,WalletTokenPosition,WatchKind,WatchlistItem} from './types.js';

interface ValueRow {
 [column:string]:null|number|bigint|string|NodeJS.NonSharedUint8Array;
 value:string;
}
interface CursorRow {name:string;block_number:number;block_hash:string|null;updated_at:number}
interface PageCursor {block:number;id:string}

const normalized=(value:string)=>value.toLowerCase();
const parsed=<T>(row:ValueRow|undefined):T|undefined=>row?JSON.parse(row.value) as T:undefined;

export class RadarStore {
 private db:DatabaseSync;

 constructor(file:string){
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
  this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA journal_mode=WAL;
   PRAGMA busy_timeout=15000;
   PRAGMA user_version=1;
   CREATE TABLE IF NOT EXISTS radar_cursors(name TEXT PRIMARY KEY,block_number INTEGER NOT NULL,block_hash TEXT,updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS radar_launches(token TEXT PRIMARY KEY,curve TEXT UNIQUE NOT NULL,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS radar_events(id TEXT PRIMARY KEY,token TEXT NOT NULL,curve TEXT NOT NULL,wallet TEXT,kind TEXT NOT NULL,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS wallet_token_positions(wallet TEXT NOT NULL,token TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(wallet,token));
   CREATE TABLE IF NOT EXISTS wallet_outcomes(wallet TEXT NOT NULL,token TEXT NOT NULL,closed_at INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(wallet,token));
   CREATE TABLE IF NOT EXISTS wallet_scores(wallet TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS token_signal_snapshots(token TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(token,kind));
   CREATE TABLE IF NOT EXISTS radar_activity(id TEXT PRIMARY KEY,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS watchlist_items(kind TEXT NOT NULL,address TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(kind,address));
   CREATE TABLE IF NOT EXISTS radar_market(token TEXT PRIMARY KEY,checked_at INTEGER NOT NULL,value TEXT,error TEXT);
   CREATE TABLE IF NOT EXISTS radar_projection_queue(token TEXT PRIMARY KEY,revision TEXT NOT NULL,queued_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS radar_views(name TEXT PRIMARY KEY,updated_at INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS radar_events_token_block ON radar_events(token,block,id);
   CREATE INDEX IF NOT EXISTS radar_events_wallet_block ON radar_events(wallet,block,id);
   CREATE INDEX IF NOT EXISTS radar_events_wallet_token_block ON radar_events(wallet,token,block,id);
   CREATE INDEX IF NOT EXISTS radar_events_block ON radar_events(block);
   CREATE INDEX IF NOT EXISTS wallet_positions_token ON wallet_token_positions(token,wallet);
   CREATE INDEX IF NOT EXISTS radar_missing_profiles ON radar_launches(block DESC,token) WHERE json_extract(value,'$.profile') IS NULL;
   CREATE INDEX IF NOT EXISTS radar_launches_block ON radar_launches(block,token);
   CREATE INDEX IF NOT EXISTS wallet_outcomes_closed ON wallet_outcomes(closed_at,wallet,token);
   CREATE INDEX IF NOT EXISTS radar_activity_block ON radar_activity(block,id);`);
 }

 health(){return (this.db.prepare('SELECT 1 AS ok').get() as {ok:number}).ok===1;}
 counts(){const launches=(this.db.prepare('SELECT COUNT(*) AS count FROM radar_launches').get() as {count:number}).count,events=(this.db.prepare('SELECT COUNT(*) AS count FROM radar_events').get() as {count:number}).count;return {launches,events};}
 close(){this.db.close();}

 saveView<T>(name:string,value:T,updatedAt=Date.now()){this.db.prepare(`INSERT INTO radar_views(name,updated_at,value) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at,value=excluded.value`).run(name,updatedAt,JSON.stringify(value));}
 viewUpdatedAt(name:string){return (this.db.prepare('SELECT updated_at FROM radar_views WHERE name=?').get(name) as {updated_at:number}|undefined)?.updated_at??null;}
 view<T>(name:string){const row=this.db.prepare('SELECT updated_at,value FROM radar_views WHERE name=?').get(name) as {updated_at:number;value:string}|undefined;return row?{updatedAt:row.updated_at,value:JSON.parse(row.value) as T}:undefined;}

 readSnapshot<T>(work:()=>T):T{this.db.exec('BEGIN');try{return work();}finally{this.db.exec('ROLLBACK');}}

 transaction(work:()=>void){
  this.db.exec('BEGIN IMMEDIATE');
  try{work();this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }

 private saveCursor(name:string,blockNumber:bigint,blockHash:string|null){
  this.db.prepare(`INSERT INTO radar_cursors(name,block_number,block_hash,updated_at) VALUES (?,?,?,?)
   ON CONFLICT(name) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,updated_at=excluded.updated_at`)
   .run(name,Number(blockNumber),blockHash,Date.now());
 }

 cursor(name:string):RadarCursor|undefined{
  const row=this.db.prepare('SELECT name,block_number,block_hash,updated_at FROM radar_cursors WHERE name=?').get(name) as CursorRow|undefined;
  return row?{name:row.name,blockNumber:String(row.block_number),blockHash:row.block_hash,updatedAt:row.updated_at}:undefined;
 }

 replaceLaunchRange(name:string,from:bigint,to:bigint,cursor:bigint,launches:RadarLaunch[],cursorHash:string|null=null){
  this.transaction(()=>{
  const retained=launches.map(row=>{const incoming=this.normalizeLaunch(row),existing=this.launchByToken(incoming.token);return existing&&existing.curve===incoming.curve?{...incoming,state:existing.state,profile:existing.profile,profileError:existing.profileError,profileAttemptAt:existing.profileAttemptAt,updatedAt:existing.updatedAt}:incoming;});
   for(const row of this.db.prepare('SELECT token FROM radar_launches WHERE block>=? AND block<=?').all(Number(from),Number(to)) as {token:string}[])this.queueProjection(row.token);
   this.db.prepare('DELETE FROM radar_launches WHERE block>=? AND block<=?').run(Number(from),Number(to));
   const insert=this.db.prepare('INSERT INTO radar_launches(token,curve,block,value) VALUES (?,?,?,?)');
   for(const launch of retained){insert.run(launch.token,launch.curve,Number(launch.launchBlock),JSON.stringify(launch));this.queueProjection(launch.token);}
   this.saveCursor(name,cursor,cursorHash);
  });
 }

 replaceEventRange(name:string,from:bigint,to:bigint,cursor:bigint,events:RadarEvent[],cursorHash:string|null=null){
  this.transaction(()=>{
   const affected=new Set((this.db.prepare('SELECT wallet,token FROM radar_events WHERE block>=? AND block<=? AND wallet IS NOT NULL').all(Number(from),Number(to)) as {wallet:string;token:string}[]).map(row=>`${row.wallet}:${row.token}`));
   this.db.prepare('DELETE FROM radar_events WHERE block>=? AND block<=?').run(Number(from),Number(to));
   const insert=this.db.prepare('INSERT INTO radar_events(id,token,curve,wallet,kind,block,value) VALUES (?,?,?,?,?,?,?)');
   for(const row of events){const event=this.normalizeEvent(row);insert.run(event.id,event.token,event.curve,event.wallet,event.kind,Number(event.blockNumber),JSON.stringify(event));if(event.wallet)affected.add(`${event.wallet}:${event.token}`);}
   for(const key of affected){const split=key.indexOf(':0x'),wallet=key.slice(0,split),token=key.slice(split+1);this.rebuildPosition(wallet,token);this.queueProjection(token);}
   this.saveCursor(name,cursor,cursorHash);
  });
 }

 market(token:string){const row=this.db.prepare('SELECT value,checked_at,error FROM radar_market WHERE token=?').get(normalized(token)) as {value:string|null;checked_at:number;error:string|null}|undefined;return row?{data:row.value?JSON.parse(row.value) as RadarMarket:null,checkedAt:row.checked_at,error:row.error}:null;}
 saveMarket(token:string,value:RadarMarket|null,error:string|null=null){this.db.prepare('INSERT INTO radar_market(token,checked_at,value,error) VALUES (?,?,?,?) ON CONFLICT(token) DO UPDATE SET checked_at=excluded.checked_at,value=COALESCE(excluded.value,radar_market.value),error=excluded.error').run(normalized(token),Date.now(),value?JSON.stringify(value):null,error);}
 marketCandidates(limit=30){
  const eligible=(token:string)=>!this.market(token)||this.market(token)!.checkedAt<Date.now()-300000;
  const cached=this.view<Array<{token:string;radarStrength:number|null;launchBlock:string}>>('feed-rows')?.value??[],queue:string[]=[];
  const add=(tokens:string[],cap:number)=>{for(const token of tokens)if(queue.length<cap&&!queue.includes(token)&&eligible(token))queue.push(token);};
  add([...cached].sort((a,b)=>Number(BigInt(b.launchBlock)-BigInt(a.launchBlock))).slice(0,50).map(row=>row.token),Math.floor(limit/3));
  add([...cached].sort((a,b)=>(b.radarStrength??-1)-(a.radarStrength??-1)).slice(0,50).map(row=>row.token),Math.floor(limit*2/3));
  const oldest=this.db.prepare('SELECT l.token FROM radar_launches l LEFT JOIN radar_market m ON m.token=l.token WHERE m.checked_at IS NULL OR m.checked_at<? ORDER BY COALESCE(m.checked_at,0),l.block DESC LIMIT ?').all(Date.now()-300000,limit) as {token:string}[];
  add(oldest.map(row=>row.token),limit);return queue;
 }

 queueProjection(token:string){this.db.prepare('INSERT INTO radar_projection_queue(token,revision,queued_at) VALUES (?,?,?) ON CONFLICT(token) DO UPDATE SET revision=excluded.revision').run(normalized(token),randomUUID(),Date.now());}
 pendingProjections(limit:number){return this.db.prepare('SELECT token,revision FROM radar_projection_queue ORDER BY queued_at,token LIMIT ?').all(limit) as {token:string;revision:string}[];}
 liveProjectionJobs(limit:number){
  const fresh=this.db.prepare('SELECT q.token,q.revision FROM radar_projection_queue q JOIN radar_launches l ON l.token=q.token ORDER BY l.block DESC,q.token LIMIT ?').all(Math.floor(limit/2)) as {token:string;revision:string}[];
  const seen=new Set(fresh.map(job=>job.token));return [...fresh,...this.pendingProjections(limit).filter(job=>!seen.has(job.token))].slice(0,limit);
 }
 finishProjection(job:{token:string;revision:string}){this.db.prepare('DELETE FROM radar_projection_queue WHERE token=? AND revision=?').run(job.token,job.revision);}
 projectionCount(){return (this.db.prepare('SELECT COUNT(*) AS count FROM radar_projection_queue').get() as {count:number}).count;}
 staleProfiles(limit:number){return (this.db.prepare("SELECT value FROM radar_launches WHERE json_extract(value,'$.profile') IS NOT NULL AND COALESCE(json_extract(value,'$.profileAttemptAt'),json_extract(value,'$.profile.profiledAt'),0)<? ORDER BY COALESCE(json_extract(value,'$.profileAttemptAt'),json_extract(value,'$.profile.profiledAt'),0),block DESC LIMIT ?").all(Date.now()-300000,limit) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarLaunch);}
 markCandidates(limit:number){return (this.db.prepare("SELECT value FROM wallet_token_positions WHERE json_extract(value,'$.tokenBalance')!='0' ORDER BY COALESCE(json_extract(value,'$.markAttemptAt'),0),wallet,token LIMIT ?").all(limit) as ValueRow[]).map(row=>JSON.parse(row.value) as WalletTokenPosition);}
 savePositionIfUnchanged(before:WalletTokenPosition,after:WalletTokenPosition){return this.db.prepare('UPDATE wallet_token_positions SET value=? WHERE wallet=? AND token=? AND value=?').run(JSON.stringify(after),before.wallet,before.token,JSON.stringify(before)).changes===1;}

 saveLaunch(row:RadarLaunch){
  const launch=this.normalizeLaunch(row);
  this.db.prepare(`INSERT INTO radar_launches(token,curve,block,value) VALUES (?,?,?,?)
   ON CONFLICT(token) DO UPDATE SET curve=excluded.curve,block=excluded.block,value=excluded.value`)
   .run(launch.token,launch.curve,Number(launch.launchBlock),JSON.stringify(launch));
 }

 launchByToken(token:string){return parsed<RadarLaunch>(this.db.prepare('SELECT value FROM radar_launches WHERE token=?').get(normalized(token)) as ValueRow|undefined);}
 launchByCurve(curve:string){return parsed<RadarLaunch>(this.db.prepare('SELECT value FROM radar_launches WHERE curve=?').get(normalized(curve)) as ValueRow|undefined);}
 launches(){return (this.db.prepare('SELECT value FROM radar_launches ORDER BY block DESC,token').all() as ValueRow[]).map(row=>JSON.parse(row.value) as RadarLaunch);}
 pendingProfileCount(){return (this.db.prepare("SELECT COUNT(*) AS count FROM radar_launches WHERE json_extract(value,'$.profile') IS NULL").get() as {count:number}).count;}
 freshProfileCandidates(head:bigint,limit:number){return (this.db.prepare("SELECT value FROM radar_launches WHERE json_extract(value,'$.profile') IS NULL AND block<=? AND (json_extract(value,'$.profileError') IS NULL OR COALESCE(json_extract(value,'$.profileAttemptAt'),json_extract(value,'$.updatedAt'))<?) ORDER BY block DESC,token LIMIT ?").all(Number(head),Date.now()-300000,limit) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarLaunch);}
 profileCandidates(limit:number){return (this.db.prepare(`SELECT launch.value FROM radar_launches launch LEFT JOIN (SELECT token,COUNT(*) AS activity FROM radar_events GROUP BY token) event ON event.token=launch.token WHERE json_extract(launch.value,'$.profile') IS NULL AND (json_extract(launch.value,'$.profileError') IS NULL OR COALESCE(json_extract(launch.value,'$.profileAttemptAt'),json_extract(launch.value,'$.updatedAt'))<?) ORDER BY COALESCE(event.activity,0) DESC,launch.block DESC,launch.token LIMIT ?`).all(Date.now()-300000,Math.max(1,Math.trunc(limit))) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarLaunch);}

 eventsForToken(token:string){return (this.db.prepare('SELECT value FROM radar_events WHERE token=? ORDER BY block,id').all(normalized(token)) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarEvent);}
 eventsForWallet(wallet:string){return (this.db.prepare('SELECT value FROM radar_events WHERE wallet=? ORDER BY block,id').all(normalized(wallet)) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarEvent);}
 eventsForPosition(wallet:string,token:string){return (this.db.prepare('SELECT value FROM radar_events WHERE wallet=? AND token=? ORDER BY block,id').all(normalized(wallet),normalized(token)) as ValueRow[]).map(row=>JSON.parse(row.value) as RadarEvent);}
 events(){return (this.db.prepare('SELECT value FROM radar_events ORDER BY block,id').all() as ValueRow[]).map(row=>JSON.parse(row.value) as RadarEvent);}

 savePosition(position:WalletTokenPosition){
  const value={...position,wallet:normalized(position.wallet),token:normalized(position.token),pairToken:normalized(position.pairToken)};
  this.db.prepare(`INSERT INTO wallet_token_positions(wallet,token,value) VALUES (?,?,?)
   ON CONFLICT(wallet,token) DO UPDATE SET value=excluded.value`).run(value.wallet,value.token,JSON.stringify(value));
 }
 position(wallet:string,token:string){return parsed<WalletTokenPosition>(this.db.prepare('SELECT value FROM wallet_token_positions WHERE wallet=? AND token=?').get(normalized(wallet),normalized(token)) as ValueRow|undefined);}
 positionsForWallet(wallet:string){return (this.db.prepare('SELECT value FROM wallet_token_positions WHERE wallet=? ORDER BY token').all(normalized(wallet)) as ValueRow[]).map(row=>JSON.parse(row.value) as WalletTokenPosition);}
 positionsForToken(token:string){return (this.db.prepare('SELECT value FROM wallet_token_positions WHERE token=? ORDER BY wallet').all(normalized(token)) as ValueRow[]).map(row=>JSON.parse(row.value) as WalletTokenPosition);}
 deletePosition(wallet:string,token:string){this.db.prepare('DELETE FROM wallet_token_positions WHERE wallet=? AND token=?').run(normalized(wallet),normalized(token));}

 private rebuildPosition(wallet:string,token:string){
  const previous=this.position(wallet,token),launch=this.launchByToken(token),events=this.eventsForPosition(wallet,token);
  if(!launch||!events.length||wallet===launch.curve||wallet===launch.token||wallet==='0x0000000000000000000000000000000000000000'){this.deletePosition(wallet,token);this.db.prepare('DELETE FROM wallet_outcomes WHERE wallet=? AND token=?').run(wallet,token);return;}
  let position=emptyPosition(wallet,token,launch.pairToken);
  for(const event of events)position=applyPositionEvent(position,event);
  const unchanged=previous&&['pairToken','tokenBalance','remainingCost','realizedPnl','observedProceeds','buys','sells','firstBuyBlock','lastTradeBlock','complete'].every(key=>previous[key as keyof WalletTokenPosition]===position[key as keyof WalletTokenPosition]);
  this.savePosition({...position,currentValue:unchanged?previous.currentValue??null:null,openPnl:unchanged?previous.openPnl??null:null,totalPnl:unchanged?previous.totalPnl??null:null,returnBps:unchanged?previous.returnBps??null:null,markedAtBlock:unchanged?previous.markedAtBlock??null:null,markAttemptAt:unchanged?previous.markAttemptAt:undefined});
  if(position.complete&&position.tokenBalance==='0'&&position.buys>0&&position.sells>0){
   const proceeds=BigInt(position.observedProceeds),pnl=BigInt(position.realizedPnl),cost=proceeds-pnl,last=events.at(-1)!;
   this.saveOutcome({wallet,token,closedAt:last.at??0,cost:cost.toString(),proceeds:proceeds.toString(),pnl:pnl.toString(),returnBps:cost>0n?Number(pnl*10000n/cost):null,complete:true});
  }else this.db.prepare('DELETE FROM wallet_outcomes WHERE wallet=? AND token=?').run(wallet,token);
 }

 saveOutcome(outcome:WalletOutcome){
  const value={...outcome,wallet:normalized(outcome.wallet),token:normalized(outcome.token)};
  this.db.prepare(`INSERT INTO wallet_outcomes(wallet,token,closed_at,value) VALUES (?,?,?,?)
   ON CONFLICT(wallet,token) DO UPDATE SET closed_at=excluded.closed_at,value=excluded.value`).run(value.wallet,value.token,value.closedAt,JSON.stringify(value));
 }
 outcomesForWallet(wallet:string){return (this.db.prepare('SELECT value FROM wallet_outcomes WHERE wallet=? ORDER BY closed_at DESC,token').all(normalized(wallet)) as ValueRow[]).map(row=>JSON.parse(row.value) as WalletOutcome);}
 outcomes(since:number|null=null){const rows=since===null?this.db.prepare('SELECT value FROM wallet_outcomes ORDER BY closed_at DESC,wallet,token').all():this.db.prepare('SELECT value FROM wallet_outcomes WHERE closed_at>=? ORDER BY closed_at DESC,wallet,token').all(since);return (rows as ValueRow[]).map(row=>JSON.parse(row.value) as WalletOutcome);}

 saveScore(score:ScoreSnapshot){
  const subject=normalized(score.subject),value={...score,subject};
  if(score.kind==='wallet-reputation')this.db.prepare(`INSERT INTO wallet_scores(wallet,value) VALUES (?,?) ON CONFLICT(wallet) DO UPDATE SET value=excluded.value`).run(subject,JSON.stringify(value));
  else this.db.prepare(`INSERT INTO token_signal_snapshots(token,kind,value) VALUES (?,?,?) ON CONFLICT(token,kind) DO UPDATE SET value=excluded.value`).run(subject,score.kind,JSON.stringify(value));
 }
 score(subject:string,kind:ScoreSnapshot['kind']){const row=kind==='wallet-reputation'?this.db.prepare('SELECT value FROM wallet_scores WHERE wallet=?').get(normalized(subject)):this.db.prepare('SELECT value FROM token_signal_snapshots WHERE token=? AND kind=?').get(normalized(subject),kind);return parsed<ScoreSnapshot>(row as ValueRow|undefined);}
 walletScores(){return (this.db.prepare('SELECT value FROM wallet_scores ORDER BY wallet').all() as ValueRow[]).map(row=>JSON.parse(row.value) as ScoreSnapshot);}

 saveActivity(activity:RadarActivity){this.db.prepare('INSERT OR IGNORE INTO radar_activity(id,block,value) VALUES (?,?,?)').run(activity.id,Number(activity.blockNumber),JSON.stringify(activity));}
 activity(cursor:string|null,limit=50):Page<RadarActivity>{return this.page<RadarActivity>('radar_activity',cursor,limit);}

 watch(item:WatchlistItem){this.db.prepare('INSERT OR IGNORE INTO watchlist_items(kind,address,created_at) VALUES (?,?,?)').run(item.kind,normalized(item.address),item.createdAt);}
 unwatch(kind:WatchKind,address:string){this.db.prepare('DELETE FROM watchlist_items WHERE kind=? AND address=?').run(kind,normalized(address));}
 watchlist(){return (this.db.prepare('SELECT kind,address,created_at FROM watchlist_items ORDER BY created_at,address').all() as {kind:WatchKind;address:string;created_at:number}[]).map(row=>({kind:row.kind,address:row.address,createdAt:row.created_at}));}

 private page<T>(table:'radar_activity',encoded:string|null,limit:number):Page<T>{
  const bounded=Math.max(1,Math.min(50,Math.trunc(limit)||50));
  const cursor=encoded===null?null:this.decodeCursor(encoded);
  const rows=(cursor?this.db.prepare(`SELECT block,id,value FROM ${table} WHERE block<? OR (block=? AND id<?) ORDER BY block DESC,id DESC LIMIT ?`).all(cursor.block,cursor.block,cursor.id,bounded+1):this.db.prepare(`SELECT block,id,value FROM ${table} ORDER BY block DESC,id DESC LIMIT ?`).all(bounded+1)) as {block:number;id:string;value:string}[];
  const hasMore=rows.length>bounded,page=rows.slice(0,bounded),last=page.at(-1);
  return {items:page.map(row=>JSON.parse(row.value) as T),nextCursor:hasMore&&last?Buffer.from(JSON.stringify({block:last.block,id:last.id} satisfies PageCursor)).toString('base64url'):null};
 }

 private decodeCursor(value:string):PageCursor{
  try{const decoded=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as Partial<PageCursor>;if(!Number.isSafeInteger(decoded.block)||typeof decoded.id!=='string'||decoded.id.length===0)throw new Error();return {block:decoded.block!,id:decoded.id};}catch{throw new Error('Invalid radar cursor');}
 }

 private normalizeLaunch(row:RadarLaunch):RadarLaunch{return {...row,token:normalized(row.token),curve:normalized(row.curve),deployer:normalized(row.deployer),pairToken:normalized(row.pairToken)};}
 private normalizeEvent(row:RadarEvent):RadarEvent{return {...row,token:normalized(row.token),curve:normalized(row.curve),wallet:row.wallet?normalized(row.wallet):null};}
}

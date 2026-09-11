import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {isAddress,parseUnits} from 'viem';
import {inspectToken,type MarketReader} from './chain/market.js';
import {encode} from './types.js';
import {reserveDrop} from './rules.js';
import type {DiscoverySnapshot} from './chain/discovery.js';
type Snapshot=JSONValue;
type JSONValue=Record<string,any>;
export interface Watch {token:string;quantity:string|null;costWei:string|null;active:boolean;status:'ok'|'error';error:string|null;checkedAt:number;snapshot:Snapshot|null}
export class WatchStore {
 private db:DatabaseSync;
 constructor(file:string){if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS watches(token TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS watch_events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,at INTEGER,detail TEXT); CREATE TABLE IF NOT EXISTS discovery(id INTEGER PRIMARY KEY,value TEXT);');}
 close(){this.db.close();}
 items():Watch[]{return (this.db.prepare('SELECT value FROM watches').all() as {value:string}[]).map(r=>JSON.parse(r.value)).filter(w=>w.active);}
 get(token:string):Watch|undefined{const row=this.db.prepare('SELECT value FROM watches WHERE token=?').get(token) as {value:string}|undefined;return row?JSON.parse(row.value):undefined;}
 events(){return (this.db.prepare('SELECT * FROM watch_events ORDER BY id DESC LIMIT 300').all() as {id:number;kind:string;at:number;detail:string}[]).map(e=>({...e,detail:JSON.parse(e.detail)}));}
 private event(kind:string,detail:unknown){this.db.prepare('INSERT INTO watch_events(kind,at,detail) VALUES (?,?,?)').run(kind,Date.now(),encode(detail));}
 save(next:Watch,isNew=false){
  this.db.exec('BEGIN IMMEDIATE');try{
   const prev=this.get(next.token);if(!isNew && !prev?.active){this.db.exec('COMMIT');return;}
   if(isNew && !prev?.active && this.items().length>=50)throw new Error('Watchlist limit: 50 tokens');
   if(isNew)this.event('watch-added',{token:next.token,quantity:next.quantity,costWei:next.costWei});
   const a=prev?.snapshot,b=next.snapshot;
   if(!isNew && prev?.status==='ok' && next.status==='error')this.event('data-unavailable',{token:next.token,error:next.error});
   if(!isNew && next.status==='ok' && prev?.status==='error')this.event('data-restored',{token:next.token});
   if(!isNew && prev?.status==='ok' && next.status==='ok' && a && b && BigInt(b.blockNumber)>BigInt(a.blockNumber) && b.observedAt-a.observedAt<=60000){
    if(a.phase!==b.phase)this.event('phase-changed',{token:next.token,from:a.phase,to:b.phase,blockNumber:b.blockNumber});
    if(a.phase===0 && b.phase===0 && a.curve===b.curve){const drop=reserveDrop(a.realQuoteReserveWei===null?null:BigInt(a.realQuoteReserveWei),b.realQuoteReserveWei===null?null:BigInt(b.realQuoteReserveWei));if(drop!==null && drop>1500)this.event('reserve-warning',{token:next.token,dropBps:drop,fromBlock:a.blockNumber,blockNumber:b.blockNumber});}
   }
   this.db.prepare('INSERT INTO watches VALUES (?,?) ON CONFLICT(token) DO UPDATE SET value=excluded.value').run(next.token,encode(next));this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 archive(token:string){const w=this.get(token);if(w?.active){this.save({...w,active:false});this.event('watch-archived',{token});}}
 loadDiscovery():DiscoverySnapshot|undefined{const r=this.db.prepare('SELECT value FROM discovery WHERE id=1').get() as {value:string}|undefined;return r?JSON.parse(r.value):undefined;}
 saveDiscovery(s:DiscoverySnapshot){this.db.prepare('INSERT INTO discovery VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(encode(s));}
}
export class WatchService {
 private pending=new Set<string>();
 constructor(readonly store:WatchStore,private reader:MarketReader){}
 private async exclusive<T>(token:string,work:()=>Promise<T>){if(this.pending.has(token))throw new Error('Token update in progress');this.pending.add(token);try{return await work();}finally{this.pending.delete(token);}}
 async add(token:string,quantity:string,cost:string){
  if(!isAddress(token) || /^0x0{40}$/i.test(token))throw new Error('Invalid token address');token=token.toLowerCase();
  return this.exclusive(token,async()=>{
   const existing=this.store.get(token);if(existing?.active){
    const decimals=existing.snapshot?.decimals??18;
    const same=quantity && cost ? /^\d+(\.\d+)?$/.test(quantity) && /^\d+(\.\d{1,18})?$/.test(cost) && (quantity.split('.')[1]?.length??0)<=decimals && parseUnits(quantity,decimals).toString()===existing.quantity && parseUnits(cost,18).toString()===existing.costWei : !quantity && !cost && existing.quantity===null;
    if(!same)throw new Error('Token already watched with different position details. Remove it before adding changed details.');return existing;
   }
   if(Boolean(quantity)!==Boolean(cost))throw new Error('Provide both token quantity and total entry cost, or leave both empty');
   if(quantity && (!/^\d+(\.\d+)?$/.test(quantity)||!/^\d+(\.\d{1,18})?$/.test(cost)))throw new Error('Invalid position amounts');
   const initial=await inspectToken(this.reader,token,10n**15n);
   const parse=(value:string,decimals:number)=>{if((value.split('.')[1]?.length??0)>decimals)throw new Error('Too many decimal places');const n=parseUnits(value,decimals);if(n<=0n)throw new Error('Amounts must be positive');return n;};
   const qty=quantity?parse(quantity,initial.decimals):null,entry=cost?parse(cost,18):null;
   const snapshot=qty?await inspectToken(this.reader,token,1n,qty):initial;
   const watch:Watch={token,quantity:qty?.toString()??null,costWei:entry?.toString()??null,active:true,status:'ok',error:null,checkedAt:Date.now(),snapshot:JSON.parse(encode(snapshot))};
   this.store.save(watch,true);return watch;
  });
 }
 async refresh(token:string){return this.exclusive(token,async()=>{
  const w=this.store.get(token);if(!w?.active)throw new Error('Unknown watch');
  try{const q=await inspectToken(this.reader,token,w.quantity?1n:10n**15n,w.quantity?BigInt(w.quantity):undefined);
   if(w.snapshot && BigInt(q.blockNumber)<BigInt(w.snapshot.blockNumber))throw new Error('RPC block moved backwards');
   const next={...w,status:'ok' as const,error:null,checkedAt:Date.now(),snapshot:JSON.parse(encode(q))};this.store.save(next);return next;
  }catch(e){const error=(e instanceof Error?e.message:'Read failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,240);this.store.save({...w,status:'error',error,checkedAt:Date.now()});throw new Error(error);}
 });}
}

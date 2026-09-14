import type {RadarReader} from './reader.js';
import {RadarStore} from './store.js';
import type {RadarEvent,RadarLaunch} from './types.js';

export interface RadarIndexerOptions {
 rangeBlocks:bigint;
 pollMs:number;
 profileConcurrency:number;
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
 private pending:Promise<void>|null=null;
 private timer:NodeJS.Timeout|null=null;
 private stopped=false;
 private snapshot:RadarIndexerStatus={state:'idle',headBlock:null,lastIndexedBlock:null,lagBlocks:null,updatedAt:null,queueDepth:0,error:null};

 constructor(private store:RadarStore,private reader:RadarReader,private options:RadarIndexerOptions){}

 status():RadarIndexerStatus{return {...this.snapshot};}

 tick():Promise<void>{
  if(this.pending)return this.pending;
  if(this.stopped)return Promise.resolve();
  const work=this.runCycle();
  this.pending=work.finally(()=>{this.pending=null;});
  return this.pending;
 }

 start(){if(!this.timer&&!this.stopped){void this.tick();this.timer=setInterval(()=>void this.tick(),this.options.pollMs);this.timer.unref();}}

 async close(){this.stopped=true;if(this.timer){clearInterval(this.timer);this.timer=null;}await this.pending;this.snapshot={...this.snapshot,state:'stopped'};}

 private async runCycle(){
  this.snapshot={...this.snapshot,state:'indexing',error:null};
  try{
   const chainId=await this.reader.chainId();if(chainId!==4663)throw new Error(`wrong chain: ${chainId}; expected 4663`);
   const head=await this.reader.head(),deployment=await this.reader.factoryDeployment();
   const factoryRange=this.range('factory',head,deployment),launches=await this.reader.launches(factoryRange.from,factoryRange.to);
   const factoryBlock=await this.reader.block(factoryRange.to);
   this.store.replaceLaunchRange('factory',factoryRange.from,factoryRange.to,factoryRange.to,launches,factoryBlock.hash);
   await this.profileLaunches(head);
   const marketRange=this.range('market',head,this.options.historyStartBlock>deployment?this.options.historyStartBlock:deployment),raw=await this.reader.trades(marketRange.from,marketRange.to),events:RadarEvent[]=[];
   for(const event of raw){const launch=this.store.launchByCurve(event.curve);if(launch)events.push({...event,token:launch.token});}
   const marketBlock=marketRange.to===factoryRange.to?factoryBlock:await this.reader.block(marketRange.to);
   this.store.replaceEventRange('market',marketRange.from,marketRange.to,marketRange.to,events,marketBlock.hash);
   for(const token of new Set(events.map(event=>event.token))){const launch=this.store.launchByToken(token);if(launch?.profile&&launch.state==='profiled')this.store.saveLaunch({...launch,state:'tracking',updatedAt:Date.now()});}
   const cursor=this.store.cursor('market')!;
   this.snapshot={state:'ready',headBlock:head.toString(),lastIndexedBlock:cursor.blockNumber,lagBlocks:(head-BigInt(cursor.blockNumber)).toString(),updatedAt:Date.now(),queueDepth:this.store.launches().filter(row=>row.state==='discovered').length,error:null};
  }catch(error){this.snapshot={...this.snapshot,state:'error',updatedAt:Date.now(),error:sanitize(error)};}
 }

 private async profileLaunches(head:bigint){
  const queue=this.store.launches().filter(row=>row.state==='discovered'||row.state==='error').sort((a,b)=>Number(BigInt(b.launchBlock)-BigInt(a.launchBlock)));
  let cursor=0;
  const worker=async()=>{while(cursor<queue.length){const row=queue[cursor++];if(!row)continue;try{const profile=await this.reader.profile(row.token,head);this.store.saveLaunch({...row,state:'profiled',profile,profileError:null,updatedAt:Date.now()});}catch(error){this.store.saveLaunch({...row,state:'error',profileError:sanitize(error),updatedAt:Date.now()});}}};
  await Promise.all(Array.from({length:Math.min(this.options.profileConcurrency,queue.length)},()=>worker()));
 }

 private range(name:string,head:bigint,floor:bigint){
  const cursor=this.store.cursor(name);if(!cursor){const from=head>=this.options.rangeBlocks-1n?head-this.options.rangeBlocks+1n:0n;return {from:from>floor?from:floor,to:head};}
  const saved=BigInt(cursor.blockNumber);if(head<saved)throw new Error('RPC head behind saved radar cursor');
  const from=saved>63n?saved-63n:0n;return {from:from>floor?from:floor,to:head};
 }
}

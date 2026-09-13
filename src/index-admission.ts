import {isAddress} from 'viem';

export interface IndexAdmissionOptions {maxActive:number;maxQueued:number;maxPerWindow:number;windowMs:number}
export type IndexAdmissionResult={state:'started'|'active'|'queued';token:string};

export class IndexAdmissionError extends Error {
 constructor(readonly status:400|429,message:string,readonly retryAfter?:number){super(message);this.name='IndexAdmissionError';}
}

export class IndexAdmission {
 private active=new Map<string,Promise<void>>();
 private queued:string[]=[];
 private queuedSet=new Set<string>();
 private admissions=new Map<string,number[]>();

 constructor(private start:(token:string)=>Promise<void>,private options:IndexAdmissionOptions){}

 admit(rawToken:string,clientId:string,now=Date.now()):IndexAdmissionResult{
  if(!isAddress(rawToken)||/^0x0{40}$/i.test(rawToken))throw new IndexAdmissionError(400,'Invalid token address');
  const token=rawToken.toLowerCase();
  if(this.active.has(token))return {state:'active',token};
  if(this.queuedSet.has(token))return {state:'queued',token};

  const client=clientId||'unknown',cutoff=now-this.options.windowMs,hits=(this.admissions.get(client)??[]).filter(at=>at>cutoff);
  if(hits.length>=this.options.maxPerWindow){
   this.admissions.set(client,hits);
   const retryAfter=Math.max(1,Math.ceil((hits[0]!+this.options.windowMs-now)/1000));
   throw new IndexAdmissionError(429,'Index request limit reached',retryAfter);
  }

  if(this.active.size<this.options.maxActive){this.record(client,hits,now);this.launch(token);return {state:'started',token};}
  if(this.queued.length>=this.options.maxQueued)throw new IndexAdmissionError(429,'Index queue is full');
  this.record(client,hits,now);this.queued.push(token);this.queuedSet.add(token);return {state:'queued',token};
 }

 private record(client:string,hits:number[],now:number){hits.push(now);this.admissions.set(client,hits);}
 private launch(token:string){
  const job=Promise.resolve().then(()=>this.start(token));this.active.set(token,job);
  void job.catch(()=>{}).finally(()=>{if(this.active.get(token)===job)this.active.delete(token);this.drain();});
 }
 private drain(){while(this.active.size<this.options.maxActive&&this.queued.length){const token=this.queued.shift()!;this.queuedSet.delete(token);this.launch(token);}}
}

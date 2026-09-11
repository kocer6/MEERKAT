interface WatchedPosition { id:string; source:string; status:string }
interface Health { status:'ok'|'error'; checkedAt:number; lastSuccessAt:number|null; error:string|null }
/** Sequential polling of persisted open positions; scanner discovery is independent. */
export class PositionMonitor {
 private active=false; private generation=0; private timer?:NodeJS.Timeout; private pending?:Promise<void>;
 private health:Record<string,Health>={};
 constructor(private positions:()=>WatchedPosition[],private observe:(id:string)=>Promise<unknown>,private intervalMs=15000){}
 snapshot(){return {active:this.active,intervalMs:this.intervalMs,positions:structuredClone(this.health)};}
 tick(){
  if(this.pending)return this.pending;
  this.pending=this.run().finally(()=>{this.pending=undefined;});return this.pending;
 }
 private async run(){
  const open=this.positions().filter(p=>p.source==='chain'&&p.status==='open');
  for(const id of Object.keys(this.health))if(!open.some(p=>p.id===id))delete this.health[id];
  for(const p of open){
   try{await this.observe(p.id);this.health[p.id]={status:'ok',checkedAt:Date.now(),lastSuccessAt:Date.now(),error:null};}
   catch(error){this.health[p.id]={status:'error',checkedAt:Date.now(),lastSuccessAt:this.health[p.id]?.lastSuccessAt??null,error:(error instanceof Error?error.message:'Quote failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]')};}
  }
 }
 start(){if(this.active)return;this.active=true;void this.poll(++this.generation);}
 private async poll(generation:number){await this.tick();if(this.active && generation===this.generation)this.timer=setTimeout(()=>void this.poll(generation),this.intervalMs);}
 async stop(){this.active=false;this.generation++;if(this.timer)clearTimeout(this.timer);await this.pending;}
}

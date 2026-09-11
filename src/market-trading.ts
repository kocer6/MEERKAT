import { inspectToken, type MarketReader } from './chain/market.js';
import { PaperEngine } from './paper.js';
import type { Position, Rules } from './types.js';
export const paperGasWei = 100000000000000n;
export type Inspection = Awaited<ReturnType<typeof inspectToken>>;
/** Transparent curve-entry fit only; not a contract-safety or investment score. All checks are mandatory. */
export function assessEntry(q: Inspection, rules: Rules) {
 const checks = [
  {label:'Readable native ETH curve and two-way quote',pass:q.reasons.length===0 && q.buy!==null && q.sellBackWei!==null},
  {label:`Opening tax at most ${rules.maxTaxBps/100}%`,pass:q.openingTaxBps!==null && q.openingTaxBps<=rules.maxTaxBps},
  {label:'Combined protocol and creator fees at most 5%',pass:q.feeBps!==null && q.creatorTaxBps!==null && q.feeBps+q.creatorTaxBps<=500},
  {label:'Requested entry at most 1% of real ETH reserve',pass:q.realQuoteReserveWei!==null && q.amountWei*100n<=q.realQuoteReserveWei},
  {label:'Estimated round-trip loss including modeled gas at most 10%',pass:q.buy!==null && q.sellBackWei!==null && (q.sellBackWei-paperGasWei)*100n >= (q.buy.spentWei+paperGasWei)*90n},
 ];
 return {score:checks.filter(x=>x.pass).length*20,eligible:checks.every(x=>x.pass),checks,gasWei:paperGasWei,
  scope:'Curve-entry fit only. Holder concentration, deployer history and contract safety are not assessed.'};
}
export class MarketTrading {
 private active = new Set<string>();
 constructor(private engine: PaperEngine, private reader: MarketReader) {}
 async buy(token: string, amount: bigint, orderId: string) {
  const q=await inspectToken(this.reader,token,amount); const assessment=assessEntry(q,this.engine.rules);
  if(!assessment.eligible) throw new Error([...q.reasons,...assessment.checks.filter(x=>!x.pass).map(x=>x.label)].join('; '));
  const position=await this.engine.buy({token:q.token,symbol:q.symbol,amountWei:amount,openingTaxBps:q.openingTaxBps,score:assessment.score,source:'chain',
   evidence:{blockNumber:q.blockNumber,blockTimestamp:q.blockTimestamp,assessment,gasModel:'Fixed 0.0001 ETH per leg; not measured gas'}},orderId,
   async()=>({...q.buy!,gasWei:paperGasWei,observedAt:q.observedAt,source:'chain'}));
  if(!this.engine.ledger.reserveWatches()[position.id])this.recordReserve(position.id,q);
  return position;
 }
 private recordReserve(id:string,q:Inspection){this.engine.ledger.recordReserve(id,{blockNumber:q.blockNumber,reserveWei:q.realQuoteReserveWei?.toString()??null,curve:q.phase===0?q.curve:null,observedAt:q.observedAt});}
 private async quote(p:Position) {
  if(p.source!=='chain') throw new Error('market controls require a chain-source paper position');
  let q:Inspection;
  try{q=await inspectToken(this.reader,p.token,1n,BigInt(p.quantity));}
  catch(error){this.engine.ledger.recordReserve(p.id,{blockNumber:null,reserveWei:null,curve:null,observedAt:Date.now()});throw error;}
  this.recordReserve(p.id,q);
  if(q.reasons.length || q.sellBackWei===null) throw new Error(q.reasons.join('; ') || 'sell quote unavailable');
  return {ethOut:q.sellBackWei,gasWei:paperGasWei,observedAt:q.observedAt,source:'chain' as const,blockNumber:q.blockNumber,phase:q.phase,quoteModel:q.quoteModel};
 }
 private async exclusive(id:string,work:()=>Promise<Position>) {
  if(this.active.has(id)) throw new Error('position update already in progress');this.active.add(id);
  try{return await work();}finally{this.active.delete(id);}
 }
 close(id:string){return this.exclusive(id,()=>this.engine.close(id,'manual',p=>this.quote(p)));}
 observe(id:string){return this.exclusive(id,async()=>{
  const p=this.engine.ledger.position(id);if(!p || p.status!=='open') throw new Error('position is not open');
  return this.engine.observe(id,await this.quote(p));
 });}
}

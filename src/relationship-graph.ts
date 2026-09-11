import type {TokenEvent,TokenProfile} from './token-history.js';

export type RelationshipRole='token'|'deployer'|'curve participant'|'transfer sender'|'transfer recipient'|'pool caller';
export type RelationshipKind='launch'|'curve buy'|'curve sell'|'transfer'|'pool call';
export interface RelationshipNode {address:string;roles:RelationshipRole[];eventCount:number;buys:number;sells:number;boughtTokens:string;soldTokens:string;balance:string;shareBps:number;firstBlock:string|null;lastBlock:string|null}
export interface RelationshipEdge {from:string;to:string;kind:RelationshipKind;attribution:'event actor'|'pool caller only';count:number;firstBlock:string;lastBlock:string;transactions:string[]}
export interface RelationshipGraph {nodes:RelationshipNode[];edges:RelationshipEdge[];summary:{observedInteractions:number;unattributedPoolCalls:number;truncated:boolean;holdersComplete:boolean;coverage:string}}

interface NodeAggregate {address:string;roles:Set<RelationshipRole>;eventCount:number;buys:number;sells:number;boughtTokens:bigint;soldTokens:bigint;balance:bigint;firstBlock:string|null;lastBlock:string|null}

export function buildRelationshipGraph(profile:TokenProfile,events:TokenEvent[],options:{maxNodes?:number;maxEdges?:number;complete?:boolean}={}):RelationshipGraph{
 const maxNodes=Math.max(2,options.maxNodes??48),maxEdges=Math.max(1,options.maxEdges??96);
 const nodes=new Map<string,NodeAggregate>(),edges=new Map<string,RelationshipEdge>();
 const node=(address:string,role:RelationshipRole)=>{const id=address.toLowerCase(),current=nodes.get(id)??{address:id,roles:new Set<RelationshipRole>(),eventCount:0,buys:0,sells:0,boughtTokens:0n,soldTokens:0n,balance:0n,firstBlock:null,lastBlock:null};current.roles.add(role);nodes.set(id,current);return current;};
 const seen=(current:NodeAggregate,blockNumber:string)=>{if(current.firstBlock===null||BigInt(blockNumber)<BigInt(current.firstBlock))current.firstBlock=blockNumber;if(current.lastBlock===null||BigInt(blockNumber)>BigInt(current.lastBlock))current.lastBlock=blockNumber;};
 const add=(fromRaw:string,toRaw:string,kind:RelationshipKind,attribution:RelationshipEdge['attribution'],event:{blockNumber:string;txHash:string})=>{
  const from=fromRaw.toLowerCase(),to=toRaw.toLowerCase(),key=`${from}|${to}|${kind}|${attribution}`,existing=edges.get(key),fromNode=nodes.get(from)!,toNode=nodes.get(to)!;
  fromNode.eventCount++;toNode.eventCount++;seen(fromNode,event.blockNumber);seen(toNode,event.blockNumber);
  if(existing){existing.count++;if(BigInt(event.blockNumber)<BigInt(existing.firstBlock))existing.firstBlock=event.blockNumber;if(BigInt(event.blockNumber)>BigInt(existing.lastBlock))existing.lastBlock=event.blockNumber;if(existing.transactions.length<3&&!existing.transactions.includes(event.txHash))existing.transactions.push(event.txHash);return;}
  edges.set(key,{from,to,kind,attribution,count:1,firstBlock:event.blockNumber,lastBlock:event.blockNumber,transactions:event.txHash?[event.txHash]:[]});
 };
 const token=profile.token.toLowerCase(),deployer=profile.deployer.toLowerCase();node(token,'token');node(deployer,'deployer');add(deployer,token,'launch','event actor',{blockNumber:profile.birthBlock,txHash:''});
 let observedInteractions=0,unattributedPoolCalls=0;
 for(const event of events){
  const kind=event.kind.toLowerCase();
  if(event.venue==='pool'){
   if(!event.actor)continue;node(event.actor,'pool caller');add(event.actor,token,'pool call','pool caller only',event);observedInteractions++;unattributedPoolCalls++;continue;
  }
  if(event.venue==='curve'&&(kind==='buy'||kind==='sell')){
   if(!event.initiator)continue;const wallet=node(event.initiator,'curve participant'),tokens=BigInt(event.tokens??0);if(kind==='buy'){wallet.buys++;wallet.boughtTokens+=tokens;add(token,event.initiator,'curve buy','event actor',event);}else{wallet.sells++;wallet.soldTokens+=tokens;add(event.initiator,token,'curve sell','event actor',event);}observedInteractions++;continue;
  }
  if(kind==='transfer'&&event.actor&&event.recipient){
   const sender=node(event.actor,'transfer sender'),recipient=node(event.recipient,'transfer recipient'),tokens=BigInt(event.tokens??event.details?.value??0);sender.balance-=tokens;recipient.balance+=tokens;add(event.actor,event.recipient,'transfer','event actor',event);observedInteractions++;
  }
 }
 const fixed=new Set([token,deployer]),candidates=[...nodes.values()].filter(value=>!fixed.has(value.address)),capacity=maxNodes-2,selected=new Set([token,deployer]);
 const ranked=(values:NodeAggregate[])=>values.sort((a,b)=>b.eventCount-a.eventCount||a.address.localeCompare(b.address)),select=(values:NodeAggregate[],limit:number)=>{for(const value of values.slice(0,limit)){if(selected.size>=maxNodes)break;selected.add(value.address);}};
 select(ranked(candidates.filter(value=>value.roles.has('curve participant'))),Math.max(1,Math.ceil(capacity*.45)));
 select(candidates.filter(value=>value.balance>0n).sort((a,b)=>a.balance===b.balance?a.address.localeCompare(b.address):a.balance>b.balance?-1:1),Math.min(16,Math.max(1,Math.ceil(capacity*.35))));
 select(ranked(candidates.filter(value=>value.roles.has('pool caller'))),Math.min(4,Math.max(1,Math.ceil(capacity*.1))));
 select(ranked(candidates),maxNodes);
 const eligible=[...edges.values()].filter(edge=>selected.has(edge.from)&&selected.has(edge.to)).sort((a,b)=>{const count=b.count-a.count;if(count)return count;const firstA=BigInt(a.firstBlock),firstB=BigInt(b.firstBlock);return firstA<firstB?-1:firstA>firstB?1:a.kind.localeCompare(b.kind);});
 const supply=BigInt(profile.totalSupply),outputNodes=[...nodes.values()].filter(value=>selected.has(value.address)).map(value=>{const balance=value.balance>0n?value.balance:0n;return {address:value.address,roles:[...value.roles],eventCount:value.eventCount,buys:value.buys,sells:value.sells,boughtTokens:value.boughtTokens.toString(),soldTokens:value.soldTokens.toString(),balance:balance.toString(),shareBps:supply>0n?Number(balance*10000n/supply):0,firstBlock:value.firstBlock,lastBlock:value.lastBlock};});
 const outputEdges:RelationshipEdge[]=[],added=new Set<RelationshipEdge>(),groups=[eligible.filter(edge=>edge.kind==='curve buy'||edge.kind==='curve sell'),eligible.filter(edge=>edge.kind==='transfer'),eligible.filter(edge=>edge.kind==='pool call'),eligible.filter(edge=>edge.kind==='launch')];
 const keep=(edge:RelationshipEdge)=>{if(outputEdges.length<maxEdges&&!added.has(edge)){outputEdges.push(edge);added.add(edge);}};for(const group of groups)if(group[0])keep(group[0]);
 const quotas=[Math.ceil(maxEdges*.42),Math.ceil(maxEdges*.42),Math.ceil(maxEdges*.1),1];for(let index=0;index<groups.length;index++)for(const edge of groups[index]!.slice(1,quotas[index]))keep(edge);for(const edge of eligible)keep(edge);
 const truncated=nodes.size>outputNodes.length||eligible.length>outputEdges.length;
 return {nodes:outputNodes,edges:outputEdges,summary:{observedInteractions,unattributedPoolCalls,truncated,holdersComplete:options.complete===true,coverage:'Curve buyer/seller and transfer addresses come from decoded events. Pool nodes are callers only and are not attributed to end users. Trade arrows show token flow; holder balances are reconstructed from indexed transfers.'}};
}

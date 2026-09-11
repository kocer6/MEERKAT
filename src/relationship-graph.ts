import type {TokenEvent,TokenProfile} from './token-history.js';

export type RelationshipRole='token'|'deployer'|'curve participant'|'transfer sender'|'transfer recipient'|'pool caller';
export type RelationshipKind='launch'|'curve buy'|'curve sell'|'transfer'|'pool call';
export interface RelationshipNode {address:string;roles:RelationshipRole[];eventCount:number}
export interface RelationshipEdge {from:string;to:string;kind:RelationshipKind;attribution:'event actor'|'pool caller only';count:number;firstBlock:string;lastBlock:string;transactions:string[]}
export interface RelationshipGraph {nodes:RelationshipNode[];edges:RelationshipEdge[];summary:{observedInteractions:number;unattributedPoolCalls:number;truncated:boolean;coverage:string}}

export function buildRelationshipGraph(profile:TokenProfile,events:TokenEvent[],options:{maxNodes?:number;maxEdges?:number}={}):RelationshipGraph{
 const maxNodes=Math.max(2,options.maxNodes??48),maxEdges=Math.max(1,options.maxEdges??96);
 const nodes=new Map<string,{address:string;roles:Set<RelationshipRole>;eventCount:number}>(),edges=new Map<string,RelationshipEdge>();
 const node=(address:string,role:RelationshipRole)=>{const id=address.toLowerCase(),current=nodes.get(id)??{address:id,roles:new Set<RelationshipRole>(),eventCount:0};current.roles.add(role);nodes.set(id,current);return current;};
 const add=(fromRaw:string,toRaw:string,kind:RelationshipKind,attribution:RelationshipEdge['attribution'],event:{blockNumber:string;txHash:string})=>{
  const from=fromRaw.toLowerCase(),to=toRaw.toLowerCase(),key=`${from}|${to}|${kind}|${attribution}`,existing=edges.get(key);
  nodes.get(from)!.eventCount++;nodes.get(to)!.eventCount++;
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
   if(!event.initiator)continue;node(event.initiator,'curve participant');add(event.initiator,token,kind==='buy'?'curve buy':'curve sell','event actor',event);observedInteractions++;continue;
  }
  if(kind==='transfer'&&event.actor&&event.recipient){
   node(event.actor,'transfer sender');node(event.recipient,'transfer recipient');add(event.actor,event.recipient,'transfer','event actor',event);observedInteractions++;
  }
 }
 const fixed=new Set([token,deployer]),ranked=[...nodes.values()].filter(value=>!fixed.has(value.address)).sort((a,b)=>b.eventCount-a.eventCount||a.address.localeCompare(b.address));
 const selected=new Set([token,deployer,...ranked.slice(0,maxNodes-2).map(value=>value.address)]);
 const eligible=[...edges.values()].filter(edge=>selected.has(edge.from)&&selected.has(edge.to)).sort((a,b)=>{const count=b.count-a.count;if(count)return count;const firstA=BigInt(a.firstBlock),firstB=BigInt(b.firstBlock);return firstA<firstB?-1:firstA>firstB?1:a.kind.localeCompare(b.kind);});
 const outputNodes=[...nodes.values()].filter(value=>selected.has(value.address)).map(value=>({address:value.address,roles:[...value.roles],eventCount:value.eventCount}));
 const truncated=nodes.size>outputNodes.length||eligible.length>maxEdges;
 return {nodes:outputNodes,edges:eligible.slice(0,maxEdges),summary:{observedInteractions,unattributedPoolCalls,truncated,coverage:'Curve buyer/seller and transfer addresses come from decoded events. Pool nodes are callers only and are not attributed to end users. Lines show on-chain interactions, not ownership.'}};
}

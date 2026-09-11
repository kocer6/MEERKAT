import type {HistoryState,TokenEvent} from './token-history.js';
const zero='0x0000000000000000000000000000000000000000';

export interface ScoreComponent {label:string;score:number;max:number;evidence:string}
export interface EvidenceScore {value:number|null;confidence:'low'|'medium'|'high';label:string;status:'calibrating'|'ready'|'error';progress:number;components:ScoreComponent[];caveat:string}

const band=(value:number)=>value>=75?'STRONG OBSERVED SIGNAL':value>=50?'DEVELOPING SIGNAL':'THIN EVIDENCE';

export function scoreToken(state:HistoryState,events:TokenEvent[]):EvidenceScore{
 const birth=BigInt(state.profile.birthBlock),head=BigInt(state.profile.head),cursor=state.cursor?BigInt(state.cursor):birth-1n;
 const span=head>=birth?head-birth+1n:1n,covered=cursor>=birth?(cursor>head?span:cursor-birth+1n):0n;
 const coverage=Math.max(0,Math.min(1,Number(covered*10_000n/span)/10_000));
 const participants=new Set(events.filter(event=>event.venue==='curve'&&event.initiator).map(event=>event.initiator!.toLowerCase())).size;
 if(state.status!=='ready')return {value:null,confidence:'low',label:state.status==='error'?'INDEXING ERROR':'CALIBRATING',status:state.status==='error'?'error':'calibrating',progress:Number((coverage*100).toFixed(1)),components:[],caveat:`Token score withheld until launch-to-head indexing completes. Current coverage: ${(coverage*100).toFixed(1)}%.`};
 const participantScore=participants===0?0:participants===1?3:participants<5?7:participants<10?12:participants<25?18:25;
 const supply=BigInt(state.profile.totalSupply),balance=BigInt(state.profile.deployerBalance);
 const deployerShare=supply>0n?Number(balance*10_000n/supply)/100:null;
 const deployerScore=deployerShare===null?0:deployerShare<=1?25:deployerShare<=5?20:deployerShare<=15?12:deployerShare<=30?6:0;
 const tax=state.profile.creatorTaxBps,taxScore=tax===0?20:tax<=100?16:tax<=300?10:tax<=500?5:0;
 const sides=new Map<string,Set<string>>();for(const event of events){if(event.venue!=='curve'||!event.initiator||!['buy','sell'].includes(event.kind))continue;const key=event.initiator.toLowerCase(),seen=sides.get(key)??new Set<string>();seen.add(event.kind);sides.set(key,seen);}const roundTrips=[...sides.values()].filter(seen=>seen.size===2).length;
 const twoSidedScore=participants?Math.round(roundTrips/participants*15):0;
 const excluded=new Set([zero,state.profile.token,state.profile.curve,state.profile.deployer,state.profile.poolManager,state.profile.memeHook].filter((value):value is string=>Boolean(value)).map(value=>value.toLowerCase()));
 const balances=new Map<string,bigint>();for(const event of events){if(event.kind.toLowerCase()!=='transfer')continue;const value=BigInt(event.tokens??event.details?.value??0);if(event.actor){const actor=event.actor.toLowerCase();balances.set(actor,(balances.get(actor)??0n)-value);}if(event.recipient){const recipient=event.recipient.toLowerCase();balances.set(recipient,(balances.get(recipient)??0n)+value);}}
 const holders=[...balances].filter(([address,balance])=>balance>0n&&!excluded.has(address)).length;
 const holderScore=holders===0?0:holders===1?2:holders<5?5:holders<10?8:holders<25?12:15;
 const components:ScoreComponent[]=[
  {label:'DEPLOYER EXPOSURE',score:deployerScore,max:25,evidence:deployerShare===null?'Current supply share unavailable':`${deployerShare.toFixed(2)}% of supply currently held by deployer`},
  {label:'CREATOR TAX',score:taxScore,max:20,evidence:`${(tax/100).toFixed(2)}% creator tax`},
  {label:'PARTICIPANT BREADTH',score:participantScore,max:25,evidence:`${participants} attributed curve participant${participants===1?'':'s'}`},
  {label:'TWO-SIDED MARKET',score:twoSidedScore,max:15,evidence:`${roundTrips} participants with attributed buys and sells`},
  {label:'HOLDER BREADTH',score:holderScore,max:15,evidence:`${holders} current non-core holder${holders===1?'':'s'} reconstructed from transfers`},
 ];
 const value=components.reduce((sum,component)=>sum+component.score,0);
 const confidence=events.length>=25&&participants>=10?'high':events.length>=10||participants>=3?'medium':'low';
 return {value,confidence,label:band(value),status:'ready',progress:100,components,caveat:'This transparent signal score is not investment advice, a price prediction, or a contract audit.'};
}

export function scoreWallet(input:{matchedTokens:number;readyMatchedTokens:number;events:number;earlyEntries:number;roundTrips:number}):EvidenceScore{
 const matched=Math.max(0,input.matchedTokens),ready=Math.max(0,Math.min(input.readyMatchedTokens,matched));
 const scopeScore=matched>=8?25:matched>=5?20:matched>=3?15:matched===2?10:matched===1?3:0;
 const earlyScore=matched?Math.round(Math.min(1,input.earlyEntries/matched)*25):0;
 const roundTripScore=matched?Math.round(Math.min(1,input.roundTrips/matched)*25):0;
 const activityScore=input.events>=50?25:input.events>=20?20:input.events>=10?15:input.events>=5?10:input.events>0?5:0;
 const components:ScoreComponent[]=[
  {label:'LOCAL SCOPE',score:scopeScore,max:25,evidence:`Observed across ${matched} locally matched token${matched===1?'':'s'}`},
  {label:'EARLY DISCOVERY',score:earlyScore,max:25,evidence:`${input.earlyEntries} early entr${input.earlyEntries===1?'y':'ies'} in the local index`},
  {label:'TWO-SIDED ACTIVITY',score:roundTripScore,max:25,evidence:`Buy and sell evidence on ${input.roundTrips} matched token${input.roundTrips===1?'':'s'}`},
  {label:'EVIDENCE DEPTH',score:activityScore,max:25,evidence:`${input.events} matched events`},
 ];
 const value=components.reduce((sum,component)=>sum+component.score,0);
 const confidence=matched>=7&&ready===matched?'high':matched>=3&&ready>=Math.ceil(matched/2)?'medium':'low';
 return {value,confidence,label:band(value),status:'ready',progress:100,components,caveat:'This score summarizes locally observed behavior, not profit or skill. Missing token histories lower confidence.'};
}

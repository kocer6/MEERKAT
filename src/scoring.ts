import type {HistoryState,TokenEvent} from './token-history.js';

export interface ScoreComponent {label:string;score:number;max:number;evidence:string}
export interface EvidenceScore {value:number;confidence:'low'|'medium'|'high';label:string;components:ScoreComponent[];caveat:string}

const band=(value:number)=>value>=75?'STRONG OBSERVED SIGNAL':value>=50?'DEVELOPING SIGNAL':'THIN EVIDENCE';

export function scoreToken(state:HistoryState,events:TokenEvent[]):EvidenceScore{
 const birth=BigInt(state.profile.birthBlock),head=BigInt(state.profile.head),cursor=state.cursor?BigInt(state.cursor):birth-1n;
 const span=head>=birth?head-birth+1n:1n,covered=cursor>=birth?(cursor>head?span:cursor-birth+1n):0n;
 const coverage=Math.max(0,Math.min(1,Number(covered*10_000n/span)/10_000));
 const coverageScore=Math.round(coverage*35);
 const participants=new Set(events.filter(event=>event.venue==='curve'&&event.initiator).map(event=>event.initiator!.toLowerCase())).size;
 const participantScore=participants===0?0:participants===1?5:participants<5?10:participants<10?15:participants<25?20:25;
 const activityScore=events.length===0?0:events.length<5?4:events.length<20?10:events.length<50?15:20;
 const supply=BigInt(state.profile.totalSupply),balance=BigInt(state.profile.deployerBalance);
 const deployerShare=supply>0n?Number(balance*10_000n/supply)/100:null;
 const deployerScore=deployerShare===null?0:deployerShare<=10?20:deployerShare<=25?15:deployerShare<=50?8:2;
 const components:ScoreComponent[]=[
  {label:'INDEX COVERAGE',score:coverageScore,max:35,evidence:`${(coverage*100).toFixed(1)}% of launch-to-head blocks indexed`},
  {label:'PARTICIPANT BREADTH',score:participantScore,max:25,evidence:`${participants} attributed curve participant${participants===1?'':'s'}`},
  {label:'ACTIVITY DEPTH',score:activityScore,max:20,evidence:`${events.length} observed events`},
  {label:'DEPLOYER EXPOSURE',score:deployerScore,max:20,evidence:deployerShare===null?'Current supply share unavailable':`${deployerShare.toFixed(2)}% of supply currently held by deployer`},
 ];
 const value=components.reduce((sum,component)=>sum+component.score,0);
 const confidence=coverage>=.999&&events.length>=25?'high':coverage>=.5||events.length>=10?'medium':'low';
 return {value,confidence,label:band(value),components,caveat:'This is a transparent evidence score, not investment safety, price prediction, or an audit.'};
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
 return {value,confidence,label:band(value),components,caveat:'This score summarizes locally observed behavior, not profit or skill. Missing token histories lower confidence.'};
}

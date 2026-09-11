import {isAddress} from 'viem';
import type {HistoryState,TokenEvent} from './token-history.js';

export interface IndexedTokenHistory {state:HistoryState;events:TokenEvent[]}

export function buildWalletDossier(raw:string,histories:IndexedTokenHistory[]){
 if(!isAddress(raw))throw new Error('Invalid wallet address');
 const address=raw.toLowerCase();
 const tokens=[] as Array<{token:string;name:string;symbol:string;status:HistoryState['status'];events:number;buys:number;sells:number;transfersIn:number;transfersOut:number;firstSeenAt:number|null;lastSeenAt:number|null;earlyEntry:boolean;fastExit:boolean}>;
 let totalEvents=0,buys=0,sells=0,transfersIn=0,transfersOut=0,earlyEntries=0,fastExits=0;
 for(const history of histories){
  const relevant=history.events.filter(event=>[event.initiator,event.actor,event.recipient].some(value=>value?.toLowerCase()===address));
  if(!relevant.length)continue;
  const initiatedTrades=relevant.filter(event=>event.initiator?.toLowerCase()===address);
  const tokenBuys=initiatedTrades.filter(event=>event.kind.toLowerCase()==='buy');
  const tokenSells=initiatedTrades.filter(event=>event.kind.toLowerCase()==='sell');
  const incoming=relevant.filter(event=>event.kind.toLowerCase()==='transfer'&&event.recipient?.toLowerCase()===address);
  const outgoing=relevant.filter(event=>event.kind.toLowerCase()==='transfer'&&event.actor?.toLowerCase()===address);
  const buyTimes=tokenBuys.map(event=>event.at).filter((at):at is number=>at!==null),firstBuy=buyTimes.length?Math.min(...buyTimes):null;
  const buyBlocks=tokenBuys.map(event=>BigInt(event.blockNumber)).sort((a,b)=>a<b?-1:a>b?1:0),firstBuyBlock=buyBlocks[0]??null;
  const earlyEntry=firstBuy!==null?firstBuy>=history.state.profile.birthAt&&firstBuy-history.state.profile.birthAt<=30_000:firstBuyBlock!==null&&firstBuyBlock>=BigInt(history.state.profile.birthBlock)&&firstBuyBlock-BigInt(history.state.profile.birthBlock)<=30n;
  const fastExit=firstBuy!==null?tokenSells.some(event=>event.at!==null&&event.at>=firstBuy&&event.at-firstBuy<=300_000):firstBuyBlock!==null&&tokenSells.some(event=>BigInt(event.blockNumber)>=firstBuyBlock&&BigInt(event.blockNumber)-firstBuyBlock<=300n);
  const times=relevant.map(event=>event.at).filter((at):at is number=>at!==null);
  tokens.push({token:history.state.profile.token,name:history.state.profile.name,symbol:history.state.profile.symbol,status:history.state.status,events:relevant.length,buys:tokenBuys.length,sells:tokenSells.length,transfersIn:incoming.length,transfersOut:outgoing.length,firstSeenAt:times.length?Math.min(...times):null,lastSeenAt:times.length?Math.max(...times):null,earlyEntry,fastExit});
  totalEvents+=relevant.length;buys+=tokenBuys.length;sells+=tokenSells.length;transfersIn+=incoming.length;transfersOut+=outgoing.length;if(earlyEntry)earlyEntries++;if(fastExit)fastExits++;
 }
 tokens.sort((a,b)=>(b.lastSeenAt??0)-(a.lastSeenAt??0));
 const labels=[] as string[];if(earlyEntries)labels.push('early participant');if(fastExits)labels.push('fast exit');if(buys&&!sells)labels.push('no indexed sells');if(!labels.length&&totalEvents)labels.push('participant');
 return {address,indexedTokens:histories.length,readyTokens:histories.filter(history=>history.state.status==='ready').length,summary:{events:totalEvents,buys,sells,transfersIn,transfersOut,earlyEntries,fastExits},tokens,assessment:{labels,smartStatus:'not assessed',realizedPnl:null},coverage:'Built only from locally indexed Pons token histories in this MEERKAT installation. It is not a complete wallet history and does not prove ownership, profit, or investment skill.'};
}

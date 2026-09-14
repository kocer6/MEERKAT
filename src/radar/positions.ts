import type {RadarEvent,WalletTokenPosition} from './types.js';

export interface PositionMark {
 currentValue:string;
 openPnl:string|null;
 totalPnl:string|null;
 returnBps:number|null;
}

export function emptyPosition(wallet:string,token:string,pairToken:string):WalletTokenPosition{
 return {wallet:wallet.toLowerCase(),token:token.toLowerCase(),pairToken:pairToken.toLowerCase(),tokenBalance:'0',remainingCost:'0',realizedPnl:'0',observedProceeds:'0',buys:0,sells:0,firstBuyBlock:null,lastTradeBlock:null,complete:true,updatedAt:Date.now()};
}

export function applyPositionEvent(position:WalletTokenPosition,event:RadarEvent):WalletTokenPosition{
 const balance=BigInt(position.tokenBalance),cost=BigInt(position.remainingCost),realized=BigInt(position.realizedPnl),proceeds=BigInt(position.observedProceeds),updatedAt=Date.now();
 if(!event.complete)return {...position,complete:false,updatedAt};
 if(event.kind==='buy'&&event.tokens!==null&&event.quote!==null){
  const tokens=BigInt(event.tokens),quote=BigInt(event.quote);if(tokens<=0n||quote<0n)return {...position,complete:false,updatedAt};
  return {...position,tokenBalance:(balance+tokens).toString(),remainingCost:(cost+quote).toString(),buys:position.buys+1,firstBuyBlock:position.firstBuyBlock??event.blockNumber,lastTradeBlock:event.blockNumber,updatedAt};
 }
 if(event.kind==='sell'&&event.tokens!==null&&event.quote!==null){
  const sold=BigInt(event.tokens),quote=BigInt(event.quote);if(sold<=0n||quote<0n||sold>balance||balance===0n)return {...position,complete:false,sells:position.sells+1,lastTradeBlock:event.blockNumber,updatedAt};
  const allocated=cost*sold/balance;
  return {...position,tokenBalance:(balance-sold).toString(),remainingCost:(cost-allocated).toString(),realizedPnl:(realized+quote-allocated).toString(),observedProceeds:(proceeds+quote).toString(),sells:position.sells+1,lastTradeBlock:event.blockNumber,updatedAt};
 }
 if(event.kind==='transfer')return {...position,complete:false,updatedAt};
 return position;
}

export function markPosition(position:WalletTokenPosition,currentValue:bigint):PositionMark{
 const value=currentValue.toString();
 if(!position.complete)return {currentValue:value,openPnl:null,totalPnl:null,returnBps:null};
 const remainingCost=BigInt(position.remainingCost),realized=BigInt(position.realizedPnl),proceeds=BigInt(position.observedProceeds),open=currentValue-remainingCost,total=realized+open,totalCost=remainingCost+proceeds-realized;
 const returnBps=totalCost>0n?Number(total*10000n/totalCost):null;
 return {currentValue:value,openPnl:open.toString(),totalPnl:total.toString(),returnBps};
}

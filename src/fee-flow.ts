import type {TokenEvent,TokenProfile} from './token-history.js';

export interface FeeRecipientChange {previousRecipient:string;newRecipient:string;blockNumber:string;txHash:string}
export interface FeeFlow {
 initialRecipient:string;
 currentRecipient:string;
 route:'direct'|'routed at launch'|'redirected';
 changes:FeeRecipientChange[];
 pendingChange:{newRecipient:string;effectiveAt:string;expiresAt:string}|null;
 curveCreatorRevenue:string;
 poolCreatorRevenue:string;
 confirmedCreatorRevenue:string;
 sweepCount:number;
 recipientEscrowBalance:string|null;
 escrowScope:'aggregate across every launch paid to the current recipient';
}

const amount=(event:TokenEvent)=>BigInt(event.details?.creatorAmount??0);

export function buildFeeFlow(profile:TokenProfile,events:TokenEvent[]):FeeFlow{
 const changes=events
  .filter(event=>event.kind==='CreatorFeeRecipientUpdated'&&event.details?.previousRecipient&&event.details?.newRecipient)
  .sort((a,b)=>Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||a.logIndex-b.logIndex)
  .map(event=>({previousRecipient:event.details!.previousRecipient!.toLowerCase(),newRecipient:event.details!.newRecipient!.toLowerCase(),blockNumber:event.blockNumber,txHash:event.txHash}));
 const currentRecipient=(profile.creatorFeeRecipient??profile.deployer).toLowerCase();
 const initialRecipient=(changes[0]?.previousRecipient??currentRecipient).toLowerCase();
 const deployer=profile.deployer.toLowerCase();
 const revenue=events.filter(event=>['FeesSwept','FeesRescued','PoolFeesSwept','PoolFeesRescued'].includes(event.kind));
 const curve=revenue.filter(event=>event.venue==='curve').reduce((sum,event)=>sum+amount(event),0n);
 const pool=revenue.filter(event=>event.venue==='pool').reduce((sum,event)=>sum+amount(event),0n);
 const pending=profile.pendingCreatorFeeRecipient;
 return {
  initialRecipient,currentRecipient,
  route:changes.length?'redirected':initialRecipient===deployer?'direct':'routed at launch',
  changes,
  pendingChange:pending&&pending.newRecipient.toLowerCase()!=='0x0000000000000000000000000000000000000000'?pending:null,
  curveCreatorRevenue:curve.toString(),poolCreatorRevenue:pool.toString(),confirmedCreatorRevenue:(curve+pool).toString(),
  sweepCount:revenue.length,recipientEscrowBalance:profile.recipientEscrowBalance??null,
  escrowScope:'aggregate across every launch paid to the current recipient',
 };
}

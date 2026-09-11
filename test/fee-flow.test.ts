import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFeeFlow} from '../src/fee-flow.js';
import type {TokenEvent,TokenProfile} from '../src/token-history.js';

const deployer='0x1111111111111111111111111111111111111111';
const routed='0x2222222222222222222222222222222222222222';
const next='0x3333333333333333333333333333333333333333';
const profile:TokenProfile={
 token:'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Token',symbol:'TKN',decimals:18,
 curve:'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',deployer,creatorFeeRecipient:routed,
 pairToken:'0x0000000000000000000000000000000000000000',phase:2,birthBlock:'10',birthAt:0,head:'30',
 poolId:'0xpool',poolManager:'0xcccccccccccccccccccccccccccccccccccccccc',totalSupply:'1000',
 deployerBalance:'0',creatorTaxBps:150,buybackEnabled:false,recipientEscrowBalance:'75',
 pendingCreatorFeeRecipient:{newRecipient:next,effectiveAt:'100',expiresAt:'200'},metadata:null,metadataError:null,
};
const event=(kind:string,blockNumber:string,details:Record<string,string>):TokenEvent=>({
 id:`${kind}-${blockNumber}`,kind,venue:kind.startsWith('Pool')?'pool':kind.startsWith('Creator')?'factory':'curve',
 blockNumber,blockHash:'0xblock',txHash:`0x${blockNumber}`,logIndex:0,at:null,initiator:null,actor:null,recipient:null,
 tokens:null,quote:null,details,
});

test('fee flow totals exact curve and pool creator payouts without presenting aggregate escrow as token revenue',()=>{
 const result=buildFeeFlow(profile,[
  event('FeesSwept','11',{creatorAmount:'40'}),
  event('PoolFeesSwept','20',{creatorAmount:'60'}),
  event('PoolFeesRescued','21',{creatorAmount:'5'}),
 ]);
 assert.equal(result.confirmedCreatorRevenue,'105');
 assert.equal(result.curveCreatorRevenue,'40');
 assert.equal(result.poolCreatorRevenue,'65');
 assert.equal(result.sweepCount,3);
 assert.equal(result.recipientEscrowBalance,'75');
 assert.equal(result.escrowScope,'aggregate across every launch paid to the current recipient');
});

test('fee flow reconstructs initial, current and pending recipients',()=>{
 const result=buildFeeFlow(profile,[
  event('CreatorFeeRecipientUpdated','18',{previousRecipient:routed,newRecipient:next}),
  event('CreatorFeeRecipientUpdated','22',{previousRecipient:next,newRecipient:deployer}),
 ]);
 assert.equal(result.initialRecipient,routed);
 assert.equal(result.currentRecipient,routed);
 assert.equal(result.route,'redirected');
 assert.deepEqual(result.changes.map(change=>[change.previousRecipient,change.newRecipient]),[[routed,next],[next,deployer]]);
 assert.equal(result.pendingChange?.newRecipient,next);
});

test('fee flow marks a recipient selected at launch separately from a direct creator payout',()=>{
 assert.equal(buildFeeFlow(profile,[]).route,'routed at launch');
 assert.equal(buildFeeFlow({...profile,creatorFeeRecipient:deployer,pendingCreatorFeeRecipient:null},[]).route,'direct');
});

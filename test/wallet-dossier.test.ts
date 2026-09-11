import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildWalletDossier,type IndexedTokenHistory} from '../src/wallet-dossier.js';
import type {HistoryState,TokenEvent} from '../src/token-history.js';

const address='0x1111111111111111111111111111111111111111';
const other='0x2222222222222222222222222222222222222222';
const state=(token:string,birthAt:number,status:HistoryState['status']='ready'):HistoryState=>({
 profile:{token,name:'Token',symbol:'TKN',decimals:18,curve:other,deployer:other,pairToken:'0x0000000000000000000000000000000000000000',phase:0,birthBlock:'10',birthAt,head:'20',poolId:null,poolManager:other,totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null},
 cursor:'20',status,error:null,updatedAt:birthAt+1000,
});
const event=(token:string,kind:string,at:number,overrides:Partial<TokenEvent>={}):TokenEvent=>({id:`${token}-${kind}-${at}`,kind,venue:'curve',blockNumber:'11',blockHash:'0xabc',txHash:'0xdef',logIndex:0,at,initiator:address,actor:address,recipient:address,tokens:'100',quote:'10',...overrides});

test('wallet dossier aggregates evidenced behavior across indexed tokens without claiming skill or profit',()=>{
 const histories:IndexedTokenHistory[]=[
  {state:state('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100_000),events:[event('a','buy',110_000),event('a','sell',200_000)]},
  {state:state('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',300_000),events:[event('b','buy',400_000),event('b','Transfer',500_000,{initiator:null,actor:other,recipient:address})]},
 ];
 const dossier=buildWalletDossier(address,histories);
 assert.equal(dossier.address,address);
 assert.equal(dossier.tokens.length,2);
 assert.equal(dossier.summary.buys,2);
 assert.equal(dossier.summary.sells,1);
 assert.equal(dossier.summary.earlyEntries,1);
 assert.equal(dossier.summary.fastExits,1);
 assert.equal(dossier.summary.transfersIn,1);
 assert.equal(dossier.assessment.smartStatus,'not assessed');
 assert.equal(dossier.assessment.realizedPnl,null);
 assert.match(dossier.coverage,/locally indexed/i);
});

test('wallet dossier returns an honest empty result when local histories contain no address evidence',()=>{
 const dossier=buildWalletDossier(address,[{state:state('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100_000,'indexing'),events:[event('a','buy',110_000,{initiator:other,actor:other,recipient:other})]}]);
 assert.deepEqual(dossier.tokens,[]);
 assert.equal(dossier.summary.events,0);
 assert.equal(dossier.indexedTokens,1);
 assert.equal(dossier.readyTokens,0);
});

test('wallet dossier rejects invalid public addresses',()=>{
 assert.throws(()=>buildWalletDossier('bad',[]),/Invalid wallet address/);
});
test('wallet dossier keeps block-only transfer evidence without inventing a timestamp',()=>{
 const transfer=event('a','Transfer',0,{at:null as never,initiator:null,actor:other,recipient:address});
 const dossier=buildWalletDossier(address,[{state:state('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100_000),events:[transfer]}]);
 assert.equal(dossier.tokens[0]?.firstSeenAt,null);
 assert.equal(dossier.tokens[0]?.lastSeenAt,null);
});
test('wallet dossier labels block-proximate entry and exit without inventing timestamps',()=>{
 const buy=event('a','buy',0,{at:null as never,blockNumber:'11'}),sell=event('a','sell',0,{at:null as never,blockNumber:'20'});
 const dossier=buildWalletDossier(address,[{state:state('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100_000),events:[buy,sell]}]);
 assert.equal(dossier.tokens[0]?.earlyEntry,true);assert.equal(dossier.tokens[0]?.fastExit,true);
});

test('wallet dossier includes creator fee and deployer roles even without a direct wallet event',()=>{
 const historyState=state('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100_000);
 historyState.profile.creatorFeeRecipient=address;
 const fee=event('a','FeesSwept',0,{at:null as never,initiator:null,actor:null,recipient:null,details:{creatorAmount:'42'}});
 const dossier=buildWalletDossier(address,[{state:historyState,events:[fee]}]);
 assert.equal(dossier.tokens.length,1);
 assert.deepEqual(dossier.tokens[0]?.roles,['fee recipient']);
 assert.equal(dossier.tokens[0]?.creatorRevenue,'42');
 assert.equal(dossier.summary.feeTokens,1);
 assert.equal(dossier.score.value,0);
 assert.ok(dossier.assessment.labels.includes('creator fee recipient'));
});

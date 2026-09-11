import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreToken,scoreWallet} from '../src/scoring.js';
import type {HistoryState,TokenEvent} from '../src/token-history.js';

const address=(digit:string)=>`0x${digit.repeat(40)}`;
const token=address('a'),deployer=address('b');
const state=(overrides:Partial<HistoryState['profile']>={},cursor='110'):HistoryState=>({
 profile:{token,name:'Token',symbol:'TKN',decimals:18,curve:address('c'),deployer,pairToken:address('0'),phase:0,birthBlock:'10',birthAt:0,head:'110',poolId:null,poolManager:address('d'),totalSupply:'1000',deployerBalance:'50',creatorTaxBps:0,metadata:null,metadataError:null,...overrides},
 cursor,status:cursor==='110'?'ready':'indexing',error:null,updatedAt:1,
});
const trade=(index:number):TokenEvent=>({id:String(index),kind:'buy',venue:'curve',blockNumber:String(11+index),blockHash:'0xabc',txHash:'0xdef',logIndex:index,at:null,initiator:address(String((index%8)+1)),actor:address(String((index%8)+1)),recipient:address(String((index%8)+1)),tokens:'1',quote:'1'});

test('token score exposes its evidence components and rewards complete broad evidence',()=>{
 const score=scoreToken(state(),Array.from({length:60},(_,index)=>trade(index)));
 assert.equal(score.value,90);
 assert.equal(score.confidence,'high');
 assert.deepEqual(score.components.map(component=>component.label),['INDEX COVERAGE','PARTICIPANT BREADTH','ACTIVITY DEPTH','DEPLOYER EXPOSURE']);
 assert.match(score.caveat,/not investment safety/i);
});

test('token score falls when the index is partial and deployer exposure is high',()=>{
 const score=scoreToken(state({deployerBalance:'900'},'20'),[trade(0)]);
 assert.ok(score.value<35);
 assert.equal(score.confidence,'low');
 assert.match(score.components[3]!.evidence,/90\.00%/);
});

test('wallet score measures repeated observed behavior without claiming profit or skill',()=>{
 const score=scoreWallet({matchedTokens:8,readyMatchedTokens:8,events:80,earlyEntries:4,roundTrips:6});
 assert.equal(score.value,82);
 assert.equal(score.confidence,'high');
 assert.match(score.caveat,/not profit or skill/i);
});

test('wallet score stays low-confidence when only one local token is known',()=>{
 const score=scoreWallet({matchedTokens:1,readyMatchedTokens:1,events:4,earlyEntries:1,roundTrips:0});
 assert.equal(score.confidence,'low');
 assert.ok(score.value<50);
});

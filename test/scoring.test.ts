import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreToken,scoreWallet} from '../src/scoring.js';
import type {HistoryState,TokenEvent} from '../src/token-history.js';

const address=(digit:string)=>`0x${digit.repeat(40)}`;
const numberedAddress=(value:number)=>`0x${value.toString(16).padStart(40,'0')}`;
const token=address('a'),deployer=address('b');
const state=(overrides:Partial<HistoryState['profile']>={},cursor='110'):HistoryState=>({
 profile:{token,name:'Token',symbol:'TKN',decimals:18,curve:address('c'),deployer,pairToken:address('0'),phase:0,birthBlock:'10',birthAt:0,head:'110',poolId:null,poolManager:address('d'),totalSupply:'1000',deployerBalance:'50',creatorTaxBps:0,metadata:null,metadataError:null,...overrides},
 cursor,status:cursor==='110'?'ready':'indexing',error:null,updatedAt:1,
});
const trade=(index:number,kind='buy'):TokenEvent=>({id:`${kind}-${index}`,kind,venue:'curve',blockNumber:String(11+index),blockHash:'0xabc',txHash:'0xdef',logIndex:index,at:null,initiator:numberedAddress(index+1),actor:numberedAddress(index+1),recipient:numberedAddress(index+1),tokens:'1',quote:'1'});
const transfer=(index:number):TokenEvent=>({id:`transfer-${index}`,kind:'Transfer',venue:'token',blockNumber:String(11+index),blockHash:'0xabc',txHash:'0xdef',logIndex:index,at:null,initiator:null,actor:address('c'),recipient:numberedAddress(index+100),tokens:'1',quote:null});

test('token score measures token signals without awarding points for index coverage',()=>{
 const trades=Array.from({length:30},(_,index)=>[trade(index,'buy'),trade(index,'sell')]).flat();
 const score=scoreToken(state({deployerBalance:'50',creatorTaxBps:0}),[...trades,...Array.from({length:30},(_,index)=>transfer(index))]);
 assert.equal(score.value,95);
 assert.equal(score.confidence,'high');
 assert.deepEqual(score.components.map(component=>component.label),['DEPLOYER EXPOSURE','CREATOR TAX','PARTICIPANT BREADTH','TWO-SIDED MARKET','HOLDER BREADTH']);
 assert.match(score.caveat,/not investment advice/i);
});

test('unfinished token index withholds the score instead of presenting a misleading partial number',()=>{
 const score=scoreToken(state({deployerBalance:'900'},'20'),[trade(0)]);
 assert.equal(score.value,null);
 assert.equal(score.confidence,'low');
 assert.equal(score.status,'calibrating');
 assert.ok(score.progress>0&&score.progress<100);
 assert.deepEqual(score.components,[]);
 assert.match(score.caveat,/withheld/i);
});

test('a sparse new token cannot receive a perfect score just because indexing finished quickly',()=>{
 const score=scoreToken(state({deployerBalance:'0',creatorTaxBps:0}),[trade(0),transfer(0)]);
 assert.ok(score.value!==null&&score.value<=55);
 assert.equal(score.confidence,'low');
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
 assert.ok(score.value!==null&&score.value<50);
});

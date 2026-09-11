import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRelationshipGraph} from '../src/relationship-graph.js';
import type {TokenEvent,TokenProfile} from '../src/token-history.js';

const token='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const deployer='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const buyer='0x1111111111111111111111111111111111111111';
const recipient='0x2222222222222222222222222222222222222222';
const poolCaller='0x3333333333333333333333333333333333333333';
const profile:TokenProfile={token,name:'Token',symbol:'TKN',decimals:18,curve:'0x4444444444444444444444444444444444444444',deployer,pairToken:'0x0000000000000000000000000000000000000000',phase:2,birthBlock:'10',birthAt:0,head:'100',poolId:'0xpool',poolManager:'0x5555555555555555555555555555555555555555',totalSupply:'1000',deployerBalance:'0',creatorTaxBps:0,metadata:null,metadataError:null};
const event=(kind:string,blockNumber:string,overrides:Partial<TokenEvent>={}):TokenEvent=>({id:`${kind}-${blockNumber}`,kind,venue:'curve',blockNumber,blockHash:'0xblock',txHash:`0x${blockNumber.padStart(64,'0')}`,logIndex:0,at:null,initiator:buyer,actor:buyer,recipient:buyer,tokens:'10',quote:'1',...overrides});

test('relationship graph aggregates evidenced address roles and repeated interactions',()=>{
 const graph=buildRelationshipGraph(profile,[event('buy','11'),event('buy','12'),event('sell','20'),event('Transfer','21',{venue:'token',initiator:null,actor:buyer,recipient}),event('buy','30',{venue:'pool',initiator:null,actor:poolCaller,recipient:null})]);
 assert.deepEqual(graph.nodes.find(node=>node.address===deployer)?.roles,['deployer']);
 assert.ok(graph.nodes.find(node=>node.address===buyer)?.roles.includes('curve participant'));
 assert.ok(graph.nodes.find(node=>node.address===recipient)?.roles.includes('transfer recipient'));
 assert.deepEqual(graph.nodes.find(node=>node.address===poolCaller)?.roles,['pool caller']);
 const buys=graph.edges.find(edge=>edge.from===token&&edge.to===buyer&&edge.kind==='curve buy');
 assert.equal(buys?.count,2);assert.equal(buys?.firstBlock,'11');assert.equal(buys?.lastBlock,'12');
 assert.equal(graph.edges[0]?.kind,'curve buy');
 assert.equal(graph.edges.find(edge=>edge.from===poolCaller)?.attribution,'pool caller only');
 assert.deepEqual(graph.edges.find(edge=>edge.kind==='launch')?.transactions,[]);
 assert.equal(graph.summary.unattributedPoolCalls,1);
});

test('trade flow points token to buyer and seller to token',()=>{
 const graph=buildRelationshipGraph(profile,[event('buy','11'),event('sell','20')]);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve buy')?.from,token);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve buy')?.to,buyer);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve sell')?.from,buyer);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve sell')?.to,token);
});

test('holder balances come only from transfer evidence',()=>{
 const zero='0x0000000000000000000000000000000000000000';
 const graph=buildRelationshipGraph(profile,[
  event('Transfer','11',{venue:'token',initiator:null,actor:zero,recipient:buyer,tokens:'100'}),
  event('Transfer','12',{venue:'token',initiator:null,actor:buyer,recipient,tokens:'40'}),
 ],{complete:false});
 assert.equal(graph.nodes.find(node=>node.address===buyer)?.balance,'60');
 assert.equal(graph.nodes.find(node=>node.address===recipient)?.balance,'40');
 assert.equal(graph.nodes.find(node=>node.address===buyer)?.shareBps,600);
 assert.equal(graph.summary.holdersComplete,false);
});

test('holder reconstruction accepts transfer values from existing persisted histories',()=>{
 const zero='0x0000000000000000000000000000000000000000';
 const graph=buildRelationshipGraph(profile,[
  event('Transfer','11',{venue:'token',initiator:null,actor:zero,recipient:buyer,tokens:null,details:{value:'75'}}),
 ]);
 assert.equal(graph.nodes.find(node=>node.address===buyer)?.balance,'75');
});

test('relationship graph keeps transfer direction and does not invent an actor',()=>{
 const graph=buildRelationshipGraph(profile,[event('Transfer','21',{venue:'token',initiator:null,actor:buyer,recipient}),event('Transfer','22',{venue:'token',initiator:null,actor:null,recipient})]);
 const transfer=graph.edges.find(edge=>edge.kind==='transfer');
 assert.equal(transfer?.from,buyer);assert.equal(transfer?.to,recipient);assert.equal(transfer?.count,1);
 assert.equal(graph.edges.some(edge=>edge.firstBlock==='22'),false);
});

test('relationship graph bounds large histories while retaining token and deployer',()=>{
 const events=Array.from({length:20},(_,index)=>event('buy',String(20+index),{initiator:`0x${(index+10).toString(16).padStart(40,'0')}`,actor:`0x${(index+10).toString(16).padStart(40,'0')}`}));
 const graph=buildRelationshipGraph(profile,events,{maxNodes:6,maxEdges:5});
 assert.equal(graph.nodes.length,6);assert.ok(graph.nodes.some(node=>node.address===token));assert.ok(graph.nodes.some(node=>node.address===deployer));assert.ok(graph.edges.length<=5);assert.equal(graph.summary.truncated,true);
});

test('bounded graph preserves evidence for every investigation mode',()=>{
 const transfers=Array.from({length:12},(_,index)=>event('Transfer',String(30+index),{venue:'token',initiator:null,actor:`0x${(index+10).toString(16).padStart(40,'0')}`,recipient:`0x${(index+30).toString(16).padStart(40,'0')}`}));
 const graph=buildRelationshipGraph(profile,[event('buy','11'),...transfers,event('buy','50',{venue:'pool',initiator:null,actor:poolCaller,recipient:null})],{maxNodes:8,maxEdges:5});
 assert.ok(graph.nodes.some(node=>node.address===buyer));
 assert.ok(graph.edges.some(edge=>edge.kind==='curve buy'));
 assert.ok(graph.edges.some(edge=>edge.kind==='transfer'));
 assert.ok(graph.edges.some(edge=>edge.kind==='pool call'));
});

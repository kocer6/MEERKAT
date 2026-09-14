import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreLaunchQuality,scoreRadarStrength,scoreWalletReputation} from '../src/radar/scores.js';

const subject='0x0000000000000000000000000000000000000011';

test('withholds launch quality below sixty known weight',()=>{
 const score=scoreLaunchQuality({subject,asOfBlock:'100',historyMaturity:0.2,deployerOutcomes:null,deployerExposure:null,holderBreadth:null,creatorConfig:80,earlyMarket:null,metadata:100});
 assert.equal(score.value,null);
 assert.ok(score.unknownInputs.includes('deployerOutcomes'));
 assert.equal(score.confidence,'provisional');
});

test('metadata cannot contribute more than five launch points',()=>{
 const score=scoreLaunchQuality({subject,asOfBlock:'100',historyMaturity:1,deployerOutcomes:0,deployerExposure:0,holderBreadth:0,creatorConfig:0,earlyMarket:0,metadata:100});
 assert.equal(score.value,5);
});

test('shrinks a small wallet sample toward fifty',()=>{
 const score=scoreWalletReputation({subject,asOfBlock:'100',completed:2,coverage:1,outcomeQuality:100,profitQuality:100,repeatability:100,earlyEntry:100,exitBehavior:100,coverageIntegrity:100});
 assert.equal(score.confidence,'provisional');
 assert.ok(score.value!==null&&score.value>50&&score.value<100);
});

test('wallet confidence reaches medium at eight and high at twenty complete positions',()=>{
 const base={subject,asOfBlock:'100',coverage:1,outcomeQuality:70,profitQuality:70,repeatability:70,earlyEntry:70,exitBehavior:70,coverageIntegrity:100};
 assert.equal(scoreWalletReputation({...base,completed:8}).confidence,'medium');
 assert.equal(scoreWalletReputation({...base,completed:20}).confidence,'high');
});

test('risk evidence subtracts no more than twenty five radar points',()=>{
 const score=scoreRadarStrength({subject,asOfBlock:'100',verified:true,recentMarketIndexed:true,nonInfrastructureEvents:10,qualifiedConviction:90,qualifiedBreadth:90,flowAcceleration:90,netBuyPressure:90,freshness:90,launchQuality:90,holderRetention:90,riskPenalty:40});
 assert.equal(score.value,65);
});

test('radar strength is withheld without enough attributed flow',()=>{
 const score=scoreRadarStrength({subject,asOfBlock:'100',verified:true,recentMarketIndexed:true,nonInfrastructureEvents:2,qualifiedConviction:90,qualifiedBreadth:90,flowAcceleration:90,netBuyPressure:90,freshness:90,launchQuality:90,holderRetention:90,riskPenalty:0});
 assert.equal(score.value,null);
 assert.ok(score.unknownInputs.includes('nonInfrastructureEvents'));
});

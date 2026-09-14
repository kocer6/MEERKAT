import type {ScoreComponent,ScoreConfidence,ScoreSnapshot} from './types.js';

interface CommonFacts {subject:string;asOfBlock:string}
export interface LaunchQualityFacts extends CommonFacts {
 historyMaturity:number;
 deployerOutcomes:number|null;
 deployerExposure:number|null;
 holderBreadth:number|null;
 creatorConfig:number|null;
 earlyMarket:number|null;
 metadata:number|null;
}
export interface WalletReputationFacts extends CommonFacts {
 completed:number;
 coverage:number;
 outcomeQuality:number|null;
 profitQuality:number|null;
 repeatability:number|null;
 earlyEntry:number|null;
 exitBehavior:number|null;
 coverageIntegrity:number|null;
}
export interface RadarStrengthFacts extends CommonFacts {
 verified:boolean;
 recentMarketIndexed:boolean;
 nonInfrastructureEvents:number;
 qualifiedConviction:number|null;
 qualifiedBreadth:number|null;
 flowAcceleration:number|null;
 netBuyPressure:number|null;
 freshness:number|null;
 launchQuality:number|null;
 holderRetention:number|null;
 riskPenalty:number;
}

const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const component=(key:string,weight:number,value:number|null):ScoreComponent=>({key,weight,value:value===null?null:clamp(value),known:value!==null,evidence:value===null?`${key} is not indexed`:`${key} contributes ${Math.round(clamp(value))}/100`});
const confidenceLabel=(confidence:number,provisional=false):ScoreConfidence=>provisional?'provisional':confidence>=.8?'high':confidence>=.35?'medium':'low';
function weighted(components:ScoreComponent[],minimumKnownWeight:number){const known=components.filter(row=>row.known&&row.value!==null),knownWeight=known.reduce((sum,row)=>sum+row.weight,0);if(knownWeight<minimumKnownWeight)return {value:null,knownWeight};const value=Math.round(known.reduce((sum,row)=>sum+row.value!*row.weight,0)/knownWeight);return {value:clamp(value),knownWeight};}
const unknown=(components:ScoreComponent[])=>components.filter(row=>!row.known).map(row=>row.key);
const snapshot=(input:{subject:string;kind:ScoreSnapshot['kind'];value:number|null;confidence:ScoreConfidence;modelVersion:string;asOfBlock:string;components:ScoreComponent[];unknownInputs:string[];explanation:string}):ScoreSnapshot=>({...input,computedAt:Date.now()});

export function scoreLaunchQuality(facts:LaunchQualityFacts):ScoreSnapshot{
 const components=[component('deployerOutcomes',25,facts.deployerOutcomes),component('deployerExposure',20,facts.deployerExposure),component('holderBreadth',20,facts.holderBreadth),component('creatorConfig',15,facts.creatorConfig),component('earlyMarket',15,facts.earlyMarket),component('metadata',5,facts.metadata)],result=weighted(components,60),confidence=result.knownWeight/100*clamp(facts.historyMaturity)/100;
 return snapshot({subject:facts.subject,kind:'launch-quality',value:result.value,confidence:confidenceLabel(confidence,result.value===null),modelVersion:'launch-quality-v1',asOfBlock:facts.asOfBlock,components,unknownInputs:unknown(components),explanation:result.value===null?`Profiling: ${result.knownWeight}% of launch evidence is known; 60% is required.`:`Launch setup scores ${result.value}/100 from ${result.knownWeight}% known evidence.`});
}

export function scoreWalletReputation(facts:WalletReputationFacts):ScoreSnapshot{
 const components=[component('outcomeQuality',30,facts.outcomeQuality),component('profitQuality',20,facts.profitQuality),component('repeatability',20,facts.repeatability),component('earlyEntry',10,facts.earlyEntry),component('exitBehavior',10,facts.exitBehavior),component('coverageIntegrity',10,facts.coverageIntegrity)],result=weighted(components,60),sample=Math.min(1,facts.completed/20),confidence=sample*clamp(facts.coverage*100)/100,displayed=result.value===null?null:Math.round(50*(1-confidence)+result.value*confidence),provisional=facts.completed<3;
 return snapshot({subject:facts.subject,kind:'wallet-reputation',value:displayed,confidence:confidenceLabel(confidence,provisional),modelVersion:'wallet-reputation-v1',asOfBlock:facts.asOfBlock,components,unknownInputs:unknown(components),explanation:displayed===null?'Insufficient attributed wallet evidence.':`${facts.completed} completed positions produce ${displayed}/100 after sample-confidence shrinkage.`});
}

export function scoreRadarStrength(facts:RadarStrengthFacts):ScoreSnapshot{
 const components=[component('qualifiedConviction',30,facts.qualifiedConviction),component('qualifiedBreadth',15,facts.qualifiedBreadth),component('flowAcceleration',15,facts.flowAcceleration),component('netBuyPressure',10,facts.netBuyPressure),component('freshness',10,facts.freshness),component('launchQuality',15,facts.launchQuality),component('holderRetention',5,facts.holderRetention)],result=weighted(components,60),gated=!facts.verified||!facts.recentMarketIndexed||facts.nonInfrastructureEvents<5,penalty=Math.min(25,Math.max(0,facts.riskPenalty)),value=gated||result.value===null?null:clamp(result.value-penalty),missing=unknown(components);
 if(!facts.verified)missing.push('verifiedToken');if(!facts.recentMarketIndexed)missing.push('recentMarketWindow');if(facts.nonInfrastructureEvents<5)missing.push('nonInfrastructureEvents');
 const confidence=Math.min(1,result.knownWeight/100)*Math.min(1,facts.nonInfrastructureEvents/20);
 return snapshot({subject:facts.subject,kind:'radar-strength',value,confidence:confidenceLabel(confidence,value===null),modelVersion:'radar-strength-v1',asOfBlock:facts.asOfBlock,components,unknownInputs:[...new Set(missing)],explanation:value===null?'Tracking: more verified market evidence is required.':`Current evidence scores ${value}/100 after a ${penalty}-point verified risk penalty.`});
}

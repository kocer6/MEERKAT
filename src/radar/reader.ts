import {createPublicClient,fallback,http,parseAbi,type Address} from 'viem';
import {curveBuyEvent,curveSellEvent,factory,factoryAbi,launched} from '../chain/abi.js';
import {curveSell} from '../chain/quotes.js';
import type {RadarEvent,RadarLaunch,RadarProfile} from './types.js';

const zero='0x0000000000000000000000000000000000000000';
const tokenAbi=parseAbi([
 'function name() view returns(string)',
 'function symbol() view returns(string)',
 'function decimals() view returns(uint8)',
 'function totalSupply() view returns(uint256)',
 'function balanceOf(address) view returns(uint256)',
 'struct Socials {string twitter;string telegram;string discord;string website;string farcaster;}',
 'function getTokenInfo() view returns(address tokenDeployer,string tokenLogo,string tokenDescription,Socials tokenSocials)',
]);
const curveAbi=parseAbi([
 'function getReserves() view returns (uint256,uint256)',
 'function realQuoteReserve() view returns (uint256)',
 'function sellableTokens() view returns (uint256)',
 'function feeBps() view returns (uint256)',
 'function creatorTaxBps() view returns (uint256)',
 'function graduated() view returns (bool)',
 'function readyToGraduate() view returns (bool)',
]);

export interface RadarReader {
 chainId():Promise<number>;
 head():Promise<bigint>;
 block(number:bigint):Promise<{number:bigint;hash:string;timestamp:bigint}>;
 factoryDeployment():Promise<bigint>;
 launches(from:bigint,to:bigint):Promise<RadarLaunch[]>;
 trades(from:bigint,to:bigint):Promise<RadarEvent[]>;
 profile(token:string,block:bigint):Promise<RadarProfile>;
 quoteSell(token:string,amount:bigint,block:bigint):Promise<bigint|null>;
}

export async function factoryIndexFloor(head:bigint,readCode:(block:bigint)=>Promise<string|undefined>,configured=0n){
 const code=await readCode(head);
 if(!code||code==='0x')throw new Error('Pons V2 factory has no deployed code');
 if(configured<0n||configured>head)throw new Error('Radar start block is outside the current chain');
 return configured;
}

export function radarRpcUrls(env:Record<string,string|undefined>=process.env){
 const raw=env.MEERKAT_RPC_URLS?.split(',').map(value=>value.trim()).filter(Boolean)??[],single=env.MEERKAT_RPC_URL?.trim();if(single)raw.push(single);if(!raw.length)raw.push('https://rpc.mainnet.chain.robinhood.com');
 const urls=[...new Set(raw)];for(const value of urls){const parsed=new URL(value);if(!['http:','https:'].includes(parsed.protocol))throw new Error('RPC must use http or https');}return urls;
}

export const radarHttpTransport=(url:string)=>http(url,{batch:{batchSize:100,wait:10},timeout:15000,retryCount:1});

export function radarReader(rpcUrls:string|string[]=radarRpcUrls()):RadarReader{
 const urls=Array.isArray(rpcUrls)?rpcUrls:[rpcUrls];for(const value of urls){const parsed=new URL(value);if(!['http:','https:'].includes(parsed.protocol))throw new Error('RPC must use http or https');}
 const transports=urls.map(radarHttpTransport),transport=transports.length===1?transports[0]!:fallback(transports,{rank:true,retryCount:1});
 const client=createPublicClient({transport});
 const getRecord=(token:string,blockNumber:bigint)=>client.readContract({address:factory,abi:factoryAbi,functionName:'getLaunchedToken',args:[token as Address],blockNumber});
 const configuredFloor=process.env.MEERKAT_RADAR_START_BLOCK&&/^\d+$/.test(process.env.MEERKAT_RADAR_START_BLOCK)?BigInt(process.env.MEERKAT_RADAR_START_BLOCK):0n;
 return {
  chainId:()=>client.getChainId(),
  head:()=>client.getBlockNumber({cacheTime:0}),
  block:async number=>{const block=await client.getBlock({blockNumber:number});if(!block.hash)throw new Error('Block hash unavailable');return {number:block.number,hash:block.hash,timestamp:block.timestamp};},
  factoryDeployment:async()=>{const head=await client.getBlockNumber({cacheTime:0});return factoryIndexFloor(head,block=>client.getBytecode({address:factory,blockNumber:block}),configuredFloor);},
  launches:async(fromBlock,toBlock)=>{
   const logs=await client.getLogs({address:factory,event:launched,fromBlock,toBlock,strict:true});
   return logs.filter(log=>!log.removed&&log.blockNumber!==null&&log.blockHash!==null&&log.transactionHash!==null&&log.logIndex!==null).map(log=>({
    token:log.args.token.toLowerCase(),curve:log.args.curve.toLowerCase(),deployer:log.args.deployer.toLowerCase(),pairToken:log.args.pairToken.toLowerCase(),
    launchBlock:log.blockNumber!.toString(),blockHash:log.blockHash!,txHash:log.transactionHash!,logIndex:log.logIndex!,state:'discovered' as const,profile:null,profileError:null,updatedAt:Date.now(),
   }));
  },
  trades:async(fromBlock,toBlock)=>{
   const logs=await client.getLogs({events:[curveBuyEvent,curveSellEvent],fromBlock,toBlock,strict:true});
   return logs.filter(log=>!log.removed&&log.blockNumber!==null&&log.blockHash!==null&&log.transactionHash!==null&&log.logIndex!==null).map(log=>{
    const common={id:`${log.blockHash}:${log.transactionHash}:${log.logIndex}`,token:'',curve:log.address.toLowerCase(),blockNumber:log.blockNumber!.toString(),blockHash:log.blockHash!,txHash:log.transactionHash!,logIndex:log.logIndex!,at:null,complete:true};
    if(log.eventName==='CurveBuy')return {...common,wallet:log.args.buyer.toLowerCase(),kind:'buy' as const,tokens:log.args.tokensOut.toString(),quote:log.args.quoteIn.toString()};
    return {...common,wallet:log.args.seller.toLowerCase(),kind:'sell' as const,tokens:log.args.tokensIn.toString(),quote:log.args.quoteOut.toString()};
   });
  },
  profile:async(token,blockNumber)=>{
   const address=token as Address,record=await getRecord(token,blockNumber);if(!record.exists)throw new Error('Token is not registered in Pons V2');
   const c={address,abi:tokenAbi,blockNumber};
   const [name,symbol,decimals,totalSupply,deployerBalance,metadata]=await Promise.all([
    client.readContract({...c,functionName:'name'}),client.readContract({...c,functionName:'symbol'}),client.readContract({...c,functionName:'decimals'}),client.readContract({...c,functionName:'totalSupply'}),client.readContract({...c,functionName:'balanceOf',args:[record.deployer]}),client.readContract({...c,functionName:'getTokenInfo'}).then(()=>true).catch(()=>false),
   ]);
   return {name,symbol,decimals,phase:record.phase,creatorTaxBps:record.creatorTaxBps,creatorFeeRecipient:record.creatorFeeRecipient.toLowerCase(),totalSupply:totalSupply.toString(),deployerBalance:deployerBalance.toString(),holderCount:null,metadataComplete:metadata,profiledAtBlock:blockNumber.toString(),profiledAt:Date.now()};
  },
  quoteSell:async(token,amount,blockNumber)=>{
   if(amount<=0n)return null;const record=await getRecord(token,blockNumber);if(!record.exists||record.phase!==0||record.pairToken.toLowerCase()!==zero)return null;
   const c={address:record.curve,abi:curveAbi,blockNumber};
   const [reserves,realQuoteReserve,sellableTokens,feeBps,creatorTaxBps,graduated,readyToGraduate]=await Promise.all([
    client.readContract({...c,functionName:'getReserves'}),client.readContract({...c,functionName:'realQuoteReserve'}),client.readContract({...c,functionName:'sellableTokens'}),client.readContract({...c,functionName:'feeBps'}),client.readContract({...c,functionName:'creatorTaxBps'}),client.readContract({...c,functionName:'graduated'}),client.readContract({...c,functionName:'readyToGraduate'}),
   ]);
   try{return curveSell({quoteReserve:reserves[0],tokenReserve:reserves[1],realQuoteReserve,sellableTokens,feeBps,creatorTaxBps,openingTaxBps:null,graduated,readyToGraduate},amount);}catch{return null;}
  },
 };
}

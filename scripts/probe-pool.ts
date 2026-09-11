import {createPublicClient,http,parseAbiItem} from 'viem';
import {marketReader,inspectToken} from '../src/chain/market.js';
import {factory} from '../src/chain/abi.js';
import {writeFileSync} from 'node:fs';
const client=createPublicClient({transport:http(process.env.MEERKAT_RPC_URL??'https://rpc.mainnet.chain.robinhood.com',{timeout:12000,retryCount:1})});
const head=await client.getBlockNumber();
const logs=await client.getLogs({address:factory,event:parseAbiItem('event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)'),fromBlock:head-200000n,toBlock:head});
const reader=marketReader();let found=false;
for(const log of logs.reverse().slice(0,25)){
 if(!log.args.token)continue;
 const r=await reader.record(log.args.token,head);
 if(r.phase!==2 || r.pairToken!=='0x0000000000000000000000000000000000000000')continue;
 const q=await inspectToken(reader,log.args.token,1n,10n**18n);
 const evidence={checkedAt:new Date().toISOString(),quantity:'1000000000000000000',...q};
 writeFileSync('docs/evidence/pool-quote-2026-09-11.json',JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
 console.log(JSON.stringify({token:q.token,block:q.blockNumber,ethOut:q.sellBackWei?.toString(),reasons:q.reasons}));found=true;break;
}
if(!found)throw new Error('No native ETH graduated pool found in recent bounded window');

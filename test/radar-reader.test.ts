import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {createPublicClient,decodeFunctionData,encodeFunctionResult,multicall3Abi,parseAbi} from 'viem';
import {factoryAbi} from '../src/chain/abi.js';
import {radarReader} from '../src/radar/reader.js';
import type {RadarLaunch} from '../src/radar/types.js';

test('factory bootstrap checks current code without reading unavailable archive state',async()=>{
 const module=await import('../src/radar/reader.js') as unknown as {factoryIndexFloor?:(head:bigint,readCode:(block:bigint)=>Promise<string>,configured?:bigint)=>Promise<bigint>};
 assert.equal(typeof module.factoryIndexFloor,'function');
 const calls:bigint[]=[];
 const floor=await module.factoryIndexFloor!(62895509n,async block=>{calls.push(block);if(block!==62895509n)throw new Error('metadata is not found');return '0x6000';},59200000n);
 assert.equal(floor,59200000n);
 assert.deepEqual(calls,[62895509n]);
});

test('RPC pool parsing preserves order and removes duplicates',async()=>{
 const module=await import('../src/radar/reader.js') as unknown as {radarRpcUrls?:(env:Record<string,string|undefined>)=>string[]};
 assert.equal(typeof module.radarRpcUrls,'function');
 assert.deepEqual(module.radarRpcUrls!({MEERKAT_RPC_URL:'https://one.example',MEERKAT_RPC_URLS:'https://two.example, https://one.example'}),['https://two.example','https://one.example']);
 assert.throws(()=>module.radarRpcUrls!({MEERKAT_RPC_URLS:'file:///tmp/rpc'}),/http or https/);
});

test('Radar transport batches concurrent RPC reads into one request',async()=>{
 const module=await import('../src/radar/reader.js') as unknown as {radarHttpTransport?:(url:string)=>ReturnType<typeof import('viem').http>};
 assert.equal(typeof module.radarHttpTransport,'function');let requests=0,wasBatch=false;
 const server=createServer(async(req,res)=>{requests++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);const body=JSON.parse(Buffer.concat(chunks).toString()) as Array<{id:number;method:string}>;wasBatch=Array.isArray(body);res.setHeader('content-type','application/json');res.end(JSON.stringify(body.map(call=>({jsonrpc:'2.0',id:call.id,result:call.method==='eth_chainId'?'0x1237':'0x64'}))));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test address');
 try{const client=createPublicClient({transport:module.radarHttpTransport!(`http://127.0.0.1:${address.port}`)});const [chain,block]=await Promise.all([client.getChainId(),client.getBlockNumber({cacheTime:0})]);assert.equal(chain,4663);assert.equal(block,100n);assert.equal(wasBatch,true);assert.equal(requests,1);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});


test('profile multicall uses one block-pinned RPC and isolates a reverted token',async()=>{
 const tokenAbi=parseAbi(['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)']);
 const rows=Array.from({length:3},(_,i)=>({token:`0x${(100+i).toString(16).padStart(40,'0')}`,curve:`0x${(200+i).toString(16).padStart(40,'0')}`,deployer:`0x${(300+i).toString(16).padStart(40,'0')}`,pairToken:'0x0000000000000000000000000000000000000000',launchBlock:'1',blockHash:'0x1',txHash:'0x1',logIndex:i,state:'discovered',profile:null,profileError:null,updatedAt:1} as RadarLaunch));
 let rpcCalls=0;
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);const body=JSON.parse(Buffer.concat(chunks).toString());
  const response=(Array.isArray(body)?body:[body]).map((call:{id:number;method:string;params:Array<any>})=>{
   rpcCalls++;assert.equal(call.method,'eth_call');assert.equal(call.params[1],'0x64');assert.equal(call.params[0].to.toLowerCase(),'0xca11bde05977b3631167028862be2a173976ca11');
   const decoded=decodeFunctionData({abi:multicall3Abi,data:call.params[0].data});assert.equal(decoded.functionName,'aggregate3');
   const calls=decoded.args![0] as ReadonlyArray<{target:string;callData:`0x${string}`}>;assert.equal(calls.length,21);
   const result=calls.map((inner,index)=>{
    const row=rows[Math.floor(index/7)]!,field=index%7;
    if(field===6||(Math.floor(index/7)===1&&field===1))return {success:false,returnData:'0x' as const};
    if(field===0)return {success:true,returnData:encodeFunctionResult({abi:factoryAbi,functionName:'getLaunchedToken',result:{token:row.token as `0x${string}`,curve:row.curve as `0x${string}`,deployer:row.deployer as `0x${string}`,creatorFeeRecipient:row.deployer as `0x${string}`,pairToken:row.pairToken as `0x${string}`,graduationThreshold:1n,poolFee:0,tickSpacing:0,creatorTaxBps:100,buybackEnabled:false,phase:0,sweptQuote:0n,sweptTokens:0n,sweptAt:0n,exists:true}})};
    const fn=['','name','symbol','decimals','totalSupply','balanceOf'][field] as 'name';
    return {success:true,returnData:encodeFunctionResult({abi:tokenAbi,functionName:fn,result:(field===1?'Example':field===2?'EX':field===3?18:field===4?1000n:10n) as string})};
   });
   return {jsonrpc:'2.0',id:call.id,result:encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result})};
  });res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(body)?response:response[0]));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing address');
 try{
  const result=await radarReader(`http://127.0.0.1:${address.port}`).profiles!(rows,100n);
  assert.equal(rpcCalls,1);assert.ok(result.get(rows[1]!.token) instanceof Error);
  for(const row of [rows[0]!,rows[2]!]){const profile=result.get(row.token);assert.ok(profile&&!(profile instanceof Error));assert.equal(profile.symbol,'EX');assert.equal(profile.metadataComplete,false);assert.equal(profile.profiledAtBlock,'100');assert.equal(profile.deployerBalance,'10');}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

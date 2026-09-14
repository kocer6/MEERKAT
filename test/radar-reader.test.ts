import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {createPublicClient} from 'viem';

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

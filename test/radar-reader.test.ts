import assert from 'node:assert/strict';
import test from 'node:test';

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

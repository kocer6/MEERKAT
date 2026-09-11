import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PonsDiscovery, type DiscoveryReader, type Launch } from '../src/chain/discovery.js';

const launch: Launch = { token: '0x1111111111111111111111111111111111111111', curve: '0x2222222222222222222222222222222222222222', deployer: '0x3333333333333333333333333333333333333333', pairToken: '0x0000000000000000000000000000000000000000', blockNumber: '5000', blockHash: '0xabc', txHash: '0xdef', logIndex: 0 };
const reader = (patch: Partial<DiscoveryReader> = {}): DiscoveryReader => ({ chainId: async () => 4663, head: async () => 5000n, code: async () => '0x1234', logs: async () => [launch, launch], record: async () => ({ exists: true, curve: launch.curve, deployer: launch.deployer, pairToken: launch.pairToken, phase: 0 }), ...patch });

test('SQLite scanner history survives restart and an empty overlap removes an orphan launch',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'meerkat-scanner-'));const file=join(dir,'paper.sqlite');
 try{
  let ledger=new Ledger(file,1n,1n);
  try{await new PonsDiscovery(reader(),{load:()=>ledger.loadDiscovery(),save:s=>ledger.saveDiscovery(s)}).refresh();}finally{ledger.close();}
  ledger=new Ledger(file,1n,1n);
  try{
   const feed=new PonsDiscovery(reader({logs:async()=>[]}),{load:()=>ledger.loadDiscovery(),save:s=>ledger.saveDiscovery(s)});
   assert.equal(feed.snapshot().launches.length,1);assert.equal(feed.snapshot().blockNumber,'5000');
   await feed.refresh();assert.equal(ledger.loadDiscovery()?.launches.length,0);
  }finally{ledger.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('checkpoint write failure retains the previous cursor and history',async()=>{
 let fail=false;let saved:ReturnType<PonsDiscovery['snapshot']>|undefined;
 const feed=new PonsDiscovery(reader(),{load:()=>saved,save:s=>{if(fail)throw new Error('disk full');saved=structuredClone(s);}});
 await feed.refresh();const before=feed.snapshot();fail=true;
 const result=await feed.refresh();assert.equal(result.status,'error');assert.equal(result.blockNumber,before.blockNumber);assert.deepEqual(result.launches,before.launches);assert.equal(saved?.status,'connected');
});

test('discovery checks chain, code and factory ABI; deduplicates real-source launches', async () => {
  const feed = new PonsDiscovery(reader()); const result = await feed.refresh();
  assert.equal(result.source, 'chain'); assert.equal(result.status, 'connected');
  assert.equal(result.launches.length, 1); assert.equal(result.checkedFactoryRecord, true);
  assert.equal(result.launches[0]?.txHash, launch.txHash);
});

test('wrong chain, missing code and mismatched factory record never produce a connected feed', async () => {
  for (const patch of [{ chainId: async () => 1 }, { code: async () => '0x' }, { record: async () => ({ exists: false, curve: launch.curve, deployer: launch.deployer, pairToken: launch.pairToken, phase: 0 }) }]) {
    const result = await new PonsDiscovery(reader(patch)).refresh();
    assert.equal(result.status, 'error'); assert.equal(result.launches.length, 0); assert.ok(result.error);
  }
});

test('RPC failure preserves old observations with stale/error label and no synthetic replacements', async () => {
  let fail = false;
  const feed = new PonsDiscovery(reader({ logs: async () => { if (fail) throw new Error('RPC down'); return [launch]; } }));
  const good = await feed.refresh(); fail = true; const bad = await feed.refresh();
  assert.equal(bad.status, 'error'); assert.equal(bad.observedAt, good.observedAt);
  assert.deepEqual(bad.launches, good.launches); assert.equal(bad.source, 'chain');
});

test('overlapping refresh calls share a single bounded log read', async () => {
  let calls = 0; const feed = new PonsDiscovery(reader({ logs: async (from, to) => { calls++; assert.ok(to - from <= 2000n); return []; } }));
  await Promise.all([feed.refresh(), feed.refresh()]); assert.equal(calls, 1);
});

test('saved scanner cursor resumes bounded backfill and replaces overlap after a reorg',async()=>{
 let saved:any;const store={load:()=>saved,save:(s:any)=>{saved=structuredClone(s);}};
 await new PonsDiscovery(reader(),store).refresh();
 const restored=new PonsDiscovery(reader({head:async()=>9000n,logs:async(from,to)=>{assert.equal(from,4937n);assert.equal(to,6936n);return [{...launch,blockHash:'0xnew'}];}}),store);
 assert.equal(restored.snapshot().status,'idle');assert.equal(restored.snapshot().launches.length,1);
 const result=await restored.refresh();assert.equal(result.blockNumber,'6936');assert.equal(result.headBlock,'9000');assert.equal(result.launches.length,1);assert.equal(result.launches[0]?.blockHash,'0xnew');
 const failed=await new PonsDiscovery(reader({logs:async()=>{throw new Error('down');}}),store).refresh();assert.equal(failed.status,'error');assert.equal(saved.blockNumber,'6936');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PonsDiscovery, type DiscoveryReader, type Launch } from '../src/chain/discovery.js';

const launch: Launch = { token: '0x1111111111111111111111111111111111111111', curve: '0x2222222222222222222222222222222222222222', deployer: '0x3333333333333333333333333333333333333333', pairToken: '0x0000000000000000000000000000000000000000', blockNumber: '5000', blockHash: '0xabc', txHash: '0xdef', logIndex: 0 };
const reader = (patch: Partial<DiscoveryReader> = {}): DiscoveryReader => ({ chainId: async () => 4663, head: async () => 5000n, code: async () => '0x1234', logs: async () => [launch, launch], record: async () => ({ exists: true, curve: launch.curve, deployer: launch.deployer, pairToken: launch.pairToken, phase: 0 }), ...patch });

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

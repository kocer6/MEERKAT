import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectToken, type MarketReader } from '../src/chain/market.js';
const token = '0x1111111111111111111111111111111111111111';
const curve = '0x2222222222222222222222222222222222222222';
const zero = '0x0000000000000000000000000000000000000000';
const reader = (patch: Partial<MarketReader> = {}): MarketReader => ({
  chainId: async () => 4663, block: async () => ({ number: 42n, timestamp: BigInt(Math.floor(Date.now()/1000)) }),
  record: async () => ({ exists: true, curve, pairToken: zero, phase: 0 }),
  metadata: async () => ({ symbol: 'TEST', decimals: 18 }),
  curve: async () => ({ quoteReserve: 10000n, tokenReserve: 1000000n, realQuoteReserve: 5000n, sellableTokens: 800000n, feeBps: 100n, creatorTaxBps: 200n, openingTaxBps: 300n, graduated: false, readyToGraduate: false }), ...patch,
});
test('inspection returns real-source block evidence, tax and amount-dependent quotes', async () => {
  const result = await inspectToken(reader(), token, 1000n);
  assert.equal(result.source, 'chain'); assert.equal(result.blockNumber, '42');
  assert.equal(result.buy?.tokensOut, 85923n); assert.equal(result.openingTaxBps, 300);
});
test('unsupported pair/phase and unknown opening tax return reasons without buy quote', async () => {
  for (const patch of [
    { record: async () => ({ exists: true, curve, pairToken: token, phase: 0 }) },
    { record: async () => ({ exists: true, curve, pairToken: zero, phase: 2 }) },
    { curve: async () => ({ ...await reader().curve(curve, 42n), openingTaxBps: null }) },
  ]) {
    const result = await inspectToken(reader(patch), token, 1000n);
    assert.equal(result.buy, null); assert.ok(result.reasons.length);
  }
});
test('wrong network, old block and failed reserve read fail closed', async () => {
  await assert.rejects(inspectToken(reader({ chainId: async () => 1 }), token, 1000n), /chain/);
  await assert.rejects(inspectToken(reader({ block: async () => ({ number: 42n, timestamp: 1n }) }), token, 1000n), /stale/);
  await assert.rejects(inspectToken(reader({ curve: async () => { throw new Error('reserve read failed'); } }), token, 1000n), /reserve/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveBuy, curveSell, type CurveSnapshot } from '../src/chain/quotes.js';
const state: CurveSnapshot = { quoteReserve: 10000n, tokenReserve: 1000000n, realQuoteReserve: 5000n, sellableTokens: 800000n, feeBps: 100n, creatorTaxBps: 200n, openingTaxBps: 300n, graduated: false, readyToGraduate: false };
test('curve quotes apply integer fees independently on buy and sell', () => {
  assert.deepEqual(curveBuy(state, 1000n), { tokensOut: 85923n, spentWei: 1000n, refundWei: 0n });
  assert.equal(curveSell(state, 100000n), 882n);
});
test('unknown taxes, closed curves, insufficient real liquidity and invalid amounts block quotes', () => {
  assert.throws(() => curveBuy({ ...state, openingTaxBps: null }, 1000n), /unknown/);
  assert.throws(() => curveBuy({ ...state, graduated: true }, 1000n), /closed/);
  assert.throws(() => curveSell({ ...state, realQuoteReserve: 1n }, 100000n), /liquidity/);
  assert.throws(() => curveBuy(state, 0n), /positive/);
  assert.throws(() => curveBuy({ ...state, feeBps: 10001n }, 1000n), /fee/);
});
test('clamped buy refunds excess input and cannot oversell curve allocation', () => {
  const q = curveBuy({ ...state, sellableTokens: 100n }, 1000n);
  assert.equal(q.tokensOut, 100n); assert.ok(q.spentWei < 1000n);
  assert.equal(q.spentWei + q.refundWei, 1000n);
});

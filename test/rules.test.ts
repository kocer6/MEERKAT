import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules, entryReasons } from '../src/rules.js';
import type { Entry } from '../src/types.js';

const token = '0x1111111111111111111111111111111111111111';
const goodEntry: Entry = { token, symbol: 'TEST', amountWei: 100n, score: 80, openingTaxBps: 0, source: 'synthetic' };

test('matched: a fully valid entry has no rejection reasons', () => {
  assert.deepEqual(entryReasons(goodEntry, defaultRules), []);
});

test('rejected: score below the configured minimum threshold', () => {
  const reasons = entryReasons({ ...goodEntry, score: defaultRules.minScore - 1 }, defaultRules);
  assert.deepEqual(reasons, ['score below minimum threshold']);
});

test('rejected: score above 100 is invalid even though it is a finite number', () => {
  const reasons = entryReasons({ ...goodEntry, score: 101 }, defaultRules);
  assert.deepEqual(reasons, ['score exceeds the maximum of 100']);
});

test('unreadable: a non-finite score blocks entry and is distinguished from a low score', () => {
  for (const score of [NaN, Infinity, -Infinity]) {
    const reasons = entryReasons({ ...goodEntry, score }, defaultRules);
    assert.deepEqual(reasons, ['score is unreadable']);
  }
});

test('rejected: opening tax reading is invalid (negative or non-integer)', () => {
  assert.deepEqual(entryReasons({ ...goodEntry, openingTaxBps: -1 }, defaultRules), ['opening tax reading is invalid']);
  assert.deepEqual(entryReasons({ ...goodEntry, openingTaxBps: 12.5 }, defaultRules), ['opening tax reading is invalid']);
});

test('rejected: opening tax exceeds the configured limit', () => {
  const reasons = entryReasons({ ...goodEntry, openingTaxBps: defaultRules.maxTaxBps + 1 }, defaultRules);
  assert.deepEqual(reasons, ['opening tax exceeds limit']);
});

test('unreadable (A1 regression): unknown opening tax blocks an otherwise-perfect entry, never defaults to a passing value', () => {
  // This is the fix for audit finding A1: a failed RPC tax read must not be
  // silently substituted with 0 (or any other value) and let through.
  const reasons = entryReasons({ ...goodEntry, openingTaxBps: null }, defaultRules);
  assert.deepEqual(reasons, ['opening tax unknown']);
});

test('rejected: malformed token address', () => {
  for (const token of ['not-an-address', '0x123', '', '0x' + '1'.repeat(41)]) {
    assert.deepEqual(entryReasons({ ...goodEntry, token }, defaultRules), ['invalid token address']);
  }
});

test('rejected: non-positive amount', () => {
  assert.deepEqual(entryReasons({ ...goodEntry, amountWei: 0n }, defaultRules), ['amount must be positive']);
  assert.deepEqual(entryReasons({ ...goodEntry, amountWei: -1n }, defaultRules), ['amount must be positive']);
});

test('rejected: source outside the known synthetic/chain enum', () => {
  const reasons = entryReasons({ ...goodEntry, source: 'unknown' as Entry['source'] }, defaultRules);
  assert.deepEqual(reasons, ['invalid source']);
});

test('rejected: multiple independent failures are all reported, not just the first one', () => {
  const reasons = entryReasons({
    token: 'bad-token', symbol: 'X', amountWei: 0n, score: 200, openingTaxBps: -5, source: 'unknown' as Entry['source'],
  }, defaultRules);
  assert.deepEqual(reasons, [
    'invalid token address',
    'amount must be positive',
    'score exceeds the maximum of 100',
    'opening tax reading is invalid',
    'invalid source',
  ]);
});

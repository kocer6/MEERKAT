import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.js';
import { PaperEngine } from '../src/paper.js';
import { exitReason, reserveDrop } from '../src/rules.js';

const now = 100000;
const token = '0x1111111111111111111111111111111111111111';
const input = { token, symbol: 'TEST', amountWei: 100n, score: 80, openingTaxBps: 0, source: 'synthetic' as const };
const buyQuote = () => Promise.resolve({ tokensOut: 1000n, spentWei: 100n, gasWei: 0n, observedAt: now, source: 'synthetic' as const });
const rules = { minScore: 60, maxTaxBps: 300, maxPositions: 3, maxGasWei: 0n, quoteMaxAgeMs: 3000, takeProfitBps: 3000, stopLossBps: 2000, trailingBps: 1500, maxHoldMs: 60000 };
const setup = () => { const ledger = new Ledger(':memory:', 1000n, 150n); return { ledger, engine: new PaperEngine(ledger, rules, () => now) }; };

test('unknown tax is rejected before any quote or budget reservation', async () => {
  const { ledger, engine } = setup(); let calls = 0;
  await assert.rejects(engine.buy({ ...input, openingTaxBps: null }, 'unknown', async () => { calls++; return buyQuote(); }), /tax.*unknown/i);
  assert.equal(calls, 0); assert.equal(ledger.account().reservedWei, '0'); ledger.close();
});

test('concurrent entry reserves budget; failed quote releases it', async () => {
  const { ledger, engine } = setup();
  let reject!: (e: Error) => void;
  const pending = engine.buy(input, 'first', () => new Promise((_resolve, r) => { reject = r; }));
  assert.equal(ledger.account().reservedWei, '100');
  await assert.rejects(engine.buy({ ...input, token: '0x2222222222222222222222222222222222222222' }, 'second', buyQuote), /budget/i);
  reject(new Error('RPC unavailable')); await assert.rejects(pending, /RPC/);
  assert.equal(ledger.account().reservedWei, '0');
  assert.equal(ledger.account().balanceWei, '1000'); ledger.close();
});

test('refund and gas are accounted for; duplicate order does not spend twice', async () => {
  const ledger = new Ledger(':memory:', 1000n, 200n);
  const engine = new PaperEngine(ledger, { ...rules, maxGasWei: 10n }, () => now);
  const quote = async () => ({ ...(await buyQuote()), spentWei: 80n, gasWei: 5n });
  const p = await engine.buy(input, 'buy', quote);
  assert.equal(p.costWei, '85'); assert.equal(ledger.account().balanceWei, '915');
  assert.equal(ledger.account().spentWei, '85'); assert.equal(ledger.account().reservedWei, '0');
  const duplicate = await engine.buy(input, 'buy', () => { throw new Error('must not requote'); });
  assert.equal(duplicate.id, p.id);
  await assert.rejects(engine.buy({ ...input, amountWei: 99n }, 'buy', quote), /idempotency/i);
  ledger.close();
});

test('concurrent exits submit one simulated fill and account for net proceeds', async () => {
  const { ledger, engine } = setup(); const p = await engine.buy(input, 'buy', buyQuote);
  let finish!: (q: { ethOut: bigint; gasWei: bigint; observedAt: number; source: 'synthetic' }) => void;
  const pending = engine.close(p.id, 'manual', () => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(engine.close(p.id, 'stop-loss', async () => { throw new Error('must not quote'); }), /closing/i);
  finish({ ethOut: 130n, gasWei: 2n, observedAt: now, source: 'synthetic' });
  const closed = await pending;
  assert.equal(closed.realizedPnlWei, '28'); assert.equal(ledger.account().balanceWei, '1028');
  assert.equal(ledger.events().filter(x => x.kind === 'exit-filled').length, 1); ledger.close();
});

test('stale, future and invalid buy quotes cannot create a fill', async () => {
  for (const patch of [{ observedAt: now - 3001 }, { observedAt: now + 1 }, { tokensOut: 0n }, { spentWei: 101n }]) {
    const { ledger, engine } = setup();
    await assert.rejects(engine.buy(input, 'bad', async () => ({ ...(await buyQuote()), ...patch })));
    assert.equal(ledger.positions().length, 0); assert.equal(ledger.account().reservedWei, '0'); ledger.close();
  }
});

test('position, journal and spent limit survive restart; interrupted paper orders recover', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meerkat-')); const file = join(dir, 'ledger.sqlite');
  try {
    let ledger = new Ledger(file, 1000n, 250n); const engine = new PaperEngine(ledger, rules, () => now);
    const p = await engine.buy(input, 'buy', buyQuote);
    // A reservation persisted before the process stops, without any external transaction.
    ledger.reserve('interrupted', { ...input, token: '0x2222222222222222222222222222222222222222' }, 100n, 3, now);
    ledger.close(); ledger = new Ledger(file, 9999n, 9999n); ledger.recover(now + 1);
    assert.equal(ledger.account().balanceWei, '900'); assert.equal(ledger.account().spentWei, '100');
    assert.equal(ledger.account().budgetWei, '250'); assert.equal(ledger.account().reservedWei, '0');
    assert.equal(ledger.position(p.id)?.status, 'open');
    assert.ok(ledger.events().some(x => x.kind === 'order-recovered')); ledger.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rules distinguish TP, SL, trailing and hold; unknown reserve is not a collapse', () => {
  const p = { costWei: '100', peakWei: '150', openedAt: now - 1000 };
  assert.equal(exitReason(p, 135n, rules, now), 'take-profit');
  assert.equal(exitReason(p, 80n, rules, now), 'stop-loss');
  assert.equal(exitReason(p, 120n, rules, now), 'trailing-stop');
  assert.equal(exitReason({ ...p, peakWei: '100', openedAt: 0 }, 100n, rules, now), 'max-hold');
  assert.equal(reserveDrop(100n, null), null);
  assert.equal(reserveDrop(100n, 0n), 10000);
});

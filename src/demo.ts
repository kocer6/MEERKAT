import { Ledger } from './ledger.js';
import { PaperEngine } from './paper.js';
import { defaultRules } from './rules.js';

export async function runDemo() {
  const ledger = new Ledger(':memory:', 1000000000000000000n, 200000000000000000n);
  const now = Date.now(); const engine = new PaperEngine(ledger, defaultRules, () => now);
  try {
    const p = await engine.buy({ token: '0x1111111111111111111111111111111111111111', symbol: 'DEMO', amountWei: 100000000000000000n, score: 80, openingTaxBps: 0, source: 'synthetic' }, 'demo-entry', async () => ({ tokensOut: 1000000000000000000000n, spentWei: 100000000000000000n, gasWei: 0n, observedAt: now, source: 'synthetic' }));
    const closed = await engine.observe(p.id, { ethOut: 140000000000000000n, gasWei: 0n, observedAt: now, source: 'synthetic' });
    return { mode: 'paper', source: 'synthetic', assumptions: 'Fixture prices, zero synthetic gas, no network or wallet. Not a performance forecast.', position: closed, account: ledger.account(), events: ledger.events() };
  } finally { ledger.close(); }
}

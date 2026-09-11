import { Ledger } from './ledger.js';
import { assertRules, entryReasons, exitReason } from './rules.js';
import type { Entry, Rules, BuyQuote, SellQuote, Position } from './types.js';

/** This module has no wallet, private-key or network-send dependency. */
export class PaperEngine {
  readonly rules: Rules;
  constructor(readonly ledger: Ledger, rules: Rules, private now = Date.now) {
    assertRules(rules);
    this.rules = Object.freeze({ ...rules });
  }
  private fresh(q: { observedAt: number }): void {
    const age = this.now() - q.observedAt;
    if (!Number.isFinite(q.observedAt) || age < 0 || age > this.rules.quoteMaxAgeMs) throw new Error('stale or invalid quote timestamp');
  }
  async buy(entry: Entry, id: string, quote: () => Promise<BuyQuote>): Promise<Position> {
    const reasons = entryReasons(entry, this.rules); if (reasons.length) throw new Error(reasons.join('; '));
    const existing = this.ledger.reserve(id, entry, entry.amountWei + this.rules.maxGasWei, this.rules.maxPositions, this.now());
    if (existing) return existing;
    try {
      const q = await quote(); this.fresh(q);
      if (q.source !== entry.source || q.tokensOut <= 0n || q.spentWei <= 0n || q.spentWei > entry.amountWei || q.gasWei < 0n || q.gasWei > this.rules.maxGasWei) throw new Error('invalid buy quote');
      return this.ledger.fillEntry(id, q, this.now());
    } catch (error) { this.ledger.failEntry(id, String(error), this.now()); throw error; }
  }
  async close(id: string, reason: string, quote: (p: Position) => Promise<SellQuote>): Promise<Position> {
    const p = this.ledger.lockExit(id);
    try {
      const q = await quote(p); this.fresh(q);
      if (q.source !== p.source || q.ethOut < 0n || q.gasWei < 0n) throw new Error('invalid sell quote');
      return this.ledger.fillExit(id, q, reason, this.now());
    } catch (error) { this.ledger.failExit(id, String(error), this.now()); throw error; }
  }
  async observe(id: string, q: SellQuote): Promise<Position> {
    this.fresh(q); const existing = this.ledger.position(id);
    if (!existing || q.source !== existing.source || q.ethOut < 0n || q.gasWei < 0n || q.gasWei > this.rules.maxGasWei) throw new Error('invalid observation');
    const p = this.ledger.mark(id, q.ethOut - q.gasWei, this.now());
    const reason = exitReason(p, q.ethOut - q.gasWei, this.rules, this.now());
    return reason ? this.close(id, reason, async () => q) : p;
  }
}

import type { Entry, Position, Rules } from './types.js';

export const defaultRules: Rules = {
  minScore: 60, maxTaxBps: 300, maxPositions: 3, maxGasWei: 100000000000000n,
  quoteMaxAgeMs: 3000, takeProfitBps: 3000, stopLossBps: 2000, trailingBps: 1500, maxHoldMs: 45 * 60000,
};

export function entryReasons(e: Entry, r: Rules): string[] {
  const reasons: string[] = [];
  if (!/^0x[0-9a-f]{40}$/i.test(e.token)) reasons.push('invalid token address');
  if (e.amountWei <= 0n) reasons.push('amount must be positive');
  if (!Number.isFinite(e.score) || e.score < r.minScore || e.score > 100) reasons.push('score below threshold or invalid');
  if (e.openingTaxBps === null) reasons.push('opening tax unknown');
  else if (!Number.isInteger(e.openingTaxBps) || e.openingTaxBps < 0 || e.openingTaxBps > r.maxTaxBps) reasons.push('opening tax exceeds limit or invalid');
  if (e.source !== 'synthetic' && e.source !== 'chain') reasons.push('invalid source');
  return reasons;
}

export function exitReason(p: Pick<Position, 'costWei' | 'peakWei' | 'openedAt'>, value: bigint, r: Rules, now: number): string | null {
  const cost = BigInt(p.costWei); if (cost <= 0n || value < 0n) return null;
  const gain = (value - cost) * 10000n / cost;
  if (gain <= -BigInt(r.stopLossBps)) return 'stop-loss';
  const peak = BigInt(p.peakWei) > value ? BigInt(p.peakWei) : value;
  if (peak > cost && (peak - value) * 10000n / peak >= BigInt(r.trailingBps)) return 'trailing-stop';
  if (now - p.openedAt >= r.maxHoldMs) return 'max-hold';
  if (gain >= BigInt(r.takeProfitBps)) return 'take-profit';
  return null;
}

/** null means missing evidence, never a zero balance. */
export function reserveDrop(before: bigint | null, after: bigint | null): number | null {
  if (before === null || after === null || before <= 0n || after < 0n) return null;
  return after >= before ? 0 : Number((before - after) * 10000n / before);
}

/**
 * Runtime validation for Rules. Types alone do not enforce that a config
 * loaded from JSON/env/UI is actually sane, so every construction path must
 * run this before the value is trusted anywhere else (budgeting, exits).
 */
export function validateRules(r: Rules): string[] {
  const reasons: string[] = [];
  const intInRange = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (!intInRange(r.minScore, 0, 100)) reasons.push('minScore must be an integer within 0..100');
  if (!intInRange(r.maxTaxBps, 0, 10000)) reasons.push('maxTaxBps must be an integer within 0..10000');
  if (!Number.isInteger(r.maxPositions) || r.maxPositions < 1) reasons.push('maxPositions must be a positive integer');
  if (typeof r.maxGasWei !== 'bigint' || r.maxGasWei < 0n) reasons.push('maxGasWei must be a non-negative bigint');
  if (!Number.isFinite(r.quoteMaxAgeMs) || r.quoteMaxAgeMs <= 0) reasons.push('quoteMaxAgeMs must be a positive number of milliseconds');
  if (!intInRange(r.takeProfitBps, 1, 1000000)) reasons.push('takeProfitBps must be a positive integer');
  if (!intInRange(r.stopLossBps, 1, 9999)) reasons.push('stopLossBps must be an integer within 1..9999 (exit before total loss)');
  if (!intInRange(r.trailingBps, 0, 9999)) reasons.push('trailingBps must be an integer within 0..9999');
  if (!Number.isFinite(r.maxHoldMs) || r.maxHoldMs <= 0) reasons.push('maxHoldMs must be a positive number of milliseconds');
  return reasons;
}

export function assertRules(r: Rules): Rules {
  const reasons = validateRules(r);
  if (reasons.length) throw new Error(`invalid rules config: ${reasons.join('; ')}`);
  return r;
}

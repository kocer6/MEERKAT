export type Source = 'synthetic' | 'chain';
export interface Entry {
  token: string; symbol: string; amountWei: bigint; score: number;
  openingTaxBps: number | null; source: Source;
  evidence?: Record<string, unknown>;
}
export interface BuyQuote { tokensOut: bigint; spentWei: bigint; gasWei: bigint; observedAt: number; source: Source }
export interface SellQuote { ethOut: bigint; gasWei: bigint; observedAt: number; source: Source }
export interface Rules {
  minScore: number; maxTaxBps: number; maxPositions: number; maxGasWei: bigint;
  quoteMaxAgeMs: number; takeProfitBps: number; stopLossBps: number; trailingBps: number; maxHoldMs: number;
}
export type ExitSettings = Pick<Rules,'takeProfitBps'|'stopLossBps'|'trailingBps'|'maxHoldMs'>;
export interface Position {
  id: string; mode: 'paper'; chainId: 4663; token: string; symbol: string; source: Source;
  quantity: string; costWei: string; peakWei: string; lastValueWei: string;
  openedAt: number; updatedAt: number; status: 'open' | 'closing' | 'closed';
  realizedPnlWei: string; exitReason?: string;
}
export interface Account { balanceWei: string; budgetWei: string; spentWei: string; reservedWei: string }
export interface JournalEvent { id: number; kind: string; at: number; detail: Record<string, unknown> }
export const encode = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v);

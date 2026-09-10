// Curve arithmetic adapted from pinned Bodkin pons/curve.ts (MIT; see THIRD_PARTY_NOTICES.md).
export interface CurveSnapshot {
  quoteReserve: bigint; tokenReserve: bigint; realQuoteReserve: bigint; sellableTokens: bigint;
  feeBps: bigint; creatorTaxBps: bigint; openingTaxBps: bigint | null; graduated: boolean; readyToGraduate: boolean;
}
const BPS = 10000n;
function validate(s: CurveSnapshot, amount: bigint) {
  if (amount <= 0n) throw new Error('amount must be positive');
  if (s.graduated || s.readyToGraduate) throw new Error('curve closed; pool quotes not supported yet');
  if (s.quoteReserve <= 0n || s.tokenReserve <= 0n || s.realQuoteReserve < 0n || s.sellableTokens < 0n || s.sellableTokens >= s.tokenReserve) throw new Error('invalid reserves');
  if (s.feeBps < 0n || s.creatorTaxBps < 0n || s.feeBps + s.creatorTaxBps > 2000n) throw new Error('invalid trade fees');
}
export function curveBuy(s: CurveSnapshot, amount: bigint) {
  validate(s, amount);
  if (s.openingTaxBps === null) throw new Error('opening tax unknown');
  if (s.openingTaxBps < 0n || s.openingTaxBps > BPS) throw new Error('invalid opening tax');
  const cap = BPS - s.feeBps - s.creatorTaxBps - 100n;
  const opening = s.openingTaxBps < cap ? s.openingTaxBps : cap;
  const net = amount - amount * s.feeBps / BPS - amount * s.creatorTaxBps / BPS - amount * opening / BPS;
  let tokensOut = net * s.tokenReserve / (s.quoteReserve + net); let spentWei = amount;
  if (tokensOut > s.sellableTokens) {
    tokensOut = s.sellableTokens;
    const needed = tokensOut * s.quoteReserve / (s.tokenReserve - tokensOut) + 1n;
    const denominator = BPS - s.feeBps - s.creatorTaxBps - opening;
    const gross = (needed * BPS + denominator - 1n) / denominator;
    spentWei = gross < amount ? gross : amount;
  }
  if (tokensOut <= 0n) throw new Error('no tokens available for this amount');
  return { tokensOut, spentWei, refundWei: amount - spentWei };
}
export function curveSell(s: CurveSnapshot, amount: bigint) {
  validate(s, amount);
  const gross = amount * s.quoteReserve / (s.tokenReserve + amount);
  if (gross > s.realQuoteReserve) throw new Error('insufficient real quote liquidity');
  return gross - gross * s.feeBps / BPS - gross * s.creatorTaxBps / BPS;
}

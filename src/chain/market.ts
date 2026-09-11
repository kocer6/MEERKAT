import { createPublicClient, http, isAddress, parseAbi, type Address } from 'viem';
import { factory, factoryAbi } from './abi.js';
import { curveBuy, curveSell, type CurveSnapshot } from './quotes.js';
const zero = '0x0000000000000000000000000000000000000000';
// Read-only ABI subset from pinned Bodkin, MIT. No buy/sell transaction methods.
const curveAbi = parseAbi([
  'function getReserves() view returns (uint256,uint256)',
  'function realQuoteReserve() view returns (uint256)', 'function sellableTokens() view returns (uint256)',
  'function feeBps() view returns (uint256)', 'function creatorTaxBps() view returns (uint256)',
  'function currentSnipeTaxBps(address) view returns (uint256)',
  'function graduated() view returns (bool)', 'function readyToGraduate() view returns (bool)',
]);
const tokenAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
// Read-only quote ABI adapted from Bodkin (MIT); simulateContract sends eth_call only.
const quoter='0x8dc178efb8111bb0973dd9d722ebeff267c98f94';
const quoterAbi=parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
export interface MarketReader {
  chainId(): Promise<number>;
  block(): Promise<{ number: bigint; timestamp: bigint }>;
  record(token: string, block: bigint): Promise<{ exists: boolean; curve: string; pairToken: string; phase: number; tickSpacing?:number }>;
  poolSell?(token:string,tickSpacing:number,quantity:bigint,block:bigint):Promise<bigint>;
  metadata(token: string, block: bigint): Promise<{ symbol: string; decimals: number }>;
  curve(address: string, block: bigint): Promise<CurveSnapshot>;
}
export function marketReader(): MarketReader {
  const client = createPublicClient({ transport: http(process.env.MEERKAT_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com', { timeout: 12000, retryCount: 1 }) });
  return {
    chainId: () => client.getChainId(), block: () => client.getBlock({ blockTag: 'latest' }),
    record: (token, blockNumber) => client.readContract({ address: factory, abi: factoryAbi, functionName: 'getLaunchedToken', args: [token as Address], blockNumber }),
    poolSell: async(token,tickSpacing,quantity,blockNumber)=>{
      const [hooks,code]=await Promise.all([
        client.readContract({address:factory,abi:parseAbi(['function memeHook() view returns (address)']),functionName:'memeHook',blockNumber}),
        client.getCode({address:quoter,blockNumber}),
      ]);
      if(!code || code==='0x' || hooks===zero)throw new Error('Pool quoter or hook unavailable');
      const {result}=await client.simulateContract({address:quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',blockNumber,
        args:[{poolKey:{currency0:zero,currency1:token as Address,fee:0,tickSpacing,hooks},zeroForOne:false,exactAmount:quantity,hookData:'0x'}]});
      return result[0];
    },
    metadata: async (token, blockNumber) => {
      const c = { address: token as Address, abi: tokenAbi, blockNumber };
      const [symbol, decimals] = await Promise.all([client.readContract({ ...c, functionName: 'symbol' }), client.readContract({ ...c, functionName: 'decimals' })]);
      return { symbol, decimals };
    },
    curve: async (address, blockNumber) => {
      const c = { address: address as Address, abi: curveAbi, blockNumber };
      const [reserves, realQuoteReserve, sellableTokens, feeBps, creatorTaxBps, openingTaxBps, graduated, readyToGraduate] = await Promise.all([
        client.readContract({ ...c, functionName: 'getReserves' }), client.readContract({ ...c, functionName: 'realQuoteReserve' }),
        client.readContract({ ...c, functionName: 'sellableTokens' }), client.readContract({ ...c, functionName: 'feeBps' }),
        client.readContract({ ...c, functionName: 'creatorTaxBps' }),
        client.readContract({ ...c, functionName: 'currentSnipeTaxBps', args: ['0x000000000000000000000000000000000000dEaD'] }).catch(() => null),
        client.readContract({ ...c, functionName: 'graduated' }), client.readContract({ ...c, functionName: 'readyToGraduate' }),
      ]);
      return { quoteReserve: reserves[0], tokenReserve: reserves[1], realQuoteReserve, sellableTokens, feeBps, creatorTaxBps, openingTaxBps, graduated, readyToGraduate };
    },
  };
}
export async function inspectToken(reader: MarketReader, token: string, amountWei: bigint, sellQuantity?: bigint) {
  if (!isAddress(token) || token.toLowerCase() === zero) throw new Error('invalid token address');
  if (amountWei <= 0n || amountWei > 10n ** 18n) throw new Error('inspection amount must be greater than zero and at most 1 ETH');
  if(sellQuantity!==undefined && (sellQuantity<=0n || sellQuantity>=2n**128n))throw new Error('invalid sell quantity');
  if (await reader.chainId() !== 4663) throw new Error('wrong chain; expected 4663');
  const block = await reader.block();
  const checkAge = () => { const age = Date.now() - Number(block.timestamp) * 1000; if (age < -5000 || age > 30000) throw new Error('stale chain block; refresh the quote'); };
  checkAge();
  const record = await reader.record(token, block.number);
  if (!record.exists) throw new Error('token is not registered with Pons V2');
  const meta = await reader.metadata(token, block.number);
  const reasons: string[] = [];
  if (record.pairToken.toLowerCase() !== zero) reasons.push('Only native ETH pairs are supported');
  const poolExit=record.phase===2 && sellQuantity!==undefined && reader.poolSell!==undefined;
  if (record.phase !== 0 && !poolExit) reasons.push('Unsupported phase: ' + (['curve', 'swept', 'pool', 'rescued'][record.phase] ?? 'unknown'));
  let state: CurveSnapshot | null = null;
  let buy: ReturnType<typeof curveBuy> | null = null; let sellBackWei: bigint | null = null;
  if(!reasons.length && poolExit){
    if(!Number.isInteger(record.tickSpacing) || record.tickSpacing!<=0 || record.tickSpacing!>32767)throw new Error('Invalid pool tick spacing');
    sellBackWei=await reader.poolSell!(token,record.tickSpacing!,sellQuantity!,block.number);
    if(sellBackWei<=0n)throw new Error('Pool sell quote has no output');
  }
  if (!reasons.length && record.phase===0) {
    state = await reader.curve(record.curve, block.number);
    if (sellQuantity === undefined) {
      try { buy = curveBuy(state, amountWei); } catch (error) { reasons.push((error as Error).message); }
    }
    if (buy || sellQuantity !== undefined) {
      try { sellBackWei = curveSell(state, sellQuantity ?? buy!.tokensOut); } catch (error) { reasons.push('Sell quote unavailable: ' + (error as Error).message); }
    }
  }
  checkAge();
  return { source: 'chain' as const, chainId: 4663, token, symbol: meta.symbol, decimals: meta.decimals, curve: record.curve,
    phase: record.phase, pairToken: record.pairToken, blockNumber: block.number.toString(), blockTimestamp: Number(block.timestamp) * 1000,
    observedAt: Date.now(), amountWei, openingTaxBps: state?.openingTaxBps == null ? null : Number(state.openingTaxBps),
    feeBps: state ? Number(state.feeBps) : null, creatorTaxBps: state ? Number(state.creatorTaxBps) : null,
    realQuoteReserveWei: state?.realQuoteReserve ?? null, buy, sellBackWei, reasons,
    quoteModel: poolExit?'Read-only Uniswap v4 Quoter eth_call for the exact position quantity at one block; gas excluded. Not an execution guarantee.':'Read-only curve estimate; fees included, gas excluded. Independent buy/sell estimates at one block; paper trades do not change chain reserves. Opening tax uses the non-wallet 0xdead recipient. Not a score or an execution guarantee.' };
}

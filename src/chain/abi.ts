// Selected read-only ABI definitions adapted from Bodkin, MIT, copyright 2026 phosphenq.
// Pinned source and full license: THIRD_PARTY_NOTICES.md and licenses/bodkin-MIT.txt.
import { parseAbi, parseAbiItem } from 'viem';

export const factory = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as const;
export const launched = parseAbiItem('event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)');
export const factoryAbi = parseAbi([
  'struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }',
  'function getLaunchedToken(address token) view returns (LaunchedToken)',
]);

import { createPublicClient, http, type Address } from 'viem';
import { factory, factoryAbi, launched } from './abi.js';

export interface Launch {
  token: string; curve: string; deployer: string; pairToken: string;
  blockNumber: string; blockHash: string; txHash: string; logIndex: number;
}
export interface DiscoveryReader {
  chainId(): Promise<number>; head(): Promise<bigint>; code(block: bigint): Promise<string>;
  logs(from: bigint, to: bigint): Promise<Launch[]>;
  record(token: string, block: bigint): Promise<{ exists: boolean; curve: string; deployer: string; pairToken: string; phase: number }>;
}
export interface DiscoverySnapshot {
  source: 'chain'; status: 'idle' | 'connected' | 'error'; chainId: number | null;
  headBlock?: string; factory: string; blockNumber: string | null; fromBlock: string | null;
  observedAt: number | null; checkedFactoryRecord: boolean; error: string | null; launches: Launch[];
}

export function rpcReader(rpcUrl = process.env.MEERKAT_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'): DiscoveryReader {
  const parsed = new URL(rpcUrl); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('RPC must use http or https');
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 12000, retryCount: 1 }) });
  return {
    chainId: () => client.getChainId(), head: () => client.getBlockNumber({ cacheTime: 0 }),
    code: async blockNumber => (await client.getBytecode({ address: factory, blockNumber })) ?? '0x',
    logs: async (fromBlock, toBlock) => {
      const logs = await client.getLogs({ address: factory, event: launched, fromBlock, toBlock, strict: true });
      return logs.filter(l => !l.removed && l.blockNumber !== null && l.blockHash !== null && l.transactionHash !== null && l.logIndex !== null).map(l => ({
        token: l.args.token, curve: l.args.curve, deployer: l.args.deployer, pairToken: l.args.pairToken,
        blockNumber: l.blockNumber!.toString(), blockHash: l.blockHash!, txHash: l.transactionHash!, logIndex: l.logIndex!,
      }));
    },
    record: (token, blockNumber) => client.readContract({ address: factory, abi: factoryAbi, functionName: 'getLaunchedToken', args: [token as Address], blockNumber }),
  };
}

export interface DiscoveryStore { load():DiscoverySnapshot|undefined; save(snapshot:DiscoverySnapshot):void }
/** Bounded backfill with a 64-block replacement overlap; deeper reorgs are not covered. */
export class PonsDiscovery {
  private state: DiscoverySnapshot = { source: 'chain', status: 'idle', chainId: null, factory, blockNumber: null, fromBlock: null, observedAt: null, checkedFactoryRecord: false, error: null, launches: [] };
  private pending?: Promise<DiscoverySnapshot>;
  constructor(private reader: DiscoveryReader,private store?:DiscoveryStore) {
    const saved=store?.load();if(saved && saved.chainId===4663 && saved.factory===factory)this.state={...saved,status:'idle',error:null};
  }
  async settled():Promise<void>{await this.pending;}
  snapshot(): DiscoverySnapshot { return { ...this.state, launches: this.state.launches.map(x => ({ ...x })) }; }
  refresh(): Promise<DiscoverySnapshot> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => { this.pending = undefined; }); return this.pending;
  }
  private async read(): Promise<DiscoverySnapshot> {
    try {
      const chainId = await this.reader.chainId(); if (chainId !== 4663) throw new Error(`wrong chain: ${chainId}; expected 4663`);
      const head = await this.reader.head();
      if (await this.reader.code(head) === '0x') throw new Error('Pons V2 factory has no deployed code');
      const cursor=this.state.blockNumber===null?null:BigInt(this.state.blockNumber);
      if(cursor!==null && head<cursor)throw new Error('RPC head behind saved scanner cursor');
      const from = cursor===null?(head>1999n?head-1999n:0n):(cursor>63n?cursor-63n:0n);
      const to=from+1999n<head?from+1999n:head;
      const logs = await this.reader.logs(from, to);
      const launches = [...new Map([...this.state.launches.filter(l=>BigInt(l.blockNumber)<from),...logs.filter(l=>BigInt(l.blockNumber)>=from && BigInt(l.blockNumber)<=to)].map(l => [`${l.blockHash}:${l.txHash}:${l.logIndex}`, l])).values()]
        .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) || b.logIndex - a.logIndex);
      const latest = launches[0];
      if (latest) {
        const record = await this.reader.record(latest.token, to);
        if (!record.exists || record.curve.toLowerCase() !== latest.curve.toLowerCase() || record.deployer.toLowerCase() !== latest.deployer.toLowerCase() || record.pairToken.toLowerCase() !== latest.pairToken.toLowerCase()) throw new Error('factory ABI record does not match launch event');
      }
      const next:DiscoverySnapshot = { source: 'chain', status: 'connected', chainId, factory, headBlock:head.toString(), blockNumber: to.toString(), fromBlock: this.state.fromBlock??from.toString(), observedAt: Date.now(), checkedFactoryRecord: !!latest, error: null, launches };
      this.store?.save(next);this.state=next;
    } catch (error) {
      // Do not expose RPC URLs containing credentials in UI/export errors.
      const message = error instanceof Error ? error.message.split('\n')[0]! : 'RPC read failed';
      this.state = { ...this.state, status: 'error', error: message.replace(/https?:\/\/\S+/g, '[RPC endpoint]').slice(0, 240) };
    }
    return this.snapshot();
  }
}

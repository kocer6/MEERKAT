import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { reserveDrop } from './rules.js';
import type { DiscoverySnapshot } from './chain/discovery.js';
import { encode, type Account, type Entry, type Position, type JournalEvent, type BuyQuote, type SellQuote } from './types.js';

interface Order { id: string; fingerprint: string; reserveWei: string; status: 'reserved' | 'filled' | 'failed'; positionId?: string }
interface ReserveObservation { blockNumber:string|null; reserveWei:string|null; curve:string|null; observedAt:number }
interface ReserveWatch extends ReserveObservation { lastWarning?:{dropBps:number;at:number} }

/** Single-user paper ledger. Every balance/position/event transition is one SQLite transaction. */
export class Ledger {
  private db: DatabaseSync;
  constructor(file: string, initialWei: bigint, budgetWei: bigint) {
    if (initialWei < 0n || budgetWei < 0n) throw new Error('negative initial balance or budget');
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS positions (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reserve_watch (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scanner (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO account VALUES (1,?)').run(encode({ balanceWei: initialWei, budgetWei, spentWei: 0n, reservedWei: 0n }));
  }
  close(): void { this.db.close(); }
  loadDiscovery():DiscoverySnapshot|undefined {
    const row=this.db.prepare('SELECT value FROM scanner WHERE id=1').get() as {value:string}|undefined;
    return row?JSON.parse(row.value):undefined;
  }
  saveDiscovery(snapshot:DiscoverySnapshot):void {
    this.db.prepare('INSERT INTO scanner VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(encode(snapshot));
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  account(): Account { return JSON.parse((this.db.prepare('SELECT value FROM account WHERE id=1').get() as { value: string }).value); }
  private saveAccount(a: Account): void { this.db.prepare('UPDATE account SET value=? WHERE id=1').run(encode(a)); }
  positions(): Position[] { return (this.db.prepare('SELECT value FROM positions ORDER BY rowid').all() as { value: string }[]).map(x => JSON.parse(x.value)); }
  position(id: string): Position | undefined {
    const row = this.db.prepare('SELECT value FROM positions WHERE id=?').get(id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  private savePosition(p: Position): void { this.db.prepare('INSERT INTO positions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(p.id, encode(p)); }
  private order(id: string): Order | undefined {
    const row = this.db.prepare('SELECT value FROM orders WHERE id=?').get(id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  private saveOrder(o: Order): void { this.db.prepare('INSERT INTO orders VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(o.id, encode(o)); }
  /** Market request identity excludes changing quote evidence; old stored orders need no migration. */
  marketOrder(id:string,token:string,amount:bigint):Position|undefined {
    const order=this.order(id);if(!order)return undefined;
    const entry=JSON.parse(order.fingerprint) as Entry;
    if(entry.source!=='chain' || entry.token.toLowerCase()!==token.toLowerCase() || BigInt(entry.amountWei)!==amount)throw new Error('idempotency key reused with different entry');
    if(order.status!=='filled')throw new Error(`order already ${order.status}; use a new id for an explicit retry`);
    const position=this.position(order.positionId!);
    if(!position)throw new Error('filled order position unavailable');
    return position;
  }
  private event(kind: string, at: number, detail: Record<string, unknown>): void { this.db.prepare('INSERT INTO events(kind,at,detail) VALUES (?,?,?)').run(kind, at, encode(detail)); }
  events(): JournalEvent[] { return (this.db.prepare('SELECT * FROM events ORDER BY id').all() as { id: number; kind: string; at: number; detail: string }[]).map(x => ({ ...x, detail: JSON.parse(x.detail) })); }
  positionHistory(id:string):JournalEvent[]|undefined {
    if(!this.position(id))return undefined;
    const events=this.events();
    const orderId=events.find(e=>e.kind==='entry-filled' && e.detail.positionId===id)?.detail.orderId;
    return events.filter(e=>e.detail.positionId===id || (orderId!==undefined && e.detail.orderId===orderId));
  }

  reserveWatches(): Record<string,ReserveWatch> {
    return Object.fromEntries((this.db.prepare('SELECT id,value FROM reserve_watch').all() as {id:string;value:string}[]).map(x=>[x.id,JSON.parse(x.value)]));
  }
  /** Alert only. Unknown reads break continuity; comparisons require a new block within 60 seconds. */
  recordReserve(id:string, observation:ReserveObservation):void {
    this.transaction(()=>{
      const before=this.reserveWatches()[id];
      if(before && observation.observedAt<before.observedAt)return;
      if(before?.blockNumber && observation.blockNumber && BigInt(observation.blockNumber)<=BigInt(before.blockNumber))return;
      const next:ReserveWatch={...observation,...(before?.lastWarning?{lastWarning:before.lastWarning}:{})};
      const comparable=before && before.curve===next.curve && next.curve!==null && before.blockNumber!==null && next.blockNumber!==null && next.observedAt-before.observedAt<=60000;
      const drop=comparable?reserveDrop(before.reserveWei===null?null:BigInt(before.reserveWei),next.reserveWei===null?null:BigInt(next.reserveWei)):null;
      if(drop!==null && drop>1500){
        next.lastWarning={dropBps:drop,at:next.observedAt};
        this.event('reserve-warning',next.observedAt,{positionId:id,dropBps:drop,beforeWei:before!.reserveWei,afterWei:next.reserveWei,fromBlock:before!.blockNumber,blockNumber:next.blockNumber,reason:'Real ETH curve reserve fell over 15%; warning only, not an exit instruction'});
      }
      this.db.prepare('INSERT INTO reserve_watch VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,encode(next));
    });
  }

  reserve(id: string, entry: Entry, reserveWei: bigint, maxPositions: number, now: number): Position | undefined {
    return this.transaction(() => {
      if (!id || reserveWei <= 0n) throw new Error('invalid order reservation');
      const fingerprint = encode(entry); const existing = this.order(id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('idempotency key reused with different entry');
        if (existing.status === 'filled') return this.position(existing.positionId!)!;
        throw new Error(`order already ${existing.status}; use a new id for an explicit retry`);
      }
      const orders = (this.db.prepare('SELECT value FROM orders').all() as { value: string }[]).map(x => JSON.parse(x.value) as Order);
      const pending = orders.filter(o => o.status === 'reserved');
      const open = this.positions().filter(p => p.status !== 'closed');
      if (open.length + pending.length >= maxPositions) throw new Error('position limit');
      if (open.some(p => p.token.toLowerCase() === entry.token.toLowerCase()) || pending.some(o => (JSON.parse(o.fingerprint) as Entry).token.toLowerCase() === entry.token.toLowerCase())) throw new Error('token already active');
      const a = this.account();
      if (BigInt(a.spentWei) + BigInt(a.reservedWei) + reserveWei > BigInt(a.budgetWei)) throw new Error('run budget exceeded');
      if (BigInt(a.reservedWei) + reserveWei > BigInt(a.balanceWei)) throw new Error('insufficient paper balance');
      a.reservedWei = (BigInt(a.reservedWei) + reserveWei).toString(); this.saveAccount(a);
      this.saveOrder({ id, fingerprint, reserveWei: reserveWei.toString(), status: 'reserved' });
      this.event('entry-reserved', now, { orderId: id, entry, reserveWei });
      return undefined;
    });
  }
  failEntry(id: string, error: string, now: number): void {
    this.transaction(() => {
      const o = this.order(id); if (!o || o.status !== 'reserved') return;
      const a = this.account(); a.reservedWei = (BigInt(a.reservedWei) - BigInt(o.reserveWei)).toString(); this.saveAccount(a);
      this.saveOrder({ ...o, status: 'failed' }); this.event('entry-failed', now, { orderId: id, error });
    });
  }
  fillEntry(id: string, q: BuyQuote, now: number): Position {
    return this.transaction(() => {
      const o = this.order(id); if (!o || o.status !== 'reserved') throw new Error('entry is not reserved');
      const e = JSON.parse(o.fingerprint) as Entry; const cost = q.spentWei + q.gasWei;
      if (cost <= 0n || cost > BigInt(o.reserveWei)) throw new Error('fill exceeds reservation');
      const a = this.account(); a.balanceWei = (BigInt(a.balanceWei) - cost).toString();
      a.spentWei = (BigInt(a.spentWei) + cost).toString(); a.reservedWei = (BigInt(a.reservedWei) - BigInt(o.reserveWei)).toString();
      const p: Position = { id: randomUUID(), mode: 'paper', chainId: 4663, token: e.token.toLowerCase(), symbol: e.symbol, source: e.source,
        quantity: q.tokensOut.toString(), costWei: cost.toString(), peakWei: cost.toString(), lastValueWei: cost.toString(), openedAt: now, updatedAt: now, status: 'open', realizedPnlWei: '0' };
      this.saveAccount(a); this.savePosition(p); this.saveOrder({ ...o, status: 'filled', positionId: p.id });
      this.event('entry-filled', now, { orderId: id, positionId: p.id, quote: q, mode: 'paper', refundWei: BigInt(e.amountWei) - q.spentWei });
      return p;
    });
  }
  mark(id: string, value: bigint, now: number): Position {
    return this.transaction(() => {
      const p = this.position(id); if (!p || p.status !== 'open') throw new Error('position is not open');
      // Net liquidation value can be negative when exit gas exceeds token proceeds.
      p.lastValueWei = value.toString(); p.peakWei = (value > BigInt(p.peakWei) ? value : BigInt(p.peakWei)).toString(); p.updatedAt = now;
      this.savePosition(p); this.event('position-marked', now, { positionId: id, valueWei: value }); return p;
    });
  }
  lockExit(id: string): Position {
    return this.transaction(() => {
      const p = this.position(id); if (!p) throw new Error('unknown position');
      if (p.status !== 'open') throw new Error(`position already ${p.status}`);
      if (p.mode !== 'paper' || p.chainId !== 4663) throw new Error('position mode/chain mismatch');
      p.status = 'closing'; this.savePosition(p); return p;
    });
  }
  failExit(id: string, error: string, now: number): void {
    this.transaction(() => { const p = this.position(id); if (!p || p.status !== 'closing') return;
      p.status = 'open'; this.savePosition(p); this.event('exit-failed', now, { positionId: id, error }); });
  }
  fillExit(id: string, q: SellQuote, reason: string, now: number): Position {
    return this.transaction(() => {
      const p = this.position(id); if (!p || p.status !== 'closing') throw new Error('position is not closing');
      const net = q.ethOut - q.gasWei; const a = this.account();
      if (BigInt(a.balanceWei) + net < BigInt(a.reservedWei)) throw new Error('insufficient paper funds for exit gas');
      a.balanceWei = (BigInt(a.balanceWei) + net).toString(); this.saveAccount(a);
      p.status = 'closed'; p.lastValueWei = net.toString(); p.realizedPnlWei = (net - BigInt(p.costWei)).toString();
      p.updatedAt = now; p.exitReason = reason; this.savePosition(p);
      this.event('exit-filled', now, { positionId: id, quote: q, reason, mode: 'paper', realizedPnlWei: p.realizedPnlWei }); return p;
    });
  }
  /** Call at single-process startup only. Paper reservations cannot conceal a network transaction. */
  recover(now: number): void {
    this.transaction(() => {
      const orders = (this.db.prepare('SELECT value FROM orders').all() as { value: string }[]).map(x => JSON.parse(x.value) as Order);
      for (const o of orders.filter(x => x.status === 'reserved')) {
        this.saveOrder({ ...o, status: 'failed' }); this.event('order-recovered', now, { orderId: o.id, reason: 'interrupted paper quote; no transaction was sent' });
      }
      const a = this.account(); a.reservedWei = '0'; this.saveAccount(a);
      for (const p of this.positions().filter(x => x.status === 'closing')) {
        p.status = 'open'; this.savePosition(p); this.event('exit-recovered', now, { positionId: p.id });
      }
    });
  }
}

# MEERKAT Radar V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Radar V2 as a continuously indexed Pons market intelligence terminal with global search, connected token and wallet dossiers, evidence-based scores, PnL, and a wallet leaderboard.

**Architecture:** Add one server-owned Radar indexer beside the existing on-demand `TokenHistory` service. Persist verified launches, normalized market events, derived positions, scores, activity, and watchlist state in SQLite; expose bounded cached read APIs; replace the old Analyze shell with route-driven Radar, Leaderboard, Watchlist, Activity, Token Dossier, and Wallet Dossier views.

**Tech Stack:** Node.js 24, TypeScript 5.9 strict mode, viem 2.56, `node:sqlite`, native Node HTTP server, browser HTML/CSS/JavaScript, Node test runner with tsx.

**Spec:** `docs/superpowers/specs/2026-09-14-meerkat-radar-v2-design.md`

## Global Constraints

- Robinhood Chain ID is exactly `4663`; the default RPC is `https://rpc.mainnet.chain.robinhood.com` and private credentials are optional.
- There is exactly one market indexer per server process; browser requests only read cached SQLite state.
- Factory, market, and enrichment cursors persist independently and resume with a 64-block replacement overlap.
- Deep Fee Flow, Relationships, Holders, and Timeline remain powered by the existing on-demand `TokenHistory` implementation.
- Unknown values remain distinct from zero, false, or empty; incomplete evidence must be visible.
- Launch Quality, Wallet Reputation, and Radar Strength remain three separately explained scores.
- PnL is stored in pair-token units; native-pair launches display ETH; no USD value is shown without a named timestamped source.
- Pool calls are not attributed to a wallet without receipt or transfer provenance; dust, self-routing, and known infrastructure are excluded.
- Radar and Leaderboard GET endpoints must not perform chain RPC requests.
- Public routes are bounded and paginated; current admission control and response limits remain active.
- The terminal has `RADAR`, `LEADERBOARD`, `WATCHLIST`, and `ACTIVITY`; the separate `ANALYZE` destination is removed.
- Desktop body copy is 16–18 px at weight 600 or greater, tables are 14–16 px with 48–54 px rows, and desktop metadata is at least 12 px.
- `MEERKAT` is the only sidebar wordmark; entity links are light by default and green only on hover or keyboard focus; active navigation is amber.
- Every package must pass focused tests, the full test suite, typecheck, and build before it is pushed or deployed.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/radar/types.ts` | Shared persisted and API contracts for launches, events, positions, scores, feeds, and pagination. |
| `src/radar/store.ts` | Versioned SQLite schema, transactions, overlap replacement, cached query methods, watchlist persistence. |
| `src/radar/reader.ts` | Robinhood Chain reads for factory launches, global curve logs, token profiles, and executable quotes. |
| `src/radar/indexer.ts` | One resumable server-owned scheduler for discovery, recent tape, historical backfill, and bounded profiling. |
| `src/radar/positions.ts` | Deterministic weighted-average position and realized/open/total PnL accounting. |
| `src/radar/scores.ts` | Launch Quality, Wallet Reputation, and Radar Strength calculations with gates and evidence. |
| `src/radar/service.ts` | Cached feeds, search classification, dossier summaries, leaderboard eligibility, and activity queries. |
| `src/observer-server.ts` | Radar lifecycle wiring, route parsing, bounded endpoints, and static route fallback. |
| `public/terminal.html` | Route-driven terminal shell and universal search markup. |
| `public/terminal.js` | Client router, navigation restoration, feed rendering, dossier rendering, and API polling. |
| `public/terminal.css` | Full-viewport MEERKAT layout, typography, tables, states, and responsive behavior. |
| `test/radar-*.test.ts` | Unit and integration coverage for persistence, indexing, accounting, scoring, queries, and UI contracts. |

### Task 1: Radar contracts and transactional SQLite store

**Files:**
- Create: `src/radar/types.ts`
- Create: `src/radar/store.ts`
- Create: `test/radar-store.test.ts`

**Interfaces:**
- Consumes: `Launch` from `src/chain/discovery.ts` and JSON encoding conventions from `src/types.ts`.
- Produces: `RadarStore`, `RadarLaunch`, `RadarEvent`, `WalletTokenPosition`, `ScoreSnapshot`, `RadarCursor`, `Page<T>`, and `WatchlistItem` for all later tasks.

- [x] **Step 1: Write the failing persistence and overlap tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {RadarStore} from '../src/radar/store.js';
import type {RadarEvent,RadarLaunch} from '../src/radar/types.js';

const launch:RadarLaunch={token:'0x0000000000000000000000000000000000000011',curve:'0x0000000000000000000000000000000000000022',deployer:'0x0000000000000000000000000000000000000033',pairToken:'0x0000000000000000000000000000000000000000',launchBlock:'100',blockHash:'0xaaa',txHash:'0xbbb',logIndex:0,state:'discovered',profile:null,profileError:null,updatedAt:1};
const buy:RadarEvent={id:'0xaaa:0xccc:1',token:launch.token,curve:launch.curve,wallet:'0x0000000000000000000000000000000000000044',kind:'buy',tokens:'100',quote:'10',blockNumber:'110',blockHash:'0xaaa',txHash:'0xccc',logIndex:1,at:1000,complete:true};

test('overlap replacement removes orphaned events and keeps the cursor atomically',()=>{
 const store=new RadarStore(':memory:');
 store.replaceLaunchRange('factory',90n,120n,120n,[launch]);
 store.replaceEventRange('market',100n,120n,120n,[buy]);
 store.replaceEventRange('market',108n,130n,130n,[]);
 assert.equal(store.cursor('market')?.blockNumber,'130');
 assert.deepEqual(store.eventsForToken(launch.token),[]);
 assert.equal(store.launchByToken(launch.token)?.curve,launch.curve);
 store.close();
});
```

- [x] **Step 2: Run the focused test and verify the missing module failure**

Run: `node --import tsx --test test/radar-store.test.ts`

Expected: FAIL with `Cannot find module '../src/radar/store.js'`.

- [x] **Step 3: Add exact shared contracts**

```ts
export type RadarStage='discovered'|'profiled'|'tracking'|'scored'|'error';
export type RadarEventKind='buy'|'sell'|'phase'|'transfer';
export type ScoreConfidence='provisional'|'low'|'medium'|'high';
export interface RadarCursor {name:string;blockNumber:string;blockHash:string|null;updatedAt:number}
export interface RadarProfile {name:string;symbol:string;decimals:number;phase:number;creatorTaxBps:number;creatorFeeRecipient:string;totalSupply:string;deployerBalance:string;holderCount:number|null;metadataComplete:boolean;profiledAtBlock:string;profiledAt:number}
export interface RadarLaunch {token:string;curve:string;deployer:string;pairToken:string;launchBlock:string;blockHash:string;txHash:string;logIndex:number;state:RadarStage;profile:RadarProfile|null;profileError:string|null;updatedAt:number}
export interface RadarEvent {id:string;token:string;curve:string;wallet:string|null;kind:RadarEventKind;tokens:string|null;quote:string|null;blockNumber:string;blockHash:string;txHash:string;logIndex:number;at:number|null;complete:boolean}
export interface WalletTokenPosition {wallet:string;token:string;pairToken:string;tokenBalance:string;remainingCost:string;realizedPnl:string;observedProceeds:string;buys:number;sells:number;firstBuyBlock:string|null;lastTradeBlock:string|null;complete:boolean;updatedAt:number}
export interface ScoreComponent {key:string;weight:number;value:number|null;evidence:string;known:boolean}
export interface ScoreSnapshot {subject:string;kind:'launch-quality'|'wallet-reputation'|'radar-strength';value:number|null;confidence:ScoreConfidence;modelVersion:string;asOfBlock:string;computedAt:number;components:ScoreComponent[];unknownInputs:string[];explanation:string}
export interface WatchlistItem {kind:'token'|'wallet';address:string;createdAt:number}
export interface Page<T> {items:T[];nextCursor:string|null}
```

- [x] **Step 4: Implement the store with versioned schema and range transactions**

```ts
export class RadarStore {
 private db:DatabaseSync;
 constructor(file:string){
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
  this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS radar_cursors(name TEXT PRIMARY KEY,block_number INTEGER NOT NULL,block_hash TEXT,updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS radar_launches(token TEXT PRIMARY KEY,curve TEXT UNIQUE NOT NULL,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS radar_events(id TEXT PRIMARY KEY,token TEXT NOT NULL,curve TEXT NOT NULL,wallet TEXT,kind TEXT NOT NULL,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS wallet_token_positions(wallet TEXT NOT NULL,token TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(wallet,token));
   CREATE TABLE IF NOT EXISTS wallet_outcomes(wallet TEXT NOT NULL,token TEXT NOT NULL,closed_at INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(wallet,token));
   CREATE TABLE IF NOT EXISTS wallet_scores(wallet TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS token_signal_snapshots(token TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(token,kind));
   CREATE TABLE IF NOT EXISTS radar_activity(id TEXT PRIMARY KEY,block INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS watchlist_items(kind TEXT NOT NULL,address TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(kind,address));
   CREATE INDEX IF NOT EXISTS radar_events_token_block ON radar_events(token,block,id);
   CREATE INDEX IF NOT EXISTS radar_events_wallet_block ON radar_events(wallet,block,id);
   CREATE INDEX IF NOT EXISTS radar_launches_block ON radar_launches(block,token);`);
 }
 replaceEventRange(name:string,from:bigint,to:bigint,cursor:bigint,events:RadarEvent[]){
  this.transaction(()=>{
   this.db.prepare('DELETE FROM radar_events WHERE block>=? AND block<=?').run(Number(from),Number(to));
   const insert=this.db.prepare('INSERT INTO radar_events(id,token,curve,wallet,kind,block,value) VALUES (?,?,?,?,?,?,?)');
   for(const event of events)insert.run(event.id,event.token,event.curve,event.wallet,event.kind,Number(event.blockNumber),JSON.stringify(event));
   this.saveCursor(name,cursor,null);
  });
 }
}
```

Implement `replaceLaunchRange`, `cursor`, `launchByToken`, `launchByCurve`, `eventsForToken`, `eventsForWallet`, position/score upserts, bounded cursor pages, activity queries, watchlist CRUD, `health`, and `close` using prepared statements. Cursor tokens are base64url JSON objects containing the final `(block,id)` pair and reject malformed input.

- [x] **Step 5: Run store tests, typecheck, and commit**

Run: `node --import tsx --test test/radar-store.test.ts && npm run typecheck`

Expected: PASS with no TypeScript errors.

```bash
git add src/radar/types.ts src/radar/store.ts test/radar-store.test.ts
git commit -m "feat: add radar persistence store"
```

### Task 2: Global chain reader and resumable market indexer

**Files:**
- Modify: `src/chain/abi.ts`
- Create: `src/radar/reader.ts`
- Create: `src/radar/indexer.ts`
- Create: `test/radar-indexer.test.ts`

**Interfaces:**
- Consumes: `RadarStore.replaceLaunchRange`, `RadarStore.replaceEventRange`, `RadarStore.cursor`, and the contracts from Task 1.
- Produces: `RadarReader` and `RadarIndexer.start():void`, `tick():Promise<void>`, `status():RadarIndexerStatus`, `close():Promise<void>`.

- [x] **Step 1: Write a deterministic resume, filter, and singleton-cycle test**

```ts
test('indexes verified curves, resumes with overlap, and coalesces concurrent ticks',async()=>{
 const calls:Array<[string,bigint,bigint]>=[];
 const reader:RadarReader={
  chainId:async()=>4663,head:async()=>500n,block:async n=>({number:n,hash:`0x${n}`,timestamp:1000n+n}),factoryDeployment:async()=>100n,
  launches:async(from,to)=>{calls.push(['launches',from,to]);return [launch];},
  trades:async(from,to)=>{calls.push(['trades',from,to]);return [buy,{...buy,id:'unknown',curve:'0x0000000000000000000000000000000000000099'}];},
  profile:async()=>profile,quoteSell:async()=>null,
 };
 const store=new RadarStore(':memory:'),indexer=new RadarIndexer(store,reader,{rangeBlocks:200n,pollMs:30000,profileConcurrency:2,historyStartBlock:100n});
 await Promise.all([indexer.tick(),indexer.tick()]);
 assert.equal(store.eventsForToken(launch.token).length,1);
 assert.equal(calls.filter(([kind])=>kind==='trades').length,1);
 await indexer.tick();
 assert.ok(calls.some(([kind,from])=>kind==='trades'&&from===437n));
 await indexer.close();store.close();
});
```

- [x] **Step 2: Run the test and verify the missing reader/indexer failure**

Run: `node --import tsx --test test/radar-indexer.test.ts`

Expected: FAIL because `RadarReader` and `RadarIndexer` do not exist.

- [x] **Step 3: Add curve event ABI and normalize only complete logs**

```ts
export const curveBuy=parseAbiItem('event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)');
export const curveSell=parseAbiItem('event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)');

export interface RadarReader {
 chainId():Promise<number>;
 head():Promise<bigint>;
 block(number:bigint):Promise<{number:bigint;hash:string;timestamp:bigint}>;
 factoryDeployment():Promise<bigint>;
 launches(from:bigint,to:bigint):Promise<RadarLaunch[]>;
 trades(from:bigint,to:bigint):Promise<RadarEvent[]>;
 profile(token:string,block:bigint):Promise<Record<string,unknown>>;
 quoteSell(token:string,amount:bigint,block:bigint):Promise<bigint|null>;
}
```

Use viem `getLogs` by event topic without an address for `CurveBuy` and `CurveSell`, map buyer/seller to `wallet`, preserve block hash/transaction hash/log index, and let the indexer discard events whose curve is absent from `radar_launches`.

- [x] **Step 4: Implement one coalesced scheduling loop with recent-first bootstrap**

```ts
export class RadarIndexer {
 private pending:Promise<void>|null=null;
 private timer:NodeJS.Timeout|null=null;
 private stopped=false;
 tick(){
  if(this.pending)return this.pending;
  this.pending=this.runCycle().finally(()=>{this.pending=null;});
  return this.pending;
 }
 start(){if(!this.timer&&!this.stopped){void this.tick();this.timer=setInterval(()=>void this.tick(),this.options.pollMs);}}
 async close(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.pending;}
}
```

In `runCycle`, validate chain 4663, index the newest range first when no market cursor exists, replace the 64-block overlap, then advance one historical range for factory and tape. Store lag, last indexed block, queue depth, state, and a sanitized one-line error in `status()`.

- [x] **Step 5: Run focused and discovery regression tests, then commit**

Run: `node --import tsx --test test/radar-indexer.test.ts test/discovery.test.ts && npm run typecheck`

Expected: PASS; the fake reader receives one trade request per coalesced tick.

```bash
git add src/chain/abi.ts src/radar/reader.ts src/radar/indexer.ts test/radar-indexer.test.ts
git commit -m "feat: index global Pons market activity"
```

### Task 3: Fast launch profiles and cached Fresh/Launches feeds

**Files:**
- Modify: `src/radar/types.ts`
- Modify: `src/radar/store.ts`
- Modify: `src/radar/indexer.ts`
- Create: `src/radar/service.ts`
- Create: `test/radar-service.test.ts`

**Interfaces:**
- Consumes: `RadarReader.profile`, launch rows, market events, and indexer status from Tasks 1–2.
- Produces: `RadarService.status()`, `RadarService.launches(cursor)`, and `RadarService.signals({feed:'fresh'|'launches',window,cursor})` using SQLite only.

- [x] **Step 1: Write progressive-state and no-RPC-on-read tests**

```ts
test('fresh feed exposes progressive launch states from cached rows',()=>{
 const store=seedRadarStore();
 const service=new RadarService(store,()=>indexStatus);
 const page=service.signals({feed:'fresh',window:'24h',cursor:null});
 assert.equal(page.items[0]?.state,'profiled');
 assert.equal(page.items[0]?.token,launch.token);
 assert.equal(page.nextCursor,null);
 store.close();
});
```

- [x] **Step 2: Run the test and verify it fails before the service exists**

Run: `node --import tsx --test test/radar-service.test.ts`

Expected: FAIL with missing `RadarService`.

- [x] **Step 3: Persist bounded profile results and transitions**

Populate the exact `RadarProfile` fields defined in Task 1. The indexer moves `discovered → profiled → tracking`; it uses a two-slot queue, prioritizes newest and visible tokens, and records a sanitized `profileError` while retaining the launch.

```ts
private async profileLaunch(row:RadarLaunch,head:bigint){
 try{
  const profile=await this.reader.profile(row.token,head);
  this.store.saveLaunch({...row,state:'profiled',profile,profileError:null,updatedAt:Date.now()});
 }catch(error){
  this.store.saveLaunch({...row,state:'error',profileError:sanitize(error),updatedAt:Date.now()});
 }
}
```

- [x] **Step 4: Implement bounded cached feed queries**

`RadarService.signals` accepts only `signals`, `fresh`, `exits`, `launches`, or `wallets`; validates `24h`, `7d`, `30d`, or `all`; returns at most 50 rows; and uses the persisted block/id cursor. Fresh rows include identity, stage, age, phase, participant count, observed buy/sell flow, and missing inputs.

- [x] **Step 5: Verify and commit**

Run: `node --import tsx --test test/radar-service.test.ts test/radar-indexer.test.ts && npm run typecheck`

Expected: PASS without any reader call from `RadarService`.

```bash
git add src/radar/types.ts src/radar/store.ts src/radar/indexer.ts src/radar/service.ts test/radar-service.test.ts
git commit -m "feat: add cached launch radar feeds"
```

### Task 4: Incremental position and PnL accounting

**Files:**
- Create: `src/radar/positions.ts`
- Modify: `src/radar/store.ts`
- Modify: `src/radar/indexer.ts`
- Create: `test/radar-positions.test.ts`

**Interfaces:**
- Consumes: ordered normalized `RadarEvent[]`, launch pair token, optional executable sell quote.
- Produces: `applyPositionEvent(position,event)`, `markPosition(position,quote)`, and rebuilt `WalletTokenPosition` rows.

- [ ] **Step 1: Write exact buy, partial sell, close, and transfer-gap tests**

```ts
test('uses weighted average cost for a partial sell',()=>{
 let p=emptyPosition(wallet,token,zeroAddress);
 p=applyPositionEvent(p,buyEvent(100n,10n));
 p=applyPositionEvent(p,buyEvent(100n,30n));
 p=applyPositionEvent(p,sellEvent(50n,15n));
 assert.equal(p.tokenBalance,'150');
 assert.equal(p.remainingCost,'30');
 assert.equal(p.realizedPnl,'5');
 assert.equal(markPosition(p,45n).totalPnl,'20');
});

test('unmatched transfer makes return incomplete',()=>{
 const p=applyPositionEvent(emptyPosition(wallet,token,zeroAddress),transferInEvent(100n));
 assert.equal(p.complete,false);
 assert.equal(markPosition(p,50n).returnBps,null);
});
```

- [ ] **Step 2: Run tests and verify the module is missing**

Run: `node --import tsx --test test/radar-positions.test.ts`

Expected: FAIL with missing `positions.js`.

- [ ] **Step 3: Implement bigint-safe weighted-average accounting**

```ts
export function applyPositionEvent(position:WalletTokenPosition,event:RadarEvent):WalletTokenPosition{
 const balance=BigInt(position.tokenBalance),cost=BigInt(position.remainingCost),realized=BigInt(position.realizedPnl);
 if(event.kind==='buy'&&event.tokens!==null&&event.quote!==null)return {...position,tokenBalance:(balance+BigInt(event.tokens)).toString(),remainingCost:(cost+BigInt(event.quote)).toString(),buys:position.buys+1,firstBuyBlock:position.firstBuyBlock??event.blockNumber,lastTradeBlock:event.blockNumber,updatedAt:Date.now()};
 if(event.kind==='sell'&&event.tokens!==null&&event.quote!==null&&BigInt(event.tokens)<=balance){const sold=BigInt(event.tokens),allocated=balance===0n?0n:cost*sold/balance;return {...position,tokenBalance:(balance-sold).toString(),remainingCost:(cost-allocated).toString(),realizedPnl:(realized+BigInt(event.quote)-allocated).toString(),observedProceeds:(BigInt(position.observedProceeds)+BigInt(event.quote)).toString(),sells:position.sells+1,lastTradeBlock:event.blockNumber,updatedAt:Date.now()};}
 return {...position,complete:false,updatedAt:Date.now()};
}
```

`markPosition` returns `{openPnl,totalPnl,returnBps}` only when the position is complete and a current executable quote exists. An unmatched sell, incoming transfer, outgoing transfer, or event marked incomplete sets `complete=false` and never invents a cost basis.

- [ ] **Step 4: Rebuild affected positions inside every overlap transaction**

After `replaceEventRange`, collect affected `(wallet,token)` pairs from both deleted and inserted rows, replay all persisted events in block/log order, and replace their `wallet_token_positions` rows in the same transaction. Exclude null wallets, self-routing, configured infrastructure addresses, and quote values below the dust threshold.

- [ ] **Step 5: Verify and commit**

Run: `node --import tsx --test test/radar-positions.test.ts test/radar-store.test.ts test/radar-indexer.test.ts && npm run typecheck`

Expected: PASS; replay after overlap produces the same position as a clean build.

```bash
git add src/radar/positions.ts src/radar/store.ts src/radar/indexer.ts test/radar-positions.test.ts
git commit -m "feat: account for radar wallet positions"
```

### Task 5: Versioned Launch Quality, Wallet Reputation, and Radar Strength

**Files:**
- Create: `src/radar/scores.ts`
- Modify: `src/radar/store.ts`
- Modify: `src/radar/indexer.ts`
- Create: `test/radar-scores.test.ts`

**Interfaces:**
- Consumes: profile facts, positions, outcomes, recent token flow, holder facts, and data coverage.
- Produces: `scoreLaunchQuality`, `scoreWalletReputation`, `scoreRadarStrength`, all returning `ScoreSnapshot`.

- [ ] **Step 1: Write gates, confidence shrinkage, caps, and risk-penalty tests**

```ts
test('withholds launch quality below sixty known weight',()=>{
 const score=scoreLaunchQuality(launchFacts({known:['metadata','creatorConfig']}));
 assert.equal(score.value,null);
 assert.ok(score.unknownInputs.includes('deployerOutcomes'));
});

test('shrinks a small wallet sample toward fifty',()=>{
 const score=scoreWalletReputation(walletFacts({rawOutcome:100,completed:2,coverage:1}));
 assert.equal(score.confidence,'provisional');
 assert.ok(score.value!==null&&score.value>50&&score.value<100);
});

test('risk evidence subtracts no more than twenty five radar points',()=>{
 const score=scoreRadarStrength(strengthFacts({base:90,riskPenalty:40}));
 assert.equal(score.value,65);
});
```

- [ ] **Step 2: Run tests and verify the score module is missing**

Run: `node --import tsx --test test/radar-scores.test.ts`

Expected: FAIL with missing `scores.js`.

- [ ] **Step 3: Implement one shared weighted-score gate**

```ts
function weighted(components:ScoreComponent[],minimumKnownWeight:number){
 const known=components.filter(component=>component.known&&component.value!==null);
 const knownWeight=known.reduce((sum,component)=>sum+component.weight,0);
 if(knownWeight<minimumKnownWeight)return {value:null,knownWeight};
 const value=Math.round(known.reduce((sum,component)=>sum+component.value!*component.weight,0)/knownWeight);
 return {value:Math.max(0,Math.min(100,value)),knownWeight};
}
```

Implement the exact spec weights. Metadata is capped at 5 points. Wallet sample confidence is based on distinct completed positions and coverage, and displayed wallet value uses `Math.round(50*(1-confidence)+raw*confidence)`. Radar wallet contribution uses squared normalized reputation with diminishing returns and a per-wallet position-size cap. Apply verified risk penalties after the base calculation and cap the subtraction at 25.

- [ ] **Step 4: Persist score explanations and material transitions**

Store `modelVersion`, `asOfBlock`, `computedAt`, components, evidence, unknown inputs, confidence, and explanation. Insert `radar_activity` only when a score crosses a configured band or a material component changes; use deterministic IDs formed from subject, score kind, block, and transition.

- [ ] **Step 5: Verify and commit**

Run: `node --import tsx --test test/radar-scores.test.ts test/scoring.test.ts && npm run typecheck`

Expected: PASS; existing legacy score tests remain unchanged.

```bash
git add src/radar/scores.ts src/radar/store.ts src/radar/indexer.ts test/radar-scores.test.ts
git commit -m "feat: calculate evidence based radar scores"
```

### Task 6: Cached API, search classification, and process lifecycle

**Files:**
- Modify: `src/radar/service.ts`
- Modify: `src/observer-server.ts`
- Modify: `src/cli.ts`
- Modify: `test/observer-server.test.ts`
- Create: `test/radar-search.test.ts`

**Interfaces:**
- Consumes: `RadarStore`, `RadarIndexer`, `RadarService`, existing `HistoryStore`, and `TokenHistory`.
- Produces: all `/api/radar/*` endpoints and static route fallback for `/terminal/*`.

- [ ] **Step 1: Write endpoint and classification tests**

```ts
test('serves cached radar routes and classifies registered addresses',async()=>{
 const app=await startObserver(observerOptions({radarReader:fakeRadarReader,radarAutoStart:false}));
 try{
  assert.equal((await fetch(app.url+'/terminal/radar')).status,200);
  assert.equal((await fetch(app.url+'/api/radar/status')).status,200);
  const result=await (await fetch(app.url+`/api/radar/search?q=${token}`)).json();
  assert.deepEqual(result,{kind:'token',address:token,route:`/terminal/token/${token}`});
 }finally{await app.close();}
});

test('does not silently classify an unknown contract-shaped address as a wallet',()=>{
 const result=service.search(unknownAddress);
 assert.deepEqual(result,{kind:'unclassified',address:unknownAddress,choices:['wallet']});
});
```

- [ ] **Step 2: Run focused tests and verify the new routes return 404**

Run: `node --import tsx --test test/radar-search.test.ts test/observer-server.test.ts`

Expected: FAIL because `/api/radar/status` and `/terminal/radar` do not exist.

- [ ] **Step 3: Add strict bounded query parsing and endpoints**

Add:

```ts
if(req.method==='GET'&&path==='/api/radar/status'){send(res,200,radar.status());return;}
if(req.method==='GET'&&path==='/api/radar/signals'){send(res,200,radar.signals({feed:parseFeed(p.get('feed')),window:parseWindow(p.get('window')),cursor:p.get('cursor')}));return;}
if(req.method==='GET'&&path==='/api/radar/leaderboard'){send(res,200,radar.leaderboard({window:parseWindow(p.get('window')),sort:parseSort(p.get('sort')),status:parseStatus(p.get('status')),cursor:p.get('cursor')}));return;}
if(req.method==='GET'&&path==='/api/radar/search'){send(res,200,radar.search((p.get('q')??'').trim()));return;}
```

Also add launches, activity, token summary, wallet summary, watchlist GET/POST/DELETE routes. Limit queries to 50 items. Invalid enums, cursors, addresses, and ambiguous hexadecimal input return 400 with a specific message.

- [ ] **Step 4: Wire exactly one Radar indexer into server startup and shutdown**

Extend `ObserverOptions` with optional `radarReader`, `radarAutoStart`, and bounded Radar settings for tests. Construct one `RadarStore` on the same database, start one `RadarIndexer` when enabled, serve all terminal subpaths using `terminalBody`, and await `radarIndexer.close()` before closing stores. The request handler never calls `radarReader`.

- [ ] **Step 5: Verify endpoint compatibility and commit**

Run: `node --import tsx --test test/radar-search.test.ts test/observer-server.test.ts && npm run typecheck && npm run build`

Expected: PASS; existing `/api/token/history`, `/api/token/timeline`, and `/api/wallet/dossier` tests remain green.

```bash
git add src/radar/service.ts src/observer-server.ts src/cli.ts test/radar-search.test.ts test/observer-server.test.ts
git commit -m "feat: expose cached radar APIs"
```

### Task 7: Route-driven terminal shell and universal search

**Files:**
- Modify: `public/terminal.html`
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Modify: `test/observer-server.test.ts`
- Create: `test/terminal-ui.test.ts`

**Interfaces:**
- Consumes: Radar APIs from Task 6 and legacy token/wallet APIs.
- Produces: client routes for Radar, Leaderboard, Watchlist, Activity, Token Dossier, and Wallet Dossier with browser-state restoration.

- [ ] **Step 1: Write static UI contract tests**

```ts
test('terminal exposes four destinations and no Analyze navigation',()=>{
 const html=readFileSync('public/terminal.html','utf8');
 assert.match(html,/data-route="\/terminal\/radar"/);
 assert.match(html,/data-route="\/terminal\/leaderboard"/);
 assert.match(html,/data-route="\/terminal\/watchlist"/);
 assert.match(html,/data-route="\/terminal\/activity"/);
 assert.doesNotMatch(html,/>\s*ANALYZE\s*</i);
 assert.match(html,/id="global-search"/);
});

test('entity links are green only on hover or focus',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/\.entity-link\{[^}]*color:var\(--sand\)/);
 assert.match(css,/\.entity-link:is\(:hover,:focus-visible\)\{[^}]*color:var\(--green\)/);
});
```

- [ ] **Step 2: Run the UI tests and verify the old Analyze shell fails them**

Run: `node --import tsx --test test/terminal-ui.test.ts`

Expected: FAIL because the four route buttons and global search are absent.

- [ ] **Step 3: Replace the left Analyze form with persistent navigation and header search**

```html
<aside class="terminal-sidebar">
  <a class="terminal-wordmark" href="/terminal/radar">MEERKAT</a>
  <nav aria-label="Terminal">
    <a data-route="/terminal/radar" href="/terminal/radar">RADAR</a>
    <a data-route="/terminal/leaderboard" href="/terminal/leaderboard">LEADERBOARD</a>
    <a data-route="/terminal/watchlist" href="/terminal/watchlist">WATCHLIST</a>
    <a data-route="/terminal/activity" href="/terminal/activity">ACTIVITY</a>
  </nav>
</aside>
<form id="global-search" role="search">
  <input id="global-search-input" aria-label="Search token or wallet" placeholder="TOKEN, SYMBOL, OR ADDRESS" autocomplete="off">
  <button>SEARCH</button>
</form>
<main id="terminal-view" tabindex="-1"></main>
```

- [ ] **Step 4: Implement a small History API router and explicit wallet fallback**

```js
const routes=[
 [/^\/terminal\/radar$/,renderRadar],
 [/^\/terminal\/leaderboard$/,renderLeaderboard],
 [/^\/terminal\/watchlist$/,renderWatchlist],
 [/^\/terminal\/activity$/,renderActivity],
 [/^\/terminal\/token\/(0x[a-fA-F0-9]{40})$/,match=>renderTokenRoute(match[1])],
 [/^\/terminal\/wallet\/(0x[a-fA-F0-9]{40})$/,match=>renderWalletRoute(match[1])],
];
function navigate(path,state={}){history.pushState({...captureViewState(),...state},'',path);return renderRoute(path);}
window.addEventListener('popstate',event=>void renderRoute(location.pathname,event.state));
```

Search navigates a token result directly. An unclassified address renders an inline confirmation with `OPEN AS WALLET`; only that button navigates to `/terminal/wallet/:address`. Save active feed, filters, scroll position, and dossier tab in `history.state`; restore them on Back.

- [ ] **Step 5: Render Radar feeds with progressive, stale, partial, and empty states**

Build five feed tabs: Signals, Fresh, Exits, Launches, Wallets. Each row shows the fields defined by the spec, uses text beside color, links entities through `navigate`, paginates by API cursor, and polls only the active feed. Status shows last indexed block, data age, lag, worker state, and missing inputs.

- [ ] **Step 6: Verify routing and commit**

Run: `node --import tsx --test test/terminal-ui.test.ts test/observer-server.test.ts && npm run typecheck && npm run build`

Expected: PASS; `/terminal`, `/terminal/radar`, and dossier routes return the same shell and the navigation contract contains no Analyze destination.

```bash
git add public/terminal.html public/terminal.js public/terminal.css test/terminal-ui.test.ts test/observer-server.test.ts
git commit -m "feat: add route driven radar terminal"
```

### Task 8: Connected dossiers and PnL leaderboard

**Files:**
- Modify: `src/radar/service.ts`
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Modify: `test/radar-service.test.ts`
- Modify: `test/terminal-ui.test.ts`
- Modify: `test/wallet-dossier.test.ts`

**Interfaces:**
- Consumes: persisted positions/scores, current `TokenHistory` and wallet evidence responses, route shell from Task 7.
- Produces: unified Token Dossier, Wallet Dossier, eligible/provisional leaderboard, Pons links, Blockscout links, and buyer PnL columns.

- [ ] **Step 1: Write leaderboard eligibility and deterministic-order tests**

```ts
test('eligible wallets outrank provisional wallets and ties are stable',()=>{
 const rows=service.leaderboard({window:'30d',sort:'total-pnl',status:'all',cursor:null}).items;
 assert.deepEqual(rows.map(row=>row.wallet),[eligibleHigher,eligibleTieA,eligibleTieB,provisionalWinner]);
 assert.equal(rows.at(-1)?.status,'provisional');
});

test('wallet with a material transfer gap is not PnL eligible',()=>{
 const row=service.walletSummary(incompleteWallet);
 assert.equal(row.leaderboardEligible,false);
 assert.ok(row.eligibilityReasons.includes('material transfer gap'));
});
```

- [ ] **Step 2: Run service tests and verify eligibility fields are missing**

Run: `node --import tsx --test test/radar-service.test.ts test/wallet-dossier.test.ts`

Expected: FAIL because leaderboard aggregation and dossier summaries are incomplete.

- [ ] **Step 3: Implement first-party leaderboard aggregation**

Require at least three completed attributed positions, sufficient selected-window coverage, no material transfer gap, and no infrastructure/deployer/token classification. Support `24h`, `7d`, `30d`, `all`; sorts `total-pnl`, `realized`, `open`, `win-rate`, `reputation`; statuses `eligible`, `provisional`, `all`. Sort by eligibility first, selected metric descending, completed positions descending, then wallet ascending.

- [ ] **Step 4: Merge Radar summaries into the existing token dossier**

The token header contains verified identity, Pons and Blockscout links, Radar Strength, confidence, Launch Quality, qualified buyers, buy/sell flow, holders, creator revenue, deployer holding, freshness, and explanation. Keep exactly five deep tabs: Overview, Fee Flow, Relationships, Holders, Timeline. Overview adds `Who is buying` and `Who still holds`; complete rows show cost, executable current value, realized PnL, and total PnL. Existing deep-history loading and timeline pagination remain intact.

- [ ] **Step 5: Replace the wallet result with the connected wallet dossier**

The wallet header contains address, Pons profile, Blockscout, Wallet Reputation, confidence, judged tokens, profitable completed positions, early entries, round trips, fast exits, active positions, observed flow, coverage, and evidence explanation. Tabs are Profile, Positions, Recent Trades, Shared Wallets, Evidence. Token names are `.entity-link` buttons that navigate to `/terminal/token/:address`; each token also gets a Pons launch link and each action an exact Blockscout transaction link.

- [ ] **Step 6: Verify dossiers, leaderboard, and legacy analysis**

Run: `node --import tsx --test test/radar-service.test.ts test/wallet-dossier.test.ts test/token-history.test.ts test/fee-flow.test.ts test/relationship-graph.test.ts test/terminal-ui.test.ts && npm run typecheck && npm run build`

Expected: PASS; Fee Flow, Relationships, Holders, and Timeline behavior remains available through Token Dossier.

```bash
git add src/radar/service.ts public/terminal.js public/terminal.css test/radar-service.test.ts test/terminal-ui.test.ts test/wallet-dossier.test.ts
git commit -m "feat: connect radar dossiers and leaderboard"
```

### Task 9: Watchlist, Activity, readability, documentation, and release verification

**Files:**
- Modify: `src/radar/service.ts`
- Modify: `src/observer-server.ts`
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/evidence/radar-v2-2026-09-14.md`
- Modify: `test/radar-service.test.ts`
- Modify: `test/terminal-ui.test.ts`
- Modify: `test/docs.test.ts`

**Interfaces:**
- Consumes: all completed Radar V2 services and views.
- Produces: saved token/wallet lists, material activity feed, compliant responsive UI, user documentation, and release evidence.

- [ ] **Step 1: Write watchlist/activity and typography contract tests**

```ts
test('watchlist is idempotent and activity is material-only',()=>{
 service.watch({kind:'token',address:token});
 service.watch({kind:'token',address:token});
 assert.equal(service.watchlist().items.length,1);
 assert.equal(service.activity(null).items.filter(item=>item.material).length,service.activity(null).items.length);
});

test('desktop readability floors are encoded in terminal CSS',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/--body-size:17px/);
 assert.match(css,/--table-size:15px/);
 assert.match(css,/--meta-size:12px/);
 assert.match(css,/min-height:50px/);
 assert.doesNotMatch(css,/border-radius:\s*(?:[1-9][0-9]|[2-9])px/);
});
```

- [ ] **Step 2: Run tests and verify the final contracts fail**

Run: `node --import tsx --test test/radar-service.test.ts test/terminal-ui.test.ts test/docs.test.ts`

Expected: FAIL until watchlist routes, activity rendering, typography variables, and docs are complete.

- [ ] **Step 3: Finish Watchlist and Activity interactions**

Add idempotent token/wallet save and remove controls to dossiers and feed rows. Watchlist shows saved identities, current score, freshness, and last material change. Activity shows threshold crossings, watched entries/exits, creator changes, and material score changes with source block/transaction links; cosmetic recomputations do not create records.

- [ ] **Step 4: Apply the full readability and responsive contract**

Use `--body-size:17px`, `--table-size:15px`, and `--meta-size:12px`; body weight is at least 600; rows are 50px high. Let the terminal use the full viewport with useful columns at 2560px. At 1440px reduce columns without reducing type. At 390px stack modules, preserve minimum sizes, use horizontal scrolling only for data tables, and keep search/navigation operable. Restrict PressStart to the wordmark, large headings, and major scores.

- [ ] **Step 5: Update project docs and evidence**

Document the four destinations, universal search, score meanings, PnL limitations, worker lifecycle, environment settings, new SQLite tables, API routes, and operational restart behavior. Add current Radar, Token Dossier, Wallet Dossier, and Leaderboard screenshots to `docs/assets/` and reference them from README and ROADMAP with explanatory captions.

- [ ] **Step 6: Run complete automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass, TypeScript reports zero errors, and `dist/public` contains the updated terminal assets.

- [ ] **Step 7: Run live and visual acceptance checks**

Start the built server against a temporary database, confirm only one global worker is reported, wait for a verified launch and compare stored factory/trade events with Blockscout, restart and confirm cursors resume with overlap, then inspect Radar, Leaderboard, Token Dossier, and Wallet Dossier at 2560×1440, 1440×900, and 390×844. Record commands, timestamps, addresses, screenshots, observed lag, and any evidence gaps in `docs/evidence/radar-v2-2026-09-14.md`.

- [ ] **Step 8: Commit the verified release package**

```bash
git add src/radar/service.ts src/observer-server.ts public/terminal.js public/terminal.css README.md ROADMAP.md docs/ARCHITECTURE.md docs/assets docs/evidence/radar-v2-2026-09-14.md test/radar-service.test.ts test/terminal-ui.test.ts test/docs.test.ts
git commit -m "feat: complete MEERKAT Radar V2"
```

## Final acceptance gate

- [ ] `RADAR`, `LEADERBOARD`, `WATCHLIST`, and `ACTIVITY` are the only persistent terminal destinations.
- [ ] Global search opens registered Pons tokens directly and requires explicit wallet fallback for an unclassified address.
- [ ] Radar reads cached state and one server-owned indexer resumes after restart.
- [ ] Fresh and Launches work before deep token history is complete.
- [ ] Launch Quality, Wallet Reputation, and Radar Strength expose separate evidence and confidence.
- [ ] Weighted-average position accounting passes buy, partial-sell, close, quote, and transfer-gap cases.
- [ ] Eligible wallets cannot be outranked by provisional wallets in the PnL leaderboard.
- [ ] Token and wallet dossiers link to each other, Pons, and exact Blockscout evidence.
- [ ] Existing Fee Flow, Relationships, Holders, and Timeline remain functional.
- [ ] The terminal fills wide screens, uses readable type, and does not leave large unused side gutters.
- [ ] Full tests, typecheck, build, live chain checks, restart checks, and three viewport inspections are recorded before deployment.

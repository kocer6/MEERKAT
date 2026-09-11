# Terminal Intelligence Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MEERKAT terminal into a readable investigation workspace with consistent buy/sell semantics and three evidence-backed relationship graph modes.

**Architecture:** Extend the existing bounded relationship graph response with per-wallet trade and transfer aggregates plus reconstructed balances. Render those aggregates in the current dependency-free HTML/CSS/JavaScript terminal as separated summary zones, an interactive SVG graph, and a selected-wallet inspector.

**Tech Stack:** Node.js 24, TypeScript 5.9, built-in `node:test`, browser DOM APIs, CSS, SVG.

**Spec:** `docs/superpowers/specs/2026-09-11-terminal-intelligence-interface-design.md`

## Global Constraints

- MEERKAT remains read-only and local-first.
- Do not add signing, wallet connection, trading, or transaction paths.
- Attribute curve buys and sells only when `TokenEvent.initiator` exists.
- Keep pool swaps gray and unattributed without transaction-trace evidence.
- Reconstruct balances only from indexed ERC-20 `Transfer` events.
- Label holder rankings partial until the token index state is `ready`.
- Keep graph output bounded and expose truncation explicitly.
- Use pixel typography only for major headings, compact labels, and badges.

---

### Task 1: Evidence-backed graph aggregates

**Files:**
- Modify: `src/relationship-graph.ts`
- Modify: `src/token-history.ts`
- Test: `test/relationship-graph.test.ts`
- Test: `test/token-history.test.ts`

**Interfaces:**
- Consumes: `TokenProfile`, `TokenEvent[]`, and `options.complete`.
- Produces: `RelationshipNode` fields `buys`, `sells`, `boughtTokens`, `soldTokens`, `balance`, `shareBps`, `firstBlock`, and `lastBlock`; `RelationshipGraph.summary.holdersComplete`; correctly directed `curve buy`, `curve sell`, and `transfer` edges.

- [x] **Step 1: Write failing direction and holder-balance tests**

```ts
test('trade flow points token to buyer and seller to token',()=>{
 const graph=buildRelationshipGraph(profile,[event('buy','11'),event('sell','20')]);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve buy')?.from,token);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve buy')?.to,buyer);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve sell')?.from,buyer);
 assert.equal(graph.edges.find(edge=>edge.kind==='curve sell')?.to,token);
});

test('holder balances come only from transfer evidence',()=>{
 const graph=buildRelationshipGraph(profile,[
  event('Transfer','11',{venue:'token',initiator:null,actor:'0x0000000000000000000000000000000000000000',recipient:buyer,tokens:'100'}),
  event('Transfer','12',{venue:'token',initiator:null,actor:buyer,recipient,tokens:'40'}),
 ],{complete:false});
 assert.equal(graph.nodes.find(node=>node.address===buyer)?.balance,'60');
 assert.equal(graph.nodes.find(node=>node.address===recipient)?.balance,'40');
 assert.equal(graph.summary.holdersComplete,false);
});
```

- [x] **Step 2: Run the focused tests and verify they fail for the missing fields and old buy direction**

Run: `npm test -- --test-name-pattern="trade flow|holder balances"`

Expected: FAIL because the buy edge currently points from buyer to token and nodes do not contain balances.

- [x] **Step 3: Add the minimal aggregate model**

Implement a per-address accumulator in `buildRelationshipGraph`. Update it from attributed curve trades and valid Transfer sender/recipient pairs. For a buy, add `token → initiator`; for a sell, add `initiator → token`. Compute `shareBps` as `balance * 10000 / totalSupply`, clamp negative reconstructed balances to zero for holder display, and preserve raw signed balance internally only while aggregating.

Extend options to:

```ts
options: {maxNodes?:number; maxEdges?:number; complete?:boolean}={}
```

Return:

```ts
summary: {
 observedInteractions:number;
 unattributedPoolCalls:number;
 truncated:boolean;
 holdersComplete:boolean;
 coverage:string;
}
```

- [x] **Step 4: Pass index completeness from token history**

Change the graph construction in `TokenHistoryService.result` to:

```ts
buildRelationshipGraph(state.profile,events,{complete:state.status==='ready'})
```

- [x] **Step 5: Run focused and full model tests**

Run: `npm test -- --test-name-pattern="relationship graph|token history result"`

Expected: PASS.

- [x] **Step 6: Commit the independently working data contract**

```powershell
git add src/relationship-graph.ts src/token-history.ts test/relationship-graph.test.ts test/token-history.test.ts
git commit -m "feat: add evidence-backed graph aggregates"
```

---

### Task 2: Terminal zones and transaction semantics

**Files:**
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Test: `test/observer-server.test.ts`

**Interfaces:**
- Consumes: existing token history response plus the graph aggregates from Task 1.
- Produces: `.summary-grid`, `.zone-score`, `.zone-overview`, `.zone-market`, `.tx-buy`, `.tx-sell`, `.tx-transfer`, and `.tx-unattributed` UI semantics.

- [x] **Step 1: Write a failing terminal contract test**

Add assertions that terminal assets contain the stable zone and transaction hooks:

```ts
for(const hook of ['summary-grid','zone-score','zone-overview','zone-market','tx-buy','tx-sell','tx-transfer','tx-unattributed']){
 assert.match(css,new RegExp(`\\.${hook}`));
}
assert.match(js,/marketSummary/);
assert.match(js,/transactionClass/);
```

- [x] **Step 2: Run the terminal contract test and verify it fails**

Run: `npm test -- --test-name-pattern="terminal connects"`

Expected: FAIL because the new hooks and helpers do not exist.

- [x] **Step 3: Build the summary grid**

In `renderToken`, group the score card, token overview, and market activity into one `.summary-grid`. Keep existing score values. Token Overview contains phase, event count, index coverage, creator tax, deployer exposure, and evidence links. Market Activity aggregates only attributed curve trades and shows buy count, sell count, unique participants, observed spent, observed received, and net quote flow.

Implement:

```js
const transactionClass=kind=>kind==='buy'?'tx-buy':kind==='sell'?'tx-sell':kind.toLowerCase()==='transfer'?'tx-transfer':'tx-unattributed';
const marketSummary=(wallets,pairToken)=>({
 buys:wallets.reduce((sum,wallet)=>sum+wallet.buys,0),
 sells:wallets.reduce((sum,wallet)=>sum+wallet.sells,0),
 participants:wallets.length,
 spent:wallets.reduce((sum,wallet)=>sum+BigInt(wallet.spent),0n),
 received:wallets.reduce((sum,wallet)=>sum+BigInt(wallet.received),0n),
 pairToken,
});
```

- [x] **Step 4: Apply stable colors to tables and lifecycle evidence**

Split `BUYS / SELLS` and `SPENT / RECEIVED` into separate readable cells. Render buy values and badges with `.tx-buy`, sell values with `.tx-sell`, transfers with `.tx-transfer`, and protocol/unattributed events with `.tx-unattributed`.

- [x] **Step 5: Add the visual zone system and readable typography**

Add the palette variables `--buy:#55d889`, `--sell:#ff6b64`, `--transfer:#e7ad50`, `--graph:#8d7aff`, and `--overview:#7395b4`. Use subtle tinted backgrounds, a colored top or left border, larger body text, and responsive stacking. Preserve the existing MEERKAT amber palette and avoid neon glow effects outside small state indicators.

- [x] **Step 6: Run the terminal contract test and commit**

Run: `npm test -- --test-name-pattern="terminal connects"`

Expected: PASS.

```powershell
git add public/terminal.js public/terminal.css test/observer-server.test.ts
git commit -m "feat: divide terminal into readable intelligence zones"
```

---

### Task 3: Three-mode interactive relationship map

**Files:**
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Test: `test/observer-server.test.ts`

**Interfaces:**
- Consumes: graph nodes, graph edges, `summary.holdersComplete`, wallet summaries, and the existing `openAddress` navigation function.
- Produces: `renderRelationships(graph,token,profile,wallets)`, the modes `trade`, `holders`, `routes`, a selected-wallet inspector, zoom/reset controls, and pointer panning.

- [x] **Step 1: Extend the failing UI contract test**

```ts
assert.match(js,/TRADE FLOW/);
assert.match(js,/CURRENT HOLDERS/);
assert.match(js,/WALLET ROUTES/);
assert.match(js,/OPEN WALLET DOSSIER/);
assert.match(js,/holdersComplete/);
assert.match(css,/\.relationship-inspector/);
assert.match(css,/\.graph-mode-tabs/);
assert.match(css,/marker-end/);
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --test-name-pattern="terminal connects"`

Expected: FAIL because the modes and inspector are absent.

- [x] **Step 3: Implement graph mode state and mode-specific data selection**

Create a relationship workspace whose local state stores `mode`, `selectedAddress`, `scale`, `panX`, and `panY`.

- `trade`: include `curve buy`, `curve sell`, and `pool call` edges.
- `holders`: select positive-balance non-token nodes ordered by `shareBps`, then draw token-to-holder evidence lines.
- `routes`: include only `transfer` edges between non-token addresses.

Show `PARTIAL INDEX` beside Current Holders when `holdersComplete` is false.

- [x] **Step 4: Render directional SVG and legend**

Define separate arrow markers for buy, sell, transfer, and unattributed edges. Apply class names from `transactionClass`, use edge count to set a bounded stroke width, and show count plus first/last block in SVG titles. Keep the token centered in Trade Flow and Current Holders; use a deterministic radial layout for routes.

- [x] **Step 5: Render and connect the wallet inspector**

On node selection, show evidenced roles, buys, sells, formatted token quantities, reconstructed balance/share, first/last block, and existing evidence labels. The `OPEN WALLET DOSSIER` button calls:

```js
void openAddress('wallet',selected.address)
```

- [x] **Step 6: Add graph controls**

Add `+`, `−`, and `RESET` controls that update the SVG viewport transform. Add pointer drag panning with pointer capture. Apply `role="tablist"`, `role="tab"`, `aria-selected`, keyboard-selectable nodes, and a useful SVG `aria-label`.

- [x] **Step 7: Run the focused test and commit**

Run: `npm test -- --test-name-pattern="terminal connects"`

Expected: PASS.

```powershell
git add public/terminal.js public/terminal.css test/observer-server.test.ts
git commit -m "feat: add relationship investigation modes"
```

---

### Task 4: Product documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`
- Modify: `PLAN.md`

**Interfaces:**
- Consumes: the completed interface and verified behavior.
- Produces: an accurate handoff checkpoint and reproducible validation record.

- [ ] **Step 1: Update product documentation**

Document the three relationship modes, global transaction colors, partial-holder limitation, selected-wallet inspector, and the fact that holder balances are reconstructed from indexed Transfer evidence.

- [ ] **Step 2: Run complete automated verification**

```powershell
npm test
npm run typecheck
npm run build
node --check public/terminal.js
git diff --check
```

Expected: all tests pass, typecheck and build exit zero, JavaScript syntax is valid, and the diff has no whitespace errors.

- [ ] **Step 3: Perform browser QA with ZZZ**

Open `http://127.0.0.1:4664/terminal`, analyze `0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a`, and verify:

- all five zones are visually distinct and readable;
- BUY is green and SELL is red in summary, tables, graph, and lifecycle;
- Trade Flow arrows have correct direction;
- Current Holders reports complete or partial index truthfully;
- Wallet Routes contains transfers only;
- node selection updates the wallet inspector;
- Open Wallet Dossier and Back return to the correct token;
- the 760 px responsive layout stacks without clipped controls.

- [ ] **Step 4: Record the verified checkpoint and commit**

Update `HANDOFF.md` with the exact test count and browser findings.

```powershell
git add README.md HANDOFF.md PLAN.md
git commit -m "docs: record relationship interface checkpoint"
git push origin main
```

- [ ] **Step 5: Verify GitHub received the final commit**

Run:

```powershell
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: clean status and identical local/remote commit hashes.

# MEERKAT handoff — product terminal + GitHub project hub (2026-09-11)

The active product is a local read-only Pons V2 scoring and intelligence terminal. Token and wallet scores are the primary product surface; lifecycle and relationship views are the evidence layer. Never restore the paper-first UI or add a signer/transaction path.

Published relationship-interface checkpoint: `main` at `0ce3bb0`. The final documentation commit follows this implementation commit.

## Implemented checkpoint

`public/landing.*`: original field-board landing centered on token and wallet scoring, with terminal/source actions inside a wide information-rich hero. It uses `public/assets/meerkat-banner-v2.png`, removes the scan-line/marquee treatment and does not repeat a cropped hero at the bottom.

`public/terminal.*`: explicit Token/Wallet address modes. A transparent 0–100 score, confidence, component points and evidence reasons appear before token lifecycle or wallet behavior details. Five color-zoned areas separate score, overview, market activity, relationship map, wallet intelligence and lifecycle evidence. BUY is green, SELL is red, Transfer is amber and unattributed evidence is gray across summaries, tables, graph and lifecycle.

The relationship workspace has three persistent modes. Trade Flow points token to buyer and seller to token. Current Holders ranks balances reconstructed from indexed Transfer events and says whether the index is complete or partial. Wallet Routes contains direct address-to-address transfers only. Selecting a wallet opens its roles, trade counts, token amounts, balance, supply share and block range, then links to the full Wallet dossier. Mode, selection and zoom survive the three-second indexing refresh for the same token.

`src/token-history.ts`: durable token profiles/events, verified `TokenLaunched` lookup from block 0 to current head, 5,000-block indexing chunks, curve/pool/transfer/factory coverage, block-based early/fast behavior and bounded 429 retry. Transfer and trade event timestamps remain null; exact blocks and transaction hashes are preserved. Curve actors are attributed. Pool swaps remain unattributed without trace evidence.

`src/fee-flow.ts`: token-specific creator revenue from curve and pool sweep events, the initial/current fee recipient, launch routing, completed redirects and pending recipient changes. The terminal displays the recipient escrow balance as aggregate context and never counts it as token revenue. History index schema v2 clears stale event families atomically before rebuilding.

Interrupted jobs now reuse the saved verified profile and cursor instead of repeating the genesis-to-head launch lookup. Rate-limit backoff is bounded across a 60-second window. `src/relationship-graph.ts` builds a bounded multi-mode graph, reserves room for curve participants, holders and pool callers, and retains evidence for each investigation mode. Persisted legacy transfers that stored quantity in `details.value` remain usable without deleting the database.

`src/wallet-dossier.ts`: pure cross-token aggregation over histories stored by this local installation. It reports indexed/ready coverage, event counts, buys/sells/transfers and block-based behavior. Smart status stays `not assessed`; realized PnL stays null.

`src/scoring.ts`: deterministic token evidence and wallet behavior scores. Scores expose their components and confidence and never replace the underlying coverage or caveat.

Token index coverage is now a readiness gate rather than a source of score points. Non-ready token histories return `CALIBRATING` or `INDEXING ERROR` with a withheld value. Ready token scores use deployer exposure, creator tax, participant breadth, two-sided market activity and holder breadth. Dense `eth_getLogs` responses recursively split when the provider reports more than 10,000 matches.

`README.md`: public project homepage using the approved MEERKAT hero, direct product promise, local quickstart, current evidence, architecture flow, roadmap summary, token status and a complete documentation index.

`docs/PRODUCT.md`, `docs/ANALYSIS.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL-SETUP.md`, `ROADMAP.md`, `SECURITY.md`, `docs/TOKEN.md`, and `CONTRIBUTING.md`: public documentation created for users and contributors. `test/docs.test.ts` prevents missing required sections and broken local README links.

## Verification

- `npm run typecheck`: pass.
- `npm test`: 107 tests passed, 0 failed, including fee aggregation, index-schema migration, scoring, dense-range splitting, relationship modes, legacy transfer reconstruction, resume and public documentation contracts.
- `npm run build`: pass.
- Browser: the rebuilt `/` and `/terminal` were inspected at desktop and 390x844. The landing has no page-level mobile overflow; the wide hero, embedded actions and score-first sections remain readable. The real COPY dossier rendered a 100/100 token evidence score with high confidence and all four components before the relationship/lifecycle evidence.
- Real RPC: COPY `0xac79255f6f404eba14f316e8669d76573a2d7b1e` resolved to symbol COPY, launch block `59283454`; chunk `59283454..59288453` returned 3,170 events and 25 attributed curve participants in 5.3 seconds after RPC pacing fixes.
- Public documentation: required sections exist, every local Markdown link from the README resolves, and the MEERKAT hero reference is present.
- Full COPY backfill: interrupted at cursor `59293453` with `12,861` events; resumed from the expected 64-block overlap at `59293390`; completed captured head `60319607` with `41,302` events. The 596.249-second wall clock includes the deliberate stop, old-worker failure reproduction, debugging waits and rebuilds, so it is not a throughput benchmark.
- Relationship API on that database: 48 nodes, 96 routes, 41,299 observed interactions and 11,750 pool-caller-only interactions; large-history truncation was reported. Desktop and 390x844 browser checks passed, including click-through to Wallet mode and no page-level mobile overflow.
- Dense ZZZ recovery: the original 5,000-block transfer query exceeded the RPC's 10,000-log limit and the next range timed out. Adaptive splitting persisted 36,940 events in the first recovered checkpoint; a later live snapshot reached cursor 54,687,389 with 65,082 events, 29 attributed wallets and 48 bounded graph nodes while the score correctly remained withheld.
- ZZZ terminal QA: a completed captured head loaded 741,643 persisted events, 29 curve participants, token score 93/100 and 16 displayed reconstructed holders. Trade Flow retained green buys and red sells; Current Holders reported complete/partial state from the live index; Wallet Routes rendered 36 transfer-only routes across 13 displayed nodes. Selecting a graph wallet opened its reconstructed balance/share and the Wallet dossier; Back restored the same token, map mode and selected wallet. At 760 px the shell stacked to one column, the mode tabs and graph controls stayed inside the viewport, and the page had no horizontal overflow.
- HOP OUT fee-flow QA: captured head 60,571,478 completed with 6,366 events. Twenty-six exact creator payout events totaled 1.177461500182357592 ETH: 0.472838185133738444 ETH from the curve and 0.704623315048619148 ETH from the pool. The recipient `0x7c8560d80dc5d982231cef05f71bbd9d1961a3cc` was routed at launch, had no later recipient changes, and had a zero current escrow balance at the captured head.

## Immediate next task

Build global wallet discovery beyond histories already indexed locally, with bounded RPC ranges, durable cursor, partial-coverage reporting and exact transaction evidence.

Known limits: wallet mode searches local indexed histories rather than the entire chain; holder balances cover the indexed Transfer range and do not yet exclude every known protocol contract; the bounded visual graph is a ranked investigation view rather than the complete stored graph; recipient escrow balances can aggregate several launches; downstream transfers after an escrow withdrawal are not attributed without trace evidence; public RPC can still rate-limit a chunk and requires resume; pool swap end-user attribution needs trace evidence; no per-event timestamps; only the latest 500 lifecycle events are sent to the browser; no external notifications.

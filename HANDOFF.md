# MEERKAT handoff — product terminal + GitHub project hub (2026-09-11)

The active product is a local read-only Pons V2 scoring and intelligence terminal. Token and wallet scores are the primary product surface; lifecycle and relationship views are the evidence layer. Never restore the paper-first UI or add a signer/transaction path.

Published base checkpoint: `main` at `258afbf2d3f446151c73e0b6510f0909521f84b3`. The current checkpoint adds operational resume and the relationship map.

## Implemented checkpoint

`public/landing.*`: original field-board landing centered on token and wallet scoring, with terminal/source actions inside a wide information-rich hero. It uses `public/assets/meerkat-banner-v2.png`, removes the scan-line/marquee treatment and does not repeat a cropped hero at the bottom.

`public/terminal.*`: explicit Token/Wallet address modes. A transparent 0–100 score, confidence, component points and evidence reasons appear before token lifecycle or wallet behavior details. The relationship map, exact links, local dossiers and secondary Live Scout/watch/activity panels remain available. Typography was increased across the terminal.

`src/token-history.ts`: durable token profiles/events, verified `TokenLaunched` lookup from block 0 to current head, 5,000-block indexing chunks, curve/pool/transfer/factory coverage, block-based early/fast behavior and bounded 429 retry. Transfer and trade event timestamps remain null; exact blocks and transaction hashes are preserved. Curve actors are attributed. Pool swaps remain unattributed without trace evidence.

Interrupted jobs now reuse the saved verified profile and cursor instead of repeating the genesis-to-head launch lookup. Rate-limit backoff is bounded across a 60-second window. `src/relationship-graph.ts` aggregates a bounded 48-node/96-route graph and marks pool callers separately from attributed curve/transfer actors.

`src/wallet-dossier.ts`: pure cross-token aggregation over histories stored by this local installation. It reports indexed/ready coverage, event counts, buys/sells/transfers and block-based behavior. Smart status stays `not assessed`; realized PnL stays null.

`src/scoring.ts`: deterministic token evidence and wallet behavior scores. Scores expose their components and confidence and never replace the underlying coverage or caveat.

`README.md`: public project homepage using the approved MEERKAT hero, direct product promise, local quickstart, current evidence, architecture flow, roadmap summary, token status and a complete documentation index.

`docs/PRODUCT.md`, `docs/ANALYSIS.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL-SETUP.md`, `ROADMAP.md`, `SECURITY.md`, `docs/TOKEN.md`, and `CONTRIBUTING.md`: public documentation created for users and contributors. `test/docs.test.ts` prevents missing required sections and broken local README links.

## Verification

- `npm run typecheck`: pass.
- `npm test`: 95 tests passed, 0 failed, including scoring, relationship, resume and public documentation contracts.
- `npm run build`: pass.
- Browser: the rebuilt `/` and `/terminal` were inspected at desktop and 390x844. The landing has no page-level mobile overflow; the wide hero, embedded actions and score-first sections remain readable. The real COPY dossier rendered a 100/100 token evidence score with high confidence and all four components before the relationship/lifecycle evidence.
- Real RPC: COPY `0xac79255f6f404eba14f316e8669d76573a2d7b1e` resolved to symbol COPY, launch block `59283454`; chunk `59283454..59288453` returned 3,170 events and 25 attributed curve participants in 5.3 seconds after RPC pacing fixes.
- Public documentation: required sections exist, every local Markdown link from the README resolves, and the MEERKAT hero reference is present.
- Full COPY backfill: interrupted at cursor `59293453` with `12,861` events; resumed from the expected 64-block overlap at `59293390`; completed captured head `60319607` with `41,302` events. The 596.249-second wall clock includes the deliberate stop, old-worker failure reproduction, debugging waits and rebuilds, so it is not a throughput benchmark.
- Relationship API on that database: 48 nodes, 96 routes, 41,299 observed interactions and 11,750 pool-caller-only interactions; large-history truncation was reported. Desktop and 390x844 browser checks passed, including click-through to Wallet mode and no page-level mobile overflow.

## Immediate next task

Build global wallet discovery beyond histories already indexed locally, with bounded RPC ranges, durable cursor, partial-coverage reporting and exact transaction evidence.

Known limits: wallet mode searches local indexed histories rather than the entire chain; public RPC can still rate-limit a chunk and requires resume; pool swap end-user attribution needs trace evidence; no per-event timestamps; only the latest 500 lifecycle events are sent to the browser; no external notifications.

# MEERKAT public roadmap

This roadmap records product capability, not marketing dates. A feature moves to **Live locally** only after its acceptance gate is demonstrated in the repository.

## Live locally

### Token lifecycle indexer

- verifies a Pons V2 launch from the factory event;
- reads curve trades, phase events, native ETH pool swaps and token transfers;
- persists 5,000-block chunks and resumes with reorg overlap;
- keeps exact block, transaction, log and decoded evidence;
- summarizes attributed curve participants without claiming identity or profit.

Acceptance evidence: tests, build, browser QA, and the bounded COPY integration sample recorded in `docs/evidence/landing-terminal-v1-2026-09-11.md`.

### Local product shell

- branded public landing page and separate analysis terminal;
- token and wallet address modes;
- local SQLite persistence;
- no signer or transaction route.

## Building now

### Complete lifecycle operations

- prove a launch-to-head backfill through the packaged server;
- interrupt after multiple chunks, restart, and record cursor resume behavior;
- expose refresh/head age so `ready` cannot be confused with permanently current.

Acceptance gate: a reproducible evidence report with duration, block range, event count, interruption point, restart cursor, and final status.

### Global wallet discovery

- discover relevant Pons events for a wallet beyond histories already stored locally;
- bound RPC range and concurrency;
- save the discovery cursor and make partial coverage visible;
- merge results into the existing dossier without duplicate events.

Acceptance gate: clean-install test showing a previously unseen wallet can be indexed, interrupted, resumed, and audited from exact transactions.

## Next

### Relationship map

Visualize deployer, attributed curve buyers/sellers, transfer routes, and pool callers. Edges will name the exact on-chain event. Router calls and unattributed pool actors will remain visibly distinct from end-user ownership claims.

### Saved cases and alerts

Let users save a token or wallet investigation, attach local notes, and define local rules for new evidence. Alert delivery must preserve the triggering block/transaction and survive restart.

### Evidence export

Export a portable JSON bundle containing the input, chain/deployment identity, coverage, profiles, events, labels, rule versions, and generation time. Add a human-readable report after the schema is stable.

## Planned

### Versioned read-only API

Publish schemas for token history, wallet dossier, case and evidence export endpoints. Add pagination instead of sending a fixed browser window.

### Hosted public terminal

Package a public read-only deployment with RPC quotas, abuse controls, observability, cache policy, and a clear service status. The local install remains supported.

## Later

- additional Pons pair types after source adapters and quantity semantics are validated;
- additional chains after deployment/ABI provenance and integration fixtures exist;
- comparative wallet cohorts after global discovery and outcome methodology are defensible.

## Product boundary

MEERKAT will remain useful without wallet connection or token ownership. No roadmap item requires custody, a private key, transaction signing, or gated access to the base evidence terminal.


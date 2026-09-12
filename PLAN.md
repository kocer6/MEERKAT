# MEERKAT product plan

Updated 2026-09-11. The user approved a branded landing page plus a separate read-only token/wallet terminal.

## Product contract

MEERKAT scores Pons V2 tokens and locally evidenced wallet behavior, then exposes the lifecycle and address relationships behind the number. No private key, signer, approval, or transaction path. No invented PnL, ownership, bot identity, or smart-money rating.

## Completed

- [x] Branded `/` landing page using the approved pixel-art desert and mascot direction.
- [x] Public roadmap with separate Live, Building, Next, Planned, and Later statuses.
- [x] Separate `/terminal` with explicit Token and Wallet modes.
- [x] Token profile lookup from the indexed Pons factory launch event; works without archive state.
- [x] Durable 5,000-block lifecycle indexing for curve events, phases, pool swaps, and transfers.
- [x] Curve participant aggregation and exact block-based early-entry / fast-exit evidence.
- [x] Local cross-token wallet dossier with honest coverage limits.
- [x] Live Scout, watchlist, monitoring, and activity retained as secondary tools.
- [x] Desktop and 390x844 responsive browser QA; no page-level horizontal overflow.
- [x] Real COPY evidence: verified launch block 59283454; first 5,000 blocks returned 3,170 events and 25 curve participants.
- [x] Public GitHub project hub with branded hero, quickstart, verified evidence, navigation, and honest token status.
- [x] Public product, analysis, architecture, local setup, roadmap, security, token-status, and contribution documents.
- [x] Automated README contract checking required documents and every local Markdown link.
- [x] Score-first token and wallet API/UI with visible components, confidence and caveats.
- [x] Wide informative 3:1 repository banner and original landing-page structure with readable type.
- [x] Withhold unfinished token scores and split dense RPC log ranges above provider limits.
- [x] Contextual Token ↔ Wallet back navigation plus Pons and Blockscout profile links.
- [x] Color-zoned terminal with green BUY, red SELL, amber Transfer and gray unattributed evidence.
- [x] Three-mode relationship workspace: Trade Flow, Current Holders and Wallet Routes.
- [x] Selected-wallet graph inspector with direct dossier navigation and persistent view state during indexing.
- [x] Reconstruct holder balances from indexed Transfer evidence, including existing persisted histories.
- [x] Trace creator-fee flow from exact curve/pool sweeps, recipient configuration and recipient-change events.
- [x] Clear stale persisted event families atomically when the history index schema changes.
- [x] Normalize and index event addresses so wallet dossiers do not parse every stored token event.
- [x] Score current reconstructed holders instead of historical transfer recipients.
- [x] Include deployer, creator-fee and pending-recipient roles in wallet dossiers.
- [x] Gate legacy scores and fee flow during schema migration; clear transient profile errors after a successful retry.
- [x] Adaptively split launch discovery when an RPC rejects a wide block range.
- [x] Keep fee addresses and the centered relationship map usable on narrow screens; reveal results after mobile analysis.
- [x] Split token dossiers into five persistent evidence tabs and retain the active tab while indexing refreshes.
- [x] Move raw lifecycle events to a cursor-paginated endpoint with 50-event pages and BUY/SELL/TRANSFER/FEES filters.
- [x] Mark Fee Flow revenue partial until launch-to-head indexing is ready.
- [x] Add a fixed-height interactive ZZZ terminal preview with working Overview, Fee Flow, Relationships, Wallets and Timeline tabs plus a direct full-dossier route.

## Next acceptance gates

- [x] Complete a launch-to-head backfill through the packaged server and record duration, cursor, event count, and restart/resume evidence.
- [x] Add a relationship graph for deployer, curve buyers/sellers, transfer recipients, and explicitly marked pool callers.
- [ ] Build global wallet discovery beyond histories already indexed locally, with bounded RPC workload and saved cursor.
- [ ] Add known-contract exclusions and balance-conservation diagnostics to the shipped transfer-ledger holder reconstruction.
- [ ] Add separately timestamped Pons price, market-cap and phase context from an official source.
- [ ] Add saved cases and configurable local alert rules to Live Scout.
- [ ] Add lazy per-event block timestamps without blocking the base dossier.
- [ ] Document the read-only API and export token/wallet evidence bundles.
- [ ] Clean-install and packaged launch verification on Windows.

Current product status and exact evidence are in HANDOFF.md. Historical paper modules remain tests/development history and are not exposed by the default product server.

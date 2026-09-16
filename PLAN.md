LIVE-5S shared-read follow-up: five simultaneous public channels exposed 7.88-second gaps from repeated parsing of the full feed. Each stream tick now loads the stored feed once and derives all due channels from that common snapshot. 207 tests/typecheck/build pass. Next LIVE-5S-VERIFY: redeploy web and remeasure concurrent channels.

LIVE-5S checkpoint (2026-09-16): user requests five-second sync and no manual reload. Replace 15-second unchanged heartbeat with a full snapshot every five seconds; earlier revision changes still push sooner. Remove hover/focus deferral that prevented new rows appearing while pointer remained on the table. Preserve keyed buttons and scroll anchoring. Update sync label even when data is unchanged. Regression checks failed before changes, 207 tests/typecheck/build pass after. Next LIVE-5S-VERIFY: deploy web and measure recurring public events. Collection/scoring latency is distinct from five-second browser synchronization.

LIVE-VERIFY complete (2026-09-15): live Radar deployed through ee87e3f. 207 tests pass locally and on VPS; typecheck/build pass. Public SSE delivered real new Fresh/Launches/Exits tokens and changed Signals; browser confirmed automatic insertion, metadata completion, all tabs LIVE, dossier/back navigation. Bounded projection cycles measured 14.607-20.421 s vs previous 748-1231 s. Collector lag 0, leaderboard 100 rows. Evidence: docs/evidence/radar-live-updates-2026-09-15.md. Historical score backlog remains draining (~35k); fresh publication is independent and fresh scoring has reserved capacity. Next task: no required live-feed work remains; assess long-term historical projection drain separately.

LIVE fresh-priority follow-up (2026-09-15): public SSE delivered 10 new Fresh/Launches rows and 7 new Exits rows in a 6.5-second observation without reload. Give half of each projection batch to newest launches and half to oldest durable jobs, preventing fresh scores from waiting behind the legacy backlog. Reconnect UI now restores the last-update text even when snapshot contents are identical. Local 207 tests/typecheck pass. Next LIVE-VERIFY: confirm restarted bounded projector timings and public Signals changes; old projector is still stopping under its existing 120-second service timeout.

LIVE pipeline correction (2026-09-15): production verification exposed projection fan-out: 512 jobs expanded through every wallet position, cycles reached 748-1003 seconds and 35k queued jobs. Bound dependency propagation to actual wallet-score value changes and enqueue dependencies outside the current batch. Collector publishes changed launches/trades immediately; enricher publishes profiles/market independently; feed merge uses a transaction to retain concurrent writers. Projector no longer rebuilds the entire feed during leaderboard refresh. Two failing regressions reproduced missing collection publication and unbounded dependency expansion; now 206 tests/typecheck/build pass. Next LIVE-VERIFY: deploy workers and measure publication, stream changes and cycle duration.

LIVE-DEPLOY checkpoint (2026-09-15): shared SSE Radar feed stream implemented for Signals/Fresh/Exits/Launches (and Wallets). Incremental keyed rows retain watch buttons, hover/focus hold prevents reorder under interaction, changes highlight, reconnect and REST fallback preserve data, background tabs pause. Local 204 tests pass; typecheck/build pass. Browser QA: seeded separate local database added rows 30->31->32 without reload; existing buys 1->9->12 and scores updated; focused saved button retained, pending new row released on blur. Back restores scroll after first snapshot. Next task LIVE-VERIFY: deploy web only and verify public SSE events, all four tabs and services. Chain collection cadence unchanged.

MC-VERIFY complete (2026-09-14): 201 production tests pass, typecheck/build pass, all four services active. Historical profile backlog reduced from approximately 3300 to zero across repeated cycles; projection catch-up drained to ordinary 61-134-job batches while collection remained current. Fresh 50/50 named, newest-first; leaderboard 100 rows; new ROBINCHAD dossier READY in browser. API samples 0.156 s Fresh / 0.203 s leaderboard / 0.406 s cached history. Evidence: docs/evidence/radar-multicall-recovery-2026-09-14.md. Supersedes earlier pending MC verification notes. Next task: no required recovery work remains; evaluate dedicated provider capacity if sustained traffic exceeds public quotas. External quote coverage and evidence-gated P/L are not guaranteed.

MC UI verification: new ROBINCHAD opened from Fresh and reached READY with verified identity, six dossier tabs, buyers/holders and tape. Browser header now advances without reload. Distinguish completed-but-unlisted external quotes from loading, and insufficient score evidence from pending computation. Local 201 tests/typecheck pass. Enrichment recorded three zero-backlog passes; final projection and API acceptance is next (MC-VERIFY).

MC cache acceptance follow-up: missing profiles fell to 808; temporary projection backlog grew to 1840 because each 128-job pass re-expanded shared-wallet dependencies. Increase the bounded projection pass to 512 to amortize that work. A failing regression also reproduced incremental cache appends leaving new launches at the bottom of Fresh; explicit descending launch-block sorting fixes it. Local 200 tests/typecheck pass. Next MC-VERIFY: confirm projection drain and real newest-token dossier on production.

MC live follow-up: 400-profile Multicall cycles succeeded in 18.7-22.6 s; missing profiles fell from about 3300 to 1963 while collection continued. Projection has a temporary catch-up backlog, still verifying drain. Fixed stale terminal header by polling status every 15 seconds with recovery and degraded/stalled states; functional regression added. Local 199 tests and typecheck pass. Next MC-VERIFY: complete queue drain and production UI/API checks.

MC catch-up follow-up: first production Multicall pass completed 100 missing profiles in 7.836 s versus preceding 20-profile cycles of 25-40 s. Raise bounded throughput to 400 profiles plus up to 100 stale refreshes, still only two concurrent 20-token eth_call batches. Regression reproduced a newer-than-captured-head launch being read before creation and incorrectly cooled down; defer those rows without error. Local 198 tests pass. Next MC-VERIFY: verify larger-batch RPC health, sustained queue drain and current visible coverage.

Multicall enrichment checkpoint (2026-09-14): verified deployed Multicall3 bytecode on Robinhood. Profiles now read bounded groups of 20 in one block-pinned eth_call, validate factory identity against the launch, and isolate token-level failures. Production enrichment default is 100 new profiles plus up to 25 stale profiles per pass, with two concurrent batches. Local npm test: 197 pass; typecheck/build pass. Next task MC-VERIFY: deploy and measure actual successful profiles, queue slope, provider errors and collection lag before claiming throughput recovery.

Split pipeline production acceptance (2026-09-14): deployed through 447ecf3; 195 tests pass on VPS, typecheck/build pass. All four services active. Collector recovered after RPC isolation and bounded catch-up, advanced to captured head 63069677 with lag 0/error null; last cycles 1.8-1.9 s. Final sample: Signals 50/50 named and 42/50 priced; Fresh 50/50 named and 40/50 priced; leaderboard 100 rows. Cached feed/leaderboard reads sampled 0.156 s. Evidence: docs/evidence/radar-split-pipeline-2026-09-14.md. This supersedes earlier pending-deployment notes below. Remaining work: reduce the approximately 3300-profile historical backlog within provider capacity; missing external fields remain unavailable and five-minute eligibility is not a freshness guarantee.

# MEERKAT product plan

Updated 2026-09-13. The user approved a branded landing page plus a separate token/wallet evidence terminal.

## Product contract

MEERKAT scores Pons V2 tokens and locally evidenced wallet behavior, then exposes the lifecycle and address relationships behind the number. No private key, signer, approval, or transaction path. No invented PnL, ownership, bot identity, or smart-money rating.

## Completed

- [x] Deploy split services; enlarge projection batches to amortize shared-wallet dependencies and correct UTF-8 in new market labels. Verification in progress on live workload.

- [x] Implement separated collection, enrichment and projection commands/services with durable versioned work, safe late-result writes and cached external market snapshots. Local verification: 191 tests, typecheck/build, JS syntax; deployment verification pending.

- [x] Production regression acceptance: FRESH/SIGNALS/LAUNCHES 50/50 named; cold token history and browser dossier/leaderboard flows verified. Evidence: `docs/evidence/radar-metadata-recovery-2026-09-14.md`.

- [x] Reserve metadata capacity for both the visible FRESH page and incoming launches; keep scored and active backlog progressing. Continuous-arrival regression passes. Verification: 182 tests, typecheck/build; production cold MIAO dossier cache 67 ms, full history 14.1 s.

- [x] Connect token history discovery to Radar's persisted launch block, verify the hinted factory event before use, and fall back on a stale hint. Batch independent profile reads; show cached Radar participants while full history loads. Local verification: 181 tests, typecheck/build and JS syntax.

- [x] Fix Radar metadata queue starvation: reserve half the batch for fresh launches, back off failed profiles, keep metadata patches independent of the full-view refresh clock, and refresh the open feed every ten seconds. Regression tests reproduce all three scheduler failures.
- [x] Index wallet/token and token/position reads, batch score writes, and group leaderboard outcomes/infrastructure once per window. Local verification: 179 tests (including retry-clock isolation), typecheck, build; production cycle and FRESH verification follows deployment.

- [x] Branded `/` landing page using the approved pixel-art desert and mascot direction.
- [x] Public roadmap with separate Live, Building, Next, Planned, and Later statuses.
- [x] Separate `/terminal` with explicit Token and Wallet modes.
- [x] Token profile lookup from the indexed Pons factory launch event; works without archive state.
- [x] Durable 50,000-block adaptive lifecycle indexing with parallel curve, token, factory and pool reads plus automatic splitting for dense RPC ranges.
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
- [x] Split Trade Flow into BUY and SELL views, arrange wallets around the token, and show per-wallet buy/sell counts in every graph mode.
- [x] Preserve and load Timeline pages across index refreshes, including checksummed token input, and remove the unused terminal utility column.
- [x] Expand landing and terminal workspaces across wide displays while retaining compact edge gutters and zero page-level overflow on mobile.
- [x] Add current product screenshots to the GitHub README and public roadmap.
- [x] Turn the README into a visual product tour covering score, fee flow, relationships, holders and paginated lifecycle evidence with real HOP OUT captures.
- [x] Add a tested public server mode with no browser control token, bounded index admission, hidden operator routes and SQLite health checks.
- [x] Add a production kit for loopback Node, Caddy HTTPS, systemd, UFW, unattended security updates and verified online SQLite backups.
- [x] Detect dense token Transfer histories and read 10,000-block windows with bounded concurrency while retaining wide reads for sparse ranges.
- [x] Serve indexing progress from a lightweight event count so repeated terminal polling does not rebuild a growing score and relationship dossier.

## Next acceptance gates

- [x] Deploy the reviewed public mode to `meerkat.my` and record DNS, TLS, restart, persisted-cursor and backup-restore evidence.
- [x] Split Radar indexing from HTTP, publish materialized feed/leaderboard views, add RPC failover configuration, and harden terminal response parsing.
- [x] Make Radar score updates incremental and refresh complete feed/leaderboard snapshots at most once every five minutes.
- [x] Batch concurrent Radar contract reads to accelerate token metadata profiling on rate-limited RPC.
- [x] Repair missing token profiles in score order and patch recovered metadata into the visible Radar feed immediately.
- [x] Add red/amber/green score identity to Radar tokens, leaderboard wallets, dossier headings and linked entities.
- [x] Expand token dossiers with market metrics, scored buyers, current holders, evidenced P/L and a transaction-linked tape.
- [x] Show profitable, losing and break-even outcomes immediately in Wallet Dossier and W/L in Leaderboard.

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

UTF-8 follow-up: normalize accidental doubled carriage returns in terminal.js before deployment; JS syntax and diff whitespace check pass.

Live follow-up: the 128-token projector drained its pending queue to zero. Add a five-second pause after completed projection to give collection/enrichment writers fair access to SQLite. Cold dossiers can show external snapshots before contract-profile RPC completes.

SQLite contention fix: project scores against a read-only WAL snapshot, buffer writes, commit only results in a short transaction, publish feed then acknowledge unchanged job revisions. Regression uses two real SQLite connections and writes during scoring. This addresses the observed cold HOODED history database-lock failure. Production re-verification follows.

RPC budget follow-up: live getLogs returned Too Many Requests; batch responses masked it as a viem UnknownRpcError. Use non-batched log transport and limit split enrichment to 20 missing profiles + 5 refreshes, concurrency 2, every 30 seconds. Cached endpoints stayed responsive. Verify collector resumes after provider cooldown.

Provider isolation: contract enrichment can use MEERKAT_ENRICH_RPC_URLS independently of the collector; external market batches proceed even if contract chainId fails. Disable periodic fallback ranking probes to preserve anonymous-provider quotas. Production collector uses verified BlockReq with official fallback, while contract enrichment/history use the official RPC. Both public providers showed quota limits, so no unlimited-freshness claim is valid.

Outage catch-up now respects rangeBlocks (2,000 production default) instead of issuing an unbounded range from the old cursor to head. A regression verifies cursor progress in bounded chunks.

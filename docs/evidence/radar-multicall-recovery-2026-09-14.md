# Radar throughput and UI recovery - 2026-09-14

Implementation through 20cb51e; supersedes the outstanding historical-profile backlog in the preceding split-pipeline report.

## Root causes and corrections

- Profiles previously required seven individual RPC operations and progressed about 20 new profiles per 25-40-second cycle. Multicall3 is deployed at the canonical address on Robinhood (bytecode verified live). Bounded 20-token groups now read all required fields at one captured block in one eth_call. Two groups run concurrently; the catch-up pass admits up to 400 missing profiles and 100 stale refreshes.
- Required per-token failures are isolated; optional metadata failure does not discard identity. Factory token, curve and deployer must match the verified launch. Existing compare-and-swap/reorg checks remain.
- Factory discovery can be ahead of the market cursor. Reading a launch before its creation produced a false registration error and a five-minute cooldown. Future-block rows are deferred without an error.
- Incremental feed-cache appends did not sort Fresh/Launches. They now explicitly sort descending by launch block before paging.
- Projection batches now contain up to 512 jobs, amortizing repeated shared-wallet dependency reads; computation still uses the non-blocking WAL read snapshot and short write phase.
- Terminal worker status refreshes every 15 seconds, recovers connectivity after errors, and marks degraded/stalled collection. Completed-but-unlisted external market data and insufficient scoring evidence are distinct from loading.

## Production verification

- 201 tests pass locally and on the VPS; typecheck and production build pass. All four systemd services active.
- First 100-profile batch completed in 7.836 seconds. Larger catch-up cycles completed in 18.688-23.660 seconds, processing about 400 missing profiles per pass.
- Historical missing-profile queue fell from roughly 3300 to 2753, 2353, 1963, 1585, 1185, 808, then 0. Multiple subsequent cycles ended at 0. Newly discovered tokens still enter between cycles; zero is not asserted at every instant.
- Temporary projection backlog exceeded 2000 during catch-up, then fell to 1676, 1208, 808, 340 and ordinary 61-134-job batches. Source cursor continued advancing with captured-head lag 0 and no error. This is a bounded moving queue, not a claim of permanently empty work.
- Public API sample: Fresh 50/50 named and sorted newest-first, 0.156 seconds; leaderboard 100 rows, 0.203 seconds; cached ROBINCHAD full history READY with 3 events, 0.406 seconds. Latencies are observations, not an SLA.
- Browser: selected newly launched ROBINCHAD from Fresh, observed loading then READY with verified identity, six dossier tabs, buyer/holder data and tape. After final reload the header advanced automatically, score showed LOW EVIDENCE, and unavailable external quote explained provider coverage instead of indefinite loading.

## Practical limits

Fresh-token ingestion is asynchronous, normally completing on a subsequent worker pass. Public RPC/API outages can still delay updates. External providers do not publish every token's price/liquidity, and scores/PnL remain unavailable when evidence is insufficient; no values were fabricated. The full historical profile backlog is resolved, but this report does not promise full-market five-minute freshness or profitable trading outcomes.

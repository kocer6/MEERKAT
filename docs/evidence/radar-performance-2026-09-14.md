# Radar performance checkpoint — 2026-09-14

This checkpoint records the production change that removed Radar computation from HTTP requests and made the background work incremental.

## Production architecture

- `meerkat.service` serves cached Radar views with its in-process Radar loop disabled.
- `meerkat-indexer.service` owns continuous launch, market, profile, score and materialized-view updates.
- Both processes share the WAL-mode SQLite database at `/var/lib/meerkat/observer.sqlite`.
- Feed and leaderboard snapshots publish atomically and no more than once every five minutes by default.
- Tail cycles recalculate only tokens and wallets affected by the current overlap or newly completed profiles.
- Concurrent contract reads use bounded JSON-RPC batches; `MEERKAT_RPC_URLS` can provide an ordered provider pool.

The pre-deployment SQLite backup is `/var/backups/meerkat/observer-20260914T164325Z.sqlite`. Its own `PRAGMA quick_check` returned `ok`.

## Production measurements

Before the split, a leaderboard request rebuilt every wallet row and took `67.540944s`. With the worker actively indexing, the public routes returned:

- `/healthz`: `200` in `0.085625s`;
- `/api/radar/signals`: `200` in `0.131393s`;
- `/api/radar/leaderboard`: `200` in `0.140872s` and 100 rows;
- `/api/radar/activity`: `200` in `0.097526s`;
- Radar token summary: `200` in `0.122787s`;
- token history/progress: `200` in `0.099763s`.

The first post-batching cycle profiled 40 tokens in about one minute and completed in about 102 seconds while continuing launch and market ingestion. The metadata backlog changed from 1,511 to 1,503 across the cycle despite new launches. A second provider URL is still recommended for sustained production headroom; no unverified endpoint was added.

## Verification

- deployed and GitHub commit: `f064c68d65d2158ac6fc961768b81cb64a7a6cc0`;
- local and production `npm run typecheck`: pass;
- local and production `npm test`: 168 passed, 0 failed;
- local and production `npm run build`: pass;
- `meerkat.service` and `meerkat-indexer.service`: active;
- indexer journal after deployment: no application errors;
- browser: Leaderboard rendered ranked PnL rows, Radar rendered cached signals with `METADATA PENDING` instead of a false token name, and a token link opened the animated two-step indexing state without the previous empty-JSON failure.

## Expanded intelligence and metadata repair

Commit `21c2f32dfd7dfe30bf1695c1cdd9072478ea0605` is deployed to both production services. Missing profiles are now selected in the same descending Radar-score order used by Signals, and each completed profile patches name, symbol and phase into the current cached feed immediately.

The expanded terminal adds one score color scale across tokens and wallets, W/L counts in Leaderboard, profitable/losing/break-even totals in Wallet Dossier, and a six-tab Token Dossier. Its Market Intelligence tab contains eight headline metrics, scored buyer and holder tables, evidenced P/L and a transaction-linked tape. The tape reports exact blocks because individual Radar event timestamps are not indexed yet.

Production verification during active indexing:

- top Signals page: 50/50 rows had real token symbols after the first repair wave;
- `/healthz`: `200` in 165 ms;
- `/api/radar/signals`: `200` in 111 ms;
- `/api/radar/leaderboard`: `200` in 135 ms and 100 rows;
- PIXR Radar token summary: `200` in 96 ms, 16 positions, 31 events and 16 participant scores;
- top-wallet summary: `200` in 177 ms, 50 completed outcomes, 33 profitable, 17 losing and 0 break-even;
- local and production `npm run typecheck`: pass;
- local and production `npm test`: 174 passed, 0 failed;
- local and production `npm run build`: pass;
- browser: Radar, PIXR Token Dossier, Leaderboard and the top Wallet Dossier rendered with the new data and navigation.

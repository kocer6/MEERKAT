# MEERKAT Radar performance design

## Problem

The production web server and Radar indexer share one Node.js event loop. Score refreshes scan all events once per launch and wallet, while the leaderboard rebuilds every wallet row during the HTTP request. With the current database this makes leaderboard requests exceed 12 seconds, blocks unrelated routes, and can cause Caddy to return an empty upstream error body. The browser then calls `response.json()` on that empty body.

Unprofiled launches are displayed as `UNKNOWN`, and the newest-first profile queue processes only two launches per 30-second cycle. This makes useful metadata arrive hours after discovery.

## Approved architecture

- Run the HTTP application and Radar indexer as separate systemd services over the same WAL-mode SQLite database.
- The indexer remains the only writer of Radar market data and periodically publishes materialized feed and leaderboard rows to SQLite.
- The HTTP process reads those rows and SQL counts only. It never runs a full Radar score or leaderboard rebuild.
- Tail indexing remains frequent. Expensive scoring and materialized-view refreshes run in the indexer process and publish atomically.
- Concurrent contract reads use bounded JSON-RPC batches, reducing request count without increasing the logical profile batch.
- Accept a comma-separated RPC pool. Viem fallback transport selects a healthy endpoint and fails over when one provider is unavailable.
- Display `METADATA PENDING` for discovered launches. Prefer launches with observed activity in the metadata queue.
- Parse HTTP responses defensively so an empty proxy error becomes a useful retry message.

## Data model

`radar_views` stores versioned JSON snapshots under stable keys:

- `feed-rows`: all precomputed `RadarFeedRow` values.
- `leaderboard-all`, `leaderboard-24h`, `leaderboard-7d`, `leaderboard-30d`: precomputed `LeaderboardRow` values.
- `indexer-status`: last durable worker status.

The worker replaces each snapshot in one SQLite statement. Readers see either the old complete view or the new complete view.

## Runtime

`meerkat.service` starts `serve` with its in-process Radar loop disabled. `meerkat-indexer.service` starts `radar-index`. Both use the same environment and database. Each tail cycle recalculates only tokens and wallets affected by new events or profile results. The worker publishes an initial view after its first successful cycle and refreshes the complete feed and leaderboard snapshot at most once every five minutes by default.

## Success criteria

- Radar status uses SQL counts and does not deserialize every launch/event.
- Feed and leaderboard HTTP paths read materialized views when available.
- The leaderboard returns while a worker cycle is running.
- Empty or non-JSON responses show a stable retryable error instead of `Unexpected end of JSON input`.
- Multiple RPC URLs are accepted without exposing credentials.
- The production web and indexer processes are independently restartable and healthy.


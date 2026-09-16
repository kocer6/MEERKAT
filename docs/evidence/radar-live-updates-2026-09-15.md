# Radar live updates — 2026-09-15

## Delivered

- Shared server-sent event channels for Signals, Fresh, Exits, Launches and Wallets. One database revision poll per process, 15-second heartbeats, bounded 50-row snapshots, reconnect on interruption, REST fallback, pause hidden tabs.
- Keyed incremental table updates retain watch buttons and existing rows. New rows and changed values highlight; hover/focus holds ordering until interaction ends. Scroll anchoring and returning from a dossier are preserved.
- Fresh launch/trade publication is independent of score projection. Enrichment publishes profiles and market results independently. Feed merges are transactional.
- Production verification uncovered a legacy unbounded score dependency expansion: a 512-job pass grew through all positions of participating wallets. Only changed wallet-score values now enqueue dependencies for later bounded passes. Half the job budget serves fresh launches and half serves oldest jobs. Leaderboard refresh no longer rebuilds the complete feed.

## Verification

Code commits: 6dab9d1, 06deadd, ee87e3f.

- Local and VPS: 207 tests pass, zero failures; typecheck and build pass.
- Real HTTP/SSE tests cover external SQLite writes, additions, updates, removal, reconnect, multiple subscribers and clean server shutdown.
- Frontend regressions cover stale fallback races, reconnect, hidden-tab lifecycle, cleanup, retained buttons, held row ordering and new row release.
- Separate local browser fixture (not production): 30 -> 31 -> 32 rows without reload; buys 1 -> 9 -> 12; score updated; focused REMOVE FROM WATCHLIST retained while incoming row waited, then inserted after blur.
- Public HTTPS stream: initial 50-row snapshots in 0.98–2.47 seconds in the final sample. Second events at 22.95–22.97 seconds: Fresh and Launches each gained 23 tokens, Exits gained 13, Signals delivered a changed snapshot with the same membership. Earlier sample gained 10/10/7 tokens in 6.5 seconds.
- Production browser: all four tabs reached LIVE. Fresh top row changed from 0x633bde...fa92a9 to 0x725772...b8534d without navigation/reload. Metadata then filled in as SATOSHI. Opened JEETEREGRET dossier and returned to Fresh/LIVE.
- Production projector cycles after bounding: 20.421 seconds / 14.607 seconds, compared with preceding 747.919–1231.270 seconds. Queue sampled 35,925 -> 35,675 while collection continued. Collector at head 63862199, lag 0, error null; leaderboard API retained 100 rows.

## Limits

Delivery is live after stored data publication; chain collection still runs in roughly 30-second batches. Newly discovered tokens can appear before metadata and score are ready; missing evidence remains missing. The historical projection backlog is still draining (approximately 35k in the acceptance sample); this work does not claim it has cleared or that every token has price/P&L coverage. User interaction intentionally holds row reordering while existing values continue updating. The old long-running worker required the existing service stop timeout during deployment; restarted bounded workers are running.

## Five-second follow-up, 2026-09-16

LIVE-5S-VERIFY complete (2026-09-16): deployed 2221124. 207 VPS tests pass; local typecheck/build pass, production build succeeds. Five simultaneous public streams returned repeated snapshots: steady gaps 4.83-5.12 seconds; initial connection/warm-up gaps 5.49-6.73 seconds. Browser shows LIVE / Synced ... every 5s with 50 rows; Fresh opens without full reload. Hover/focus no longer defers incoming rows. This is browser synchronization of available stored data, not a promise that all RPC/enrichment/score computations finish every five seconds. Next task: no required five-second UI sync work remains.


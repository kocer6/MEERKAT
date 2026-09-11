# MEERKAT — read-only product plan

Updated 2026-09-11. This replaces the earlier paper-MVP product target at the user's explicit request.

## Product contract

No private key. No signer. No transaction path. MEERKAT watches real chain data and helps a user understand changes. It never claims to execute a buy/sell. Manual positions are explicitly user-entered, not wallet-verified.

## Implemented

- [x] Default observer server and UI; no demo balance, buy or sell endpoints.
- [x] Durable token watchlist, add/refresh/archive, maximum 50 active tokens.
- [x] Optional manual quantity and total entry cost; exact-quantity real quote and P&L before gas where supported.
- [x] Sequential background refresh; stale/error labels and retained last good observation.
- [x] Persistent reserve/phase/data-quality activity; in-app alerts, no execution.
- [x] Real launch discovery, saved cursor/history, bounded catch-up and shallow overlap replacement.
- [x] Observe-mode JSON export, loopback binding, origin/host checks, authenticated controls.
- [x] Automated tests and live read-only API evidence: docs/evidence/observer-live-2026-09-11.json.

## Next acceptance gates

- [ ] End-to-end browser interaction QA: add/manual position/pause/resume/archive/export and mobile inspection. Empty product page loaded successfully; full interaction QA remains open.
- [ ] Edit manual position details without archive/re-add; record corrections in activity.
- [ ] Configurable valuation thresholds as signals only, with deduplication and data-quality rules.
- [ ] Public address import and verified holdings, with explicit limitations on historical entry cost.
- [ ] External notification delivery, opt-in and tested (no provider currently configured).
- [ ] More risk signals, granular field quality, deep reorg handling and scalable history retention.
- [ ] Release review, clean-install and packaged launch checks.

70 tests currently pass across retained paper fixtures and new observer modules. This is an implemented local observer product, not a claim that every item above is complete. Do not estimate completion from the test count. See HANDOFF.md for the next exact operation.

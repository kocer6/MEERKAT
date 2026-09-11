# MEERKAT handoff — OBSERVER PRODUCT (2026-09-11)

The user explicitly replaced the paper-trading concept. No private key, no signer, no transaction path. Default `npm start` / built serve now run src/observer-server.ts and public/observer.* with separate data/observer.sqlite. Old paper code/database is preserved as development history; never expose its virtual holdings as real or restore paper-first UX.

## Implemented checkpoint

src/watch.ts: dedicated SQLite watch/activity/discovery store and real MarketReader service. Add optional manual quantity and total ETH cost, exact-quantity valuation, serial per-token mutations, 50-watch limit, archive, same-token duplicate checks, durable data errors/recovery, reserve drop >15% and phase events with increasing blocks and <=60s continuity. Manual position records are unverified. Outage retains last snapshot; UI labels errors/age. No trade methods in observer server.

src/observer-server.ts: loopback server with strict origin/Host, local control token, add/refresh/archive, polling pause/resume, read-only scanner, export. PositionMonitor is reused only as a polling scheduler; callback updates watches, never PaperEngine. Scanner reconnect uses generation guard and durable backfill. Shutdown waits for active reads/requests before database close.

public/observer.*: primary market-watch UX, real empty state, add token/optional holding record, watch cards, real discovery, activity/evidence/export. No fake data, paper balance, trade buttons or score. The prior warm brand palette is retained; no new artwork generation.

## Verification

- 70 total tests pass (includes historical fixture tests). New tests cover watch persistence, exact manual quantities, invalid inputs, outages, reserve-alert dedup, restart, observer API auth and absence of paper routes.
- Build and observer.js syntax pass.
- Live API probe: Devin at block 60124854, mode observe, add then refresh against real RPC, in-memory DB. Evidence docs/evidence/observer-live-2026-09-11.json; scripts/probe-observer.ts reproduces and overwrites file. No user watchlist pollution.
- New page opened in in-app browser (tab 3), initial DOM renders real empty watchlist. Full browser form interaction and visual/mobile QA remain unverified.

## Immediate next step

Complete browser interaction QA against the new page, then add manual-position edit flow with audit history. Read PLAN.md next gates. Do not revert to paper MVP instructions in older docs/audit material. No wallet import, external notifications or configurable position-price thresholds yet. In-app activity is the current notification channel. CLI demo command is a legacy test fixture, not the product workflow.

Known limits: 50 watches, bounded scanner history JSON, only latest 300 activity events displayed/exported, deep reorgs not handled, monitoring requires running local server; scanner reconnect manual. Non-native/unsupported phase quotes stay unavailable. Duplicate watch with different details rejects; archive/re-add required to change.

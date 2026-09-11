## Latest checkpoint: graduation exits through v4 (2026-09-11)

Existing native-ETH paper positions now quote their exact token quantity through Uniswap v4 Quoter after factory phase becomes 2. Reads, factory memeHook and simulation are pinned to one block. The pool key uses fee 0 per Pons v2, factory tick spacing and native ETH/token ordering. eth_call only; no signer or transaction. Quote failures retain the position. Exit journal records phase and quote model. Reserve watch becomes unavailable after graduation rather than comparing pool data to curve reserves.

56 tests and build pass, including curve-entry -> pool outage -> recovery -> manual paper exit. Live quoter verified at block 60099012; docs/evidence/pool-quote-2026-09-11.json. Reproduce read-only with node --import tsx scripts/probe-pool.ts (overwrites this evidence file).

Limits: new pool entries still blocked; non-native pairs, intermediate swept phase and rescued phase unsupported. Fixed modeled gas remains 0.0001 ETH per leg, not the quoter gas estimate. Full pool risk analysis remains open. Next priority: cross-block idempotent order replay, then durable discovery and more risk signals.
Sources: https://developers.uniswap.org/docs/protocols/v4/deployments and https://docs.ponsfamily.com/v2; ABI/quote pattern adapted from pinned Bodkin MIT.
## Latest checkpoint: persistent reserve watch (2026-09-11)

M3.3 partial: open chain paper positions now retain real ETH reserve snapshots in SQLite. A drop strictly above 15% between increasing blocks on the same curve within 60 seconds journals a warning. Missing RPC data, unsupported phases, old/duplicate blocks and long gaps do not fabricate a collapse. Last warning is historical and persists through restart; warnings never instruct an exit. Independent PnL rules still apply. API/export and Positions/Journal expose the state.

Validation: 53 tests pass, TypeScript build and browser JS syntax pass. Tests cover restart, duplicate suppression, unknown data, curve changes and warning-without-exit. UI rendering was not visually rechecked this checkpoint.

Next: full pool/graduation quote support, richer watch signals and durable discovery/reorg handling remain open. Also harden market order replay: current fingerprint includes block evidence, so replay at a newer block is rejected (no duplicate spend); same-block replay test now uses a deterministic timestamp.
# MEERKAT — exact continuation state

## Latest checkpoint: background position monitoring (2026-09-11)

PositionMonitor now starts with the local server, selects persisted open CHAIN positions directly from SQLite (independent of the launch feed), reads them sequentially and schedules the next cycle 15 seconds after completion. One in-flight cycle only; generation guards prevent duplicate loops on stop/start. Authenticated pause/resume endpoints and UI controls are available. Pause waits for an in-flight read to finish; the pause state is session-only and restart enables monitoring again. Server shutdown waits for monitor work before closing SQLite.

Each position exposes last success/error health. A failed quote retains its prior valuation and position; successful reads clear the error. Closing a position removes it from the next cycle. TP/SL/trailing/hold are evaluated automatically through the existing MarketTrading/PaperEngine path. No automatic entries. Unsupported pool phase continues to report an error and retain the position until pool quotes are implemented.

Fixed known negative-net-value bug: if token proceeds fall below modeled exit gas, net valuation can be negative and still trigger stop-loss. Ledger records negative liquidation value and actual modeled net proceeds, while respecting available funds for exit gas. Unknown RPC reserves remain errors; this does not turn unknown data into zero. Regression added for the previously failing case.

Verification: 49/49 tests, typecheck/build, JS syntax pass. Tests cover shared in-flight ticks, filtering open chain positions, error recovery/removal, stop waiting with no future scheduling, authenticated pause/resume, plus negative-net stop-loss and prior lifecycle tests. Browser pause and resume controls verified. Background scheduling is verified with mocked reads; no new live unattended-run duration is claimed.

Next: M3.3 reserve-change watch rules with field quality, then pool-phase quote support and graduation transitions. M3.4 remains PARTIAL: pinned polling/restart selection/error state exist, discovery durable backfill/reorg handling does not. Full safety intelligence and strategy editing also remain open. User has paused design work.



## Latest checkpoint: manual market-based paper trades (2026-09-11)

User priority is product; design remains paused. Inspect now shows five mandatory curve-entry checks: readable ETH curve/two-way quote, opening tax <= configured limit (3%), protocol+creator fees <=5%, requested amount <=1% of real ETH reserve, modeled round-trip loss <=10%. Each observed check contributes 20 to a curve-entry-fit score, but ALL must pass. This is deliberately not Bodkin's social/deployer score and not a contract-safety rating. Do not present 100 as investment confidence. Holder/deployer analysis is still missing.

src/market-trading.ts bridges the reader to PaperEngine. Buy re-reads the market, journals block/assessment evidence in Entry.evidence, and charges fixed modeled gas of 0.0001 ETH per side. It never uses browser-supplied quotes/scores. Sell reads the position's exact quantity and does not depend on a buy opening-tax read. Unsupported phases/errors retain the position rather than inventing a price. Controls: POST /api/paper/buy (token, amount, orderId), /api/paper/observe (id), /api/paper/close (id), all authenticated. Position updates are serialized per ID. Duplicate keys cannot create a second fill; replay may return the original result or fail when fresh evidence differs.

UI flow: Inspect -> Open paper position -> Update quote (valuation and TP/SL/trailing/hold evaluation) or Close paper position. Positions now distinguish CHAIN/SYNTHETIC, show unrealized PnL and valuation timestamp. Journal and export persist modeled fees/evidence. This checkpoint is MANUAL monitoring: no background position loop or automatic entry. The scanner's polling does not monitor positions.

Verification: 45/45 tests, typecheck/build, JS syntax pass. Tests cover quote-backed lifecycle, modeled gas, failed entry with no reserve, phase change/RPC failure preserving open state, take-profit, serialized competing exits, API auth and lifecycle. Real isolated in-memory cycle in docs/evidence/market-paper-cycle-2026-09-11.json: Devin token, entry block59744885 / exit59744893, 0.005 ETH + 0.0001 modeled entry gas, realized -0.000316024689560939 ETH. This is a verification sample, not performance evidence. Browser also verified Inspect -> Open -> Close on the same real token in the persistent demo workspace.

Exact next: M3.4 background bounded monitoring pinned to persisted open positions, per-position error/stale status and restart; M3.3 reserve-change watch rules without false zero on RPC failure. Then pool-phase quotes for graduation. M3.2 and M4.2 remain partial (pool support, richer risk intelligence, settings/start-pause auto-entry absent). Existing observe rejects valuations below modeled exit gas: such positions need manual Close until zero-net valuation monitoring is implemented and tested. No live execution or signer.



## Current checkpoint: real curve inspection (supersedes older next-work notes)

2026-09-10. User paused design work and prioritized product functionality. M3.2 is PARTIAL: real block-pinned native-ETH curve quotes and inspection UI now work. No market-based paper entry yet. Next: implement evidence-backed entry scoring/quality and explicit paper gas-cost model, then connect fresh quotes to manual PaperEngine buy/close and durable position monitoring. Do not fake a passing score to enable buy. Pool/graduated phases remain explicitly unsupported.

New src/chain/quotes.ts adapts pinned Bodkin integer fee/refund math with strict checks for unknown opening tax, invalid fees, closed curves and insufficient real reserve. src/chain/market.ts checks network 4663 and block age <=30s before/after all block-pinned reads; gets factory record, symbol/decimals, curve reserves, fees and tax. Tax failure stays null. Native ETH phase 0 only. Recipient for tax simulation is 0xdead; no wallet is connected. Quotes are independent snapshot estimates, include protocol fees/taxes, exclude gas and do not mutate reserves. They are not simulated on-chain transactions or execution guarantees.

POST /api/inspect?token=...&amount=0.01 requires the control token, validates 0<amount<=1 ETH and <=18 decimals, bounds concurrent inspections to one, and does not change the ledger. UI has token/amount form and per-launch Inspect buttons. Input edits invalidate prior displayed results; late responses cannot overwrite edited inputs. Form failures do not fabricate a quote.

Verification: Node24, npm test 40/40; npm run typecheck, npm run build, node --check public/app.js pass. Real evidence docs/evidence/curve-quote-2026-09-10.json: token RAJPUTIN at block59740859 with curve quote for 0.01 ETH. Browser form independently returned block59741003 and showed changing real reserves/quotes. Earlier font/readability CSS changes were already local when user paused design; preserved in this checkpoint, no further visual redesign. Unknown fee/reserve, wrong chain, stale block, invalid HTTP amount and auth cases covered. Tests use mocks; real network check is separate.


Updated 2026-09-10: M3.1 + local UI checkpoint. Read AGENTS.md and PLAN.md. Target: kocer6/MEERKAT main. User authorizes incremental GitHub checkpoints. The two-day PAPER MVP takes priority over full V1.

## Integration of Claude's work

Accepted remote main through 9bf67b9, including runtime Rules validation and granular entryReasons. Verified Claude's 26 tests on Node v24.20.0 (the previous Node 22 verification gap is closed). Preserved earlier uncommitted Codex UI on local branch checkpoint-local-ui-before-claude, commit 569d9fc; integrated only its UI/server files, keeping Claude's rules and tests. PaperEngine now freezes a copy of validated rules so callers cannot mutate safety limits afterward.

## Implemented

- Node 24 / TypeScript; SQLite transactional paper ledger, reservations, refunds/gas, idempotent entries, serialized exits and single-process recovery. Amounts serialize as decimal strings. Offline synthetic demo: 1 ETH -> 0.1 buy -> 0.14 sell -> 1.04 balance, zero fixture gas. TP/SL/trailing/max hold are implemented in the engine.
- Local HTTP dashboard: npm start -> http://127.0.0.1:4664. Persistent data/paper.sqlite; virtual initial balance 1 ETH and cumulative entry budget 0.5 ETH. Synthetic demo button, positions, rule summary, journal and JSON export. Build copies assets; npm run start:built runs compiled output. Loopback binding, exact Host/Origin validation, per-process control token and CSP protect controls.
- M3.1: read-only Pons V2 discovery using viem. Checks chain 4663, factory bytecode and latest launch against getLaunchedToken at the same block. Reads a bounded last-2,000-block snapshot, deduplicates events and retains at most 50 (UI shows 15). Single-flight refresh; start/pause controls poll every 30 seconds after each read completes. Stop/restart generation prevents duplicate polling loops. No network reads until the user connects the feed (or runs the market CLI).
- Failed reads retain the prior observation with error and original timestamp. No synthetic fallback. No private keys, wallet clients or transaction submission. The real launch panel is separate from synthetic paper fills.
- Imported only selected Bodkin ABI and factory constant with pinned attribution in THIRD_PARTY_NOTICES.md and full licenses/bodkin-MIT.txt. Canary code is not imported yet.

## Verification

Node v24.20.0: npm test **33/33**, npm run typecheck and npm run build pass. Claude baseline npm ci also passed before dependency addition; viem installation updated package-lock.json.

Tests cover core accounting, Claude's validation/filter cases, immutable settings, discovery chain/code/ABI failure, stale retention, dedup/single-flight and HTTP authorization/start/stop with no accidental paper entries. Network-dependent checks are separate from the offline tests.

Real read: node --import tsx src/cli.ts market returned connected on chain 4663, head 59541655, from 59539656, factory record check true. Public examples: docs/evidence/market-read-2026-09-10.json (first three events only). Browser subsequently loaded newer launches at head 59544379, verified pause and synthetic scenario; existing persisted balance 1.04 became 1.08 ETH after one more fixture cycle. Desktop and 390x844 mobile screenshots inspected; no page-level horizontal overflow, tables scroll internally. Browser console had no warnings/errors.

## Exact next work

**Next ID: M3.2.** Read the pinned upstream protocol modules and audit findings before implementing enrichment and quotes. Add read-only token/curve/pool inspection, quality-tagged opening tax and explainable score, explicit native-ETH-pair/phase support, current block-pinned buy/sell quotes. Test unknown RPC data and unsupported phases before connecting real-source quotes to PaperEngine. Never fill using a guessed zero tax or stale quote.

Then M3.3: Canary watch rules/quality, including failed reserve read staying unknown, never a false collapse or automatic LEAVE sell. M3.4: durable cursor/reconnect/backfill and pinned open-position monitoring. M4.2: strategy settings and manual paper entry/exit controls using those real adapters. Finish M4.1/M4.3 with health and position-specific timeline/unrealized PnL.

## Known limits

MVP is NOT complete. Current real feed only discovers events: no market score/tax enrichment, real quotes, real-source paper entries, automatic trading or watch rules. Snapshot is not complete launch history; no durable feed cursor or reorg reconciliation. Only the latest event's factory record is cross-checked each refresh. Settings UI and manual trade buttons are absent. No alerts, hosted deployment or token gating.

Single-user/single-process ledger; no schema migration gate. Server recovers interrupted paper orders only at startup. Cumulative demo budget is intentional, not reset per trade; repeat fixtures eventually hit the budget (including the conservative gas reserve). Start with a different MEERKAT_DB path for a fresh demo; do not delete user data. Browser timestamps and chain evidence are observations from this checkpoint, not permanent market facts.

## Checkpoint method

Update PLAN.md and this file before each commit. Git CLI push credentials are unavailable here; the connected GitHub API supports create_tree -> create_commit -> non-force update_ref. Base the tree/parent on the current remote main, preserve other contributors, then fetch and compare the local files with remote and verify ls-remote SHA. Do not assume the same connector is available in another AI environment; use its authorized GitHub method. Never commit databases, credentials, node_modules or build output.

## Latest checkpoint: brandkit design, 2026-09-10
Replaced the temporary green identity with the user's sand/amber pixel-art brand. New generated desert/meerkat hero, CSS avatar, locally hosted OFL pixel font, responsive five-step route and Scanner navigation. See docs/BRAND.md for palette, asset provenance and generation prompt. Assets are explicitly whitelisted by the local server and copied by the existing build. Desktop/mobile inspected; redesigned synthetic scenario completed. 33 tests, typecheck and build passed. Next engineering ID remains M3.2; this visual checkpoint does not complete additional trading features.

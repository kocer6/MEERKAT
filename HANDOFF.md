# MEERKAT — exact continuation state

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

# MEERKAT — exact continuation state

Updated 2026-09-10. Read AGENTS.md and PLAN.md. User authorizes incremental GitHub checkpoints; target kocer6/MEERKAT main. Two-day PAPER MVP takes priority over full V1.

## Implemented

Node 24 / TypeScript project with no runtime npm dependencies. Built-in node:sqlite ledger stores account, orders, positions and journal; fills are journal events. State changes are transactional. Amounts serialize as decimal strings. Reservations prevent concurrent budget overspend. Duplicate order keys do not buy twice. Exit locks prevent concurrent closes. Recovery releases interrupted paper reservations and reopens interrupted exits; call recover only at single-process startup.

PaperEngine supports entry filters, quotes, TP/SL/trailing/max hold, manual full close and valuations. Unknown opening tax blocks entry; unknown reserve remains null. Demo is synthetic and offline: 1 ETH -> 0.1 buy -> 0.14 sell -> 1.04 balance, zero synthetic gas. No wallet, signing or real market data.

Files: src/types.ts, rules.ts, ledger.ts, paper.ts, demo.ts, cli.ts; test/paper.test.ts and smoke.test.ts. Original implementation; upstream code is not imported yet. Add upstream MIT notices when importing.

## Verification

Test-first: smoke/core tests initially failed for missing modules. npm test: 9/9 pass; covers unknown tax, concurrent reservations, failed quotes, refund/gas, idempotency, concurrent exits, stale/future quotes, restart, exit rules, CLI demo. npm run typecheck/build: exit 0. npm ci and npm run demo verified for this checkpoint. Previous confirmed remote: f8836ed283dcc517ee931900aa0798f76e9d8f23. Use git log for this checkpoint SHA.

## Exact next work

Next task: M1.2 runtime validation, then M1.3/M3 adapters and M4 interface.

1. Validate Rules at construction; add balance/limit/config edge tests. Types alone do not enforce runtime inputs. M1.2 stays open.
2. Import required Bodkin protocol/score modules with license/provenance, not unsafe snipe orchestration. M2.2 stays open until richer score/filter reasons are integrated.
3. Real Pons V2 read-only discovery/quotes: chain/deployment checks, fresh tax in quote path, quality and open-position pins. No signer. Keep fixtures visibly synthetic.
4. Local authenticated control API/UI backed by ledger. No server exists yet.

## Known limits

Single-user/single-process paper core, not a live or multi-wallet ledger. No schema migration/version gate yet. Rules are supplied in code. Quote callbacks are internal adapters; external API requires runtime validation. Paper fills do not modify chain liquidity. A1/A5 are handled at our boundary, not upstream source changes or full RPC adapter tests. No UI, chain adapter, real quote validation, alerts, hosting or gating. MVP is NOT complete.

## Checkpoints

Update PLAN and this file with code changes, commands/outcomes, errors and exact next ID every checkpoint. Git CLI auth was unavailable; connected GitHub API writes work. Use current parent, never force update, verify ls-remote. Keep a local backup branch before aligning with API-created commit if SHAs differ. If interrupted, continue from current source and checklist rather than rerunning the audit.

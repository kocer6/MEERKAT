# MEERKAT — exact continuation state

Updated 2026-09-10 (M1.2 checkpoint). Read AGENTS.md and PLAN.md. User authorizes incremental GitHub checkpoints; target kocer6/MEERKAT main. Two-day PAPER MVP takes priority over full V1.

## Implemented

Node 24 / TypeScript project with no runtime npm dependencies. Built-in node:sqlite ledger stores account, orders, positions and journal; fills are journal events. State changes are transactional. Amounts serialize as decimal strings. Reservations prevent concurrent budget overspend. Duplicate order keys do not buy twice. Exit locks prevent concurrent closes. Recovery releases interrupted paper reservations and reopens interrupted exits; call recover only at single-process startup.

PaperEngine supports entry filters, quotes, TP/SL/trailing/max hold, manual full close and valuations. Unknown opening tax blocks entry; unknown reserve remains null. Demo is synthetic and offline: 1 ETH -> 0.1 buy -> 0.14 sell -> 1.04 balance, zero synthetic gas. No wallet, signing or real market data.

New this checkpoint (M1.2): `validateRules`/`assertRules` in src/rules.ts enforce runtime bounds on every field of `Rules` (minScore 0..100 int, maxTaxBps 0..10000 int, maxPositions >=1 int, maxGasWei non-negative bigint, quoteMaxAgeMs >0, takeProfitBps >0 int, stopLossBps 1..9999 int, trailingBps 0..9999 int, maxHoldMs >0). `PaperEngine`'s constructor calls `assertRules(rules)`, so a config built from JSON/env/UI that violates these bounds throws immediately at construction instead of silently reaching budget or exit-rule logic later. `Ledger`'s existing negative-balance/negative-budget guard is now covered by a test rather than only living in the source.

Files: src/types.ts, rules.ts, ledger.ts, paper.ts, demo.ts, cli.ts; test/paper.test.ts and smoke.test.ts. Original implementation; upstream code is not imported yet. Add upstream MIT notices when importing.

## Verification

`npm ci`, `npm run typecheck`, `npm run build` all exit 0. `npm test`: 15/15 pass (9 prior + 6 new this checkpoint): malformed-rules matrix (14 sub-cases: out-of-range/non-integer/wrong-type/zero-where-positive-required for every Rules field) all throw `/invalid rules config/`; default rules pass `validateRules` with zero reasons; `maxPositions` boundary (N entries reserve, N+1th rejected with `/position limit/` and never calls its quote function); run-budget boundary (reservation == budget succeeds, budget - 1 wei rejects with `/budget/i`); paper-balance boundary (reservation == balance succeeds leaving balance 0, balance - 1 wei rejects with `/insufficient paper balance/`); `Ledger` rejects negative initial balance and negative budget. `npm run demo` still produces the same fixed synthetic result as before (balance 1.04 ETH, take-profit exit).

Environment note: this sandbox ran Node v22.22.2, not the `>=24 <25` pinned in package.json's `engines`. node:sqlite behaved correctly here, but the pinned Node 24 runtime has not been re-verified in this specific session — do not treat this as a Node-24 pass, re-run the same commands on Node 24 before relying on it for a release checkpoint.

Previous confirmed remote: bd7adf9 (parent of this checkpoint). This checkpoint's local commit is 032f50b on top of bd7adf9, **not yet pushed**: `git push origin main` failed with `fatal: could not read Username for 'https://github.com'` — no git credential helper, `.netrc`, `GITHUB_TOKEN`, `gh` CLI, or GitHub MCP tool is available in this session's sandbox. The next session (or the user, from an authenticated environment) must run `git push origin main` from this checkout, or provide push credentials/a GitHub MCP connector, then verify with `git ls-remote origin main` that the remote SHA matches the local one before trusting that GitHub reflects this work.

## Exact next work

Next task: M1.3 (import required upstream modules) or M3.1 (real Pons V2 read-only discovery), then M2.2 (richer entry-filter/score reasons), then M4 (local control API/UI). Recommended order given MVP priority: M2.2 first (small, no new external dependency), then M3.1 (needed before M3.2-M3.4 and before M4 can show anything beyond fixtures), then M1.3 alongside it as adapters are pulled in, then M4.

1. M2.2 — Entry filters + score reasons: extend `entryReasons` in src/rules.ts beyond the current five checks (token format, amount>0, score range, tax known/under limit, source enum) with whatever additional scoring/filter reasons the two-day spec requires (see docs/MVP-2-DAY.md). Add matched/rejected/unreadable-input test scenarios and the A1 regression referenced in docs/audit/TECHNICAL-AUDIT.md. Unknown-tax-blocks-entry is already covered; do not regress it.
2. M3.1 — Verify chainId/deployment/ABI read-only for Pons V2 and connect a real feed behind the existing `Source = 'synthetic' | 'chain'` type. Record real block/tx/token examples and their source in docs/. `PaperEngine`/`Ledger` should not need changes if the adapter honestly returns `source: 'chain'` quotes shaped like `BuyQuote`/`SellQuote`; keep synthetic fixtures visibly labeled `synthetic` so they can never be mistaken for live data.
3. M1.3 — Import only the required Bodkin protocol/score modules with LICENSE/THIRD_PARTY_NOTICES and pinned provenance (see docs/audit/TECHNICAL-AUDIT.md for pinned revisions). Do not import the unsafe snipe orchestration. Confirm imports build and no upstream token/referral links or branding leak into MEERKAT's own interface.
4. M4.1 — Local authenticated control API/UI backed by the existing `Ledger`/`PaperEngine`. No server exists yet at all — this is greenfield. Must enforce Origin checks per AGENTS.md/PLAN.md M5.2 before it ships.

## Known limits

Single-user/single-process paper core, not a live or multi-wallet ledger. No schema migration/version gate yet. Rules are supplied in code (now runtime-validated at PaperEngine construction, but there is still no config file/env/UI loader that would exercise that path end-to-end — M4 will need one). Quote callbacks are internal adapters; external API requires its own runtime validation when M3 adapters land (BuyQuote/SellQuote shapes are trusted as given by the caller today beyond the checks already in `PaperEngine.buy`/`close`/`observe`). Paper fills do not modify chain liquidity. A1/A5 are handled at our boundary, not upstream source changes or full RPC adapter tests. No UI, chain adapter, real quote validation, alerts, hosting or gating. MVP is NOT complete.

## Checkpoints

Update PLAN and this file with code changes, commands/outcomes, errors and exact next ID every checkpoint. Git CLI auth was unavailable in earlier sessions; connected GitHub API writes work — this session has direct git+bash access to a full clone and is pushing over the git CLI. Use current parent, never force update, verify ls-remote after pushing. Keep a local backup branch before aligning with API-created commit if SHAs differ. If interrupted, continue from current source and checklist rather than rerunning the audit.

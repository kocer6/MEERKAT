# MEERKAT Radar Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Radar, Leaderboard, and token navigation responsive while background indexing continuously updates chain data.

**Architecture:** A dedicated indexer process writes market data and atomic materialized views to shared WAL-mode SQLite. The web process performs bounded reads and uses robust response parsing in the browser.

**Tech Stack:** Node.js 24, TypeScript, node:sqlite, viem, systemd, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-14-meerkat-radar-performance-design.md`

## Global Constraints

- Preserve the public read-only product contract: no private key, signer, approval, or transaction path.
- Never invent token metadata or PnL.
- Keep schema changes backward compatible with the production SQLite database.
- Keep web and indexer services independently restartable.

---

### Task 1: Durable materialized views

**Files:** `src/radar/store.ts`, `src/radar/views.ts`, `test/radar-store.test.ts`, `test/radar-service.test.ts`

- [x] Write failing tests for atomic generic views, SQL counts, and cached feed/leaderboard reads.
- [x] Run the focused tests and confirm missing APIs fail.
- [x] Add `radar_views`, count methods, view builders, and cached service reads.
- [x] Run the focused tests and confirm they pass.

### Task 2: Dedicated worker and RPC pool

**Files:** `src/cli.ts`, `src/observer-server.ts`, `src/radar/indexer.ts`, `src/radar/reader.ts`, `deploy/meerkat.service`, `deploy/meerkat-indexer.service`, `deploy/install.sh`, `deploy/meerkat.env.example`, `test/radar-indexer.test.ts`, `test/radar-reader.test.ts`, `test/docs.test.ts`

- [x] Write failing tests for durable status, active-launch profile priority, RPC URL parsing, and deployment units.
- [x] Run the focused tests and confirm the new contracts fail.
- [x] Add `radar-index`, persist views/status, disable the web-owned worker in production, and install the second service.
- [x] Run the focused tests and confirm they pass.

### Task 3: Browser failure handling and metadata state

**Files:** `public/terminal.js`, `test/terminal-ui.test.ts`

- [x] Write failing source-contract tests for safe response parsing, retry copy, and `METADATA PENDING`.
- [x] Run the UI test and confirm failure.
- [x] Implement the minimal client helper and label change.
- [x] Run the UI test and confirm it passes.

### Task 4: Verification and production rollout

**Files:** `PLAN.md`, `HANDOFF.md`, `docs/evidence/`

- [ ] Run typecheck, all tests, and build.
- [ ] Update project continuation records with exact results.
- [ ] Commit and push the focused checkpoint; verify the remote SHA.
- [ ] Back up production SQLite, deploy both services, and verify database integrity.
- [ ] Measure Radar, Leaderboard, Activity, and token route latency while the worker is indexing.
- [x] Recalculate scores only for tokens and wallets affected by the current tail cycle.
- [x] Bound full feed and leaderboard publication to a configurable five-minute interval.
- [x] Batch concurrent contract reads on each configured RPC transport.
- [ ] Inspect the production terminal and confirm metadata/error presentation.

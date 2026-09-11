# MEERKAT Landing and Terminal V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a branded landing page and a separate real read-only analysis terminal for Pons V2 token and public-wallet addresses.

**Architecture:** The loopback Node server serves two static page shells and existing JSON APIs. Token lifecycle indexing remains in `TokenHistory`; a small wallet-dossier service aggregates evidence from histories stored locally. Landing content is static and honest, while terminal state is rendered from API results.

**Tech Stack:** Node.js 24, TypeScript 5.9, viem, node:sqlite, semantic HTML, CSS, browser JavaScript.

**Spec:** `docs/design/LANDING-TERMINAL-V1.md`

## Global Constraints

- No private key, signer, approval, or transaction path.
- No invented market data, PnL, wallet ownership, or smart-money rating.
- Keep the existing approved MEERKAT artwork and locally hosted fonts.
- `/` is the landing page; `/terminal` is the product.
- Keep local installation as the default runtime.

---

### Task 1: Page routing contract

**Files:**
- Modify: `test/observer-server.test.ts`
- Modify: `src/observer-server.ts`
- Create: `public/landing.html`
- Create: `public/terminal.html`

**Interfaces:**
- Produces: `GET /` landing HTML and `GET /terminal` terminal HTML with the local control token.

- [x] Write a server test asserting separate page titles, `OPEN TERMINAL`, the roadmap, and absence of the control token from the landing page.
- [x] Run the focused test and confirm it fails because the routes do not exist.
- [x] Add the two page assets and exact route mapping.
- [x] Re-run the focused test and the full observer server test.

### Task 2: Honest wallet dossier aggregation

**Files:**
- Create: `test/wallet-dossier.test.ts`
- Create: `src/wallet-dossier.ts`
- Modify: `src/token-history.ts`
- Modify: `src/observer-server.ts`

**Interfaces:**
- Consumes: locally persisted `TokenEvent[]` from `HistoryStore`.
- Produces: `HistoryStore.tokens()` and `buildWalletDossier(address, histories)` with token participation, buys, sells, transfers, timing flags, and evidence coverage.
- Produces: `GET /api/wallet/dossier?address=0x...`.

- [x] Write failing aggregation tests for multiple token histories, empty evidence, invalid addresses, and refusal to claim smart status or realized PnL.
- [x] Run the focused tests and confirm the expected missing-module failure.
- [x] Implement the minimum store query, pure aggregator, and read-only endpoint.
- [x] Re-run focused tests.

### Task 3: Branded landing page

**Files:**
- Create: `public/landing.css`
- Create: `public/landing.js`
- Modify: `public/landing.html`

**Interfaces:**
- Consumes: `public/assets/meerkat-desert.png` and `public/assets/press-start-2p.ttf`.
- Produces: responsive hero, capability proof, product flow, honest roadmap, and terminal CTA.

- [x] Add a static contract test for required copy, roadmap statuses, local/open-source statement, and reduced-motion CSS.
- [x] Run the focused test and confirm it fails.
- [x] Implement the semantic landing sections and restrained mascot motion.
- [x] Re-run the focused test.

### Task 4: Token and wallet terminal

**Files:**
- Create: `public/terminal.css`
- Create: `public/terminal.js`
- Modify: `public/terminal.html`
- Modify: `src/observer-server.ts`

**Interfaces:**
- Consumes: `/api/token/index`, `/api/token/history`, `/api/wallet/dossier`, `/api/state`, and existing watch/scanner controls.
- Produces: explicit Token/Wallet modes, lifecycle view, participants table, wallet dossier, and secondary Scout/Watch panels.

- [x] Add static/server assertions for both modes and all referenced API routes.
- [x] Run the focused tests and confirm they fail.
- [x] Implement the terminal controller and accessible responsive layout.
- [x] Run JavaScript syntax checks and focused tests.

### Task 5: Product documentation and release evidence

**Files:**
- Modify: `README.md`
- Modify: `PLAN.md`
- Modify: `HANDOFF.md`
- Create: `docs/evidence/landing-terminal-v1-2026-09-11.md`

**Interfaces:**
- Produces: reproducible local start instructions, accurate status, visual-QA evidence, and the next implementation task.

- [x] Run final `npm run typecheck`, `npm test`, and `npm run build` after documentation changes.
- [x] Start the built server and verify `/`, `/terminal`, token validation, and the empty wallet dossier path.
- [x] Inspect desktop and mobile screenshots for both pages and record exact limitations.
- [ ] Commit the coherent checkpoint, push it, and verify the remote revision.

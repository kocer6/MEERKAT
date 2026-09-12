# Terminal Dossier Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized token dossier with five focused tabs, a paginated timeline API, readable mobile typography, and a more informative landing page.

**Architecture:** The summary endpoint keeps score, fee, relationship, wallet, and holder aggregates but omits raw lifecycle events. `HistoryStore` provides a cursor-paginated event query used by a dedicated read-only timeline endpoint. The browser renders stable tab panes and fetches timeline pages only when Timeline is opened.

**Tech Stack:** Node.js 24, TypeScript, `node:sqlite`, vanilla HTML/CSS/JavaScript, Node test runner, Playwright for browser QA.

**Spec:** User-approved requirements in the 2026-09-12 conversation and attached terminal audit.

## Global Constraints

- Remain read-only: no private key, signer, approval, or transaction route.
- Timeline page size is 50 and supports BUY, SELL, TRANSFER, and FEES filters.
- Pixel type is reserved for headings; readable metadata is at least 12 px.
- Preserve Token to Wallet navigation, Pons links, Blockscout evidence, score caveats, and relationship modes.

---

### Task 1: Paginated timeline data contract

**Files:**
- Modify: `src/token-history.ts`
- Modify: `src/observer-server.ts`
- Test: `test/token-history.test.ts`
- Test: `test/observer-server.test.ts`

**Interfaces:**
- Produces: `HistoryStore.timeline(token, {limit, cursor, types})`
- Produces: `GET /api/token/timeline?token=&limit=50&cursor=&types=`

- [x] Write failing tests for newest-first cursor pagination, filters, invalid input, and summary responses without raw events.
- [x] Run the focused tests and confirm the expected contract failures.
- [x] Implement indexed pagination and the read-only endpoint.
- [x] Run focused tests and commit the verified data contract.

### Task 2: Five persistent dossier tabs

**Files:**
- Modify: `public/terminal.js`
- Modify: `public/terminal.css`
- Test: `test/observer-server.test.ts`

**Interfaces:**
- Consumes: token summary and `/api/token/timeline`.
- Produces: Overview & Score, Fee Flow, Relationships, Wallets & Holders, and Timeline tab panes.

- [x] Write failing asset-contract tests for five tabs, lazy timeline loading, filters, pagination, and partial fee wording.
- [x] Run the focused tests and confirm failure.
- [x] Render stable tab panes, retain the active tab during polling, and lazy-load timeline pages.
- [x] Raise metadata sizes, contain graph labels, and keep mobile result scrolling.
- [x] Run focused tests and commit the verified terminal interface.

### Task 3: Informative landing product preview

**Files:**
- Modify: `public/landing.html`
- Modify: `public/landing.css`
- Test: `test/observer-server.test.ts`

**Interfaces:**
- Produces: a static terminal preview, mini relationship graph, dedicated live Fee Flow presentation, mascot interludes, and an Analyze HOP OUT example.

- [x] Write failing landing contract tests for the new product sections and example link.
- [x] Run the focused tests and confirm failure.
- [x] Add the new sections using existing MEERKAT assets and responsive CSS.
- [x] Run focused tests and commit the verified landing page.

### Task 4: Real-data and visual verification

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`
- Modify: `PLAN.md`

- [x] Run typecheck, all tests, production build, audit, and diff checks.
- [x] Measure summary payload and timeline page payload for HOP OUT and ZZZ.
- [x] Inspect desktop and 390 px terminal/landing screenshots, tab navigation, filters, load-more behavior, graph containment, and auto-scroll.
- [x] Record verified evidence in handoff documents, commit, and push `main`.

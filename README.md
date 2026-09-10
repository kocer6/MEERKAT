# MEERKAT

An explainable Pons V2 trading companion for Robinhood Chain.

**Status: offline paper core implemented.** SQLite accounting, budget reservations, exits and a synthetic demo work. No web UI or real market data yet. No real-money execution.

## Continue development

Start with the [shared plan and progress checklist](PLAN.md). To transfer work to Claude, use the [ready-to-copy continuation prompt](docs/CONTINUE-IN-CLAUDE.md).

1. Read [HANDOFF.md](HANDOFF.md) for the current state and next action.
2. Follow [AGENTS.md](AGENTS.md) for checkpoint and verification rules.
3. Build the [two-day MVP](docs/MVP-2-DAY.md), which takes priority over the [broader V1 specification](docs/V1-SPEC.md).
4. Review the [technical audit](docs/audit/TECHNICAL-AUDIT.md) before importing upstream modules.

The intended loop is discover -> explain -> paper enter -> watch -> exit -> journal. Commits preserve progress so another coding assistant can continue without the original conversation.

## Audit evidence

Pinned Bodkin and Canary revisions, findings and scope limitations are documented in the audit. Original test/build/typecheck and dependency audit outputs are in [docs/audit/evidence](docs/audit/evidence).

To reproduce the two mocked-RPC findings, install Node 24 and Git, then run from this repository root:

```sh
git clone https://github.com/Phosphenq/bodkin.git work/bodkin
git -C work/bodkin checkout 27b801ad5358061fc10f151cc1e305974df89178
git clone https://github.com/Gipppp121/canary.git work/canary
git -C work/canary checkout 376714b5a3134218020cf0f0e664ce5fa895578d
npm --prefix work/bodkin ci --ignore-scripts --no-audit --no-fund
npm --prefix work/canary ci --ignore-scripts --no-audit --no-fund
node --import ./work/bodkin/node_modules/tsx/dist/loader.mjs scripts/audit-repro.mjs
```

These checks confirm existing upstream defects using mocked clients; they do not send transactions and are not tests of a completed MEERKAT application. The archived audit report refers to its original local output layout; use the commands above for this repository.

## Run the offline core

Requires Node 24.x. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run demo`.

The demo prints JSON for a synthetic entry and take-profit exit: 1 ETH initial balance, 0.1 ETH buy, 0.14 ETH sell, 1.04 ETH final balance, zero synthetic gas. This is an accounting fixture, not a performance forecast. No key or network is required. The CLI uses an in-memory SQLite database; persistence/restart behavior is tested separately.

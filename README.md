# MEERKAT

An explainable Pons V2 trading companion for Robinhood Chain.

**Status: paper core, local dashboard and real read-only launch discovery implemented.** The dashboard demo still uses synthetic prices; real launch events are displayed separately. Market quotes and real-source paper entries are the next milestone. No real-money execution.

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

## Run the dashboard

After npm ci, run npm start and open http://127.0.0.1:4664. The paper scenario button runs the accounting fixture; positions, balance and journal persist in data/paper.sqlite. Export JSON downloads the current state. The initial virtual balance is 1 ETH and the cumulative entry budget is 0.5 ETH; repeated scenarios eventually reach that budget. Optional environment variables: PORT (default 4664), MEERKAT_DB (a different path starts a separate workspace).

Click **Connect chain feed** to read actual Pons V2 launches on chain 4663. It checks the factory deployment and latest event against its factory record, polls every 30 seconds after the previous read, and shows observation age and transaction links. Pause stops further polling. The feed is a snapshot of the last 2,000 blocks (up to 50 events, 15 displayed), not complete history. It does not create paper trades or provide scores/quotes yet. Failed reads remain explicitly marked; synthetic records never replace real observations.

For a one-shot JSON network check, run `node --import tsx src/cli.ts market`. Optional MEERKAT_RPC_URL overrides the public default https://rpc.mainnet.chain.robinhood.com. No wallet or key is needed. The standalone offline demo never contacts RPC.

To run compiled output: `npm run build`, then `npm run start:built`. Keep the control server on loopback; it is designed for one local process. No public hosting or live-money executor is included. See THIRD_PARTY_NOTICES.md for the selected upstream ABI attribution.

## Inspect real curve quotes
Use Inspect beside a scanner token, or paste a token address into Inspect a token. Enter an amount greater than zero and at most 1 ETH, then Inspect & quote. The panel shows symbol, phase, opening tax, protocol/creator fees, real ETH reserve, buy quantity/spend/refund, and an independent sell estimate at the same block. Only native ETH curves before graduation are supported. Quotes include fees/taxes but exclude gas; they are snapshot estimates, not execution guarantees. Scoring and market-based paper entry remain pending. Unknown critical fields or stale RPC blocks block quoting.

## Paper trade using market quotes
Inspect a supported token and amount, review all five entry checks, then choose Open paper position. The server re-reads the quote before recording a virtual fill. Modeled gas is fixed at 0.0001 ETH per side; it is not a measured transaction fee. Update quote on an open CHAIN position refreshes its value and evaluates TP/SL/trailing/hold rules; Close paper position performs a full virtual exit. **Open CHAIN positions are automatically monitored every 15 seconds after the previous cycle finishes.** Pause/resume is available in Positions; paused monitoring does not evaluate automatic exits. Pause lasts for this server session; restarting the server resumes monitoring. Scanner polling is separate. Unsupported graduation phases or RPC errors retain the open position and report failure. Entry checks cover curve liquidity/costs only, not contract safety, holders or deployer reputation.

Reserve watch: real ETH curve reserves are checked with position quotes. A fall over 15% within 60 seconds produces a persistent journal warning, not a sell instruction. Missing reads and phase changes break comparison. Positions show the last historical warning; existing PnL exit rules remain independent.

Existing native-ETH paper positions continue valuation and exits after Pons graduation using block-pinned Uniswap v4 Quoter eth_call. New entries into pools remain unsupported. Quotes include pool/hook effects; paper gas stays fixed at 0.0001 ETH per leg.

Retrying a completed market order with the same ID, token and requested amount returns its saved position without querying RPC or spending again, including after server restart. Failed/pending orders require a new explicit request. Browser retry keeps the ID until page reload or a new inspection.

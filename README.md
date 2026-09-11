# MEERKAT — Market Watch

Local read-only companion for Pons V2 on Robinhood Chain (4663).
**No private key. No signer. No transaction path in the product server.**

## Run

Requires Node.js 24.

```sh
npm ci
npm start
```

Open http://127.0.0.1:4664/. The default entry point is the observer product, not the former paper preview.
Use `MEERKAT_RPC_URL` for another HTTP RPC endpoint, `PORT` for the local port and `MEERKAT_DB` for the database file. Default data: `data/observer.sqlite`. Keep this file and its SQLite companions private; export can contain your manual positions.

## Use

1. Paste a Pons V2 token address, or connect Discover and select a real launch.
2. Leave amounts blank for a watch-only token. To track a position, enter token quantity and total ETH entry cost. These are user records, not verified wallet holdings.
3. The server refreshes saved watches sequentially every 15 seconds after the previous cycle. View phase, reserve, tax, exact-quantity estimated proceeds and P&L before gas when available.
4. Activity records reserve drops above 15%, phase changes and unavailable/restored data. No alert executes a trade. Remove archives a watch; it does not sell tokens.
5. Export observations includes watches, discovery and the latest 300 activity events. Pause stops polling for this session; restart resumes saved watches. Scanner needs Connect after restart.

Real native-ETH curve and graduated-pool position estimates use block-pinned reads. Failed reads retain the last observation with an error/age label. Unsupported phases/pairs show missing values/reasons. Quantity and entry cost cannot currently be edited in place: remove and add again. At most 50 active watches.

## Scope and limits

- Local product; server must be running for monitoring. Alerts are in-app only.
- Public-wallet import, verified wallet balances, configurable price alerts and external notification delivery are not implemented.
- This is not a contract safety audit, prediction service or automated trader. No all-clear score is presented.
- Discovery starts from the latest 2,000 blocks and resumes persisted history in bounded chunks; 64-block overlap does not cover deep reorgs.
- Old paper modules and their tests remain development fixtures. Their HTTP endpoints are absent from the default observer server. The former `data/paper.sqlite` is preserved and never shown as real holdings.

## Verify and continue

```sh
npm test
npm run build
npm run start:built
```

See PLAN.md and HANDOFF.md. `node --import tsx scripts/probe-observer.ts` runs a real read-only API check against an in-memory database and rewrites the named evidence file. Imported protocol code provenance remains in THIRD_PARTY_NOTICES.md.

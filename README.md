# MEERKAT — Token Intelligence

Local, open-source Pons V2 token and wallet intelligence for Robinhood Chain (4663).

**No private key. No signer. No transaction path.**

## What it does

- `/` is a branded product landing page with an honest public roadmap.
- `/terminal` accepts a Pons V2 token or a public wallet address.
- Token dossiers reconstruct the verified launch, curve buys/sells, factory phases, pool swaps, transfers, participants, and transaction evidence.
- Wallet dossiers aggregate behavior across token histories indexed by the local installation.
- Live Scout, watchlist, monitoring, and local activity remain available as secondary terminal tools.

MEERKAT labels observable behavior. An early entry is a curve buy within 30 blocks of launch; a fast exit is a sell within 300 blocks of that wallet's first indexed buy. It does not claim beneficial ownership, realized PnL, bot identity, or investment skill.

## Run locally

Requires Node.js 24.

```sh
npm ci
npm start
```

Open [http://127.0.0.1:4664/](http://127.0.0.1:4664/). Select **Open terminal** to analyze an address.

Environment variables:

- `MEERKAT_RPC_URL`: Robinhood Chain HTTP RPC endpoint.
- `PORT`: loopback port; default `4664`.
- `MEERKAT_DB`: SQLite file; default `data/observer.sqlite`.

The database and its SQLite companion files remain local and are ignored by Git.

## Evidence boundaries

- Token history is persisted in 5,000-block chunks and resumes after restart or a rate-limit failure.
- Curve buyer/seller event addresses are attributed. Pool swaps remain unattributed without transaction-trace evidence.
- Events retain exact block, log, transaction, venue, quantities, and raw event fields. Per-event timestamps are omitted because the default public RPC rate-limits historical block reads.
- A wallet dossier covers locally indexed Pons histories. An empty dossier does not prove that the address has no chain activity.
- Unsupported pairs or phases remain unavailable instead of becoming zero.

## Public roadmap

| Capability | Status | Meaning |
| --- | --- | --- |
| Token lifecycle | Live | Real Pons profile and chunked on-chain history |
| Wallet dossiers | Building | Working local cross-token aggregation; global discovery remains limited |
| Relationship map | Next | Visual address routes with explicit attribution limits |
| Live Scout | Next | Existing scanner expanded into saved cases and alert rules |
| Public data API | Planned | Documented read-only evidence endpoints |
| Additional chains | Later | Only after validated source adapters exist |

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run start:built
```

See [PLAN.md](PLAN.md), [HANDOFF.md](HANDOFF.md), and [the approved design](docs/design/LANDING-TERMINAL-V1.md). Imported protocol-code provenance remains in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

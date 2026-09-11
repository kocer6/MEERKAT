<p align="center">
  <img src="public/assets/meerkat-banner-v2.png" alt="MEERKAT — score wallets, score tokens, trace the evidence" width="100%">
</p>

<h1 align="center">MEERKAT</h1>

<p align="center"><strong>Score a token. Score a wallet. Open the evidence behind every point.</strong></p>

<p align="center">
  Local token intelligence for Pons V2 on Robinhood Chain.<br>
  No private key. No signer. No transaction path.
</p>

<p align="center">
  <a href="docs/PRODUCT.md">Product</a> ·
  <a href="docs/ANALYSIS.md">How analysis works</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="docs/TOKEN.md">Token status</a> ·
  <a href="docs/LOCAL-SETUP.md">Run locally</a> ·
  <a href="SECURITY.md">Security</a>
</p>

> **Project status:** transparent token scoring, local wallet scoring, lifecycle reconstruction and the relationship map work locally today. Wallet coverage is limited to histories indexed by that installation. A hosted public terminal and a MEERKAT token have not launched.

## What MEERKAT does

Paste a Pons V2 token or public wallet address into `/terminal`. MEERKAT returns a 0–100 evidence score first, shows confidence and every scoring component, then opens the underlying dossier:

- launch identity, deployer, pair, curve, tax and current phase;
- curve buys and sells with attributed initiating addresses;
- factory phase transitions, pool swaps and ERC-20 transfers;
- exact block, transaction, log index, quantities and venue for every event;
- participant summaries such as early entry and fast exit, with the rule shown;
- token score components for coverage, participant breadth, activity depth and deployer exposure;
- wallet score components for local scope, early discovery, two-sided activity and evidence depth;
- a wallet dossier across every token history stored on the same installation.

Missing evidence lowers the score's confidence and remains visible. A score is a summary of observed evidence, not a safety rating, price prediction, beneficial-ownership claim, realized profit, bot identity, or investment-skill verdict.

## Run it

Requires **Node.js 24** and a Robinhood Chain RPC endpoint.

```sh
git clone https://github.com/kocer6/MEERKAT.git
cd MEERKAT
npm ci
npm start
```

Open [http://127.0.0.1:4664/](http://127.0.0.1:4664/), select **Open terminal**, and paste a token or wallet address. The default RPC and database path work without adding secrets. See the [local setup guide](docs/LOCAL-SETUP.md) for configuration and troubleshooting.

## Two investigation modes

| Mode | Input | Result | Current boundary |
| --- | --- | --- | --- |
| **Token** | Pons V2 token address | Evidence score, confidence, components, profile, actors, relationships and lifecycle | Latest 500 events are rendered; the full indexed history stays in SQLite |
| **Wallet** | Public EVM address | Behavior score, confidence, cross-token activity and timing labels | Searches locally indexed Pons histories; global wallet discovery is in development |

The landing page, terminal, APIs, indexer, state, and database all run inside one local Node.js process. The browser never receives a signing route because the server has none.

## Verified evidence

The current checkpoint was exercised against Robinhood Chain using COPY (`0xac79255f6f404eba14f316e8669d76573a2d7b1e`):

- factory launch resolved at block `59,283,454`;
- an interrupted job resumed from its saved profile and 64-block overlap;
- the captured head `60,319,607` completed with `41,302` persisted events;
- `25` curve participants were attributed and the bounded relationship API returned `48` nodes and `96` routes.

This is evidence for one real token and captured head, not a claim that every token is fully indexed. Reproduction details and known limits are in the [full backfill note](docs/evidence/copy-backfill-relationship-2026-09-11.md).

## How an address becomes evidence

```mermaid
flowchart LR
  A[Token or wallet address] --> B[Collect local evidence]
  B --> C[Score plus confidence]
  C --> D[Show component reasons]
  D --> E[Lifecycle and relationships]
  E --> F[Blocks and transaction links]
```

Every label is derived from an explicit rule. For example, an **early entry** is a curve buy within 30 blocks of launch, and a **fast exit** is a sell within 300 blocks of that wallet's first indexed buy. Read the complete [analysis contract](docs/ANALYSIS.md).

## Roadmap

| Stage | Status | Acceptance gate |
| --- | --- | --- |
| Token evidence score | **Live locally** | Deterministic components, confidence and visible caveat |
| Local wallet score | **Live locally** | Cross-token local evidence with explicit coverage |
| Token lifecycle | **Live locally** | Verified launch and resumable event history |
| Global wallet discovery | **Building** | Bounded discovery with saved cursor |
| Relationship map | **Live locally** | Bounded actor routes with explicit pool-caller attribution |
| Cases and alerts | **Next** | Saved investigations and local rule notifications |
| Read-only API and exports | **Planned** | Versioned schema and portable evidence bundle |
| Hosted terminal / more chains | **Later** | Operational and adapter validation before public claims |

The detailed [public roadmap](ROADMAP.md) separates shipped behavior from future work and defines the evidence required to change each status.

## Documentation

| Document | Use it for |
| --- | --- |
| [Product guide](docs/PRODUCT.md) | What the terminal is for and how an investigation flows |
| [Analysis contract](docs/ANALYSIS.md) | Events, labels, attribution, scoring boundaries and data gaps |
| [Architecture](docs/ARCHITECTURE.md) | Components, persistence, APIs and trust boundaries |
| [Local setup](docs/LOCAL-SETUP.md) | Install, configure, update, back up and troubleshoot |
| [Roadmap](ROADMAP.md) | Shipped, current, next and later work with acceptance gates |
| [Token status](docs/TOKEN.md) | Official launch status and verification policy |
| [Security policy](SECURITY.md) | Read-only model and responsible reporting |
| [Contributing](CONTRIBUTING.md) | Development workflow and pull request checks |
| [Technical handoff](HANDOFF.md) | Exact current checkpoint, commands and known limits |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Imported code and asset provenance |

The full COPY backfill and restart evidence is recorded in the [lifecycle checkpoint](docs/evidence/copy-backfill-relationship-2026-09-11.md).

## Development checks

```sh
npm run typecheck
npm test
npm run build
npm run start:built
```

MEERKAT is early software. Verify important conclusions against the linked transaction evidence and never treat a behavior label as financial advice.

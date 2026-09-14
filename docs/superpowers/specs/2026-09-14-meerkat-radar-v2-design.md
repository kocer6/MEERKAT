# MEERKAT Radar V2 Design

**Date:** 2026-09-14  
**Status:** Proposed for implementation  
**Product:** MEERKAT on Robinhood Chain (chain ID 4663)

## 1. Goal

MEERKAT Radar V2 turns the current address-by-address terminal into a shared market intelligence system for Pons V2 launches.

The product must:

- discover and track verified Pons V2 launches continuously;
- rank current token signals without requiring a user to submit each token first;
- build first-party wallet history, positions, PnL, reputation and a leaderboard;
- preserve the current token analysis: score, Fee Flow, Relationships, Holders and Timeline;
- expose separate Token Dossier and Wallet Dossier screens backed by the same evidence store;
- work as a locally installable service and as the shared public deployment;
- remain a public-chain analysis product with no signer or transaction execution.

Radar scores are evidence summaries. They are not price predictions or guarantees of profit.

## 2. Product structure

The terminal has four persistent destinations:

1. **Radar** — live market discovery and ranked feeds.
2. **Leaderboard** — wallets ranked by evidenced PnL, with reputation and coverage beside it.
3. **Watchlist** — saved tokens and wallets.
4. **Activity** — signal changes, watched events, entries and exits.

There is no separate `ANALYZE` navigation item. A universal search field remains visible in the terminal header. It accepts:

- a Pons token address;
- a wallet address;
- an indexed token name or symbol.

For a hexadecimal address, the server checks the Pons V2 factory. A registered token opens Token Dossier. An address that is not a registered Pons token opens Wallet Dossier after the user selects or confirms wallet mode. This explicit fallback prevents arbitrary contract addresses from being silently misclassified as personal wallets.

The routes are:

- `/terminal/radar`
- `/terminal/leaderboard`
- `/terminal/watchlist`
- `/terminal/activity`
- `/terminal/token/:address`
- `/terminal/wallet/:address`

Browser history preserves the source route, active feed, filters, scroll position and active dossier tab. Opening a wallet from a token and pressing Back returns to that token and tab.

## 3. Radar feeds

Radar has five feed tabs:

### Signals

Tokens with enough evidence for a current Radar Strength score. Rows show token identity, Radar Strength, confidence, qualified buyers, net flow, signal change and age.

### Fresh

Recent verified launches. A token can appear before it has a final score. Progressive states are:

`DISCOVERED → PROFILED → TRACKING → SCORED`

Unknown or immature inputs remain unknown. A new token never receives a high score from one favorable component.

### Exits

Tokens where qualified wallets have materially reduced or closed evidenced positions. Dust transfers and small partial sells do not create an exit signal.

### Launches

The complete verified Pons launch stream with phase, launch quality, deployer history, tax, current participation and indexing state.

### Wallets

Recently active qualified wallets and newly discovered wallet candidates. This is a discovery feed; the full ranked table lives in Leaderboard.

Rotation flow is outside this implementation. It requires a separate follow-up design after the base trade and position accounting has been verified in production.

## 4. Connected dossiers

Radar, Leaderboard, Watchlist, Activity and global search open the same dossier screens. There is one implementation for each object type.

### Token Dossier

The persistent intelligence header contains:

- token name, symbol, address and verified Pons status;
- links to the Pons launch page and Blockscout;
- Radar Strength and confidence;
- Launch Quality;
- qualified buyer count;
- observed buy and sell flow;
- current holders;
- confirmed creator revenue;
- deployer holding;
- current index state and freshness;
- a plain-language explanation of the current signal.

Existing analysis remains available in dedicated tabs:

1. Overview
2. Fee Flow
3. Relationships
4. Holders
5. Timeline

Overview includes `Who is buying` and `Who still holds`. Wallet names and addresses open Wallet Dossier. Where evidence is complete, the buyer table shows cost, current value, realized PnL and total position PnL.

### Wallet Dossier

The persistent intelligence header contains:

- wallet address;
- Pons profile and Blockscout links;
- Wallet Reputation and confidence;
- judged tokens;
- profitable completed positions;
- early entries;
- round trips;
- fast exits;
- active positions;
- observed flow and evidence coverage;
- a plain-language explanation of positive and negative evidence.

Wallet tabs are:

1. Profile
2. Positions
3. Recent Trades
4. Shared Wallets
5. Evidence

Every token row opens Token Dossier and links to its Pons launch page. Every attributed action links to the exact Blockscout transaction.

## 5. Readability and interaction contract

The terminal fills the available desktop viewport and does not compress the entire application into a centered small card.

- `MEERKAT` is the only sidebar wordmark; the small adjacent subtitle is removed.
- Pixel typography is limited to the wordmark, large headings and major numeric accents.
- Body copy uses a locally available system sans-serif font at 16–18 px and weight 600 or greater.
- Tables use 14–16 px text and rows approximately 48–54 px high.
- Metadata never drops below 12 px on desktop.
- Metric tiles retain the existing square, bordered visual language. They do not use rounded generic cards.
- Token and wallet entities are light by default and turn green only on hover or keyboard focus.
- The active navigation destination uses amber, so active state is distinct from green hover.
- Buy values use green and sell values use red. Color is accompanied by text or sign so it is not the only cue.
- At 2560 px widths, content expands into useful columns and larger modules. It does not create wide empty gutters.
- At mobile widths, columns stack and low-priority columns collapse without shrinking text below the stated minimums.

## 6. Indexing architecture

Radar adds a single shared global indexer. It runs once per installation, independent of browser sessions. Visitors read cached SQLite state and never start a market-wide job.

The indexer has four workers with explicit queues:

### Factory discovery

- Locates the Pons V2 factory deployment boundary once and persists it.
- Backfills `TokenLaunched` events in bounded ranges.
- Polls the chain head for new launches.
- Uses a 64-block replacement overlap for reorg tolerance.
- Stores verified token, curve, deployer, pair token, launch block, transaction and log identity.

### Market tape

- Queries `CurveBuy` and `CurveSell` topics across bounded recent block ranges.
- Filters returned log addresses against the verified curve registry.
- Stores only events belonging to known Pons curves.
- Persists an independent cursor and overlap.
- Updates wallet-token positions incrementally.

The public RPC feasibility probe on 2026-09-14 returned 39 launches, 1,246 buys and 1,002 sells over 2,000 blocks. Those 2,000 blocks represented about 3.4 minutes. This proves that global topic reads are possible and that the current 2,000-block initial discovery window is far too short for historical coverage.

### Fast profiler

New launches are profiled without starting a full launch-to-head token history:

- factory record and phase;
- token metadata;
- creator tax and fee recipient;
- total supply and deployer balance;
- deployer launch history;
- early curve activity;
- current holder breadth when the fast range provides enough transfers.

Visible and newly launched tokens have priority. The queue uses bounded concurrency and the existing RPC retry/backoff behavior.

### Deep dossier index

The current `TokenHistory` implementation remains the source for full Fee Flow, Relationships, Holders and Timeline. It runs on demand when a user opens a token, and may continue in the background. Radar never waits for a complete deep history before displaying a launch or live flow.

## 7. Persistence

SQLite remains the local source of truth. New versioned tables are added without discarding current `token_history` or `token_events` data.

The new logical tables are:

- `radar_cursors` — factory, market tape and enrichment cursors;
- `radar_launches` — verified launch identity and current profile state;
- `radar_events` — normalized global buy, sell, phase and signal-relevant events;
- `wallet_token_positions` — incremental cost, proceeds, token balance and completeness per wallet/token;
- `wallet_outcomes` — mature closed or judged position outcomes;
- `wallet_scores` — versioned Wallet Reputation result and components;
- `token_signal_snapshots` — versioned Launch Quality and Radar Strength snapshots;
- `radar_activity` — material state transitions used by Activity and Watchlist;
- `watchlist_items` — locally saved token and wallet addresses.

Every event retains block number, block hash, transaction hash and log index. Inserts are idempotent. Overlap replacement removes and rebuilds affected derived rows transactionally.

## 8. Score system

MEERKAT exposes three independent scores. They are never combined into one unexplained number.

### 8.1 Launch Quality

Launch Quality describes the observable launch setup, not current momentum.

Known components and maximum weights:

| Component | Weight |
| --- | ---: |
| Deployer prior launch outcomes | 25 |
| Deployer supply exposure | 20 |
| Holder/distribution breadth | 20 |
| Creator tax and fee configuration | 15 |
| Early market structure | 15 |
| Verifiable metadata completeness | 5 |

Each component returns a normalized value, its evidence, and `known` or `unknown`. The displayed value is the weighted average of known components only, but it is withheld until at least 60% of total weight is known. Metadata can contribute at most five points because it is easy to manipulate.

Confidence uses both known weight and the maturity of deployer/participant history. A newly discovered token normally shows `PROFILING`, not 0 or 100.

### 8.2 Wallet Reputation

Wallet Reputation describes repeated, attributed behavior across Pons tokens.

| Component | Weight |
| --- | ---: |
| Completed-position outcome quality | 30 |
| Profit factor and median return | 20 |
| Repeatability across distinct tokens | 20 |
| Early-entry quality | 10 |
| Exit behavior and fast-dump penalty | 10 |
| Attribution and coverage integrity | 10 |

Closed positions are judged from verified cost and proceeds. Open marked gains do not count as completed wins. One extreme winner is capped by the repeatability and concentration components.

The raw component result is shrunk toward 50 while the sample is small:

`displayed = round(50 × (1 − confidence) + raw × confidence)`

Sample confidence grows with distinct judged positions and evidence coverage. Fewer than three completed positions is `PROVISIONAL`; eight or more complete positions can reach medium confidence; twenty or more can reach high confidence when coverage is also high.

Behavior labels such as `EARLY BUYER`, `HOLDER`, `SWING`, `SCALPER` or `FAST EXIT` are rule-based summaries with visible definitions. `SNIPER`, beneficial ownership and coordinated-wallet claims require transaction-level evidence and are not inferred from timing alone.

### 8.3 Radar Strength

Radar Strength describes the current evidence around a token. It is not a probability of price appreciation.

Base components:

| Component | Weight |
| --- | ---: |
| Qualified-wallet conviction | 30 |
| Distinct qualified-wallet breadth | 15 |
| Recent flow acceleration | 15 |
| Net attributed buy pressure | 10 |
| Freshness and entry timing | 10 |
| Launch Quality contribution | 15 |
| Holder retention/breadth | 5 |

Qualified-wallet conviction uses diminishing returns per wallet so one wallet cannot dominate. Wallet contribution is proportional to the square of its normalized reputation and capped by attributed position size.

Verified risk events subtract up to 25 points:

- material deployer balance reduction;
- creator-fee recipient changes;
- severe sell or liquidity drain;
- same-block or linked-wallet concentration;
- insufficient attribution revealed after an earlier snapshot.

The score is withheld until the token is verified, the recent market window is indexed, at least 60% of component weight is known and the flow contains enough non-infrastructure events. Otherwise the UI shows `DISCOVERED`, `PROFILING` or `TRACKING` with progress and missing inputs.

Every score response includes `modelVersion`, `asOfBlock`, `computedAt`, `confidence`, component values, evidence text and unknown inputs.

## 9. Position and PnL accounting

The accounting base is the pair token. Native-pair launches are reported in ETH. Optional USD rendering may be added only when a timestamped, named price source is available; ETH remains the stored source value.

For attributed curve trades:

- a buy increases token quantity and quote cost;
- weighted-average unit cost is updated after each buy;
- a sell realizes `quote received − allocated cost`;
- remaining cost is reduced by the sold quantity at weighted-average cost;
- total PnL is `realized PnL + executable value of remaining balance − remaining cost`.

Current value uses a current executable sell quote when available. A spot display price is not silently substituted for an executable quote.

Transfers are handled conservatively:

- an unmatched incoming transfer does not invent a zero cost basis;
- an unmatched outgoing transfer does not become a sale;
- affected token positions are marked incomplete;
- incomplete positions can show observed proceeds or balances but not a definitive return percentage.

Pool swaps remain unattributed unless receipt/transfer reconstruction identifies one dominant end-user wallet. Pool calls must not be assigned to `tx.from` when that address is a router or relayer. Dust, self-routing and known infrastructure are excluded from wallet performance.

## 10. Leaderboard

Leaderboard is a first-party aggregation of MEERKAT positions. It provides:

- windows: `24H`, `7D`, `30D`, `ALL`;
- sorts: `TOTAL PNL`, `REALIZED`, `OPEN`, `WIN RATE`, `REPUTATION`;
- wallet address and Pons profile link;
- Wallet Reputation and confidence;
- total, realized and open PnL;
- profitable and completed round trips;
- tokens traded and early entries;
- evidence coverage and provisional status.

Eligibility for PnL ranking requires:

- at least three completed attributed positions;
- sufficient indexed coverage for the selected window;
- no unresolved transfer gap that materially changes ranked PnL;
- exclusion of known infrastructure and token/deployer contracts.

Ineligible wallets remain searchable and may appear in a `PROVISIONAL` view, but they do not outrank eligible wallets. Clicking a row opens Wallet Dossier.

## 11. API boundaries

Current token-history and wallet-dossier APIs remain compatible while new read endpoints are added:

- `GET /api/radar/status`
- `GET /api/radar/signals?feed=&window=&cursor=`
- `GET /api/radar/launches?cursor=`
- `GET /api/radar/activity?cursor=`
- `GET /api/radar/leaderboard?window=&sort=&status=&cursor=`
- `GET /api/radar/search?q=`
- `GET /api/radar/token/:address/summary`
- `GET /api/radar/wallet/:address/summary`

Responses are paginated and bounded. Public requests read cached state; they do not trigger unbounded global backfills. Existing admission control and response limits remain in force.

The first UI implementation may poll bounded JSON endpoints. Server-sent events are deferred until polling load is measured.

## 12. Performance and operational behavior

- Factory discovery targets a new-launch delay of 30 seconds or less under a healthy RPC.
- Recent market tape is prioritized before historical backfill.
- A cached Radar or Leaderboard response should be available without a chain request.
- The public process has one market indexer and one bounded enrichment queue.
- Full token histories remain capped separately from global indexing.
- RPC 429 and range-limit errors use adaptive splitting, exponential delay and persisted resume cursors.
- The UI always shows last indexed block, data age, lag and worker state.
- An indexer restart resumes from the persisted cursor with overlap instead of repeating completed history.

Local installations use the same SQLite schema and workers. Configuration controls RPC URL, database path, history horizon, poll interval and bounded concurrency. Defaults must work with the public Robinhood Chain RPC without requiring private credentials.

## 13. Error and evidence handling

- Unknown is distinct from zero, false and empty.
- Partial indexing is visible at component and page level.
- A stale score remains visible with a stale badge and its original `asOfBlock`; it is not presented as live.
- Invalid or non-Pons token input returns a specific classification result.
- Reorg overlap rebuilds affected event-derived state.
- RPC and metadata errors never expose credential-bearing URLs.
- Score changes create an activity record only when a material component or threshold changes.
- Every user-visible PnL, label or score can be expanded to its source events and calculation version.

## 14. Testing and acceptance

### Unit tests

- score component boundaries, unknown inputs, confidence shrinkage and hard gates;
- position accounting for buys, partial sells, complete exits and transfer gaps;
- leaderboard eligibility and deterministic ordering;
- event normalization, infrastructure exclusion and overlap replacement;
- search classification and route construction.

### Integration tests

- factory backfill and resume against a deterministic fake reader;
- global buy/sell tape filtering to registered curves;
- incremental wallet position rebuild after overlap replacement;
- cached Radar API behavior without an RPC call;
- Token Dossier and Wallet Dossier navigation history;
- existing Fee Flow, Relationships, Holders and Timeline regression coverage.

### Live verification

- confirm a new Pons launch appears within the target delay;
- compare several stored buys and sells with Blockscout transactions;
- verify Pons and Blockscout links;
- restart during backfill and confirm cursor reuse;
- inspect Radar, both dossiers and Leaderboard at 2560, 1440 and 390 px widths;
- confirm body, table and metadata text meet the readability contract;
- verify no browser session starts a duplicate global worker.

## 15. Delivery sequence

1. Global launch registry, cursors and market tape.
2. Fast token profiles, progressive states and Launches/Fresh feeds.
3. Incremental positions, PnL accounting and Wallet Reputation.
4. Radar Strength, Signals and Exits.
5. Global search and connected Token/Wallet Dossier routes.
6. Leaderboard.
7. Watchlist and Activity integration.
8. Readability pass, responsive QA, documentation, deployment and production evidence.

Each package must leave the existing public terminal usable and must pass focused tests, full tests, typecheck and build before deployment.

## 16. Reference boundaries

The information hierarchy is informed by FOMO Robinhood Radar: separate market feeds, trader profiles, wallet context, cost-basis-aware presentation and a leaderboard that distinguishes repeatable process from a headline number.

Stampede informs the later rotation-flow concept and the need to validate a simple radar score against outcomes. Bodkin informs explainable early-launch observations. Canary informs material state-change events. Rumzo informs explicit completeness and unknown handling. Agent Arena informs public packaging and the rule that visible product elements must map to working logic.

MEERKAT uses its own Robinhood Chain index, score definitions, visual system and implementation. Reference code is not copied unless it is explicitly licensed, pinned and attributed under the repository's existing third-party policy.

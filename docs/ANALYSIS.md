# Analysis contract

This document defines what MEERKAT observes, how it creates labels, and where attribution stops. It is the contract between the indexer, API, UI, and anyone interpreting a dossier.

## Evidence identity

An indexed event keeps:

- block number and block hash;
- transaction hash and log index;
- event kind and venue;
- actor, initiator, and recipient when the event ABI provides them;
- token and quote quantities when available;
- decoded raw event fields.

The stable event identity combines block hash, transaction hash, and log index. Re-indexed overlap replaces matching local rows instead of duplicating them.

## Attribution

Curve buys and sells expose the initiating buyer or seller in the event, so MEERKAT can attribute those actions to that public address. Transfers expose `from` and `to` addresses. Pool swaps expose the pool caller, which may be a router rather than the end user; they therefore remain unattributed to an end user without transaction-trace evidence.

An address is evidence of an on-chain role. It is not proof of beneficial ownership or a real-world identity.

## Relationship graph

The graph aggregates repeated interactions between public addresses and the token. It always retains the token and deployer, ranks other nodes by evidenced interaction count, and bounds the response to 48 nodes and 96 routes. The browser draws the top 18 nodes for readability.

Curve buy/sell and transfer routes are solid because the decoded event supplies the address. Pool routes are dashed and labeled `pool caller only`. A line means an on-chain interaction occurred; it does not mean common ownership, coordination, or control.

## Current labels

| Label | Exact rule | What it does not mean |
| --- | --- | --- |
| Early participant | First attributed curve buy is within 30 blocks of the verified launch block | Insider, sniper, or profitable trader |
| Fast exit | Attributed sell is within 300 blocks of that wallet's first indexed buy | Successful flip or realized profit |
| No indexed sells | One or more attributed buys and no attributed sells in local coverage | The wallet still owns the tokens |
| Participant | Matching attributed events exist without a more specific current label | Quality or skill assessment |

When event timestamps are unavailable, the rules use block distance. The default public RPC rate-limits large batches of historical block reads, so per-event timestamps are currently omitted rather than guessed.

## Quantities and profit

Raw integer quantities are stored as decimal strings to avoid floating-point loss. Curve spent/received summaries add decoded quote values from attributed curve events. They do not include every transfer, pool route, gas cost, tax consequence, or off-history acquisition. For that reason, realized PnL is `null` and smart status is `not assessed` or `insufficient cross-token evidence`.

## Coverage states

- `indexing`: the cursor has not reached the captured head.
- `ready`: the cursor reached the head captured when the profile was loaded.
- `paused`: the process stopped while work remained.
- `error`: the latest read failed; saved evidence and cursor remain available.

`ready` describes the bounded indexing job. New blocks after the captured head require another refresh. The UI must show cursor/status and must not describe partial history as complete chain history.

## Scores

Scores summarize the evidence MEERKAT can show; they are not safety ratings, price predictions, or profitability claims. Every API score contains the 0–100 value, confidence (`low`, `medium`, or `high`), component points, supporting observation, and a caveat.

The **token signal score** is withheld until launch-to-head indexing reaches `ready`. Index coverage controls readiness and confidence; it never adds points to token quality. Once ready, the score allocates 25 points to current deployer exposure, 20 to creator tax, 25 to attributed curve-participant breadth, 15 to participants with both attributed buys and sells, and 15 to non-protocol transfer-recipient breadth. This prevents a newly launched token from receiving 100 merely because its short history indexed quickly.

The **wallet behavior score** allocates 25 points each to locally matched token scope, early-entry frequency, tokens with both attributed buys and sells, and matched event depth. Confidence remains low below three matched tokens and becomes high only with at least seven matched tokens whose histories are all ready.

Global wallet discovery, normalized opportunity sets, trace-aware attribution, realized outcome methodology, market-cap context and resistance to address splitting remain future work. Market cap is not currently a scoring input. Realized PnL therefore stays `null`, and smart status stays `not assessed` even when a numeric behavior score is present.

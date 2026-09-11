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

## Scoring direction

MEERKAT does not yet publish a composite wallet score. A useful score needs global token discovery, normalized opportunity sets, trace-aware attribution, realized outcome methodology, sample-size thresholds, and resistance to address splitting. Until those gates are met, the product presents counts and rule-based observations instead of a decorative number.


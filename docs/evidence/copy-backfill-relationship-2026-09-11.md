# COPY full backfill and relationship checkpoint — 2026-09-11

## Environment

- Product: packaged `npm run start:built`
- Chain: Robinhood Chain, chain ID 4663
- Token: COPY `0xac79255f6f404eba14f316e8669d76573a2d7b1e`
- Database: isolated local SQLite file, excluded from Git
- Starting commit: `258afbf2d3f446151c73e0b6510f0909521f84b3`

## Interruption and resume

The first packaged run started from verified launch block `59283454`. After two persisted 5,000-block chunks the API reported:

- cursor `59293453`;
- `12,861` events;
- status `indexing`;
- `running: true`.

The process was interrupted. The database retained the cursor and events. The old worker repeated the expensive profile/factory discovery after restart and hit HTTP 429. A focused reproduction returned `RpcRequestError`, code `429`, details `Too Many Requests`.

The recovery path was changed to reuse a stored verified profile for `indexing`, `paused`, or `error` jobs. The expected 64-block overlap began at `59293390` (`59293453 - 63`). A deterministic test asserts that exact resumed range and proves profile discovery is not called again.

Fifteen seconds after the corrected restart, the API reported cursor `59308389`, `25,236` events, `running: true`, and no error. This demonstrates forward progress from the saved checkpoint.

## Completion

The same packaged job reached its captured head:

| Field | Result |
| --- | --- |
| Launch block | `59283454` |
| Captured head | `60319607` |
| Inclusive block coverage | `1,036,154` blocks |
| Final cursor | `60319607` |
| Status | `ready` |
| Persisted events | `41,302` |
| Attributed curve wallets | `25` |

The database creation-to-ready wall clock was `596.249` seconds. That interval includes the deliberate interruption, reproduction using the old worker, debugging waits and rebuilds. It must not be presented as an indexing throughput benchmark.

A later explicit refresh captured head `60327214`, reached that cursor, and retained `41,302` events.

## Relationship output

The completed local history produced:

- 48 returned nodes;
- 96 returned routes;
- 41,299 evidenced interactions before display bounding;
- 11,750 pool-caller-only interactions;
- `truncated: true`, correctly signaling that the full history exceeds the visual response limit.

Curve buyer/seller and transfer addresses use decoded-event attribution. Pool nodes remain caller-only and render as dashed routes. Clicking a graph address opened its Wallet dossier.

## Browser checks

- Desktop: COPY profile, 100% coverage, 41,302 events and the relationship map rendered together.
- Mobile 390x844: document scroll width remained 375 pixels; the 650-pixel graph uses its own horizontal scroll container.
- The first mobile pass exposed an overlapping graph heading/count. A responsive stacked heading fixed it and the second screenshot was inspected.
- No signer, private-key field, approval or transaction path was introduced.

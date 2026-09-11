# ZZZ dense-history recovery — 2026-09-11

Token: `0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a` (`ZZZ`)

## Reproduced failure

The first implementation requested every event source in fixed 5,000-block ranges. The public Robinhood Chain RPC rejected the token transfer query with `logs matched by query exceeds limit of 10000`. After the first successful checkpoint, another range failed with `log query timed out`. The UI had zero indexed events, showed only the deployer relationship, and incorrectly presented the deployer component as a 20/100 final token score.

## Implemented behavior

- matching density-limit and log-timeout responses recursively split the affected block range;
- the outer 5,000-block checkpoint remains durable, so restart overlap behavior is unchanged;
- token score is withheld as `CALIBRATING` until launch-to-captured-head indexing reaches `ready`;
- progress and an indexing error are shown separately from token quality.

## Live checkpoint

After restarting the packaged server and resuming the same local database:

- the first recovered checkpoint stored `36,940` events;
- after 20 more seconds the cursor reached block `54,687,389`;
- `65,082` events and `29` attributed wallets were available;
- the relationship response reached its explicit `48`-node bound;
- status remained `indexing`, score value remained withheld, and displayed coverage was `0.3%`.

This checkpoint proves dense-range recovery and early useful evidence. It is not a completed launch-to-head backfill or a performance benchmark.

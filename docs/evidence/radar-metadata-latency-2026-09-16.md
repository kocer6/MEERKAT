# Radar metadata latency verification — 2026-09-16

Production code: 714228a7563c7acdc07ca94ebe1f98be503272f5.

Root causes: new profiles shared a 20–57 second enrichment cycle with market/position work; incremental publication rewrote a 37,249,768-byte feed cache and a measured writer transaction took 6,506 ms. Under contention this caused SQLite busy errors.

Changes: dedicated five-second metadata worker (40 tokens, two batches); missing-profile SQL index and captured-head guard; visible feed pages read latest token profiles; changed feed rows persist individually instead of rewriting the base snapshot. Expensive feed calculations run in a read snapshot. Slow write transactions are logged.

Validation: 211 tests pass on VPS; TypeScript/build pass. All five services active. Collection lag zero; metadata queue zero; all worker error fields null. After all workers switched to incremental writes, metadata cycles measured 179–2374 ms; collector cycle 2162 ms, enrichment cycle 6696 ms. These are observations, not latency guarantees.

Public Fresh SSE: four newly inserted tokens changed from pending to real symbols in 2.98 seconds without reconnect/reload. Other snapshots continued at roughly five-second intervals. No new metadata process restart was observed during the final run. Score projection still has a separate backlog; prices/liquidity depend on external data availability.

```json
{
  "samples": [
    {
      "seconds": 0.8,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 6.39,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 11.38,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 16.47,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 21.47,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 23.42,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 25.44,
      "pending": 4,
      "new": 4
    },
    {
      "seconds": 28.42,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 30.44,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 35.59,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 40.58,
      "pending": 0,
      "new": 0
    },
    {
      "seconds": 45.58,
      "pending": 0,
      "new": 0
    }
  ],
  "completed": [
    {
      "token": "0x52321dd7c58caeebc30a1c56133df58d3f688a5f",
      "symbol": "CEGE",
      "seconds": 2.98
    },
    {
      "token": "0x65ed559377c742ae38e17d8fb8a30433c910e6fe",
      "symbol": "ORGINU",
      "seconds": 2.98
    },
    {
      "token": "0xa80e35e1b50496813ef2e6710fac0980745bb1c3",
      "symbol": "PIJÖN",
      "seconds": 2.98
    },
    {
      "token": "0x7703a47dd66521096e2c8d195574324876f0f843",
      "symbol": "Calledit",
      "seconds": 2.98
    }
  ]
}
```

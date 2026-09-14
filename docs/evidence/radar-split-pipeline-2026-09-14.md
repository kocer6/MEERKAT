# Split Radar pipeline production acceptance - 2026-09-14

Implementation: 447ecf3 (and preceding split-pipeline commits).

## Deployed behavior

- Collection, enrichment and projection run as separate systemd services. The web process reads persisted snapshots.
- Durable revisioned projection work survives restart; late quotes use compare-and-swap; projection computes in a WAL read snapshot and commits short writes.
- Collector catches up in bounded ranges. Its RPC budget is isolated from profile enrichment and legacy history.
- External enrichment batches up to 30 requested Robinhood token addresses through GeckoTerminal, with DexScreener fallback. Contract-RPC failure does not stop external enrichment.
- Radar and token dossiers expose source/time-labelled price, liquidity, volume, market cap and FDV. Missing fields remain null; indicative USD prices do not become invented executable P/L.

## Verification

- Local and deployed production suites: 195 tests passed, zero failures. Production typecheck and build passed.
- All four production services active. Collector advanced from block 63069106 to 63069677 between final checks; captured-head lag 0 and error null. Latest normal collector cycles 1917 ms and 1794 ms.
- Projection reached an empty queue between batches. At a subsequent read 95 newly queued jobs were pending, with no worker error. This is a changing work queue, not a permanent zero-work guarantee.
- Public API sample: signals 50 rows in 0.156 s; Fresh 50 rows in 0.156 s; leaderboard 100 rows in 0.156 s. These are measured samples, not latency guarantees.
- Final coverage sample: Signals 50/50 named, 42/50 priced; Fresh 50/50 named, 40/50 priced.
- Browser QA: full-width Radar price/liquidity columns, leaderboard W/L and token dossier market strip inspected. No page-level horizontal overflow at 2545 px. HOODED history READY with 63 events; existing buyers, holders and dossier tabs preserved.

## Limits

- Roughly 3300 launches remained queued for contract-profile enrichment at the final status sample. Old backlog is not declared complete.
- Five minutes is refresh eligibility, not a freshness SLA for the full universe. Processing capacity and public-provider quotas determine actual delay. Both public RPC providers exhibited rate limits during testing; authenticated capacity may be needed for sustained growth.
- External sources do not cover every new token or every field. Market cap and FDV stay distinct; missing liquidity/price is not zero.
- The existing page-header index status is fetched on page initialization; API worker status is current, but that header is not a continuously polling health indicator.

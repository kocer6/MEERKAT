# Radar metadata and cold-dossier recovery — 2026-09-14

Runtime checkpoint: `3aae367e6664548466f4a8d05ba8e6665b3903fb` on `https://meerkat.my`.

## Reproduced causes

- FRESH initially had names for only 5/50 rows while SIGNALS had 50/50. A scored-token backlog consumed the metadata batch; subsequently, continuous new arrivals could starve older visible Fresh rows.
- Patching names reset the feed snapshot timestamp used to decide whether all views should rebuild. Leaderboard snapshots could remain stale indefinitely.
- Rebuilding one wallet/token position parsed the wallet's entire event history. The largest sampled wallet had 50,007 events. Token position reads scanned 49,726 positions without a token index.
- The cold token dossier ignored Radar's saved launch block and searched factory logs from genesis. Independent profile reads were serialized.
- An already-open Radar page never refreshed its feed.

## Changes

Bounded metadata capacity is shared between visible Fresh rows, incoming launches, scored tokens and active backlog. Failed profiles have a separate retry timestamp; score updates and overlap discovery cannot postpone or erase it. Full-view refresh uses the leaderboard snapshot clock, independent of name patches. Wallet/token and token/position reads are indexed, score writes share a transaction, and leaderboard outcomes/infrastructure are grouped once per window. Worker logs record phase timings.

Token dossiers verify the saved launch block with a single factory-event query, falling back to full discovery if stale. Independent contract reads are batched. Cached Radar identity, score, buyers, holders and tape appear while the full history loads. The open Radar list refreshes every ten seconds.

## Verification

- Local and VPS `npm test`: 182 passed, zero failed. Tests reproduce fresh/scored starvation, continuous-arrival starvation, full-view clock starvation, retry cooldown and stale launch-hint fallback.
- `npm run typecheck`, `npm run build`, `node --check public/terminal.js`, and `git diff --check` passed.
- Final API sample: FRESH 50/50 named (206 ms), SIGNALS 50/50 (129 ms), LAUNCHES 50/50 (109 ms). These are samples, not latency guarantees.
- Leaderboard returned 100 rows; wallet summary returned evidenced profitable/losing counts in 207 ms.
- Cold MIAO (`0x483e75bc528b687cb0fd9f37d74dfcb583c254c9`): confirmed no prior history; cached Radar summary 67 ms, complete profile 12.7 s, full 37-event history ready in 14.1 s.
- Chrome: RobinScan reached READY with the six dossier tabs, buyer P/L, holders and tape. Leaderboard showed W/L. The open Fresh page updated without reload and ended with zero pending-name buttons.
- Both systemd services active; `/healthz` returned `ok`. Worker status showed no error, 5,843 launches and 224,398 events at the sampled checkpoint.

## Limits and reference comparison

FOMO Radar uses a selected wallet cohort plus separate enrichment with batched external token lookups. Its default RPC is the same official Robinhood endpoint. This is a different workload from scanning every Pons launch; the comparison does not establish equal dataset coverage or equal PnL accuracy. Reference inspected: https://github.com/cvxv666/fomo-robinhood-radar (`fomo_agent/pipeline/new_tokens.py`, `fomo_agent/sources/rpc.py`, `fomo_agent/config.py`). No external wallet scores were imported.

Public RPC latency remains variable: observed worker cycles ranged from 12.8 seconds to roughly a minute, with a 105-second initial catch-up. A new launch can briefly await profiling; this change prevents persistent queue starvation, not all loading states. The historical metadata backlog continues in the worker. Missing marks, insufficient trade evidence, non-native quote units and unavailable historical prices remain explicit rather than fabricated.

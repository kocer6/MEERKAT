# Landing and terminal V1 evidence — 2026-09-11

## Browser

- Landing loaded at `/` with the approved MEERKAT desert asset, terminal CTA, product explanation, and six-item roadmap.
- CTA navigated to `/terminal`.
- Desktop landing and terminal were visually inspected in Chrome.
- Viewport override 390x844: landing `innerWidth=390`, `scrollWidth=375`; terminal `innerWidth=390`, `scrollWidth=375`, `(max-width:760px)=true`.
- Wallet mode accepted `0x1111111111111111111111111111111111111111` and displayed zero locally indexed histories with the explicit statement that this does not prove no chain activity.
- A CSS `hidden` override defect was observed during QA, fixed with `[hidden]{display:none!important}`, and rechecked visually.

## Real token read

Token: COPY `0xac79255f6f404eba14f316e8669d76573a2d7b1e`

- Verified Pons `TokenLaunched` block: `59283454`.
- Current token profile at read time: phase 2, native pair token, creator tax 150 bps.
- First lifecycle chunk: blocks `59283454..59288453`.
- Events decoded: `3170`.
- Attributed curve participants: `25`.
- Per-event timestamps: `0`, intentionally omitted to avoid hundreds of rate-limited historical block reads. Exact blocks and transaction hashes are retained.

The first implementation failed against pruned historical `eth_getCode`; factory-event lookup replaced it. A later attempt hit RPC 429 while fetching per-transfer timestamps; the final reader removes that request explosion and paces the four log reads per chunk.

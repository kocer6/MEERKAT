# MEERKAT handoff — landing + intelligence terminal (2026-09-11)

The active product is a local read-only Pons V2 intelligence terminal. The user approved the split landing/terminal design and public roadmap. Never restore the paper-first UI or add a signer/transaction path.

## Implemented checkpoint

`public/landing.*`: branded pixel-art landing, large readable headline, product proof, four analysis lenses, honest roadmap, GitHub link and terminal CTA. Uses the existing approved `public/assets/meerkat-desert.png` and local Press Start 2P font.

`public/terminal.*`: explicit Token/Wallet address modes, token lifecycle results, wallet behavior table, exact evidence links, local wallet dossiers, and secondary Live Scout/watch/activity panels. Desktop and 390x844 layouts were inspected; measured page scroll width was 375 at a 390 viewport.

`src/token-history.ts`: durable token profiles/events, verified `TokenLaunched` lookup from block 0 to current head, 5,000-block indexing chunks, curve/pool/transfer/factory coverage, block-based early/fast behavior and bounded 429 retry. Transfer and trade event timestamps remain null; exact blocks and transaction hashes are preserved. Curve actors are attributed. Pool swaps remain unattributed without trace evidence.

`src/wallet-dossier.ts`: pure cross-token aggregation over histories stored by this local installation. It reports indexed/ready coverage, event counts, buys/sells/transfers and block-based behavior. Smart status stays `not assessed`; realized PnL stays null.

## Verification

- `npm run typecheck`: pass.
- `npm test`: 84 tests passed, 0 failed.
- `npm run build`: pass.
- Browser: `/` and `/terminal` inspected at desktop and 390x844. Landing CTA navigates correctly. Wallet mode with `0x1111…1111` renders an honest zero-local-evidence dossier. Hidden-panel regression was found and fixed.
- Real RPC: COPY `0xac79255f6f404eba14f316e8669d76573a2d7b1e` resolved to symbol COPY, launch block `59283454`; chunk `59283454..59288453` returned 3,170 events and 25 attributed curve participants in 5.3 seconds after RPC pacing fixes.

## Immediate next task

Run a full COPY backfill through `npm run start:built`, interrupt after at least two persisted chunks, restart, and confirm the cursor resumes with the 64-block overlap. Then implement the relationship graph from persisted event actors/recipients without inventing ownership links.

Known limits: wallet mode searches local indexed histories rather than the entire chain; public RPC can still rate-limit a chunk and requires resume; pool swap end-user attribution needs trace evidence; no per-event timestamps; only the latest 500 lifecycle events are sent to the browser; no external notifications.

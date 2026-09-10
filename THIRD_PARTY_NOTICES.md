# Third-party provenance

## Bodkin (MIT)

Copyright (c) 2026 phosphenq. Full license: [licenses/bodkin-MIT.txt](licenses/bodkin-MIT.txt).

Pinned source: https://github.com/Phosphenq/bodkin/tree/27b801ad5358061fc10f151cc1e305974df89178

`src/chain/abi.ts` selects the TokenLaunched event, LaunchedToken struct, getLaunchedToken read and factory address from upstream `src/abi/pons.ts` and `src/chain.ts`. Trading writes and the upstream snipe orchestration are not imported. MEERKAT discovery uses viem read-only methods and its own freshness/error handling. This is a minimal ABI import, not a claim that upstream scoring/quote adapters are integrated.

## Canary

Reviewed at 376714b5a3134218020cf0f0e664ce5fa895578d. No Canary source is included in this checkpoint. Include its GIPP MIT notice alongside any future source import.

## Dependencies

`viem` is used for RPC and ABI decoding; exact dependencies are pinned by package-lock.json. Their upstream license files are distributed with their npm packages. No third-party token, referral link or mascot is used in the application UI.

## Press Start 2P
Locally hosted font from https://github.com/google/fonts/tree/main/ofl/pressstart2p, by CodeMan38. Licensed under SIL Open Font License 1.1; full notice in licenses/press-start-2p-OFL.txt.

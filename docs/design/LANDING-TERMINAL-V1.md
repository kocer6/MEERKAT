# MEERKAT landing and terminal V1

Approved by the user on 2026-09-11.

## Product promise

MEERKAT reconstructs the public on-chain story of a Pons V2 token and shows which wallets participated, when they entered and exited, and which behavioral labels are supported by evidence. It is a read-only local product: no private key, signer, approval, or transaction path.

The public experience has two distinct surfaces:

- `/` explains one memorable idea and directs the visitor to the product.
- `/terminal` accepts a token or public-wallet address and presents the analysis.

## Landing page

The landing page uses the supplied MEERKAT brand direction: near-black sky, warm sand and amber, crisp pixel-art desert, large readable type, thin technical borders, and the meerkat mascot. The existing `public/assets/meerkat-desert.png` is the hero artwork.

Hero copy:

> THOUSANDS LAUNCH.  
> ONE MEERKAT WATCHES.

The primary action is `OPEN TERMINAL`. Supporting sections explain the token dossier, wallet behavior analysis, evidence boundaries, open-source/local installation, and the public roadmap. Live and planned capabilities must never share the same status.

## Terminal

The terminal keeps one primary input and two explicit modes:

- **Token:** validates a Pons V2 token, indexes its verified launch-to-head lifecycle, and shows metadata, phase, trades, transfers, participants, behavioral flags, and transaction evidence.
- **Wallet:** accepts a public address and builds a cross-token activity profile from locally indexed Pons token histories. Contract wallets remain valid wallet inputs; mode is selected explicitly instead of guessed from bytecode.

The first terminal result is useful before the full index completes: profile metadata and indexing coverage appear as soon as available. Every score or label must disclose its evidence and limits. `Smart`, realized PnL, and beneficial ownership are not inferred from incomplete data.

Watchlist, discovery, monitoring, and alerts remain secondary tools inside the terminal rather than the landing page or default view.

## Public roadmap

The landing roadmap is a product trust surface, not a promise of completed work.

1. **Token lifecycle — LIVE:** verified Pons launch, curve and pool events, transfers, participants, and evidence links.
2. **Wallet dossiers — BUILDING:** cross-token history from local indexed evidence, timing and behavior patterns.
3. **Relationship map — NEXT:** routes between deployers, traders, recipients, and related wallets with explicit attribution limits.
4. **Live scout — NEXT:** new-launch stream, saved cases, watch rules, and local alerts.
5. **Public data API — PLANNED:** documented read-only endpoints and exportable evidence.
6. **Additional chains — LATER:** only after source adapters and validation evidence exist.

Trading, copy trading, autonomous execution, token-gated claims, and invented AI scores are outside this V1.

## Accessibility and responsive behavior

Body copy uses a readable monospace face at 16px or larger. Pixel display type is limited to short headings and labels. Desktop and mobile must have no page-level horizontal overflow; wide evidence tables may scroll inside their own containers. Motion respects `prefers-reduced-motion`.


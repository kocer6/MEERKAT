# Terminal intelligence interface redesign

## Goal

Make the MEERKAT terminal readable as an investigation workspace. A user should immediately understand which information is a score, market activity, wallet behavior, token ownership, or raw evidence. Buys and sells must have stable visual semantics throughout the terminal.

The implementation keeps MEERKAT read-only and local-first. It does not add trading, signing, wallet connection, or inferred facts that the local index cannot support.

## Information hierarchy

The token dossier is divided into five visually distinct zones:

1. **Token Signal Score** uses the existing amber brand accent and explains each scored component.
2. **Token Overview** uses a cool blue accent for identity, phase, indexing coverage, supply, creator tax, and external evidence links.
3. **Market Activity** uses green and red values for attributed buys and sells. It summarizes counts and observed quote flow without presenting a price or profit calculation.
4. **Relationship Map** uses a restrained purple accent and contains the graph modes, legend, controls, and selected-wallet inspector.
5. **Lifecycle Evidence** remains neutral except for event types: green buy, red sell, amber transfer, gray protocol or unattributed activity.

Pixel typography is limited to product headings, section titles, badges, and compact labels. Body copy, addresses, tables, controls, and explanations use a readable sans-serif font at a larger base size.

## Global transaction semantics

- `BUY` is green. In flow diagrams it points from the token to the attributed buyer because tokens move into that participant's position.
- `SELL` is red. In flow diagrams it points from the attributed seller to the token because the participant returns tokens to the market.
- `TRANSFER` is amber and preserves the observed sender-to-recipient direction.
- `UNATTRIBUTED` is gray and dashed. Pool swaps without transaction-trace attribution never become wallet buys or sells.

These colors and directions are shared by summary cards, graph edges, tables, badges, and lifecycle rows.

## Relationship Map modes

### Trade Flow

This is the default mode. The token is centered. Attributed buyers appear on one side and sellers on the other, while wallets with both behaviors are marked as active traders. Edge width reflects event count. The graph limits the number of visible nodes and reports when it shows a bounded top-activity view.

### Current Holders

This mode reconstructs token balances from indexed ERC-20 `Transfer` events. It shows the largest positive balances, node size reflects share of total supply, and the details panel shows raw balance plus percentage. Until indexing reaches the selected head, the mode is explicitly labeled `PARTIAL INDEX`; it cannot claim a complete holder ranking.

Protocol and zero addresses remain identifiable and are excluded from participant-quality labels. Balance reconstruction uses event evidence rather than external holder APIs.

### Wallet Routes

This mode shows observed wallet-to-wallet token transfers. It excludes curve buys and sells so users do not confuse market interaction with direct transfers. Edge direction follows the transfer event and width reflects transfer count.

## Wallet inspector

Selecting a wallet node opens an inspector beside the map. It shows only available evidence:

- address and evidenced roles;
- attributed buy and sell counts;
- observed bought and sold token amounts;
- reconstructed current token balance and supply share;
- first and last observed blocks;
- evidence labels such as early entry or fast exit;
- a button to open the full wallet dossier.

No profitability, ownership identity, bot classification, or smart-money status is shown unless a later verified model supports it.

## Interaction

Mode controls are a segmented tab group with keyboard semantics. Nodes can be selected by mouse or keyboard. The SVG map supports zoom controls and reset; panning is available by pointer drag. The legend remains visible in every mode and changes its explanation to match the active mode.

The existing Token → Wallet → Back navigation remains intact. Opening a wallet from the graph uses the same history mechanism as opening one from the activity table.

## Backend data

`buildRelationshipGraph` will expose enough aggregates for all three modes without sending the complete event history to the browser:

- directional trade edges with buy and sell separated;
- transfer edges;
- per-wallet buy/sell counts and token quantities;
- per-wallet first and last observed blocks;
- reconstructed balances and supply shares;
- graph coverage and truncation metadata.

The existing bounded graph limits remain in place. The API response will distinguish a ready holder snapshot from a partial one based on index state.

## Responsive behavior

On wide screens, score, overview, and market activity form a summary grid; the map and wallet inspector share one workspace. On narrower screens, summary zones stack, the inspector moves below the graph, and tables scroll horizontally. The graph retains a useful minimum height and does not shrink labels below readable size.

## Verification

Automated tests must prove:

- buy and sell edges have opposite, correct directions;
- holder balances are reconstructed from transfers;
- incomplete indexing produces a partial holder snapshot;
- the terminal contains the three graph controls and stable transaction classes;
- existing Token → Wallet → Back navigation still works.

The final implementation must pass the full test suite, TypeScript checking, production build, JavaScript syntax check, and `git diff --check`. Browser QA will use the indexed ZZZ token to verify populated graph modes, colors, node selection, wallet navigation, legibility, and responsive layout.

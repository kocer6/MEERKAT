# MEERKAT product guide

MEERKAT is a local scoring and investigation terminal for Pons V2 tokens on Robinhood Chain. It answers two practical questions first: how strong is the observed token signal, and does a wallet show repeated behavior inside the histories this installation has indexed? The lifecycle and relationship map expose the evidence behind those answers.

The product is deliberately read-only. It has no private-key input, signer, approval flow, buy button, sell button, or transaction submission route.

## Start an investigation

1. Run MEERKAT and open `http://127.0.0.1:4664/terminal`.
2. Select **Token** or **Wallet**.
3. Paste a valid EVM address and run the analysis.
4. Keep the terminal open while a new token history indexes. Progress and errors are persisted locally.
5. Open exact transaction evidence from the lifecycle instead of relying on the summary alone.

## Token mode

Token mode first proves that the address belongs to a Pons V2 launch. It reads the factory launch event and current profile, then indexes these event families from launch to the captured head:

| Source | Evidence |
| --- | --- |
| Pons curve | Buys, sells, refunds, curve completion and creator-fee sweeps |
| Pons factory | Launch sweep, pool graduation and creator-fee recipient changes |
| Token contract | ERC-20 transfers |
| Native ETH pool and Pons hook | Pool swaps and creator-fee sweeps when the pool identifier can be derived |

While indexing runs, the result shows `CALIBRATING`, exact block coverage and any RPC error instead of a partial numeric score. Once the captured launch-to-head range is ready, the result begins with a token signal score, confidence and five visible components. It then includes direct Pons and explorer links, the token profile, indexing cursor, total event count, latest lifecycle events, and attributed curve participants. Exact event fields remain in the local SQLite database even though the browser receives only the latest 500 lifecycle events.

### Relationship map

Token mode also builds a bounded visual map from the complete persisted history. It connects the deployer, token, curve participants, transfer senders/recipients and pool callers. Solid lines use an address exposed by the decoded event. Dashed lines mean the address is only the pool caller and is not attributed to an end user. Selecting an address opens its local wallet dossier.

### Fee flow

The fee panel totals the token-specific `FeesSwept`, `FeesRescued`, `PoolFeesSwept` and `PoolFeesRescued` creator amounts. It separates curve and pool revenue, shows the configured initial and current recipient, reconstructs completed recipient changes, and warns about a pending change. A route selected at launch is distinguished from a later redirect.

The fee escrow's current balance is useful context but can aggregate revenue from several launches assigned to the same recipient. MEERKAT therefore never adds that balance to the token's confirmed revenue. Transfers after the recipient withdraws from escrow are ordinary wallet activity until a separate transaction trace proves their purpose.

## Wallet mode

Wallet mode compares the address with every Pons token history already stored by the same installation. It begins with a wallet behavior score and confidence, then reports initiated curve buys and sells, incoming and outgoing transfers, first/last indexed activity when timestamps exist, and rule-based early-entry or fast-exit observations. Direct links open the public Blockscout address page and the Pons public profile route.

Internal address links keep a navigation stack. Opening a wallet from a token and then a token from that wallet exposes a contextual back button, so the investigation path can be retraced without retyping an address.

Coverage is explicit. If 12 token histories are indexed, the dossier searches those 12 histories. A zero result means no matching evidence was found in that local set; it does not mean the wallet was inactive across the chain.

## Secondary tools

The terminal retains Live Scout, watchlist, monitoring and local activity panels. These are supporting investigation tools. The core workflow is address → transparent score → component reasons → exact evidence.

## What MEERKAT is not

- It is not a trading terminal and cannot submit a transaction.
- It is not a full-chain block explorer.
- It does not identify the human or organization controlling an address.
- It does not calculate realized PnL from incomplete wallet histories.
- It does not call a wallet smart, insider, bot, sniper, or profitable without a defined evidence model.

Those constraints are product behavior: unavailable conclusions stay unavailable in the API and UI.

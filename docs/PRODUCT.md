# MEERKAT product guide

MEERKAT is a local investigation terminal for Pons V2 tokens on Robinhood Chain. It answers two practical questions: what happened during a token's lifecycle, and where did a public wallet appear inside the histories this installation has indexed?

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
| Pons curve | Buys, sells, refunds and curve completion |
| Pons factory | Launch sweep and pool graduation |
| Token contract | ERC-20 transfers |
| Native ETH pool | Pool swaps when the pool identifier can be derived |

The result includes the token profile, indexing cursor, total event count, latest lifecycle events, and attributed curve participants. Exact event fields remain in the local SQLite database even though the browser receives only the latest 500 lifecycle events.

## Wallet mode

Wallet mode compares the address with every Pons token history already stored by the same installation. It reports initiated curve buys and sells, incoming and outgoing transfers, first/last indexed activity when timestamps exist, and rule-based early-entry or fast-exit observations.

Coverage is explicit. If 12 token histories are indexed, the dossier searches those 12 histories. A zero result means no matching evidence was found in that local set; it does not mean the wallet was inactive across the chain.

## Secondary tools

The terminal retains Live Scout, watchlist, monitoring and local activity panels. These are supporting investigation tools. The core workflow is address → verified evidence → token lifecycle or wallet dossier.

## What MEERKAT is not

- It is not a trading terminal and cannot submit a transaction.
- It is not a full-chain block explorer.
- It does not identify the human or organization controlling an address.
- It does not calculate realized PnL from incomplete wallet histories.
- It does not call a wallet smart, insider, bot, sniper, or profitable without a defined evidence model.

Those constraints are product behavior: unavailable conclusions stay unavailable in the API and UI.


# HOP OUT creator-fee flow checkpoint

Date: 2026-09-11

Token: `0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8`

This checkpoint exercised the packaged local terminal against Robinhood Chain through the configured public RPC. The durable launch-to-head index completed at captured head `60,571,478` with `6,366` stored events.

## Verified result

| Evidence | Value |
| --- | ---: |
| Creator payout events | 26 |
| Curve creator revenue | 0.472838185133738444 ETH |
| Pool creator revenue | 0.704623315048619148 ETH |
| Confirmed creator revenue | 1.177461500182357592 ETH |
| Current recipient | `0x7c8560d80dc5d982231cef05f71bbd9d1961a3cc` |
| Route | Routed at launch |
| Completed recipient changes | 0 |
| Current recipient escrow balance | 0 ETH |

The confirmed total is the sum of token-specific creator amounts decoded from curve and pool sweep events. The recipient escrow balance is a current aggregate account value and is displayed separately. It is not added to the token total.

The terminal also exposes every payout transaction, opens the recipient's local wallet dossier, and links to the public Pons and Blockscout address pages. Transfers made after the recipient withdraws from escrow remain unattributed unless later transaction-trace work proves their purpose.

## Reproduction

Run the local server, open `/terminal`, select Token, and analyze the address above. Wait for the captured range to report `READY`; partial results are labeled while indexing. The live chain head can advance, so later runs may include newer events.

# Security policy

## Supported version

Security fixes target the latest commit on `main`. This is early software; pin a reviewed commit when using it in a sensitive research workflow.

## Read-only security model

The active MEERKAT product accepts public token and wallet addresses. It does not request a seed phrase or private key, create a signer, build a transaction, request token approval, or broadcast to the chain.

Local data is stored in the configured SQLite file. It may reveal which public addresses and tokens the operator researched, so protect backups according to that privacy need. The configured RPC provider can observe requests made to it.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository when available. Include:

- the affected commit and operating system;
- a minimal reproduction;
- expected and observed behavior;
- security impact;
- suggested mitigation, if known.

Do not include private keys, seed phrases, access tokens, or unrelated personal data. If private reporting is unavailable, open a public issue containing only non-sensitive coordination details and ask the maintainer for a private channel.

## Scope priorities

Reports are especially useful when they show remote code execution, unintended file access, RPC response injection into executable browser content, bypass of local request boundaries, corruption of persisted evidence, secret exposure, or a hidden transaction/signing path.

Incorrect analytics without a security impact should use a normal bug report, with the exact block and transaction needed to reproduce the conclusion.


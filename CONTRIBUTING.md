# Contributing to MEERKAT

Contributions should make on-chain evidence easier to collect, verify, or interpret without expanding claims beyond the data.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install Node.js 24 and run `npm ci`.
3. Add or update a test that demonstrates the behavior being changed.
4. Keep chain quantities as integers or decimal strings; do not introduce floating-point accounting.
5. Run the required checks.
6. Open a pull request describing the trigger, resulting behavior, verification, and remaining evidence boundary.

```sh
npm run typecheck
npm test
npm run build
```

## Pull request scope

- Keep changes small enough to review against exact acceptance evidence.
- Preserve unavailable fields as unavailable; never replace missing chain data with zero.
- Link protocol assumptions to an ABI, contract source, block, transaction, or reproducible fixture.
- Do not add private-key, signer, approval, transaction-building, or broadcast code to the active product.
- Update public documentation when behavior, labels, routes, configuration, or roadmap status changes.
- Record third-party source and license provenance in `THIRD_PARTY_NOTICES.md`.

## Tests and integration evidence

Unit tests should avoid live-network dependence. Put bounded live-RPC checks in a dated evidence note with chain ID, address, block range, endpoint class, elapsed time, result counts, and known incompleteness. Never commit credentials or a local SQLite database.

## Bug reports

Include the MEERKAT commit, Node version, operating system, command, address, coverage status, and complete error text with RPC credentials removed. For an analytics error, include the exact transaction and the conclusion you expected.

Security issues follow [SECURITY.md](SECURITY.md).

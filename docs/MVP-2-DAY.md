# MEERKAT — two-day milestone

The assistant writes the implementation. Target a demonstrable paper-trading product within the user's two-day window; this is a timebox, not a guarantee of production readiness.

## Required vertical slice

Real Pons V2 launch -> explainable score and entry filters -> simulated buy -> position monitoring -> TP/SL/trailing exit -> persistent journal and results.

One local web interface, fixtures for an explicitly synthetic offline demo, clear installation instructions, and a project landing page. All simulated fills must be labeled. Use selected Bodkin protocol modules and Canary watch rules, with audited defects addressed.

## Sequence

Day 1: minimal runnable project, deterministic decision tests, durable paper ledger, budget reservations, serialized exits, synthetic full cycle; then real discovery/quote integration.

Day 2: interface, position timeline/journal, RPC failure and restart handling, clean-install verification, documentation and publication preparation.

Push coherent checkpoints with updated HANDOFF.md throughout. If time is running short, prioritize a working and honestly labeled vertical slice over additional features.

## Deferred

Live signing/execution, partial exits, Telegram, token launch/gating, paid hosting, copy trading and model-driven decisions. The broader V1 specification describes later scope, not the two-day acceptance criteria.

## Acceptance

- Offline demo works without keys and completes an entry/exit cycle with correct accounting.
- Real launch data is identified separately from synthetic fixtures and paper fills.
- RPC tax failure blocks entry; reserve failure cannot create a false reserve-drop alert.
- Concurrent entries respect reserved budget; duplicate exit triggers create one exit.
- Restart restores positions and journal; no signer is constructed in paper mode.
- Build, typecheck and relevant tests pass; commands and unresolved live-data limitations are recorded.
- Another assistant can clone the repository and continue using HANDOFF.md without the original chat.

# MEERKAT continuation instructions

Read HANDOFF.md first, then docs/MVP-2-DAY.md. The two-day paper MVP takes priority over the broader docs/V1-SPEC.md.

The user authorizes incremental commits and pushes to this repository after coherent work checkpoints. Update HANDOFF.md with actual implementation status, exact verification commands/outcomes, blockers and the next action before each push. Verify the remote commit after pushing. Never claim unverified functionality works.

Keep commits focused. Do not overwrite other contributors' work or force-push. Never commit credentials, private keys, runtime wallet/position data, databases, node_modules or generated build files. Keep main usable; document unfinished work on a WIP branch if necessary.

Preserve MIT copyright and license notices for imported Bodkin/Canary code. Follow the pinned source revisions and audit findings in docs/audit/TECHNICAL-AUDIT.md. Fix relevant failures rather than copying the upstream orchestration unchanged.

Paper mode must have no signer. Unknown RPC values must not become zero or trigger trades. Use one order service, durable state, budget reservations and serialized exits. No real-money execution is authorized as a test of this MVP.

Before modifying code, read existing flows and state assumptions. Use the smallest implementation that completes the requested user flow. Run meaningful checks for changed behavior and record limitations honestly. Do not add AI trading, token gating, copy trading, Telegram or partial exits to the two-day milestone.

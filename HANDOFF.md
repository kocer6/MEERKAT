# Start here — Pons companion

Updated: 2026-09-10. This file is the continuation entry point for any coding assistant.

## User mandate

The assistant writes the code. The user has only two days for the first useful release. Push incremental checkpoints to the user-designated GitHub repository, with this handoff updated each time. Target repository: https://github.com/kocer6/MEERKAT, branch main. Initial remote baseline: 0f5c98fc9d9adf555f9840a5a007f38336e9200f. This bootstrap checkpoint contains documentation and evidence only; verify its commit with git log.

## Actual state

Technical audit and full V1 specification exist. Product implementation has NOT started. No working product, deployment or live trading has been verified. Do not describe upstream passing tests as tests of our product.

Read docs/audit/TECHNICAL-AUDIT.md for evidence and docs/V1-SPEC.md for the broader design. The two-day milestone takes priority over the full V1 feature list:

- Real Pons V2 launches and explainable scoring.
- Automated paper entry, position monitoring and TP/SL/trailing exits.
- Persistent journal, results and reasons.
- One local web interface and synthetic demonstration; public project page/docs when ready.
- Defer live execution, partial exits, Telegram, token gating, copy trading and AI decision making.

This reduced scope was proposed by the assistant after the user's two-day constraint. The user's latest instruction is to preserve all progress on GitHub so another AI can continue.

## Upstream

- https://github.com/Phosphenq/bodkin at 27b801ad5358061fc10f151cc1e305974df89178, MIT, preserve phosphenq notice.
- https://github.com/Gipppp121/canary at 376714b5a3134218020cf0f0e664ce5fa895578d, MIT, preserve GIPP notice.
- Use selected adapters and pure rules, not two independent execution engines.

Audit verified on Windows / Node 24.20.0: Bodkin 23 tests, Canary 46 tests; both build/typecheck pass. npm audit reported zero known vulnerabilities. Two extra mocked-RPC probes confirmed tax failure treated as zero and Canary reserve failure producing a false alert without fallback. See docs/audit/evidence/audit-reproductions.txt. Upstream code was not changed.

## Mandatory engineering constraints

Unknown tax blocks entry; unknown reserve never means zero. Paper has no signer dependency. Persist orders/positions/journal transactionally, reserve budget before concurrent entries, serialize position exits, recover incomplete operations on restart. All prices and fills must be labeled real observations versus simulations. Do not turn Canary LEAVE into automatic selling. Pin every open position for monitoring. Keep secrets, wallet state, databases and node_modules out of Git.

## Next concrete work

1. Repository selected: kocer6/MEERKAT. Read AGENTS.md and docs/MVP-2-DAY.md.
2. Bootstrap documentation, evidence and ignore rules are prepared in this checkpoint. Add upstream LICENSE notices when importing code.
3. Implement one vertical paper cycle with durable state and regression coverage for the audited failure cases, then connect real launch/quote reads.
4. Add the interface and journal; validate install, demo and recovery; push after each coherent checkpoint.

## Checkpoint convention

Each checkpoint updates: completed functionality, exact commands and outcomes, known failures, next action, and any changed scope. Record the previous verified remote SHA here or in a status file; report the new pushed SHA in chat. Never claim a push until remote verification succeeds. If an intermediate state fails tests, push only to a clearly identified WIP branch and document the failure; keep the working default branch usable.

No application start command exists yet. Do not invent one. The audit reproduction command in TECHNICAL-AUDIT.md refers to local audit checkouts, not the future application.


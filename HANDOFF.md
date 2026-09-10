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

**Next task: M1.1 in PLAN.md. No implementation task is currently in progress.**

1. Read AGENTS.md, PLAN.md and docs/MVP-2-DAY.md; inspect the checkout and git status.
2. Create the minimal Node 24/TypeScript application and real build/typecheck/test/demo scripts. Add a meaningful startup smoke test. There is currently no package.json or src directory.
3. Run clean install and the newly created commands. Record their actual outputs here; then mark M1.1 complete only if they pass.
4. Continue M1.2 and onward in PLAN.md. Preserve upstream notices when importing code. Push coherent checkpoints with both status documents updated.

## Latest checkpoint record

- Completed: M0.1–M0.5; shared PLAN.md, CLAUDE.md, continuation prompt and linked README/AGENTS/HANDOFF. Product code remains unimplemented.
- Changed files in this checkpoint: PLAN.md, CLAUDE.md, docs/CONTINUE-IN-CLAUDE.md, README.md, AGENTS.md, HANDOFF.md.
- Prior verified remote: a9be2c0e975da19b1bfca1363d1d3cce4ec6b445 on main. The commit containing this record is identifiable with git log; it cannot include its own SHA without creating another commit.
- Verification for this documentation checkpoint: git diff --check, local Markdown link validation and checklist consistency. No application tests exist or ran. Any failed verification must be recorded before publication.
- Known blocker: none for local implementation. Git CLI authentication was not established in the prior session; the connected GitHub API successfully published the prior checkpoint. Use available authorized credentials and verify remote updates.
- Recovery: if the session ends, start at M1.1 unless newer commits/checklist entries prove further progress. No unfinished code needs recovery at this checkpoint.

## Checkpoint convention

Each checkpoint updates: completed functionality, exact commands and outcomes, known failures, next action, and any changed scope. Record the previous verified remote SHA here or in a status file; report the new pushed SHA in chat. Never claim a push until remote verification succeeds. If an intermediate state fails tests, push only to a clearly identified WIP branch and document the failure; keep the working default branch usable.

No application start command exists yet. Do not invent one. The audit reproduction command in TECHNICAL-AUDIT.md refers to local audit checkouts, not the future application.


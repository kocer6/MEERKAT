# Continue MEERKAT

Read AGENTS.md, PLAN.md, then HANDOFF.md before doing work. These files are the shared continuation contract for Claude and Codex. PLAN.md is the checklist; HANDOFF.md records the exact stopping point and verification evidence.

Implement the next incomplete task identified in HANDOFF.md. Inspect the actual checkout first: do not restart completed work, repeat the audit unnecessarily, or mistake upstream tests for MEERKAT tests. The two-day paper MVP takes priority over the broader V1 specification.

Update PLAN.md and HANDOFF.md after each coherent implementation checkpoint, commit them with the code, push to the selected repository and verify the remote revision when credentials allow. The user has authorized incremental updates. If push is unavailable, report it clearly and keep a local checkpoint; do not claim GitHub is current.

If the user only provides the repository URL without filesystem access, explain that implementation needs a cloned checkout and write-capable tools. Never claim changes were applied based on reading files alone.

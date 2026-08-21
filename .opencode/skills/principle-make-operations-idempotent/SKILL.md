---
name: principle-make-operations-idempotent
description: Make operations converge to same end state on reruns, crashes, and retries.
---


# Make Operations Idempotent

> **Harness: opencode + t3 code preview** — This skill runs under opencode. For any UI or browser-visible behavior, use the `t3-code_preview_*` tools (`open`, `navigate`, `snapshot`, `click`, `type`, `evaluate`, `scroll`, `recording_start/stop`) to drive `http://localhost:8000` (Next.js dev on port 8000 per `README.md:26`) and capture evidence. For verification loops, prefer `t3-code_preview_evaluate` and `t3-code_preview_snapshot` over manual curl when the bug is visual or hydration-related. Secrets stay in `.env` — redact as `<REDACTED>` in outputs.

Design operations so they converge to the correct state regardless of how many times they run or where they start from. Every state-mutating operation should answer: "What happens if this runs twice? What happens if the previous run crashed halfway?"

**Why:** Commands, lifecycle operations, and processing loops run where crashes, restarts, and retries are normal. If partial state changes the next run's outcome, every restart becomes a debugging session.

**The pattern:**
- Convergent startup: scan for existing state, clean stale artifacts, adopt live sessions
- Content-based cleanup: compare by content equivalence, not creation order
- Self-healing locks: use PID-based stale lock detection
- Idempotent scheduling: failed work respawns cleanly, fresh input regenerated after each cycle

**The test:**
1. What happens if this runs twice in a row?
2. What happens if the previous run crashed at every possible point?
3. Does re-execution converge to the same end state?

If any answer is "it depends on what state was left behind," the operation needs a reconciliation step.

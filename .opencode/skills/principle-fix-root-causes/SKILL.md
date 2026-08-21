---
name: principle-fix-root-causes
description: Trace symptoms to root cause, reproduce first, fix there rather than adding guards.
---


# Fix Root Causes

> **Harness: opencode + t3 code preview** — This skill runs under opencode. For any UI or browser-visible behavior, use the `t3-code_preview_*` tools (`open`, `navigate`, `snapshot`, `click`, `type`, `evaluate`, `scroll`, `recording_start/stop`) to drive `http://localhost:8000` (Next.js dev on port 8000 per `README.md:26`) and capture evidence. For verification loops, prefer `t3-code_preview_evaluate` and `t3-code_preview_snapshot` over manual curl when the bug is visual or hydration-related. Secrets stay in `.env` — redact as `<REDACTED>` in outputs.

When debugging, do not paper over symptoms. Trace every problem to its root cause and fix it there.

**Why:** Symptom fixes accumulate. Each workaround makes the system harder to reason about, and the real bug remains. Root-cause fixes are slower upfront but reduce total debugging time.

**Pattern:**
- Reproduce first (if you can't reproduce it, you can't verify your fix)
- Ask "why" until you hit the root cause
- Resist the urge to add guards (adding a nil check to silence a crash is a symptom fix)
- If a workaround needs a paragraph-long comment to justify it, the code is wrong (fix the code, not the comment)
- Check for the pattern, not just the instance (grep for the same pattern, fix all instances)
- When stuck, instrument. Don't guess (add logging, read the actual error)

**Restart bugs: suspect state before code**

Code doesn't change between runs. State does. When something "fails after restart," suspect stale persistent state first: config files, caches, lock files, serialized state. If clearing a state file restores behavior, prioritize state validation as the fix.

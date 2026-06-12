---
description: Update docs/STATE.md so the next session starts with full context
---

Update the living state file so no manual hand-off is ever needed.

1. Run `git log --oneline -15` and `git status` to see what happened this session.
2. Open `docs/STATE.md`. Update these sections to reflect reality now:
   - **Last updated** → today's date.
   - **Current status** → anything that changed (deploys, branches, what now works).
   - **Next steps** → re-prioritise; remove done items, add new ones.
   - **Open threads / deferred** → add anything discovered, remove anything resolved.
   - **Known traps** → add any new gotcha we hit.
3. If a decision was made that isn't obvious from the code, also run the `/caveat` flow to log it in `docs/decisions/`.
4. Show me the diff of `docs/STATE.md` before saving. Do not commit unless I ask.

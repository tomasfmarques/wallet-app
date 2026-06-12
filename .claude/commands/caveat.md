---
description: Log a non-obvious decision into the right docs/decisions file
argument-hint: [what was decided]
---

Record this decision so future sessions know why: $ARGUMENTS

1. Figure out which module it belongs to (auth, loan, portfolio, settings, budget, deploy, or 00-setup) and open that file in `docs/decisions/`.
2. Append an entry in the existing house style:
   - **What** — the decision or shortcut.
   - **Why** — the reason.
   - **How to change** — what to do for a different approach later.
3. If it changes current priorities or adds deferred work, also reflect it in `docs/STATE.md`.
4. Show me the additions. Keep it tight — one entry, no padding.

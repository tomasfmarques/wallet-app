# How to work on Wallet360 with Claude (the new setup)

You no longer hand off between tabs. Context lives in the repo and loads itself.
Here's the whole system in one page.

## The one-chat workflow

Open **one** Claude Code session in the repo. It auto-reads `CLAUDE.md`, which points
to everything else. To start: type `/catchup`. To stop: type `/handoff`. That's it —
the next session (today, tomorrow, any tab) picks up exactly where you left off,
because the state is in `docs/STATE.md`, not in a chat.

You can still open extra tabs when you want parallel work, but you don't *need* to,
and you never paste a handoff again.

## What each piece does

| Thing | Where | Purpose |
|-------|-------|---------|
| `CLAUDE.md` | repo root | Auto-loaded every session. Identity, stack, rules, pointers. Keep it short. |
| `docs/STATE.md` | docs | Living "where we are / what's next." The no-hand-off file. |
| `docs/decisions/` | docs | Why things are built the way they are — one file per module. Load only what you touch. |
| `docs/archive/` | docs | The original CAVEATS + last handoff, preserved verbatim. |
| `.claude/agents/` | .claude | Subagents that work in their own context window (saves tokens). |
| `.claude/commands/` | .claude | Slash commands for repeated workflows. |
| `.claude/settings.json` | .claude | Shared permissions so routine commands don't prompt; prod DB push is denied. |

## Slash commands

- `/catchup` — brief me on current state (reads STATE + git, not the whole repo).
- `/handoff` — update STATE.md before ending a session.
- `/caveat <decision>` — log a non-obvious decision into the right module file.
- `/ship` — pre-deploy checklist: schema-sync guard → build → review → commit → push.

## Subagents (delegate to keep the main chat lean)

Ask the main chat to "use the **frontend** agent to…", "use **db-prisma** to…",
or "have **code-reviewer** look at this." Each runs in an isolated context, so the
big reads happen over there and your main thread stays cheap.

- **frontend** — React/Vite/TS UI, pt-PT strings, Chart.js, mobile-first.
- **db-prisma** — schema/migrations, handles the two-schema dev/prod trap.
- **code-reviewer** — reviews diffs before commit; doesn't write features.

## Why this saves tokens

- `CLAUDE.md` is small and loads once; the 65 KB of decisions no longer ride along.
- You read one `docs/decisions/<module>.md`, not all of them.
- Subagents absorb large/file-heavy work in a separate window.
- `/catchup` reads a summary file instead of re-deriving state from the codebase.

## Maintenance habit

End sessions with `/handoff`. Log surprises with `/caveat`. Keep `CLAUDE.md` lean —
if it grows, push detail down into `docs/decisions/`.

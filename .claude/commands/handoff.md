---
description: Wrap up the session — update docs/STATE.md, then commit and push to prod
---

Update the living state file so no manual hand-off is ever needed, then deploy.

1. Run `git log --oneline -15` and `git status` to see what happened this session.
2. Open `docs/STATE.md`. Update these sections to reflect reality now:
   - **Last updated** → today's date.
   - **Current status** → anything that changed (deploys, branches, what now works).
   - **Next steps** → re-prioritise; remove done items, add new ones.
   - **Open threads / deferred** → add anything discovered, remove anything resolved.
   - **Known traps** → add any new gotcha we hit.
3. If a decision was made that isn't obvious from the code, also run the `/caveat` flow to log it in `docs/decisions/`.
4. **Schema-sync guard:** if `git diff --name-only` shows `backend/prisma/schema.prisma` changed, confirm `schema.prod.prisma` changed too AND `export.ts`/`import.ts` were updated. If not, STOP and warn — do not push.
5. **Commit & push to prod:** `git add -A`, write a clear commit message summarising the session, then `git push`. Pushing to `main` auto-deploys to production on **Vercel** (the `vercel-build` step runs `db:push:prod`), so treat it as a production release. (Render is retired.)

Never run destructive Prisma prod commands here; that's the db-prisma agent's job with a Neon snapshot first.

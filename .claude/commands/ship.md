---
description: Pre-deploy checklist — build, schema-sync check, commit, push
---

Run the Wallet360 release checklist. Stop and report if any step fails; don't push past a failure.

1. **Schema-sync guard:** if `git diff --name-only` shows `backend/prisma/schema.prisma` changed, confirm `schema.prod.prisma` changed too AND `export.ts`/`import.ts` were updated. If not, STOP and warn.
2. **merchant.ts parity:** if `frontend/src/lib/merchant.ts` changed, remind me to verify the backend normalizer matches.
3. **Build:** run `npm run build`. Report any TypeScript or build errors.
4. **Review:** invoke the `code-reviewer` agent on the staged diff. Surface blocking findings.
5. **State:** confirm `docs/STATE.md` reflects what shipped (offer to run `/handoff`).
6. **Commit & push:** only after I approve — `git add -A`, a clear commit message, `git push`. Pushing to `main` auto-deploys to production on **Vercel** (the `vercel-build` step runs `db:push:prod`), so treat it as production. (Render is retired.)

Never run destructive Prisma prod commands here; that's the db-prisma agent's job with a Neon snapshot first.

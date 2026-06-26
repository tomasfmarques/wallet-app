---
description: Commit and push to prod — with pre-deploy guards
---

The Wallet360 deploy action: verify, then **commit and push to production**. Stop and report if any step fails; never push past a failure.

1. **Schema-sync guard:** if `git diff --name-only` shows `backend/prisma/schema.prisma` changed, confirm `schema.prod.prisma` changed too AND `export.ts`/`import.ts` were updated. If not, STOP and warn.
2. **merchant.ts parity:** if `frontend/src/lib/merchant.ts` changed, verify the backend normalizer matches.
3. **Build:** run `npm run build`. Report any TypeScript or build errors; STOP on failure.
4. **Review:** invoke the `code-reviewer` agent on the diff. Surface any blocking findings; STOP if anything is blocking.
5. **Commit & push to prod:** `git add -A`, a clear commit message, then `git push`. Pushing to `main` auto-deploys to production on **Vercel** (the `vercel-build` step runs `db:push:prod`), so treat it as a production release. (Render is retired.)

Never run destructive Prisma prod commands here; that's the db-prisma agent's job with a Neon snapshot first.

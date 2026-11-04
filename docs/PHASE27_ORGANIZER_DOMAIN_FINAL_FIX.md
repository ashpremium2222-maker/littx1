# Phase 27 — Organizer Domain Final Fix

**Assessment date:** 2026-10-21  
**Repository revision inspected:** `f98cc49` (`main`, aligned with `origin/main` before this report was added)  
**Release decision:** **NO-GO for production** until isolated staging authentication and organizer event-assignment acceptance passes.  
**Production change:** None. No deploy, DNS change, or production configuration change was made.

## Proven root cause

The browser symptom was caused by a stale Vercel production deployment, not by a missing route in the current repository. The active production deployment inspected read-only was `littx1-4rj5d4jie-sbrnexora.vercel.app` (deployment ID `dpl_HxMwHRXzyjiiqpc5sReCAryvTjNy`), state `READY`, target `production`, built from commit `f6caab10e125f71786011714a65f3adba21a3304` (`phase 2 and 3`). Vercel metadata listed `organiser.littx.in` and the public hostnames as aliases of that deployment. Its deployed `vercelConfig` had the SPA catch-all rewrite to `/index.html`, but no redirect rules. Thus `/` on the organizer alias received the public static homepage. The supplied report identified `c2ee881` as deployed; the read-only Vercel deployment listing showed a newer active production deployment at `f6caab1`, with `c2ee881` as an earlier deployment.

The checked-out repository was clean at `f98cc49` (`main`, aligned with `origin/main`). Its `vercel.json` already contains an exact host-conditioned root redirect from `organiser.littx.in` to `/organizer`, with query preservation and a temporary redirect, before the SPA rewrites. The existing `/organizer` and `/organizer/(.*)` rewrites serve the React app, so this destination does not loop. Vercel's deployed configuration confirms the active deployment was built from an older commit that predates the redirect. The available evidence does not indicate an unsupported host matcher or a redirect-order problem.

The React app handles `/organizer` using its existing organizer portal and login gate. Organizer data remains protected by the existing authenticated API and server-side assigned-event authorization. No authentication, cookie, CSRF, Origin, bearer-cutoff, API, or application code was changed for this phase.

## Read-only live HTTP observations

Requests were made with redirects disabled so status and `Location` could be inspected. They are HTTP routing observations only, not authentication or staging acceptance.

| URL | Observed response |
|---|---|
| `https://organiser.littx.in/` | `200 OK`, no `Location`; Vercel cache hit |
| `https://organiser.littx.in/organizer` | `200 OK`, no `Location`; Vercel cache hit |
| `https://organiser.littx.in/admin` | `200 OK`, no `Location`; Vercel cache hit |
| `https://littx.in/` | `308`, `Location: https://www.littx.in/` |
| `https://www.littx.in/` | `200 OK`; Vercel cache hit |

These responses are consistent with the deployed old configuration. A `200` for a panel path only proves an HTML application shell was returned; it does not prove panel authorization or organizer assignment checks.

## Fix and regression coverage

No additional application/configuration patch was necessary: the exact-host redirect is already in `vercel.json` at the current repository revision. The existing `staging/server/test/panel-routing.test.js` regression coverage verifies:

- only `/` on the exact `organiser.littx.in` hostname is redirected to `/organizer`;
- query parameters are preserved;
- `/organizer` is not redirected again;
- the public root continues to resolve to the public homepage;
- other panel and unrelated hosts do not receive the organizer redirect;
- organizer path refresh/deep-link rewrites and the authenticated React screen gate remain in place.

Local verification on this checkout:

- Isolated backend suite (`npm test` in `staging/server`): **79/79 passed**. The suite uses the project's isolated test runner and mock storage; it is not staging evidence.
- Frontend production build (`npm run build` in `staging/combined-app`): **passed**. Vite emitted the existing advisory that the main minified chunk exceeds 500 kB.
- TypeScript (`npx tsc --noEmit`): **passed**.
- JavaScript syntax (`node --check` for `staging/server/test/panel-routing.test.js` and `staging/server/server.js`): **passed**.
- Vercel configuration JSON parse: **passed**.
- `git diff --check`: **passed**.

The root redirect and its routing regression tests were already present in the inspected `f98cc49`; this phase added this evidence report only. No application/configuration patch was needed locally. These local checks do not claim a live fix.

## Deployment and acceptance gate

The current repository commit containing the redirect must be promoted through the approved Vercel project workflow after staging gates pass. After deployment, verify that the deployment's source revision includes the redirect, then check:

1. `https://organiser.littx.in/` responds with a temporary redirect to `/organizer`, preserving a non-sensitive test query.
2. `https://organiser.littx.in/organizer` and a nested organizer route load on refresh without redirect loops.
3. An unauthenticated visitor sees the organizer login flow and no organizer data.
4. A synthetic organizer can access only explicitly assigned events; an unassigned event is denied server-side.
5. Cookie, CSRF, Origin, expiry, logout, and bearer-cutoff protections pass on the actual isolated staging host.
6. `https://littx.in/` continues to serve the public marketplace (including its canonical redirect to `www` if that remains the configured behavior).

Phase 19 records all staging acceptance rows as **BLOCKED**, because no isolated staging endpoint, database, verified staging identities, or authorized test devices were available. Production deployment is therefore withheld. The next required action is to provision and execute the isolated staging acceptance recorded in `docs/PHASE19_STAGING_ACCEPTANCE.md`; after it passes, promote the current reviewed repository revision and verify the live redirect and authorization flows. No production DNS or settings are to be changed as part of this report.

## Later deployment failure evidence (Phase 30)

The earlier assessment explained the then-current live homepage response but preceded the newer failed deployments. Vercel deployment details for commit `764a2b3` now show a configuration validation failure: `redirects[0]` contains an unsupported `preserveQueryParams` property. That option was added to the earlier organizer redirect and caused later deployments to fail before the app build. Phase 30 removes the property from organizer/admin/PR redirect entries; Vercel forwards query parameters by default. This new evidence supersedes the earlier statement that no redirect configuration issue was present. No deployment has been initiated by Codex.

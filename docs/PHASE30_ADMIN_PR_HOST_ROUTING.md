# Phase 30 — Admin and PR Host Routing

**Status:** Implemented locally; Vercel failure diagnosed from deployment details. The corrected configuration has not been redeployed or verified on staging. Production remains NO-GO.

## Change

The shared Vercel project serves the public marketing page at `/` and the React application from `app.html` for existing panel paths. The React router selects the master admin panel under `/admin` and the PR portal under `/pr`. Before this change, requests to the admin and PR subdomain roots fell through to the public homepage.

`vercel.json` now has temporary exact-host root redirects:

- `https://admin.littx.in/` → `/admin`
- `https://pr.littx.in/` → `/pr`

Vercel carries source query parameters through redirects by default. The `preserveQueryParams` option was removed: Vercel's deployment validator rejected that property on `vercel.json` redirect objects (it applies to bulk redirect definitions instead). Existing `/admin` and `/pr` paths and their SPA rewrites remain in place for direct navigation and refresh. The public root continues to serve `index.html`. No other panel host was enabled.

The existing app continues to gate the admin UI on a master-admin session and PR APIs on a PR session. Backend role, company, and event-assignment checks were not changed. The redirects do not grant access. Host-only cookies, CSRF, Origin, session expiry, and bearer cutoff behavior were not changed.

## Vercel deployment failure diagnosis

The Vercel dashboard reported: `The vercel.json schema validation failed ... redirects[0] should NOT have additional property preserveQueryParams`. This applied to the organizer rule added in Phase 25, so later deployments also failed before the app build. The same unsupported property had been copied into the admin and PR rules. The fix removes it from all three rules while retaining temporary redirects and default query forwarding. This root cause was confirmed from the deployment details for commit `764a2b3`.

## Verification

Automated routing regression tests cover exact host matching, Vercel's default query forwarding, absence of the rejected property, no redirect loop on existing panel paths, admin/PR deep-link SPA rewrites, the public homepage route, and the existing UI/API role gates.

- Isolated backend tests (`npm test`, `staging/server`): **84/84 passed**.
- Frontend build (`npm run build`, `staging/combined-app`): **passed**; existing >500 KB bundle advisory remains.
- TypeScript (`npx tsc --noEmit`): **passed**.
- `node --check staging/server/test/panel-routing.test.js`: **passed**.
- `vercel.json` JSON parse: **passed**.
- `git diff --check`: **passed**; Git reported line-ending conversion notices only.

These checks do not establish that the corrected configuration has passed Vercel's remote deployment validator, nor that deployed domains, TLS, cookie configuration, or panel logins work. No deployment was triggered.

## Deployment and staging checks

An authorized release owner must deploy this repository revision through the approved staging process and confirm both domains are attached to the intended Vercel project with valid HTTPS. Use only project-specific DNS records shown by Vercel; this repository does not establish DNS targets or change domain bindings.

On staging, verify:

1. Each host root redirects to its corresponding panel path and retains a harmless test query parameter.
2. `littx.in/` still serves the public marketplace.
3. `/admin`, `/admin/<supported path>`, `/pr`, and `/pr/<supported path>` load on direct navigation and refresh.
4. Anonymous users see the panel login, not protected data; an admin account cannot access PR-only APIs and a PR account cannot access admin-only APIs.
5. Login, authenticated API requests, logout, CSRF/Origin checks, cookie attributes, and session expiry work on each actual host.
6. Redirects do not loop and all assets/API requests stay on the intended host.

No hosting dashboard, DNS, production configuration, customer data, or secrets were accessed or changed. No deployment was performed. Staging acceptance is still required before production use.

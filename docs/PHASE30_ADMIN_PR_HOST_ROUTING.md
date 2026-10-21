# Phase 30 — Admin and PR Host Routing

**Status:** Implemented locally; not deployed or verified on staging. Production remains NO-GO.

## Change

The shared Vercel project serves the public marketing page at `/` and the React application from `app.html` for existing panel paths. The React router selects the master admin panel under `/admin` and the PR portal under `/pr`. Before this change, requests to the admin and PR subdomain roots fell through to the public homepage.

`vercel.json` now has temporary exact-host root redirects:

- `https://admin.littx.in/` → `/admin`
- `https://pr.littx.in/` → `/pr`

Both preserve query parameters. Existing `/admin` and `/pr` paths and their SPA rewrites remain in place for direct navigation and refresh. The public root continues to serve `index.html`. No other panel host was enabled.

The existing app continues to gate the admin UI on a master-admin session and PR APIs on a PR session. Backend role, company, and event-assignment checks were not changed. The redirects do not grant access. Host-only cookies, CSRF, Origin, session expiry, and bearer cutoff behavior were not changed.

## Verification

Automated routing regression tests cover exact host matching, query preservation, no redirect loop on existing panel paths, admin/PR deep-link SPA rewrites, the public homepage route, and the existing UI/API role gates. Local test/build results are recorded in the completion report for this change. They do not establish that the deployed domains, TLS, cookie configuration, or panel logins work.

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

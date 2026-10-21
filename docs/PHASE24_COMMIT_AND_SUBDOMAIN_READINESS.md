# Phase 24 — Commit and Subdomain Readiness

**Decision: Production remains NO-GO.** No hosting project, DNS, TLS, deployment, production configuration, or external provider was accessed or changed.

## Phase 23 commit

Phase 23 was already committed in the current checkout and is also the current `origin/main` revision:

- Commit: `f6caab10e125f71786011714a65f3adba21a3304`
- Existing commit subject: `phase 2 and 3`
- Phase 23 implementation/report file set is in that commit. There were no staged or unstaged changes at the start of Phase 24, so no duplicate or empty commit was created and no history was rewritten.
- Phase 24 readiness report is new and remains uncommitted. It is intentionally not mixed into the already-published Phase 23 commit.

Files in the existing Phase 23 commit:

- `docs/PHASE23_OPERATIONAL_PANELS_AND_EVENT_CLEANUP.md`
- `extracted_littx/littx/index.html`
- `scratch_app.tsx`
- `scratch_app2.tsx`
- `staging/combined-app/src/App.tsx`
- `staging/combined-app/src/admin-dash/DevAdminApp.tsx`
- `staging/combined-app/src/admin-dash/PartnerDashboardApp.tsx`
- `staging/combined-app/src/admin-dash/pages/AdminDashboardPage.tsx`
- `staging/combined-app/src/admin-dash/pages/CompanyPortal.tsx`
- `staging/combined-app/src/admin-dash/pages/Dashboard.tsx`
- `staging/combined-app/src/admin-dash/pages/Events.tsx`
- `staging/combined-app/src/admin-dash/pages/PartnerDashboardPage.tsx`
- `staging/combined-app/src/admin-dash/pages/QRScans.tsx`
- `staging/server/server.js`
- `staging/server/test/panel-routing.test.js`
- `vercel.json`

The current working tree was clean before this document was created. The repository ignore rules exclude `.env` and build output; no credentials or environment-file contents were read. The Phase 23 report describes the intentional event-data cleanup and test evidence. This Phase 24 inspection did not modify application files.

## Current deployment and routing facts

- The app is one React/Vite SPA build in `staging/combined-app`; Vercel's build command copies the public `index.html` and built `app.html` into one output.
- `vercel.json` routes `/api/*` to `api/index.js`, existing panel paths to `app.html`, and the root fallback to the public `index.html`.
- `staging/combined-app/src/App.tsx` selects panels by pathname. It retains one explicit `ashtudev.vercel.app` Shadow compatibility branch. It does not select Stageway panels based on the proposed hostnames.
- Browser clients use relative `/api` requests. No independent API-origin configuration was found. The API is the same Express app exported from `api/index.js` and does not currently have a separate deployment definition.
- Cookie sessions and CSRF exist behind opt-in configuration; cookie mode is disabled by default. The bearer cutoff has an explicit enforcement latch. Phase 19 staging acceptance remains incomplete. Host rewriting now would expose a new entry point before the required real staging browser, cookie, CSRF, cutoff, and rollback checks pass.
- Existing path routes remain the supported access paths. No host rewrite, cookie-domain widening, cross-origin credential setup, or API-host routing was made.

Vercel's current documentation supports conditional host rewrites in `vercel.json`, and its domain workflow directs project owners to add the domain and inspect the project-specific DNS requirements. This establishes that a future single-project approach is technically possible; it does not establish that the Stageway project or DNS zone is configured. See [Vercel `vercel.json` configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Vercel custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain).

## Hostname readiness

“Pending” means neither host-based selection nor the domain/TLS binding is verified in this repository or through the hosting account. Current path routes remain available as compatibility routes.

| Proposed host | Existing path / purpose | Repository routing status | Hosting/DNS/TLS status |
| --- | --- | --- | --- |
| `littx.in` | `/`, `/events`, event detail query | Public root and marketplace code exist; host itself is unverified | Pending project binding, DNS, TLS, HTTPS and staging verification |
| `admin.littx.in` | `/admin` | Path only; no host selection | Pending auth staging gate, host rewrite, project binding, DNS and TLS |
| `organizer.littx.in` | `/organizer` | Path only; server continues to enforce explicit event assignments | Pending auth staging gate, host rewrite, project binding, DNS and TLS |
| `seller.littx.in` | `/seller` | Path only; seller-specific authentication remains | Pending WebAuthn/origin review and staging acceptance, host rewrite, DNS and TLS |
| `pr.littx.in` | `/pr` | Path only; existing PR authorization remains | Pending auth staging gate, host rewrite, project binding, DNS and TLS |
| `scan.littx.in` | `/scanner` | Path only; scanner uses its distinct session mechanism | Pending native/browser scanner acceptance, host rewrite, project binding, DNS and TLS |
| `my.littx.in` | `/bookings` | Path only; OTP recovery and scoped ticket access remain separate | Pending OTP/link staging acceptance, host rewrite, project binding, DNS and TLS |
| `api.littx.in` | Current API is `/api/*` on the same host | **Not configured or required by the present client architecture** | Do not add unless a separate API-host design passes auth/CORS/CSRF review and staging tests |

No proposed HTTPS URL is represented as live or implemented. The safe URLs in this checkout remain the existing host plus path; the project does not establish that host's present DNS or TLS status.

## External hosting and DNS checklist

These are manual owner actions after the auth/staging gate is approved. No external changes were attempted.

1. In the authorized Vercel team, identify the exact project connected to this repository and verify its production and staging deployment domains. Do not reassign a domain already attached to another project without the domain owner resolving the conflict.
2. Add the approved hostnames in that project's **Settings → Domains**. Add `littx.in` and only the panel hosts approved for the controlled rollout: `admin`, `organizer`, `seller`, `pr`, `scan`, and `my`. Omit `api` unless its independent architecture is separately approved.
3. For each added host, inspect the records Vercel requires (`vercel domains inspect <hostname>` or the dashboard's domain details). Apply only the exact project-specific A/CNAME/TXT instructions shown there at the authorized DNS provider. Do not copy general example targets into production DNS.
4. Wait for domain verification and TLS issuance in Vercel. Verify certificate coverage, HTTPS, and the exact host-to-project binding before testing application behavior.
5. For staging, prefer isolated staging hostnames and a staging deployment/database. Do not bind proposed production names to a staging project unless the domain owner explicitly approves that external change.
6. Keep `/api` same-origin on each host through the existing rewrite design unless an API-host migration is separately approved. Do not add wildcard credentialed CORS. Do not set `Domain=.littx.in`; current cookie design is host-only and no cross-subdomain-cookie requirement is established.

### Environment-variable names to configure only in an authorized isolated staging secret store

Names were identified from repository documentation/source; no values were read, copied, or changed.

- Runtime/origins: `NODE_ENV`, `PORT`, `BASE_URL`, `CORS_ORIGINS`, `PUBLIC_TICKET_ORIGIN`.
- Database: `MONGODB_URI` (must point only to the isolated staging database).
- Browser sessions/cutoff: `SESSION_COOKIE_AUTH_ENABLED`, `SESSION_BEARER_CUTOFF_AT`, `SESSION_BEARER_CUTOFF_ENFORCED`.
- Existing flow-specific secrets/configuration include `BOOKING_OTP_SECRET`, `CHECKOUT_IDEMPOTENCY_SECRET`, `SCANNER_SESSION_SECRET`, and the existing role/WebAuthn/provider variable names documented in Phase 13/15. Do not invent or reuse production values.
- Configure only exact staging origins. With same-origin `/api`, do not add subdomain origins unless a measured staging flow requires them.

## Staging validation checklist

Run only after isolated endpoints, database, accounts, and authorized synthetic test identities exist. Capture redacted evidence with build/revision and timestamps; never capture cookie/token values or real customer data.

- DNS resolves each staging host to the intended staging project; the host binding is verified and HTTPS has a valid certificate.
- `https://<host>/` selects the intended panel on panel hosts, while the public hostname preserves the existing marketplace. Refresh a direct entry/deep link and confirm static assets load. Verify the current path routes still work during compatibility.
- Each panel uses same-origin `/api` and the isolated staging database. Unknown hosts do not accidentally select a privileged panel. API authorization is checked independently of frontend route selection.
- For each browser panel, verify login, role/event assignment restrictions, logout, session expiration/revocation, host-only `HttpOnly; Secure` cookie attributes, intended SameSite and path, CSRF success/failure, missing/untrusted Origin rejection, and no session credential in URL, local/session storage, redirects, or logs.
- Confirm bearer/static-key cutoff behavior at before/at/after boundary in staging only, plus cookie login after cutoff. Exercise rollback and prove it cannot reopen legacy browser access.
- Verify seller WebAuthn origin/RP behavior and native scanner/seller session compatibility on test devices; verify scanner offline expiry and OTP/ticket recovery separately.
- Confirm `/api.littx.in` remains unused unless its separate design is approved. Verify no wildcard CORS or broad cookie domain.
- Preserve synthetic tickets, QR identities, group admission counts, inventory, and payment state during all tests; use no real payment or production records.

## Verification run for Phase 24

These checks ran locally against the current checkout. Backend tests used `staging/server/test/run-isolated.js`, which drops application/deployment environment values and supplies test-only configuration; it does not load `staging/server/.env`.

- `npm test` (`staging/server`) — **PASS: 76 passed, 0 failed**.
- `npm run build` (`staging/combined-app`) — **PASS**; Vite emitted the existing large JavaScript chunk advisory (about 1.44 MB minified).
- `npx tsc --noEmit -p tsconfig.json` (`staging/combined-app`) — **PASS**.
- `node --check staging/server/server.js`, `node --check staging/server/session-cookie-auth.js`, `node --check staging/server/test/panel-routing.test.js` — **PASS**.
- `git diff HEAD^ HEAD --check` — **PASS** for the already committed Phase 23 changes. The new Phase 24 document was reviewed for whitespace and will be included in the next diff check.
- No deployment, staging endpoint, DNS, TLS, browser, Android device, credential, or provider verification was performed. Automated mocks/local tests are not staging acceptance.

## Blockers and release decision

1. Provision and authorize isolated staging infrastructure, including the Vercel staging project/target, staging database, test identities, and any provider test accounts needed by the existing acceptance plan.
2. Complete and document Phase 19 browser-cookie, CSRF, cutoff, rollback, shared-session, native-client, and role-boundary acceptance on actual staging hosts and devices.
3. Only after that acceptance, approve the hostname list and add exact host-conditioned rewrites while retaining existing paths. Verify unknown-host behavior and all old path aliases.
4. Have the hosting/DNS owner add the domains and apply only provider-inspected records; verify TLS before executing host-specific tests.
5. Keep `api.littx.in` out of scope until a reviewed need and cross-origin auth/CORS/CSRF design exists.

**NO-GO.** No Phase 24 host-routing code was enabled because doing so before the existing cookie-auth staging gate would introduce new panel entry origins without verified auth, CSRF, cutoff, and rollback behavior. Production remains NO-GO until all mandatory staging acceptance passes and a separately approved rollout plan exists.

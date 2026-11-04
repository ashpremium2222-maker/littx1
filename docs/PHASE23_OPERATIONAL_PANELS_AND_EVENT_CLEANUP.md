# Phase 23 — Operational Panels and Event Cleanup

**Status:** Local code changes implemented; staging acceptance not performed. Production remains **NO-GO**.

## Panel routes found

This repository builds one React application at `staging/combined-app` and deploys it with a static public `index.html` plus an SPA entry (`app.html`) and a shared `/api` rewrite. The public homepage remains the existing static Stageway design; its event cards are loaded from `GET /api/events` and link to `/events?event=<slug-or-id>`.

| Current path | Application entry | Access notes |
| --- | --- | --- |
| `/` | Public Stageway marketplace | Existing root page and UI preserved. It fetches only the public events API. |
| `/events` | React event marketplace | Detail/booking selection uses the `event` query parameter; booking submits the selected stored `eventId` and ticket category ID. |
| `/admin` | Super-admin sign-in or panel | Master-admin session is required for the super-admin portal. |
| `/dashboard` | Company-admin sign-in or dashboard | Existing company-admin role and company scope apply. |
| `/organizer` | Organizer sign-in or organizer portal | Organizer sees only explicitly assigned events; authorization is enforced by the backend. |
| `/seller` | Seller portal | Existing seller authentication and company-wide event scope apply. |
| `/pr` | PR portal | Existing PR authentication and event rules apply. |
| `/scanner` | Scanner gate | Uses the scanner-specific authentication mechanism. |
| `/bookings` | Customer booking history and ticket recovery | Uses OTP recovery and scoped ticket capabilities, separate from panel sessions. |
| `/view/:ticketId` | Legacy ticket view | Existing ticket-link policy remains unchanged in this phase. |

The prior Vercel config explicitly routed `/admin`, seller, PR, scanner, marketplace, and ticket paths to the SPA, but `/organizer`, `/bookings`, and nested `/admin/...` paths fell through to the public static homepage. `vercel.json` now routes these path-based entry points and refreshes to `app.html`. A local routing regression test covers those routes and preserves `/` on `index.html`.

The subdomain map (`admin.littx.in`, `organizer.littx.in`, `seller.littx.in`, `pr.littx.in`, `scan.littx.in`, and `my.littx.in`) is **not implemented or verified**. Phase 16/17 session migration remains staging-only, cookie mode defaults off, and no DNS or host routing was changed. The current routing test explicitly confirms that no Vercel host matcher was enabled. The API host `api.littx.in` is also not implemented; current clients use same-origin `/api`.

| Proposed hostname | Intended panel | Current implementation |
| --- | --- | --- |
| `littx.in` | Public marketplace | Root page works in the repository design; hosting/DNS/HTTPS not verified. |
| `admin.littx.in` | Super-admin | Pending approved host routing, DNS/TLS, and cookie-auth staging. Current path: `/admin`. |
| `organizer.littx.in` | Organizer | Pending approved host routing, DNS/TLS, and cookie-auth staging. Current path: `/organizer`. |
| `seller.littx.in` | Seller | Pending approved host routing, DNS/TLS, and cookie-auth staging. Current path: `/seller`. |
| `pr.littx.in` | PR | Pending approved host routing, DNS/TLS, and cookie-auth staging. Current path: `/pr`. |
| `scan.littx.in` | Scanner/staff | Pending approved host routing, DNS/TLS, and native/browser client acceptance. Current path: `/scanner`. |
| `my.littx.in` | Customer bookings/recovery | Pending approved host routing, DNS/TLS, and OTP/browser acceptance. Current path: `/bookings`. |
| `api.littx.in` | Optional API origin | Not implemented or established as required; current clients use same-origin `/api`. |

## Admin event workflow verified in code

1. Sign in at `/admin` using the existing master-admin flow. The application routes to `DevAdminApp` only for a `master_admin` session with the expected portal scope.
2. Open **Events** and create a draft. The UI sends `POST /api/admin/events`; the server requires an administrator, validates the title, company, slug, dates, and ticket categories, and saves a draft with `active: false`.
3. Open the saved event and configure slug, description, category, venue, address, city, timezone, dates, image URLs, ticket categories, prices, capacity, group size, and category status. The UI sends `PATCH /api/admin/events/:eventRef`. Existing order/category and inventory capacity checks are enforced server-side.
4. Submit the draft for review (`draft` → `pending_review`), then publish (`pending_review` → `published`). Publishing is restricted to a master administrator. The UI reflects the returned server record; it does not show success unless the API succeeds.
5. Assign organizer accounts from **Master Overview**. The UI sends `PUT /api/master/events/:eventRef/organizers`; the server requires master-admin access and verifies that each account is an organizer in the event’s company.
6. The public homepage calls `GET /api/events`; the event API excludes nonpublic lifecycle/visibility states. Event detail and checkout use the selected stored event/category IDs; checkout prices and inventory are server-authoritative.

This flow was verified by inspecting the frontend components, Vercel rewrites, API handlers, event model, and existing isolated tests. It was not exercised in a browser against staging. A newly created draft can be filled out in its edit form before publication; no event-specific sample values are supplied.

Public checkout submits the selected event ID and category ID, and the server re-resolves event status, category price, and shared inventory. Seller and PR flows use the same stored event and inventory reservation rules. Existing tests cover seller company scope, scanner event assignment, online/offline shared inventory, group-admission quantities, and duplicate scan rejection; those are isolated automated results, not staging acceptance.

## Organizer workflow and access control

`/organizer` loads `OrganizerPortal`. It calls `GET /api/organizer/overview`, which uses `getEventsForOrganizer(userId)` and returns the explicitly assigned events. Editing uses the event-scoped admin event endpoint, whose middleware checks `canManageEvent`; assignment and publishing remain administrator-only. The page shows an empty assignment state when the response contains no assigned events. Existing isolated tests cover assigned access, unassigned same-company denial, cross-company denial, role denial, and assignment validation.

## Event and dashboard cleanup

- Replaced the tracked extracted static event-listing page at `extracted_littx/littx/index.html` with a redirect to the current dynamic homepage. The deployed homepage `index.html` was not redesigned or modified.
- Removed formula-based revenue forecasts from the administrator, company dashboard, and legacy partner dashboard pages; those figures had no documented forecasting model. Charts now display recorded sales only.
- Removed static empty ticket-category rows and placeholder seller identities from the legacy partner dashboard. Empty data remains empty.
- Removed the fabricated “Event Schedule” lineup card from event management and replaced it with stored event details or an explicit unavailable state.
- Event-management dashboard records now key configured events by stored event ID and historical sales without an event ID separately by their historical label. Same-named configured events no longer share buyer/sales detail through name matching.
- The master-admin company workspace now sends its existing master session to protected company/sales APIs and child panels, exposes API load errors with retry, and uses real resend behavior instead of the literal `littx-admin` key and no-op callbacks. Its event switcher filters by event ID; historical name matching is used only if the company has exactly one event with that name. No email was sent during this work.
- Removed the misspelled `/dashhboard` frontend/backend route and its deployment rewrite. Existing `/dashboard` and the separately protected presentation API capability are unchanged.
- The mock-event map in `staging/server/db.js` is empty at initialization and has no normal-startup event seed. Synthetic event fixtures remain confined to isolated tests.
- Repository search found no active RichAutomate code/configuration/outbound call outside historical documentation and dependency history. No replacement provider was added. The existing WhatsApp code reports unavailable when no supported provider is configured.

### Remaining constants and compatibility behavior

- `DGR-` is the existing ticket-ID prefix in `staging/server/ticket.js`; it was retained to preserve ticket identity compatibility. `DGR` also remains a company display/legacy alias in seller and organizer configuration code; these are not event names or seeded events.
- Search found the generic ticket issuer marker `LITTX-ADMIN` in existing ticket-issuer classification and an empty `_mockEvents` map in database fallback code. Neither is an event name, event ID, seeded demo event, or replacement authentication credential.
- `Asia/Kolkata`, INR defaults, generic card gradients/icons, and generic labels are application defaults, not event records. Event-specific descriptions, schedules, posters, prices, and categories come from stored event data.
- `ashtudev.vercel.app` remains a host-specific Shadow panel compatibility branch in `staging/combined-app/src/App.tsx`. Removing or redirecting that legacy host could change access for existing users, so it was preserved and should be reviewed as part of an approved hostname migration.
- `localhost` references are limited to local development/test configuration and documented local diagnostics.
- Historical records without an event ID remain readable in historical reporting. Such records cannot be used to select or mutate a configured event by name; checkout and ticket generation continue to use event-scoped server validation.

## Deployment, DNS, and environment dependencies

No DNS, Vercel project-domain configuration, TLS certificate, deployment environment, or production variable was inspected or changed. Do not treat any proposed subdomain as live.

When subdomain migration is explicitly approved and the staging cookie-authentication gate passes:

1. Add each approved hostname to the actual hosting project’s domain settings. Use only the DNS record target returned by the hosting provider; the repository does not establish the correct A/CNAME target.
2. Configure and verify TLS for each hostname at the host. Confirm `/`, panel deep links, API calls, login/logout, OTP recovery, and ticket delivery on the actual HTTPS origins.
3. Decide and implement the host-to-panel mapping in Vercel or the hosting router; a DNS alias alone currently serves the static homepage at `/` and does not select a panel.
4. Keep authentication cookies host-only unless a separate documented security review proves a broader scope necessary. Do not enable the new subdomains until the cookie and CSRF migration is accepted in staging.
5. Use same-origin `/api` unless a separately approved API-host migration changes the architecture. If the API origin changes, update exact CORS origins and callback/origin settings; never use wildcard CORS with credentials.

Relevant environment-variable **names** found in the repository/docs (values intentionally omitted):

- Core/runtime: `NODE_ENV`, `PORT`, `MONGODB_URI`, `BASE_URL`, `CORS_ORIGINS`, `PUBLIC_TICKET_ORIGIN`.
- Session/security: `SESSION_COOKIE_AUTH_ENABLED`, `SESSION_BEARER_CUTOFF_AT`, `SESSION_BEARER_CUTOFF_ENFORCED`, `BOOKING_OTP_SECRET`, `CHECKOUT_IDEMPOTENCY_SECRET`, `SCANNER_SESSION_SECRET`.
- Existing staging email choices: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FROM_EMAIL`; or Mailgun/Brevo names listed in `docs/PHASE13_STAGING_SETUP.md`.
- Existing direct Meta WhatsApp names are documented in `docs/PHASE13_STAGING_SETUP.md`; WhatsApp delivery remains unavailable without the supported provider configuration and must only be tested with an authorized staging account/test recipient.
- Existing admin, scanner, seller, PR, Shadow, and WebAuthn configuration names are defined in `staging/server/server.js`; configure only through the approved isolated staging secret store. No secret values were read or changed in this phase.

Follow `docs/PHASE13_STAGING_SETUP.md` and `docs/PHASE15_INFRASTRUCTURE_READINESS.md` for isolated infrastructure, staging-only secret setup, and evidence capture. The actual DNS target, hosting-domain assignment, TLS, provider accounts, and live browser/device behavior cannot be verified from this checkout.

## Verification

Local verification used isolated backend test configuration. The test runner drops application environment values, sets `NODE_ENV=test`, uses synthetic credentials, and does not load `staging/server/.env`.

- Backend: `npm test` in `staging/server` — **76 passed, 0 failed** (includes new panel rewrite/company-workspace, event-ID binding, and active-source RichAutomate/demo-list regression tests plus existing event creation/publication/assignment/public-catalog/checkout scope tests).
- Frontend production build: `npm run build` in `staging/combined-app` — **passed**. Vite reported the existing large JavaScript chunk advisory (about 1.44 MB minified); no dependency changed.
- TypeScript: `npx tsc --noEmit -p tsconfig.json` in `staging/combined-app` — **passed**.
- Syntax: `node --check staging/server/test/panel-routing.test.js` and `node --check staging/server/server.js` — **passed**. Homepage inline JavaScript is parsed by `homepage-events.test.js` in the backend suite.
- `git diff --check` — **passed** (Git emitted only working-copy line-ending notices).
- Dependency audit and Android debug build were not run because this phase changed no dependencies or Android client files. Staging/browser/DNS/HTTPS checks were not run because no authorized staging target was supplied.

## Release decision and remaining work

**NO-GO for production.** Local code and isolated tests do not establish staging acceptance. Next steps: provision authorized isolated staging resources, complete the Phase 19/18 authentication and workflow evidence, explicitly approve whether/when host-based subdomain routing is enabled, add host routing only after that approval and cookie-auth staging validation, verify DNS/TLS and panel workflows on each staging hostname, then record release approval separately. No commit, push, deployment, migration, payment change, DNS change, external provider contact, or production configuration change was made.

# Stageway Phase 10 — Release Blocker Remediation

**Assessment date:** 2026-10-20  
**Decision:** **NO-GO for production** pending legacy ticket-link disposition/transition planning and real staging acceptance.  
**Scope:** Remediation and verification in the existing working tree. No commit, push, deployment, production configuration edit, production migration, or live financial operation was performed. Existing payment integrations were not changed or activated.

Phase 10 rechecked and supersedes the Phase 9 dependency-audit and TypeScript counts. All Phase 1–9 work remains in the working tree.

## Release blockers

| Severity | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
| High | Open, legacy access preserved by owner decision | `/api/ticket/:ticketId`, `/api/ticket/:ticketId/download`, and `/api/ticket/:ticketId/resend` accept existing short IDs as bearer access. | IDs from older tickets are guessable. View exposes attendee name, event, ticket type, amount, quantity, scan status/time and issue time. Download exposes the ticket PDF, including attendee/customer details and QR identity. Resend triggers email to the booking address. There is no legacy-link expiry/rotation mechanism. OTP history and scoped download tokens do not revoke these routes. |
| High | Open, staging not run | No staging database, real email/WhatsApp provider, Vercel project runtime setting, or deployment secret store was available. | Local mock tests do not establish production provider delivery, indexes, runtime compatibility, or access controls in the actual deployment. |
| Medium | Remediated in code; staging verification open | Sensitive login, checkout, ticket, and recovery endpoint limits now use the existing MongoDB atomic TTL rate-limit collection. Rate-limit bucket keys are HMACed; Vercel uses the trusted single-proxy hop for `req.ip`; failures reject with HTTP 503. | Each limited request adds an atomic MongoDB write. Confirm the TTL/unique indexes exist and measure latency/load in staging. If the shared store is unavailable, protected routes fail closed. Unit/integration tests run with mock storage, not multiple serverless instances. |
| Medium | Remediated locally | TypeScript check now reports zero errors with the configured strict/no-unused options. | Production acceptance and type-aware runtime journeys still need staging/browser coverage. |
| Low | Open | Frontend build succeeds but emits a >500 kB chunk warning (about 1.43 MB minified main JS). | Startup/download performance may be suboptimal on mobile connections. |

## Nodemailer advisory and remediation

The deployment dependency path is repository-root `api/index.js` → `staging/server/server.js`; Vercel installs the repository-root dependency set. The server also has its own manifest for local server development. Phase 9 had only updated the nested server dependency, so Phase 10 updated **both** manifests and lockfiles.

- Before: root `nodemailer@9.0.5`; nested server `nodemailer@9.1.1`.
- After: root and nested server declare `^10.0.10`; both lockfiles resolve `10.0.10`.
- Confirmed direct dependency in both `package.json` files; no transitive override was used.
- The root lockfile’s other audited vulnerable patch versions were also updated using `npm audit fix` (no major updates). The nested server lockfile was already on the compatible patched versions from Phase 9.
- Nodemailer 10 requires Node.js 20 or later and retains its CommonJS entry point. The SMTP `createTransport()` / `sendMail()` usage and `{ path }` / `{ content, cid }` attachment interface used here are covered by a network-free compatibility regression test. Mailgun and Brevo API branches do not use Nodemailer. The [upstream changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md) lists the 10.0.9 parser fixes; npm metadata reports Node `>=20.0.0`.
- [Current Vercel documentation](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) lists Node 20.x, 22.x, and 24.x as supported; the actual Stageway project selection remains unverified. Confirm it is at least 20.x before release.

Relevant advisories addressed include [GHSA-6vj9-mwq6-2f5v](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v) (affected `<10.0.2`), [GHSA-8vvx-rff5-p5rq](https://github.com/advisories/GHSA-8vvx-rff5-p5rq) (affected `<10.0.2`), [GHSA-g57g-f23g-4646](https://github.com/advisories/GHSA-g57g-f23g-4646) (affected `>=9.1.0 <10.0.9`), [GHSA-v53p-9fqp-m79j](https://github.com/advisories/GHSA-v53p-9fqp-m79j) (affected `<=10.0.5`), and [GHSA-prgh-xp8r-p3m5](https://github.com/advisories/GHSA-prgh-xp8r-p3m5) (affected `>=9.1.0 <=10.0.4`). The tested 10.0.10 release is outside all those ranges.

## TypeScript triage

The original 96 diagnostics grouped into these causes and affected areas:

- **Unused declarations and imports** in admin dashboards, seller/PR/shadow portals, scanner screens, and ticket UI. Removed unused imports and dead values where safe; retained compatibility props and state setters where callers or setters still use them.
- **Admin component contract mismatches** across admin shells and dashboard/settings/QR/ticket pages. Removed props not accepted by child components and adapted reload callbacks to return `Promise<void>`.
- **Incomplete order record typing** for offline PR fields. Added optional `prUserId`, `paymentMethod`, and `prName` to the local `Order` model.
- **Dashboard category map inference** returned `unknown` values. Added a precise category totals record type at the entry boundary.
- **Scanner status and browser capability types** did not include `cancelled` or the optional torch property. Added `cancelled` to the UI `TicketStatus` union and typed the optional torch capability.
- **State and handler signatures** needed discriminated screen initialization and a compatible refresh callback; an unused generated date helper and unused feedback values were removed or marked intentionally retained.

No compiler setting was disabled and no blanket `any` conversion or suppression was added. The exact configured command now passes: `cd staging/combined-app; npx tsc --noEmit`.

## Distributed rate-limit coverage

The following limits now consume a shared MongoDB counter using the existing `OtpRateLimit` collection (atomic updates, unique bucket key, TTL expiration):

| Route group | Shared limit |
| --- | --- |
| `/api/auth/login`, `/api/portal-auth/login`, `/api/seller/login-step1`, `/api/seller/login-step2`, `/api/shadow/login`, `/api/shadow-private/login`, `/api/scanner-login`, `/api/scanner-app-session` | 10 per 15 minutes per client IP across this login group |
| `/api/create-order`, `/api/verify-payment`, `/api/pr/create-order` | 20 per 15 minutes per client IP across checkout routes |
| `/api/ticket/:ticketId` | 30 per 15 minutes per client IP |
| `/api/ticket/:ticketId/download` | 30 per 15 minutes per client IP |
| `/api/ticket/:ticketId/resend` | 3 per 15 minutes per client IP |
| `/api/customer/bookings/recovery/request` | 5 per 15 minutes per client IP, plus the existing distributed email-subject OTP issuance limit of 3 per 15 minutes |
| `/api/customer/bookings/recovery/verify` | 10 per 15 minutes per client IP, plus one-time OTP attempt/expiry enforcement |
| `/api/customer/bookings/ticket-download` | 20 per 15 minutes per client IP |

The request counters are stored by fixed window and the client IP is not stored in clear text. Vercel’s `VERCEL=1` runtime flag enables a one-hop trusted proxy setting so Express obtains the forwarded client address; confirm the flag is exposed in the deployed function. The existing MongoDB `OtpRateLimit` schema already provides the unique and TTL indexes; verify those indexes in staging before relying on the distributed behavior.

## Legacy ticket route assessment and options

- `GET /view/:ticketId` serves the ticket-view SPA; the SPA requests the public JSON route below.
- `GET /api/ticket/:ticketId` returns ticket and attendee details when the bearer ID resolves.
- `GET /api/ticket/:ticketId/download` returns/rebuilds the PDF for that bearer ID.
- `POST /api/ticket/:ticketId/resend` resends the PDF to the email already stored for the ticket; the caller does not prove mailbox ownership.
- New OTP-verified history uses `POST /api/customer/bookings/ticket-download` with a short-lived ticket/email-bound token in the Authorization header.
- Existing legacy routes have no time-based expiration, ID rotation, or migration of old emailed URLs. Current countability/cancellation guards and distributed per-IP limits reduce some exposure but do not authenticate the bearer.

Safest remediation options and effects:

1. **Preserve legacy links while customers migrate via OTP recovery** (current behavior). Avoids locking customers out; leaves a high residual bearer-link risk.
2. **Introduce a transition period and notify customers, then require OTP/token for legacy IDs.** Reduces long-term exposure; old email links stop working after the announced date unless customers recover access.
3. **Rotate legacy ticket IDs and reissue links.** Strongest identifier remediation; requires coordinated PDF/QR identity and ticket record handling, and risks breaking printed/email tickets. Do not do this without explicit approval and an event-by-event migration plan.

No legacy route was invalidated, and no ticket/QR ID was changed.

## Verification results

- `cd staging/server; npm test` — **47 passed, 0 failed**. Includes synthetic/mock booking, inventory, OTP, authorization, scanning, refund-request, and reconciliation flows; a network-free Nodemailer CommonJS/SMTP stream transport attachment check; rate-limit enforcement; and fail-closed behavior when the shared counter store is unavailable.
- `cd staging/combined-app; npm run build` — **passed**; Vite reports a large-chunk warning (main JS ~1.43 MB minified).
- `cd staging/combined-app; npx tsc --noEmit` — **passed, 0 errors**.
- Root `npm audit --omit=dev` — **0 vulnerabilities** after updating the deployment dependency set.
- `cd staging/server; npm audit --omit=dev` — **0 vulnerabilities**.
- `cd staging/combined-app; npm audit --omit=dev` — **0 vulnerabilities**.
- `node --check` — **17 server and 4 frontend JavaScript files passed**. No JavaScript syntax failures.
- `git diff --check` — **passed**; Git reports LF/CRLF conversion notices only.
- No real SMTP, Mailgun, Brevo, WhatsApp, MongoDB staging cluster, Vercel function, or gate device was exercised. No real staging acceptance was claimed.

## Required staging acceptance checklist

1. Verify the Vercel API function runs Node 20.x or later and exposes `VERCEL=1`; record the function’s actual `process.version` in staging.
2. Set staging-only `NODE_ENV`, `MONGODB_URI`, `BASE_URL`, exact `CORS_ORIGINS`, `BOOKING_OTP_SECRET` (32+ random bytes), `SCANNER_SESSION_SECRET` (32+ random bytes), required admin/seller/scanner credentials, and one real SMTP/Mailgun/Brevo configuration with a verified sender. Do not reuse production credentials.
3. Connect to a staging MongoDB copy; confirm `OtpRateLimit` unique `bucketKey` and TTL `windowExpiresAt` indexes, and rehearse both event and organizer-assignment migrations in dry-run before an approved staging apply.
4. Exercise the OTP recovery request/verify flow using a controlled staging mailbox; confirm generic response behavior, code expiry/single use, no code/token in logs, booking history scope, 15-minute token binding, and expired-token denial.
5. Verify public event discovery, event/category-specific price, a pending booking, reservation expiry, and inventory release; run concurrent attempts and confirm no oversell.
6. Exercise authorized seller/PR offline issuance, confirm shared inventory consumption and unique QR, then scan the group ticket for its full admission count and verify duplicate-scan rejection on a second scanner.
7. Verify organizer event assignment isolation, super-admin role boundaries, seller company-wide scope, and refund approval/rejection. Confirm refund approval triggers no gateway refund, ticket invalidation, or inventory restoration. Verify reconciliation remains read-only and scoped.
8. Send controlled ticket and OTP emails and WhatsApp messages. Record provider-accepted/delivered status distinctly; a test-mode result or API mock is not provider confirmation.
9. Test rate limits through multiple concurrent Vercel function instances, verify shared 429 behavior and fail-closed behavior when Mongo counters are unavailable, then measure added Mongo write latency and TTL cleanup.
10. Test legacy email links on previously issued short IDs without rotating or invalidating them; document approved customer migration/expiry policy before changing access behavior.

## Changed files

Phase 10 changed:

- `package.json`, `package-lock.json` (root deployment dependency tree)
- `staging/server/package.json`, `staging/server/package-lock.json`
- `staging/server/server.js` (Mongo-backed shared route limits and Vercel proxy handling)
- `staging/server/test/nodemailer-compat.test.js`
- `staging/server/test/security.test.js` (shared route-rate-limit regressions)
- Type corrections in `staging/combined-app/src/admin-dash/App.tsx`, `DevAdminApp.tsx`, `PartnerDashboardApp.tsx`, `pages/AdminDashboardPage.tsx`, `pages/ChangePreviewModal.tsx`, `pages/CompanyControlCenter.tsx`, `pages/CompanyPortal.tsx`, `pages/Dashboard.tsx`, `pages/MasterCompaniesTable.tsx`, `pages/MasterGlobalSearch.tsx`, `pages/MasterSystemSettings.tsx`, `pages/Orders.tsx`, `pages/PartnerDashboardPage.tsx`, `src/components/CustomerDashboard.tsx`, `PublicWebsite.tsx`, `src/lib/store.tsx`, `src/littix/App.tsx`, `src/pr-portal/PRApp.tsx`, `src/screens/Dashboard.tsx`, `GenerateTicket.tsx`, `QRScanner.tsx`, `TicketCard.tsx`, `src/seller-portal/SellerPortalApp.tsx`, and `src/shadow/ShadowPanelApp.tsx`
- This Phase 10 report

All prior Phase 1–9 changes remain present and uncommitted.

## Go/no-go

**NO-GO for production.** Local technical blockers from the dependency audit and TypeScript check are resolved, and all local tests/build checks pass. The high-risk short-ID bearer routes remain active per the owner’s prior decision, and there is no staging evidence for provider delivery, MongoDB indexes, serverless shared counters, or the actual Vercel Node runtime. Keep production access behavior and configuration unchanged until the staging checklist and legacy-link transition decision are complete.

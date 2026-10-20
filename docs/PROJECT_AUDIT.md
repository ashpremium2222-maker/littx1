# Stageway Project Audit

> **Historical audit:** This audit predates the Phase 21 event cleanup. Earlier event seed and compatibility observations below are historical; see `PHASE21_HARDCODED_EVENT_AND_RICHAUTOMATE_REMOVAL.md` for current status.

**Audit date:** 2026-10-19
**Repository state:** `main` at the current checkout; the working tree already contained edits to the main React app, several portal components, `staging/server/server.js`, `vercel.json`, Android Gradle cache files, and untracked Android app folders before this audit. Those existing edits were preserved.
**Scope:** Source/configuration inventory, route and auth-flow inspection, database models/seeding, payment and ticket code paths, frontend/native clients, build/test scripts, and deployment files. No production service or database was accessed.

## Architecture

- One Express 5 API is implemented in `staging/server/server.js`; `api/index.js` exports it for Vercel. Local startup listens on port 3000.
- The customer/admin/organizer/seller/PR/scanner portals share the React 19 + TypeScript + Vite app in `staging/combined-app`. Vite proxies `/api` to the local Express service.
- `staging/server/db.js` defines MongoDB/Mongoose models for events, users/sessions, companies, sales, scans, and audit/support records. When no explicit Mongo URI exists and Mongoose is disconnected, a local in-memory fallback is enabled; it persists mock sales to a JSON file under the OS temp or server folder. Explicit `MONGODB_URI` disables that fallback, including when the database is unreachable.
- Native Android projects are present for scanner, seller, dashboard, solver, and Shadow-branded apps, plus a Capacitor Android project under the web app. Server APIs remain the source of truth for ticket scans and most portal data.
- Vercel configuration builds the web app and rewrites API traffic to the Express function. `.env.example` documents database, payment, mail, WhatsApp, scanner, seller, and WebAuthn settings. A real local `staging/server/.env` exists in the checkout but is ignored and was not read or included in this audit.

## Verified Existing Functionality

- Mongo models and helpers cover event/company records, ticket sales, session records, QR scan logs, and audit history. A Dholida event/catalog seed and Dholida compatibility logic are present.
- Razorpay order creation, client-return signature verification, a Razorpay webhook route with HMAC verification, and atomic sale-state claims are implemented. These are code-path findings only; gateway credentials and live webhook delivery were not verified.
- PDF ticket creation, QR generation, email and WhatsApp integrations, ticket retrieval/resend, seller WebAuthn/passkey flows, scanner token validation, and several admin/partner portals exist.
- Admin/master-admin middleware and role-specific guards exist. The Phase 1 continuation inventory is expanded in docs/API_AUTHORIZATION_MATRIX.md; Phase 2 adds event management, public catalogue/detail, and PR event-list routes, whose ownership scope is documented there.
- The frontend and Android projects have no unified automated integration test suite. The server test command now runs 15 HTTP security regression tests, including initial multi-event coverage. These do not yet cover the larger payment, tenant isolation, booking, refund, concurrency, and scan-race matrix.

## Confirmed Findings and Changes Made in This Audit

### Addressed in the first Phase 1 change set

1. **Unauthenticated native scanner token minting:** `/api/scanner-app-session` previously issued a signed scanner token without credentials. It now requires the configured scanner password, uses a timing-safe comparison, and fails closed when scanner secrets are absent or too short. The Android scanner now prompts for that password and submits it to the endpoint.
2. **Unauthenticated scanner activity totals:** `/api/scan-stats` previously returned daily scan totals publicly. It now requires a valid scanner session, and the web scanner sends its session token.
3. **Unauthenticated PR sales and submission APIs:** PR sales, Razorpay-order creation, and cash-sale requests previously trusted caller-supplied `prUserId` and were not authenticated. They now require a server-side PR session; sales are scoped to the session identity and submissions take the partner ID/name from that session. PR login now creates a persisted session, and the PR UI uses the server login rather than embedded credentials.
4. **Source/default credentials:** Removed the default admin key, seller and PR password fallbacks, weak presentation key, root app password gate, demo quick-fill credentials, client-side partner password checks, and initial mock user credentials. New empty-database seed users are created only for explicitly configured secrets and store scrypt hashes. Added the presentation and seed-account variables to `.env.example`.
5. **Frontend placeholder admin key:** Removed the hardcoded fallback from the admin sales/config/generation client paths; requests use a configured legacy key or an existing auth token.

These changes do not rotate credentials already deployed or rewrite existing user rows. Operators must replace any previously exposed/default credentials. Existing legacy plaintext passwords in a populated database remain a migration issue and need a controlled, verified migration plan.

## Phase 1 Continuation — Confirmed Findings and Fixes

The follow-up review found and addressed these additional issues:

1. **Public platform administration:** Company listing, control-center, configuration, emergency actions, admin seller listing, database diagnostics, and test-email routes lacked server-side guards. Master-only routes now require master admin; seller listing requires admin; test email is master-only. Company config rejects unsupported fields, audit actor comes from the authenticated session, and governance actions are allowlisted.
2. **Diagnostic and gateway-secret exposure:** Database diagnostics returned a database URI and sample attendee records. Company endpoints returned embedded Razorpay credentials, and schema/company seeds contained fake Razorpay-looking defaults. Diagnostics are reduced to connection state, company responses redact credentials, and new/default company gateway config is disabled with blank test values. Existing company rows were not rewritten.
3. **Destructive operations:** The legacy test-data wipe deleted every sale without a test-data filter. It is disabled and returns 404. Clear/cancel/delete sales now require master-admin authorization and retain explicit safeguards.
4. **Session lifecycle and brute force:** Persisted seller sessions had an expiry bypass, Shadow/unified auth trusted process-local token sets, and login endpoints lacked throttling. User, seller, and Shadow sessions now validate persisted token plus 12-hour expiry; user logout revokes its token. Browser portal tokens are stored in sessionStorage, with legacy localStorage token copies removed on use. This reduces persistence after the tab closes but does not protect tokens from same-origin script execution. Login, checkout, ticket retrieval/download, and resend receive process-local throttling.
5. **Cross-company access and ticket issue attribution:** Company-admin sales and approval actions are scoped to their company; master-only routes cannot be reached with company or PR roles. Manual issuance ignores body-supplied partner attribution and checks seller/company ownership against the selected event. Scanner sessions require configured event names and company ID; scanning outside assignment is denied.
6. **Payment and ticket integrity:** Production no longer enters simulated-payment mode when gateway credentials are absent. Test simulation requires NODE_ENV=development plus PAYMENT_TEST_MODE=true (or NODE_ENV=test). Client verification binds the signed Razorpay order ID to the stored order. Webhook signatures use captured raw request bytes and timing-safe comparison. Public order claims and PR cash approval are atomic. New ticket IDs use full UUID entropy, public ticket lookup no longer mutates sale records or returns contact email/phone, and static public PDF serving was removed.
7. **Presentation access and HTTP policy:** Presentation credentials are restricted to the sales presentation endpoint and responses omit contact details. CORS uses configured origins, JSON parsing is capped at 256 KiB, security headers are set, and production uncaught errors are generic.

## Phase 2 — Multi-Event Foundation (in progress)

- Added event slugs, organizer/company ownership, lifecycle and visibility fields, event location/dates, and persisted ticket-category configuration. Sales keep their legacy event label and gain optional event/category references.
- Added company-scoped event administration, review and publish transitions, public event discovery/detail endpoints, event-specific public and PR pricing, and a customer `/events` catalogue.
- Added a dry-run-first migration that only links records on unique exact matches and reports ambiguous or orphaned records. It has not been run against production.
- Phase 2 is not complete. Atomic inventory reservations, full event/category editing, event-ID reporting and staff/scanner assignments, dynamic ticket/notification templates, and customer-owned booking retrieval remain open. See docs/MULTI_EVENT_AUDIT.md for locations, impact, and migration constraints.

## Remaining High-Risk or Unverified Areas

- **Customer ownership:** There is no authenticated customer account/booking-owner system; the customer login/register UI calls endpoints that are not implemented by this server, so customer booking APIs do not enforce ownership. Customer UI tokens, if a separate service returns them, are stored in sessionStorage. Ticket links remain bearer credentials. Newly issued IDs have 122-bit UUID entropy, but old eight-hex-character ticket IDs remain weaker and need a customer-safe rotation/migration to fully address historical link enumeration.
- **Rate-limit distribution:** Login/checkout/ticket throttling is in-memory per process and does not coordinate across Vercel instances. Add shared edge or store-based rate limiting before high-volume public deployment.
- **Event assignment:** Scanner assignment is configured by exact event names and company ID; sellers have company checks on manual issue and scanning. Per-user/per-device event assignments are not modeled across every legacy seller endpoint. Phase 2 adds event ownership and PR company filtering, but first-class staff/scanner assignments remain open.
- **Legacy cash approval:** PR cash approval/rejection now atomically claims pending state, but provider delivery recovery, audit consistency, and failure retry behavior still need dedicated integration tests.
- **Payment/provider verification:** Invalid webhook signature and duplicate atomic claim are tested locally. No live Razorpay webhook, payment, refund, or notification provider was exercised. Refund/settlement API routes are not declared; UI/model refund fields do not establish gateway refund behavior.
- **Existing database cleanup:** Existing company records may retain the old fake gateway defaults, and old plaintext seller password rows are not rewritten. A targeted reviewed migration should clear only known fake gateway values and migrate legacy seller credentials; rotate any corresponding credential that was actually deployed. No production migration or rotation was run.
- **Public bearer-ticket compatibility:** Public ticket display/download/resend remain necessary for current customer flows and are rate-limited. Historical ticket IDs need a safe rotation plan; no customer login/reset/recovery endpoints exist.
- **Other unverified work:** Production CORS origins and secret values were not tested against deployment. Dependency vulnerability scanning, provider replay, database backup/restore, recovery, and monitoring were not performed. Android builds were not run due missing local SDK configuration.
## Verification Checkpoint

- Git started on `main` tracking `origin/main`; it was not clean. Existing changes were recorded above and left intact.
- There are no repository `AGENTS.md` files in the scanned project tree.
- After the Phase 2 foundation changes, `npm test` in `staging/server` passed 15 tests; syntax checks for `server.js`, `db.js`, the new migration, and `test/security.test.js` passed; `npm run build` in `staging/combined-app` passed with a Vite large-chunk warning; and `git diff --check` passed. These are local checks against isolated mock sales, not production verification.
- Native Android compilation was not run because this checkout has no configured local Android SDK properties/environment. No production database or payment/refund/notification provider was accessed. The automated source scan emitted only path/line categories, not credential values; no secret value was included in the report.
- No migrations or production data changes were performed.

## Phase 3 booking/payment checkpoint — 2026-10-19

- Local working-tree changes add 15-minute atomic inventory reservations to public and PR online checkout, including group-size admission counts and idempotent release; payment callback/webhook reconciliation checks captured order, amount, and currency; event IDs are recorded; and ticket generation uses a retryable lease.
- Server tests include mocked inventory reservation/expiry/release, OTP lifecycle, refund decision invariants, and whole-group scan race handling. Latest backend test run passed 29/29.
- OTP challenge storage and admin refund decision routes are implemented, but customer-facing OTP delivery/recovery and refund submission are not operational. The scanner admits the full group on one QR scan; delivery retry workers, cash/manual inventory handling, and production index verification remain open.
- Payment gateway integration is deferred for the current continuation. Existing provider code/configuration was left untouched. Late captures after inventory expiry require manual review without automatic ticket issuance, overselling, or automatic refunds. No production or live financial operation was performed.
# Historical audit notice

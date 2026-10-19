# Major Fixes Changelog

## 2026-10-19 — Phase 0 audit and Phase 1 security set 1

### What was wrong

- The native scanner session endpoint minted a valid scanner token for any caller.
- Daily scan totals were available without scanner authentication.
- PR sales and sale-submission routes trusted the caller-supplied partner ID and had no authenticated partner session. The PR portal also contained plaintext partner credentials and performed login locally.
- Admin, seller, PR, presentation, root-app, and empty-database seed paths contained weak/default credentials. The frontend exposed demo quick-fill credentials, client-side partner passwords, and an admin-key fallback.

### Files changed

- `staging/server/server.js`: fail-closed admin/seller/PR configuration, configured presentation key, password-protected native scanner login, scanner-only totals, persisted PR login sessions, PR role middleware, partner-scoped sales, and server-derived partner attribution.
- `staging/server/db.js`: optional password field, fresh seed users only when corresponding deployment secrets are set, scrypt hashes for those seeds, and no default mock users.
- `staging/server/.env.example`: blank secret placeholders and seed/presentation keys.
- `staging/combined-app/src/pr-portal/PRApp.tsx`: server-backed PR sign-in, session token use, protected PR requests, and no embedded default credentials.
- `staging/combined-app/src/screens/Dashboard.tsx`: sends scanner session for daily totals.
- `staging/combined-app/src/lib/store.tsx`, `staging/combined-app/src/screens/GenerateTicket.tsx`: removed source fallback admin key; use configured key or existing session token.
- `staging/combined-app/src/components/PublicSignInModal.tsx`: removed demo credential quick-fill controls.
- `staging/combined-app/src/App.tsx`, `scratch_app.tsx`, `scratch_app2.tsx`: root ticket-manager gate now delegates to the server portal-auth endpoint rather than checking embedded passwords.
- `staging/combined-app/src/admin-dash/App.tsx`, `PartnerDashboardApp.tsx`, `DevAdminApp.tsx`: removed static partner-password checks from admin manual-ticket flows.
- `scanner-native-android/.../ScannerApi.kt`, `.../ScannerRepository.kt`, `.../Models.kt`, `.../ScannerViewModel.kt`, `.../ScannerApp.kt`: native scanner now asks for and submits a server-held password and uses an authenticated stats request.
- `README.md`: documented scanner and deployment secret requirements.
- `docs/PROJECT_AUDIT.md`, `docs/IMPLEMENTATION_ROADMAP.md`: audit findings and ordered implementation plan.

### Verification

- `npm test` in `staging/server`: 3 HTTP security tests passed for missing scanner configuration, scanner password/session enforcement, and unauthenticated PR route rejection.
- `node --check server.js`, `node --check db.js`, and `node --check test/security.test.js`: passed.
- `npm run build` in `staging/combined-app`: passed. Vite reports an existing >500 kB JavaScript chunk warning.
- A source scan found no remaining matches for the removed known weak credential strings outside documentation. No live MongoDB, Razorpay, mail, or WhatsApp services were used.
- No database migration or production data mutation was run.

### Remaining risks

- Previously provisioned default credentials may still be active and require operator rotation. Existing database user rows are intentionally not rewritten.
- A first pass found other static client-side gate/partner password checks and a broad set of API routes that still need a complete authorization review.
- Shared rate limiting, CORS/security-header hardening, live provider validation, backup/recovery, and detailed multi-event isolation tests remain open.

### Next step

Complete Phase 1 route-by-route authorization and login abuse protection, remove remaining client-side credential gates, then add focused security tests before beginning multi-event work.

## 2026-10-19 — Phase 1 continuation: authorization and security hardening

### Confirmed issues fixed

- Added server-side guards to public master-company, diagnostics, admin seller, test-email, partner/pricing, and destructive admin routes. Disabled the unsafe legacy wipe endpoint.
- Added company ownership checks for company-admin sales/approval and seller manual ticket issue/scanning; scanner sessions now require assigned event names and company ID.
- Fixed persistent session expiry and removed in-process authorization bypasses. Added 12-hour expiry, token revocation on logout, generic login failures, timing-safe secret comparisons, and process-local throttling.
- Restricted CORS to configured origins, capped JSON bodies at 256 KiB, added security headers, and made production error responses generic.
- Made production payment simulation fail closed, bound Razorpay callback order ID to the stored order, verified webhooks using raw request bytes, and atomically claimed PR cash approvals.
- Increased new ticket bearer ID entropy, minimized public ticket lookup data, removed public static PDF serving, and restricted/sanitized presentation-key access.
- Removed fake gateway credentials from schema and new-company defaults; redacted gateway secret fields from company API responses. Existing database records were intentionally left untouched.

### Files changed

- `staging/server/server.js`, `staging/server/db.js`, `staging/server/ticket.js`, and `staging/server/test/security.test.js`.
- `staging/server/.env.example`, `README.md`, `docs/API_AUTHORIZATION_MATRIX.md`, `docs/PROJECT_AUDIT.md`, and this changelog.
- Admin dashboard fetches no longer put legacy admin keys in query strings; presentation data is sanitized server-side. Browser portal and customer UI tokens now use sessionStorage and clear prior localStorage copies.

### Verification

- `npm test` in `staging/server`: 13 passed, 0 failed. Coverage includes protected-route rejection, insufficient/expired roles, scanner event isolation, invalid webhook signature, duplicate payment and cash claims, cross-company approval denial, presentation data minimization, gateway-secret redaction, and untrusted CORS.
- Node syntax checks passed for `server.js`, `db.js`, `ticket.js`, and `test/security.test.js`.
- `npm run build` in `staging/combined-app` passed; Vite reports the existing large JavaScript chunk warning.
- `git diff --check` passed. Android builds, live providers, production database, payments/refunds, and provider-backed webhook replay were not run.

## Phase 2 — Multi-Event Foundation (2026-10-19, in progress)

### Confirmed changes

- Added event slug, organizer/company ownership, lifecycle/visibility, location/date metadata, and event-owned ticket categories. Existing sale labels remain; optional `eventId` and `ticketCategoryId` references are additive.
- Added organizer-scoped event list/create/edit operations, review/publish and safe lifecycle transitions, public published-event discovery/detail, and company-filtered PR event discovery.
- Bound public and PR checkout to a selected event/category and server-resolved price. Added a customer catalogue at `/events` and data-driven homepage event cards.
- Added a dry-run-first migration that links only unique exact legacy matches and reports ambiguous/orphaned records. It has not been applied to production.

### Verification and remaining work

- `npm test` in `staging/server`: 15 passed, 0 failed. The two new tests cover organizer ownership/lifecycle/public filtering and event-specific checkout pricing/category/inventory/order references.
- Node syntax checks passed for `server.js`, `db.js`, `migrations/20261019_multi_event_foundation.js`, and `test/security.test.js`. `npm run build` in `staging/combined-app` passed with a large-chunk warning. `git diff --check` passed.
- Phase 2 remains incomplete: atomic inventory reservations, complete event/category editor UI, event-ID reporting and staff/scanner assignment, dynamic PDF and generic notification templates, migration rollback evidence, and customer-owned booking retrieval remain open.

### Required operations and remaining risk

- Configure `CORS_ORIGINS`, `BASE_URL`, `SCANNER_EVENT_NAMES`, and `SCANNER_COMPANY_ID`. Use `PAYMENT_TEST_MODE=true` only outside production. Configure live Razorpay credentials and webhook secret for production payments.
- Existing company rows may contain old fake gateway defaults; review and clear only those exact placeholders through a controlled migration. Existing plaintext seller credentials require a controlled hash migration. Rotate any credential that was actually deployed; no rotation or database migration was performed.
- Existing short ticket IDs remain bearer links; plan a customer-safe rotation. Process-local throttles do not coordinate across serverless instances. No customer account ownership system exists; the customer login/register UI endpoints are absent from this API. Browser sessionStorage remains readable by same-origin scripts.
- Phase 2 remains gated on review of the authorization matrix and closure of the historical ticket-link and first-class event-assignment design risks.

## Phase 3 — Booking and payment reliability (2026-10-19, in progress)

### Changes in the current working tree

- Added persisted payment/fulfillment/refund lifecycle fields, checkout idempotency records, 15-minute event inventory reservations, and atomic reservation consume/release operations.
- Public and PR online checkout now calculate integer minor-unit totals on the server, count group sizes as individual admissions, reserve finite inventory, and verify provider order amount/currency. Razorpay callback/webhook acceptance reconciles captured order, amount, and currency; webhook event IDs and ticket-generation leases support retry safety.
- The frontend reuses server-provided minor-unit totals. The PDF ticket renderer tolerates missing legacy ticket-category labels.
- Added booking/payment helper and API regression coverage. Latest backend test run: 24 passed, 0 failed.

### Open work and owner decisions

- Scanner behavior currently consumes one order QR once. Owner must choose whole-group admission or one-at-a-time admission counting before scanner/ticket changes.
- OTP recovery lacks an approved configured delivery channel/template. Refund request/approval APIs, durable delivery retries, cash/manual inventory policy, migration/index validation, and gateway sandbox verification are incomplete.
- No migration, production database, live payment, refund, or provider operation was run. This phase is not production-ready. See `docs/BOOKING_PAYMENT_AUDIT.md`.

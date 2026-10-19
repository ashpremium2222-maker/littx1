# Stageway Project Audit

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
- Admin/master-admin middleware and multiple role-specific guards exist, but the guards are not consistently applied to all routes. At least 83 API route declarations were found; a route-by-route authorization matrix remains outstanding.
- The frontend and Android projects have no unified automated integration test suite. The server test command was initially a failing placeholder; this change set replaces it with three HTTP security regression tests, which do not yet cover the larger payments, tenant isolation, booking, refund, or scan race matrix.

## Confirmed Findings and Changes Made in This Audit

### Addressed in the first Phase 1 change set

1. **Unauthenticated native scanner token minting:** `/api/scanner-app-session` previously issued a signed scanner token without credentials. It now requires the configured scanner password, uses a timing-safe comparison, and fails closed when scanner secrets are absent or too short. The Android scanner now prompts for that password and submits it to the endpoint.
2. **Unauthenticated scanner activity totals:** `/api/scan-stats` previously returned daily scan totals publicly. It now requires a valid scanner session, and the web scanner sends its session token.
3. **Unauthenticated PR sales and submission APIs:** PR sales, Razorpay-order creation, and cash-sale requests previously trusted caller-supplied `prUserId` and were not authenticated. They now require a server-side PR session; sales are scoped to the session identity and submissions take the partner ID/name from that session. PR login now creates a persisted session, and the PR UI uses the server login rather than embedded credentials.
4. **Source/default credentials:** Removed the default admin key, seller and PR password fallbacks, weak presentation key, root app password gate, demo quick-fill credentials, client-side partner password checks, and initial mock user credentials. New empty-database seed users are created only for explicitly configured secrets and store scrypt hashes. Added the presentation and seed-account variables to `.env.example`.
5. **Frontend placeholder admin key:** Removed the `change-me-admin-key` fallback from the admin sales/config/generation client paths; requests use a configured legacy key or an existing auth token.

These changes do not rotate credentials already deployed or rewrite existing user rows. Operators must replace any previously exposed/default credentials. Existing legacy plaintext passwords in a populated database remain a migration issue and need a controlled, verified migration plan.

## Remaining High-Risk or Unverified Areas

- **Authorization coverage:** Continue checking every route for authenticated identity, role scope, event/company ownership, and tenant filtering. This audit found public ticket endpoints by design, but full data minimization and ownership review is still needed. Seller/organizer/PR isolation needs dedicated tests.
- **Remaining client-only gates:** Admin/partner manual-ticket flows no longer ask for a static partner password; their APIs still need route-by-route review to ensure authenticated server identity and correct event/company scope. Do not treat frontend screens as authorization.
- **Authentication controls:** No shared rate limiter was found in the inspected login paths. Review login throttling, recovery, session expiry/revocation, token storage, WebAuthn origin configuration, account lifecycle, and legacy plaintext password handling. The PR token currently follows the existing session model; session lifetime/revocation policy still needs a broader audit.
- **CORS and hardening:** Express currently installs unrestricted `cors()` and does not show a central security-header or request-size policy. Review origin allowlists, CSRF implications, Helmet-equivalent headers, JSON limits, and abuse controls.
- **Payments:** Test mode creates non-gateway order IDs when Razorpay credentials are absent. Confirm that all paid-ticket paths are unreachable in production test mode, verify pending/failed/interrupted transitions and duplicate webhook behavior, and add isolated tests. No live provider was available for verification.
- **Ticket and QR controls:** QR/ticket generation and atomic scan claims exist, but security, event association, invalidation/refund behavior, concurrent duplicate scans, gate identity, and offline behavior require targeted tests.
- **Multi-event support:** Event/company records exist, but global `EVENT` selection and Dholida-specific pricing, labels, seeds, and ticket fallbacks remain. New events are not yet proven sellable without code changes.
- **Data durability:** Mock sales are JSON-file based and unsuitable as a production store. Backup/restore, MongoDB indexes, transaction availability, and recovery procedures have not been verified. Do not point production traffic at the mock fallback.
- **Financial workflows:** Refund and settlement UI/model fields exist, but actual gateway refunds, reconciliation, commission accounting, payout controls, and audit invariants remain unverified.
- **Notifications and uploads:** Mailgun/SMTP and WhatsApp code/configuration exist. Credentials, consent, retries, delivery observability, upload validation, and privacy-safe logging need provider-backed verification.
- **Dependencies and deployment:** Lockfiles exist for the React app and server. No lockfile/dependency vulnerability scan or production deployment was run. SQLite is listed as a server dependency, but active SQLite use was not found in the inspected server path. Android buildability depends on local SDK configuration.
- **Operations:** No verified monitoring, alerting, backup schedule, disaster-recovery drill, or rollback evidence was found in the inspected repository.

## Initial Checkpoint

- Git started on `main` tracking `origin/main`; it was not clean. Existing changes were recorded above and left intact.
- There are no repository `AGENTS.md` files in the scanned project tree.
- `npm run build` in `staging/combined-app` passed (with a Vite large-chunk warning); `npm test` in `staging/server` passed all three newly added HTTP security checks. `node --check` and `git diff --check` passed.
- Native Android compilation was not run because this checkout has no configured local Android SDK properties/environment. No production database or external payment/notification provider was accessed.
- No migrations or production data changes were performed.

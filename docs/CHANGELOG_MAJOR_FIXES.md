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

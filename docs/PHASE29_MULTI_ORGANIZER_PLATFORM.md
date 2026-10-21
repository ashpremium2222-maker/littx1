# Phase 29 — Multi-Organizer Account and Team Management

**Status:** Implemented locally; staging and production acceptance remain blocked.  
**Repository revision at audit start:** `7fb1762`; the working tree already contained Phase 29 audit work.  
**External actions:** No deployment, DNS, provider contact, production data/configuration, commit, or push was performed.

## Decisions recorded

- Organizer and seller/PR contact and invitation flows use verified email only.
- Approving an organizer creates a new company for that application.
- Existing company-wide seller/PR access is report-only until a master administrator explicitly saves per-account event assignments.
- Seller/PR invitations expire after seven days. Resending rotates the random token and invalidates the previous link.
- Existing event publication policy remains unchanged: an organizer creates/submits drafts; only a master administrator publishes.

## Audit findings

- Organizer accounts previously had no application or verified-email workflow. The master-admin creation route could provision an active account directly; this remains available for backward-compatible administrator provisioning.
- Organizer event reads/edits were already assignment-scoped, but organizer event creation was behind administrator authorization and did not derive the company from an organizer session.
- Seller login uses password plus WebAuthn and persisted seller sessions. PR login uses the platform login route. These are kept separate.
- Seller and PR event access previously used company-wide scope. The new policy collection supports explicit event assignments; an absent policy deliberately retains the legacy company-wide behavior until an administrator migrates that identity.
- No event-scoped invitation or recipient activation flow existed.
- Phase 20 cookie/CSRF/Origin/session-expiry/bearer-cutoff behavior and the Phase 28 staging blockers remain unchanged. No panel subdomain or DNS changes were made.

## Implemented locally

### Organizer lifecycle

1. `POST /api/organizer/applications` validates organization name, contact name, and email, rate-limits issuance, and emails a purpose-specific OTP. Only its challenge ID is returned; the code is never returned by the API.
2. `POST /api/organizer/applications/:applicationId/verify` binds the one-time code to the application and email. Only verified applications enter the review queue.
3. Master admins review `GET /api/master/organizer-applications` and approve/reject through `POST /api/master/organizer-applications/:applicationId/decision`. Rejection records the reason. Approval creates a fresh `org-<uuid>` company and an inactive organizer account with no password.
4. Activation is sent to the verified email and completed at `POST /api/organizer/activate`. The activation OTP is purpose-scoped and single-use; the organizer chooses a password. The existing administrator status API can suspend/reactivate an activated account; pending email activation cannot be bypassed through that API.
5. Organizers can edit their contact name and organization name through the authenticated profile endpoints. Verified email changes are intentionally unsupported until a separate re-verification flow exists.
6. `POST /api/admin/events` now accepts an organizer session. The server derives the company and assigns the new draft to that organizer; request-supplied tenant ownership is ignored. Draft submission and master-only publication continue to use the existing lifecycle API.

### Seller and PR invitations and event access

- Organizers can list/manage a team only for an event they are assigned to, issue/resend/revoke invitations, and remove an explicit event assignment.
- Invitation records contain a SHA-256 hash of a random token, exact recipient email, role, company, event, inviter, timestamps, status, and seven-day expiry. The raw token is sent to the addressed email only. The email link places it in the URL fragment; the API receives it only when the recipient submits the acceptance form.
- Acceptance checks the exact email, expiry, one-time atomic claim, role, company, and event. New accounts choose a 12-character-minimum password; linking an existing account requires its current password and a prior explicit partner assignment. Existing credentials are not reset. Seller login still requires WebAuthn registration/authentication; PR login continues through `/api/auth/login`.
- Partner event access is checked server-side for event listings, seller pricing and ticket issuance, mobile seller configuration, PR event listings and sale submission, and staff ticket retrieval. Explicit policies immediately narrow access. Policy updates add/remove event IDs without replacing concurrent assignments.
- An account that has no explicit policy retains its old company-wide scope. The master-admin access report shows the effective legacy scope without modifying it. `PUT /api/master/accounts/:userId/event-assignments` changes that account to an explicit set only after an administrator selects and saves the event list.
- Invitation acceptance and policy changes are audited without storing raw invitation tokens. Audit/activity output remains scoped through the existing event/role authorization.

### Frontend and routing

- Added organizer application, email verification, activation, and invitation acceptance forms.
- Added organizer profile editing, event draft creation (including event dates and poster URL), publication-review submission, and event team management.
- Added master-admin application review and report-first seller/PR event assignment controls.
- Invited sellers can enter the invited email in the existing seller portal and retain the password-plus-passkey flow. PR invitees sign in with their invited email and password.
- Added a Vercel SPA rewrite for `/accept-invitation`; `/organizer/apply` and `/organizer/activate` use the existing `/organizer/(.*)` rewrite. Existing public marketplace, path-based panels, and host routing remain unchanged.

## Persistence and migration notes

New Mongoose models/fields are additive: organizer applications, event invitations, partner access policies, organizer email/status fields, and optional partner assignment IDs. No database migration or staging index validation was run. Before staging, verify collection/index creation, particularly unique application/invitation identifiers and the unique `(role, principalId)` partner-policy key. OTP purposes were extended in the existing OTP challenge model; no existing ticket/customer OTP scope was changed.

No existing user, event, ticket, sale, ticket ID, QR identity, inventory count, price, payment state, or refund state was changed. The legacy seller/PR migration is opt-in per identity and can reduce that account's current access when saved; first review the read-only report and choose the exact event list. There is no bulk assignment, deletion, or automatic role migration.

The master-admin direct organizer creation endpoint remains as a backward-compatible administrative path. New public applicants must complete verified email, approval, and owner activation.

## Automated verification

Final local checks for this phase:

- `npm test` in `staging/server`: **83/83 passed** using `test/run-isolated.js` with synthetic environment values, in-memory/mock persistence, and a test-only email outbox. No `.env` was loaded and no email provider was contacted.
- `npm run build` in `staging/combined-app`: **passed**. Existing Vite large-chunk advisory remains (main JS about 1.46 MB uncompressed).
- `npx tsc --noEmit` in `staging/combined-app`: **passed**.
- `node --check` for changed server JavaScript files and `git diff --check`: passed.
- Vercel JSON is covered by existing routing test coverage; direct new invitation-path routing is included in `panel-routing.test.js`.

The Phase 29 tests cover verified application, approval/rejection, inactive activation, suspension/reactivation, server-derived organizer tenant/event ownership, draft/review/publication separation, invitation recipient mismatch, hashed token storage, replay, expiry, resend token rotation, concurrent single-use claim, seller WebAuthn registration initiation, PR login, multi-event assignments, assignment removal, migration report behavior, and access denial after explicit scope reduction. All runtime coverage is local and mocked; it is not staging acceptance.

## Required staging acceptance and remaining blockers

Production remains **NO-GO**. Phase 28 reports no verified isolated staging environment. Staging must provide:

- Isolated HTTPS app origin(s), supported Node runtime, two app instances, and an isolated MongoDB database.
- Staging-only `BOOKING_OTP_SECRET` (at least 32 random characters), a secure `BASE_URL`, and an approved staging email transport (`BREVO_API_KEY`, Mailgun settings, or SMTP settings). This report does not read or supply secret values.
- Verified Mongoose collection/index creation; OTP expiry; request/invitation rate limits across app instances; and rollback/failure handling.
- Synthetic organizer, seller, PR, master-admin, event, and ticket identities. Test email accounts only; no production customer records.
- Real HTTPS organizer login/logout, CSRF/Origin/session expiry, event-assignment isolation, organizer application email verification and activation, sender/recipient behavior, invitation expiry/replay/resend/revocation, seller passkey registration/authentication, PR workflow, and seller/PR separate event access.
- Direct refresh tests for `/organizer/apply`, `/organizer/activate`, and `/accept-invitation`; confirmation that invitation token fragments are not sent as HTTP requests or recorded by hosting logs; and actual staging email-link behavior.
- Existing Phase 19–28 acceptance criteria, including cookie migration and bearer cutoff, still pass. Browser cookie mode remains disabled by default; no cutoff was activated.

No seller/PR subdomain or new host routing was enabled. These account flows currently use the existing path-based application and configured `BASE_URL`. No deployment, mail delivery, staging migration, native-device acceptance, or production integration was performed. Payment/provider integrations and existing payment behavior were not changed.

## Changed files

- `staging/server/db.js`
- `staging/server/booking-otp.js`
- `staging/server/server.js`
- `staging/server/mailer.js`
- `staging/server/test/run-isolated.js`
- `staging/server/test/phase29.test.js`
- `staging/server/test/panel-routing.test.js`
- `staging/combined-app/src/App.tsx`
- `staging/combined-app/src/components/LoginPage.tsx`
- `staging/combined-app/src/components/OrganizerAccountFlows.tsx`
- `staging/combined-app/src/organizer-portal/OrganizerPortal.tsx`
- `staging/combined-app/src/organizer-portal/EventTeamManager.tsx`
- `staging/combined-app/src/seller-portal/SellerPortalApp.tsx`
- `staging/combined-app/src/admin-dash/pages/MasterOverview.tsx`
- `vercel.json`
- `docs/PHASE29_MULTI_ORGANIZER_PLATFORM.md`

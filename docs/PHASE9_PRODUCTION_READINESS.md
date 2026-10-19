# Stageway Phase 9 Production Readiness

**Assessment date:** 2026-10-20  
**Status:** No-go for production deployment pending the high-risk items below.  
**Scope:** Readiness audit and compatible hardening only. No deployment, production configuration change, migration, or live financial operation was performed. Existing payment integrations were left unchanged.

## Risk summary

| Severity | Finding | Status |
| --- | --- | --- |
| High | Legacy short ticket IDs remain active bearer links. A person who obtains one may view/download that ticket. The owner chose to preserve these links; this is an accepted residual risk, not a secured endpoint. | Open; requires a planned secure transition before broad production use. |
| High | Installed Nodemailer version remains within several high-severity advisories. Compatible dependency updates removed the other audited production advisories; the remaining Nodemailer remediation requires a major-version decision/provider validation. | Open; test upgrade to a fixed major in staging before release. |
| High | Production secrets, database connection, public origin, and real email delivery could not be validated against the deployment environment. The local `.env` is missing required production values. | Open; validate in deployment secret store and staging. |
| Medium | Authentication/ticket/OTP throttles are process-local and do not coordinate across serverless instances. | Open; use shared rate limiting before significant public traffic. |
| Medium | TypeScript check reports 96 errors across existing app files. No diagnostics remain in `CustomerBookingHistory.tsx` or the ticket-access module’s related frontend usage. | Open; clean type-check debt before release. |
| Medium | No real MongoDB, SMTP/Mailgun, WhatsApp provider, or deployed Vercel environment was available for end-to-end validation. | Open; perform staging acceptance below. |
| Low | Frontend bundle has a 1.43 MB minified JS chunk and Vite emits a >500 kB chunk warning. | Open optimization item. |

## Changes made during Phase 9

- Production `/api` requests now fail closed with HTTP 503 if MongoDB is not configured instead of silently using local mock storage.
- Production email delivery requires configured real delivery; production no longer falls back to Ethereal test mail. Existing Brevo support is included in the delivery-availability check, and `FROM_EMAIL` is honored.
- Mail HTML interpolation is escaped. Logs no longer include customer identifiers, ticket bearer IDs, or provider response bodies in the reviewed paths.
- Ticket file lookup validates the ticket ID and resolved path. Ticket view/PDF responses are private and non-cacheable.
- Cancelled tickets are rejected by ticket view/download/resend routes, with a regression test.
- OTP-verified booking history can issue a 15-minute HMAC token scoped to the ticket and normalized booking email. The download endpoint checks the token server-side; the client sends it in an Authorization header, not a URL.
- Existing legacy public ticket links remain active per the owner’s decision. This preserves emailed links but leaves the bearer-link exposure described above. New recovery downloads use the scoped token flow.
- Safe compatible production dependency updates were applied to the server lockfile. The remaining Nodemailer major upgrade was not applied without staging validation.

## Verification performed

- `cd staging/server; npm test` — **44 passed, 0 failed**. Includes isolated mock tests for access control, OTP recovery, token purpose/ticket/email binding and expiry, cancellation, shared online/offline inventory, concurrent duplicate scanning, group admission counts, refund-request decisions, and read-only financial reconciliation.
- `cd staging/combined-app; npm run build` — **passed**. Vite emitted the existing large-chunk warning; minified JS is about 1.43 MB.
- `cd staging/server; npm audit --omit=dev` — **1 high vulnerability remains**, Nodemailer; other prior production findings were fixed by compatible updates.
- `cd staging/combined-app; npm audit --omit=dev` — **0 vulnerabilities**.
- `cd staging/combined-app; npx tsc --noEmit` — **96 TypeScript errors remain** across the application. No errors were reported in `CustomerBookingHistory.tsx` after its compatibility fix. Type checking exits with code 2.
- `node --check` — passed for the four JavaScript files under `staging/combined-app` and 16 server JavaScript files.
- `git diff --check` — passed; Git displayed line-ending conversion notices only.
- No provider-backed or deployed staging E2E was run. Email/WhatsApp delivery, real MongoDB behavior/indexes, Vercel runtime behavior, and actual customer/device scanning remain unverified.

## Hybrid workflow coverage

The automated isolated tests exercise public event/category selection, checkout price and availability validation, atomic inventory reservations and expiry, online/offline shared capacity, idempotency, payment-state validation through mocked provider events, ticket cancellation, group QR admission counts and duplicate rejection, OTP recovery, organizer assignment isolation, seller company scope, PR/session access, refund-request approval/rejection without automatic refunds or inventory restoration, and scoped read-only reconciliation.

These are repository tests against isolated mock storage and mocked events. They are not evidence of live provider delivery, MongoDB deployment behavior, real payment processing, or a full browser/device acceptance run.

## Required production configuration

Set and validate these in the deployment secret/configuration store; do not copy local development values:

- `NODE_ENV=production`
- `MONGODB_URI` for the production database
- `BASE_URL` and `CORS_ORIGINS` restricted to the deployed HTTPS origins
- Strong unique bootstrap/admin credentials where enabled (`MASTER_PASS`, `COMPANY_ADMIN_PASS`, `SCANNER_PASSWORD`); review whether legacy `ADMIN_KEY` is required and disable it if not
- `SCANNER_SESSION_SECRET` and `BOOKING_OTP_SECRET`, randomly generated with at least 32 bytes of entropy
- One real email delivery configuration: SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) or the supported Mailgun/Brevo provider credentials; set a verified sender via `FROM_EMAIL`
- If WhatsApp delivery is enabled, its provider credentials, sender, and approved template configuration
- Validate `WEBAUTHN_ORIGIN` and `WEBAUTHN_RP_ID` if passkey authentication is enabled
- Ensure the configured frontend/API origins, generated ticket URLs, and HTTPS hostname agree

Local inspection found required production values absent, but this is not a read of Vercel’s secret store. No secret values are included here. Keep all real credentials out of source control. The checked-in `.env.example` is illustrative only and must not be used as a production configuration.

## Migration plan (not executed)

1. Take and verify a restorable database backup; rehearse against a recent staging copy.
2. Run `staging/server/migrations/20261019_multi_event_foundation.js` in dry-run mode first. Review duplicate event slugs, orphan event/category references, existing indexes, and proposed mappings. With explicit release approval, apply it before the organizer assignment migration. It assigns event IDs/slugs and sale references, drops the old unique event-name index, and creates slug/company/status/event indexes.
3. Run `staging/server/migrations/20261020_organizer_event_assignments.js` in dry-run mode. With approval, apply after the foundation migration; it adds the organizer assignment lookup index and requires no data backfill.
4. Re-run migration verification and application acceptance against staging before production scheduling.

Both scripts connect to MongoDB even for inspection. Neither was run in this audit. Rollback for the foundation migration should use the verified database backup because reversing the data mappings and dropped index safely is not automatic. The organizer assignment migration can be rolled back by dropping its additive index; preserve any assignment data. Production execution requires a separately approved maintenance window.

## Release checklist and rollback

- Resolve or explicitly accept the legacy ticket bearer-link exposure; a transition plan should migrate old customers through verified recovery without silently invalidating their current links.
- Upgrade Nodemailer to a fixed supported release and exercise SMTP/Brevo/Mailgun delivery in staging.
- Configure and verify the production environment values above, strong unique secrets, HTTPS, and exact allowed origins.
- Rehearse migrations and restore from backup in staging; confirm indexes and event/sale mappings.
- Run the 44-test backend suite, frontend build, clean type check, dependency audit, and full staging acceptance on web and scanner devices.
- Confirm shared rate limiting, monitoring/alerting, log redaction, PDF storage/retention behavior, backup restore, and recovery ownership.
- Keep payment-provider behavior unchanged for this phase; no payment operations were performed.

If release validation fails, stop traffic to the new release and redeploy the last known-good application artifact. Restore the pre-migration backup only if migration verification shows data corruption or incompatible mappings; coordinate that database recovery separately and preserve post-backup booking records for reconciliation. Do not delete or overwrite data as an application rollback shortcut.

## Deployment decision

**NO-GO.** Do not deploy this working tree until the open high-risk items and staging validation are resolved. The legacy-link exception is documented per owner decision; the remaining Nodemailer advisory, unavailable production configuration validation, distributed rate limiting, and TypeScript failures also need an explicit release disposition. No commit, push, production change, or migration was made.

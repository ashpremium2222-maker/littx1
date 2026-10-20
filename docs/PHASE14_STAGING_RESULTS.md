# Stageway Phase 14 — Staging Verification Results

> **Historical snapshot:** RichAutomate references below describe the earlier repository state and are superseded by Phase 21 removal. The blocked staging acceptance results remain historical evidence and are not changed by Phase 21. See `PHASE21_HARDCODED_EVENT_AND_RICHAUTOMATE_REMOVAL.md` for current status.

**Assessment date:** 2026-10-20
**Release recommendation:** **NO-GO. Staging acceptance was not performed.** The checkout has no confirmed staging endpoint, staging database, deployed runtime metadata, or verifiably staging-only provider account. No probes or provider calls were made. The local ignored `.env` contains configured RichAutomate-related keys, but its account/environment cannot be established; its values were not read or used. Do not treat it as staging authorization.

## Environment readiness evidence

Only presence checks and non-secret local metadata were used. Secret values were not printed or recorded.

| Resource | Observed evidence | Readiness |
| --- | --- | --- |
| Isolated staging endpoint | `STAGING_BASE_URL`, `STAGING_URL`, and `VERCEL_URL` are unset in the process environment; no endpoint was supplied in project configuration. | **BLOCKED** — no target to test. |
| Supported deployed Node runtime | Local Node is `v26.5.0`. Root and server lockfiles resolve Nodemailer `10.0.10` (`>=20.0.0`). No staging deployment/runtime metadata is available. | **BLOCKED** for deployed runtime; local compatibility only. |
| Staging MongoDB | `MONGODB_URI` is unset in the process environment and the ignored `staging/server/.env` has no Mongo URI key. | **BLOCKED** — no isolated DB. |
| Email provider | SMTP/Mailgun/Brevo environment keys are unset. No controlled staging mailbox/provider was identified. | **BLOCKED** — no send test. |
| Meta WhatsApp test account | Meta phone-number ID, access token, template name, attachment flag, and webhook verification token are unset. | **BLOCKED** — no upload/send test. |
| RichAutomate staging account | The ignored `staging/server/.env` contains non-empty RichAutomate key/template setting names. Values were not read; account identity and environment are unknown. The running process has no RichAutomate variables set. | **BLOCKED** — cannot establish it is staging-only; not used. |
| Isolated test tickets/recipients | No staging DB, mailbox, provider sender, or controlled test-recipient authorization was supplied. | **BLOCKED** — none created or contacted. |

The server loads `staging/server/.env` through dotenv when started. To avoid accidentally using an unknown account credential, Phase 14 did not start the server, call provider diagnostics, or run the local test suite. No HTTP requests were sent to Stageway, Meta, RichAutomate, SMTP, or MongoDB.

## Acceptance matrix

**PASS** below means staging evidence exists. **PASS (local only)** records previously completed offline regression evidence and does not close a staging blocker. **BLOCKED** means the test was not run because the required isolated resource was absent or unverified. No staging test produced a FAIL; no staging tests were executed.

| Test | Evidence required / staging result | Status |
| --- | --- | --- |
| ST-01 — Deployed Node supports locked Nodemailer | Local Node `v26.5.0`; root/server lockfiles resolve Nodemailer `10.0.10`, whose engine requirement is Node `>=20.0.0`. No deployed `process.version` or runtime setting. | **BLOCKED** (staging); PASS (local compatibility only). |
| ST-02 — Mongo indexes and TTL | Inspect isolated database for unique `OtpRateLimit.bucketKey`, TTL `windowExpiresAt`, and OTP challenge `expiresAt`; observe expiry of synthetic rows. No MongoDB connection. Phase 12 records model declarations only. | **BLOCKED**. |
| ST-03 — Shared limits and failure behavior | Send requests across at least two staging application instances; observe common 429 budget and 503 when shared store is unavailable; capture write latency. No app instances/database. | **BLOCKED**. |
| ST-04 — OTP recovery delivery | Use a staging mailbox to confirm generic known/unknown response, actual delivery, expiry, single use, attempt lock and rate limit. No email provider/test mailbox. | **BLOCKED**; local OTP tests previously passed. |
| ST-05 — Token scope and replay | Verify separate view/download/resend scopes; expiry, replay/tamper, wrong-ticket, wrong-recipient, and wrong-purpose rejection using staging-generated test bookings. No staging booking data or secret. | **BLOCKED**; Phase 13 local suite reported token-scope, ticket/email binding, expiry, tamper and wrong-purpose regressions passing. The token implementation is stateless/reusable until expiry as documented; staging replay policy still needs acceptance. |
| ST-06 — Admin/organizer authorization | Use staging principals across master admin, company admin and assigned/unassigned organizers; test cross-company/event denial and suspension. No role accounts or data. | **BLOCKED**; local role/organizer regressions previously passed, but staging role matrix remains open. |
| ST-07 — PR/seller/Shadow authorization | Verify owner and cross-owner download/resend, assignment/company scope, and disabled/suspended sessions for PR, seller and both Shadow paths. No isolated role accounts. | **BLOCKED**; local subset coverage is recorded in Phase 12. |
| ST-08 — Inventory, seller attribution, group QR and duplicate scan | Concurrent online-test-mode and offline synthetic admissions; verify shared capacity, attribution, group admission quantity and second/concurrent scanner rejection. No isolated event, test staff, or scanner. | **BLOCKED**; local mock regressions previously passed. No payment gateway test. |
| ST-09 — Controlled email delivery | Confirm staging provider acceptance and mailbox delivery, OTP and ticket email, PDF/QR identity, `/bookings` link and safe logs. No staging provider or authorized recipient. | **BLOCKED**; local stream transport compatibility was previously tested only. |
| ST-10 — Meta PDF attachment | Verify real staging upload response media `id`, template document header references it, send accepted and final delivery status/device outcome. Also test missing/oversized PDF, upload failure, invalid/expired media ID, uncertain timeout/retry and no legacy fallback. Meta credentials/account absent. | **BLOCKED**; prior local mocks passed upload payload and fail-closed/no-fallback behavior. No real upload/message. |
| ST-11 — RichAutomate PDF attachment | Verify the staging account returns the expected `media_id`, template header uses it, provider accepts and delivers; test media ID invalid/expired, upload/template rejection, failure/retry, missing/oversized file, and no legacy fallback. Local ignored key is unverified and deliberately unused. | **BLOCKED**; prior local mocks passed expected `media_id` payload and failure behavior. Gupshup-hosted configuration may return only `media_url`, which code rejects. |
| ST-12 — Provider privacy/retention terms | Provider/account-specific access, retention, residency and deletion terms for ticket PDFs/attendee data must be reviewed and accepted by the data/privacy owner. | **BLOCKED** — no account or terms review evidence. |
| ST-13 — Legacy compatibility and clients | Test existing short-ID view/download/resend with test fixtures; enumerate external apps/templates and verify customer replacement journey. No staging endpoint or external-owner inventory. | **BLOCKED** (staging/external inventory); PASS (repository source review only). |

### Local evidence not repeated

Phase 12 records 52 backend tests, frontend build, TypeScript, three dependency audits, syntax checks and `git diff --check`. Phase 13 records 57 backend tests, including five mocked WhatsApp media upload tests, plus frontend build, TypeScript, three audits, changed-JavaScript syntax and whitespace checks. Those runs used local/mock evidence, not staging. Phase 14 made no executable code changes and did not repeat those checks. No staging acceptance is inferred from them.

## Legacy-link exposure and transition plan

### Confirmed repository paths

- `GET /view/:ticketId` serves the app shell. The client route in `staging/combined-app/src/App.tsx` opens `PublicTicketView`, which fetches `GET /api/ticket/:ticketId` and provides direct `GET /api/ticket/:ticketId/download` links. The JSON and PDF routes still treat the short ticket ID as bearer access.
- `POST /api/ticket/:ticketId/resend` remains a public compatibility route and sends to the stored email plus WhatsApp when available. Phase 13 changed WhatsApp PDF attachment delivery to direct provider upload; the legacy route itself remains active and the email/PDF compatibility paths remain.
- `vercel.json` retains a `/view/(.*)` SPA rewrite. The scanner Android source `scanner-native-android/.../ScannerViewModel.kt` recognizes `/view/<id>` from QR/deep-link strings; this is confirmed parsing behavior, not evidence of an external deployed app inventory.
- `PublicTicketView.tsx` is the confirmed web caller of the legacy view/download APIs. Customer booking history and current email CTA use OTP recovery at `/bookings`. Admin, PR, seller, Shadow and private-Shadow portal code uses scoped staff endpoints. Shadow Android source uses authenticated Shadow APIs for its ticket actions; scanner Android parses historic view links.
- Server code still constructs legacy download URLs in some API responses and email-delivery call arguments (`server.js` checkout/webhook/manual/Shadow/admin delivery paths). The current email template itself uses `/bookings` and attaches the PDF. New WhatsApp attachment requests use media IDs, not ticket download URLs.
- Previously delivered emails, WhatsApp messages, PDFs, browser bookmarks and external-provider templates cannot be inventoried or recalled from this checkout. No external client/provider owner inventory was supplied. These uses are **unknown**, not confirmed absent.

### Proposed staged migration (no cutoff or notices performed)

1. **Inventory and readiness:** obtain owner lists for production/mobile releases, saved customer links, mail and WhatsApp provider templates. Keep every issued ID/QR and the three legacy endpoints unchanged. Complete all ST-01–ST-12 staging evidence with isolated test data and recipients; review provider handling of PDF/PII and approve support recovery for customers who no longer control the booking mailbox.
2. **Replacement verification:** validate OTP booking recovery and staff-scoped endpoints for online, seller, PR and admin tickets, plus scanned individual/group tickets using unchanged QR identities. Fix any uncovered client before communication.
3. **Notice and compatibility window:** product/support prepares notice, help articles, mailbox-loss verification process, support staffing and event-day fallback. Select the notice channels and grace-period duration with the business owner; no duration/date is inferred here. Announce only after staging passes and explicit approval.
4. **Observe during the approved window:** track aggregate legacy route counts/statuses without logging ticket IDs, PII, tokens or full links. Track `/bookings` recovery success/support volume and provider delivery outcomes. Keep legacy routes enabled and monitor for old client usage.
5. **Cutoff gate:** after the approved window, review evidence and unresolved support cases. Obtain separate explicit approval of a cutoff date and release plan. This report does not set a date or authorize invalidation.
6. **Rollback:** if recovery or event entry fails during transition, pause the cutoff and keep/re-enable legacy compatibility while investigating; preserve tickets, PDFs, IDs, QR payloads, scans, quantities and inventory. No ID rotation or destructive data action is part of this plan.

## Release blockers, owners, and actions

| Blocker | Recommended owner/action | Closure evidence |
| --- | --- | --- |
| No confirmed isolated staging host/runtime | Platform/DevOps: provide isolated staging URL, deployed Node version, runtime configuration and secret-store access. | Runtime metadata and environment presence checks with values redacted. |
| No staging database / distributed topology | Platform + database owner: supply disposable isolated MongoDB and at least two app instances; create/review model indexes through staging procedure. | Index/TTL evidence, synthetic expiry observation, shared 429/503 results and latency. |
| No verifiably staging email/Meta/RichAutomate accounts or controlled recipient | Messaging/provider owners: identify dedicated staging accounts/sender/template and authorized test mailbox/device; confirm account isolation before enabling credentials. | Redacted upload/send identifiers, provider status and test recipient receipt. |
| RichAutomate account mode and response shape unknown | RichAutomate account owner: confirm staging account uses media-ID return path (`media_id`); if it returns only `media_url`, obtain a provider-supported secure media-ID flow. Do not allow public URL fallback. | Staging upload response schema with IDs redacted and successful template reference. |
| Provider privacy/data terms unreviewed | Security/privacy/legal owner: review access, retention, residency, deletion and subprocessors for ticket PDFs containing attendee data/QRs. | Recorded approval tied to selected staging/production account. |
| Full role/inventory/scanner acceptance not run | QA + event operations + portal owners: provision only synthetic test records and role principals; execute ST-05–ST-09. | Completed matrix with test IDs, outcomes and evidence. |
| Legacy short-ID routes still expose bearer access; outside consumer inventory incomplete | Product/support + security: inventory external clients, validate replacement/support, prepare notice and grace-period proposal, then request separate cutoff approval. | Signed-off consumer list, staging migration evidence, approved notice/window and later explicit cutoff authorization. |

## Final decision

**NO-GO for production.** Required staging checks are blocked, provider account/data-handling behavior is unverified, and legacy short-ID bearer routes remain active. No items are marked staging PASS; local test results are not staging acceptance.

Production GO requires all of the following objective evidence: deployed Node `>=20`; isolated Mongo indexes/TTL and cross-instance shared limits pass; OTP/customer-token and all staff role boundaries pass; shared online/offline inventory, seller attribution, group admission and duplicate-scan checks pass; controlled email and at least the selected WhatsApp provider report successful upload, accepted send and final delivery; upload/media ID expiry/error/retry behavior is understood with no public URL fallback; provider PDF data terms are approved; and legacy consumer inventory plus support/communication plan are approved. A legacy cutoff requires a separate explicit date approval after the compatibility period. Until then, leave legacy access and production configuration unchanged.

## Phase 14 work performed

- Updated `docs/PHASE12_STAGING_ACCEPTANCE.md` with the current environment recheck and explicit continued staging block.
- Created this Phase 14 evidence/report and transition plan.
- No code, payment integration, deployment configuration, or production data was changed. No provider/API request, email, WhatsApp message, customer notice, live payment, refund, migration, commit, or push occurred. Existing Phase 13 server code, tests and documentation were left unchanged.

## Phase 19 authentication acceptance recheck

The recheck and per-test evidence matrix are in [PHASE19_STAGING_ACCEPTANCE.md](PHASE19_STAGING_ACCEPTANCE.md). No verified staging endpoint, database, or staging-only credentials were available; the existing `staging/server/.env` was not read or used. Staging runtime checks were stopped. All Phase 19 acceptance items remain **BLOCKED** and production remains **NO-GO**.
# Historical snapshot notice

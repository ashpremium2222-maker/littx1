# Stageway Phase 13 — Isolated Staging Setup

**Purpose:** Prepare a repeatable, non-production environment for validating Phase 11 ticket recovery and Phase 13 secure WhatsApp PDF delivery. This guide does not authorize deployment, production changes, customer communications, or live financial activity.

## Environment separation

- Use a separate staging project/environment, hostname, database/cluster, email sender, WhatsApp business sender/account or explicitly approved test number, and secret store. Do not copy production customer records or secrets.
- Set `NODE_ENV=production` in the isolated staging runtime when validating production-mode fail-closed behavior. Keep its database and provider accounts isolated from production. For local unit tests use the repository test command; do not point a local process at production.
- Set `BASE_URL`, `PUBLIC_TICKET_ORIGIN`, and `CORS_ORIGINS` to the exact staging HTTPS origins. `PUBLIC_TICKET_ORIGIN` is used for the WhatsApp `/bookings` template link. Verify no rendered message or email points at `www.littx.in` or a production host.
- Keep payment-gateway configuration out of this setup. Do not add or activate Razorpay or other provider credentials for WhatsApp acceptance. Do not run checkout in a way that can create a real payment.
- Never print secret values in shell output, logs, screenshots, CI artifacts, or this guide. Grant access only to the staging operators who need it.

## Runtime and isolated infrastructure

- Use Node.js 20 or newer; the root and server lockfiles resolve Nodemailer 10.0.10, which declares Node `>=20.0.0`. Record the actual deployed staging `process.version`; local runtime compatibility is not a substitute.
- Use an isolated MongoDB database and network credentials scoped only to that database. Enable the same replica/transaction capabilities as the intended staging runtime where needed by the app. Do not seed copied customer or production financial data.
- Use the deployed serverless/function topology intended for release so multiple instances and serverless filesystem behavior can be observed. Ticket PDFs are generated/read within request flows; do not assume local files survive another invocation.
- Provide HTTPS ingress, exact CORS origins, and a staging-only domain. If testing a Vercel function, record its runtime setting and whether `VERCEL=1` is present without exposing any other environment values.
- Provide a controlled staging mailbox and a test WhatsApp recipient/consenting tester. Keep messages and recipients inside the approved test audience; Phase 13 local work sent no messages.

## Environment-variable names found in the repository

Names below are source-derived. Configure only what the specific staging test needs. Optional provider settings remain disabled unless the provider/template has been explicitly provisioned for staging. No values are included here.

### Core application, recovery, and URLs

`NODE_ENV`, `MONGODB_URI`, `BASE_URL`, `CORS_ORIGINS`, `PUBLIC_TICKET_ORIGIN`, `BOOKING_OTP_SECRET`, `SCANNER_SESSION_SECRET`, `CHECKOUT_IDEMPOTENCY_SECRET`, `PORT`, `VERCEL`.

Generate `BOOKING_OTP_SECRET`, `SCANNER_SESSION_SECRET`, and `CHECKOUT_IDEMPOTENCY_SECRET` with a cryptographically secure random generator, using at least 32 random bytes where the relevant code requires it. Keep them independent. Store values in the staging platform's encrypted secret manager; do not commit `.env` files. The OTP secret must be configured for recovery acceptance; the scanner secret is only needed for scanner tests.

### WhatsApp (choose a staging integration path)

- **Direct Meta Cloud API:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_ATTACH_PDF`, and `WHATSAPP_VERIFY_TOKEN` if validating the webhook handshake. The template must be approved/configured in the staging WhatsApp account with a document header when `WHATSAPP_ATTACH_PDF=true`. The PDF is uploaded from the server using the API bearer token, then referenced by provider media ID; no public PDF URL is required for the attachment.
- **RichAutomate:** `RICHAUTOMATE_API_KEY`, `RICHAUTOMATE_TEMPLATE_NAME`, `RICHAUTOMATE_TEMPLATE_LANG`, and `RICHAUTOMATE_ATTACH_PDF`. The configured template must have a document header for attachments. The implementation uploads the PDF through RichAutomate's authenticated media endpoint and sends the returned media ID.
- The code selects direct Meta when both Meta phone-number ID and access token exist; otherwise it selects RichAutomate when its API key exists. Avoid ambiguous dual-provider staging settings unless verifying this precedence deliberately.
- The code requires a `media_id` from RichAutomate. Its current API reference states Gupshup-hosted numbers may return `media_url` instead. Confirm the staging account hosting mode before enabling attachment; if it returns only a URL, the app fails closed and no public-download fallback is permitted. Obtain a supported media-ID contract from RichAutomate before adapting this path.
- Use a staging-owned API key and WhatsApp sender. Do not place access tokens or API keys in frontend configuration. The webhook's GET handshake should use an explicitly configured random `WHATSAPP_VERIFY_TOKEN`; do not rely on the source fallback. The current POST webhook handler only summarizes/acknowledges events and does not verify Meta request signatures, so do not treat it as trusted delivery-status reconciliation.

### Staging email and role-specific tests

- Email variables referenced in server code: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FROM_EMAIL`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_URL`, `BREVO_API_KEY`. Select one staging provider and a verified staging sender; test OTP/ticket mail only to controlled mailboxes.
- Role/portal variables referenced in server code: `ADMIN_KEY`, `PORTAL_ADMIN_KEY`, `PORTAL_DASHBOARD_KEY`, `MASTER_PASS`, `COMPANY_ADMIN_PASS`, `PR1_PASS`, `PR2_PASS`, `PR5_PASS`, `SELLER_A_PASS`, `SELLER_B_PASS`, `SELLER_C_PASS`, `SELLER_7TH_HEAVEN_PASS`, `SELLER_LITTLANE_PASS`, `SELLER_NITRO_PASS`, `SHADOW_PASS`, `SHADOW_PRIVATE_PASS`, `PRESENTATION_KEY`, `SOLVER_REVEAL_PASSWORD`, `SCANNER_PASSWORD`, `SCANNER_COMPANY_ID`, `SCANNER_EVENT_NAMES`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ANDROID_ORIGIN`, `WEBAUTHN_LEGACY_ORIGIN`, and `WEBAUTHN_LEGACY_RP_ID`. Configure unique staging-only credentials only for roles in the acceptance matrix; avoid seed-password variables unless intentionally initializing an empty staging user collection.
- Payment variables also exist in source (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_TEST_MODE`). They are intentionally outside this WhatsApp staging setup. Do not configure live payment credentials or enable payment processing for these tests.
- `LAMBDA_TASK_ROOT` and `LITTX_MOCK_SALES_FILE` are runtime/test support variables, not staging secrets. Do not point a staging process at mock sale files.

## Safe secret generation and storage

1. Generate each application secret with a cryptographic random generator (for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) in a trusted operator shell. Do not paste the resulting value into chat, documentation, source, or a command that will be retained in history.
2. Put provider keys and application secrets in the staging environment's encrypted secret manager. Restrict read/write access, avoid sharing values across environments, and rotate a staging secret if it is exposed.
3. Configure only the selected WhatsApp provider's credentials. Do not activate `*_ATTACH_PDF` until the selected staging template actually has an approved document header.
4. Record only whether a required secret is present and the secret-manager reference/owner. Never include the value in acceptance evidence.

## MongoDB indexes, TTL, and shared limits

1. Use a fresh isolated staging database and create indexes through the app's normal startup/index creation path. Do not run production migrations or connect this procedure to a production URI.
2. Read-only inspect `OtpRateLimit` and verify the unique `bucketKey` index plus TTL index on `windowExpiresAt`; inspect `OtpChallenge` TTL on `expiresAt`. Capture index names, key patterns, uniqueness/TTL values, and database/cluster identity (redacted to non-secret staging labels).
3. Insert only synthetic expired OTP/rate-limit records under an approved staging fixture, wait for MongoDB's TTL monitor interval, and verify cleanup. Do not use real OTP/customer rows.
4. Send controlled below-limit and over-limit requests through at least two separate staging function instances. Confirm a shared 429 boundary; simulate shared-store unavailability only with an approved staging fault technique and confirm sensitive operations fail closed with 503.
5. Record latency and result codes. Do not print bucket keys, OTPs, authorization headers, tokens, or customer details.

## WhatsApp PDF staging acceptance

The local implementation uses direct upload (design B):

- Meta path: authenticated multipart `POST /v21.0/{phone-number-id}/media` with `messaging_product=whatsapp`, PDF MIME type and file, followed by a template document header containing the returned media `id`.
- RichAutomate path: authenticated multipart `POST /api/v1/public/media` with a PDF file, followed by `POST /api/v1/send-template` using `header_media_type=document` and `header_media_id`.
- Both providers document a 100 MB PDF/document maximum; the application rejects empty files and files over 100,000,000 bytes before upload. Provider account/template behavior and actual file acceptance still require staging confirmation.
- A media ID is kept only in memory and not logged or persisted. Existing integration has no automatic resend retry; if an upload or message request fails or times out, inspect the provider console/status using its message ID when available and use the approved staff resend workflow. Do not blindly retry an uncertain send.
- Attachment-disabled sends use the existing template body and do not make a PDF upload. Attachment-enabled upload/send errors fail that WhatsApp channel; they do not fall back to a short-ID public download URL. Email remains an independent channel.

Setup and execution:

1. Configure one staging provider, staging sender, and approved staging template. Confirm the approved template name, language, body parameter order, and document header with the provider account owner.
2. Set `PUBLIC_TICKET_ORIGIN` to the staging hostname and verify the link parameter uses `/bookings`; no message may contain a production origin or ticket PDF URL.
3. Create a synthetic, non-financial staging ticket fixture using an approved test path. Do not initiate a live checkout or make a test payment against a live gateway. Verify the generated PDF exists in the same invocation before calling WhatsApp upload.
4. With attachment disabled, execute only a controlled staging send and confirm exactly one template send and no media upload. With attachment enabled, execute one controlled test send; confirm upload is authenticated, returns a media ID, and the template request contains that ID and filename, with no `link`/`header_media_url`.
5. Check the recipient device, provider accepted/delivered status, PDF contents, existing ticket ID, QR identity, and group admission quantity against the synthetic fixture. Provider API acceptance alone is not proof of delivery.
6. Exercise upload failure, file missing/empty/over-limit, template rejection, and timeout paths using local mocks or staging-only faults. Confirm no insecure URL fallback and no sensitive URL/token/media ID in application logs.
7. Capture request method/host/path, status, safe response/message ID where permitted, timestamps, test fixture label, file byte count, device outcome, and the relevant code version. Redact phone numbers, tokens, PDFs/QRs, and full request bodies from shared evidence.

Do not use an actual customer/production account as a staging recipient. If no provider-owned test sender/account is available, stop before the send test and record it BLOCKED.

## Test tickets and execution sequence

1. Run local validation from the repository root: `cd staging/server; npm test`; `cd staging/combined-app; npm run build`; `cd staging/combined-app; npx tsc --noEmit`; `npm audit --omit=dev` in root, server, and combined-app; `node --check` on changed server/test JavaScript; and `git diff --check`.
2. In staging, create synthetic single and group ticket fixtures with designated test attendee names/emails/phones and non-production event/category data. Label every record `PHASE13-STAGING`; ensure data cannot be mistaken for a real sale.
3. Validate OTP recovery, customer booking history, secure view/download/resend scopes, then Meta or RichAutomate attachment-disabled and attachment-enabled send paths to controlled inbox/device.
4. Validate authenticated staff paths (admin/organizer, PR, seller, Shadow where used), scanner admission quantity/duplicate scan, legacy URL compatibility, and rate limits without changing any ticket ID, QR, inventory, or payment state.
5. Delete synthetic staging fixtures only through the documented staging cleanup path after evidence is captured and the owner confirms there are no in-flight tests. No customer messages are sent as part of cleanup.

## Evidence and rollback precautions

- Capture deployed Node version, code revision, selected provider, staging origin labels, presence-only secret checks, Mongo index definitions/TTL values, cross-instance rate-limit outcomes, local command output, provider request statuses, and recipient-device confirmation.
- Redact API keys, access tokens, OTPs, customer data, phone numbers, complete signed/capability URLs (none should be used for WhatsApp attachments), PDF/QR images, and full request/response bodies.
- Staging rollback means disabling the staging attachment flag, reverting the staging code revision, and removing only synthetic staging records/temporary provider media according to the provider's supported controls. Do not remove live/production media or customer records.
- Phase 13 preserves legacy download routes and does not invalidate historic links. A deployment rollback must not alter ticket IDs, QR payloads, admission quantities, inventory, or payment behavior.
- Do not set a customer-facing cutoff or send notices under this staging guide. Production remains NO-GO until every required staging acceptance case is evidenced and legacy-link cutoff is separately approved.

## Still unverified until staging access exists

- Actual selected provider account, approved template name/language/header, account-specific capabilities, token scopes, sender quality/consent, recipient availability, document acceptance, delivery latency and failure semantics.
- Deployed Node runtime, Vercel/function settings, canonical staging URLs, environment presence, Mongo indexes/TTL behavior, distributed rate-limit behavior and write latency.
- Provider behavior for duplicate sends, network timeout after acceptance, RichAutomate media-ID expiry/reuse and Meta media-ID lifecycle as experienced by the configured account.
- End-to-end PDF layout, QR identity/admission count on device, test email/WhatsApp delivery, role authorization, scanner compatibility, and all old external/mobile/template consumers.
- Legacy short-ID view/download/resend routes remain available during compatibility and continue to expose bearer-link risk until a separately approved transition cutoff.

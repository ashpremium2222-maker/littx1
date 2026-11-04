# Stageway Phase 13 — Isolated Staging Setup

**Status update (Phase 21):** This setup guide supersedes the earlier provider instructions. Current WhatsApp delivery has one supported integration path: direct Meta Cloud API when explicitly configured. There is no alternate provider fallback. If Meta is not configured, WhatsApp delivery reports unavailable/failed and does not claim success. This guide does not authorize deployment, provider contact, customer communications, or live financial activity.

Use [`PHASE15_INFRASTRUCTURE_READINESS.md`](PHASE15_INFRASTRUCTURE_READINESS.md) for the provisioning handoff. Do not start the application or contact an endpoint/provider until an isolated staging target has been established and authorized.

## Environment separation

- Use separate staging deployment, hostname, database/cluster and database principal, secret store, email sender, Meta test account/sender/template, and test identities. Never copy production customer records or secrets.
- Use `NODE_ENV=production` only inside the isolated staging runtime when validating production-mode behavior. Local automated tests use the repository's isolated runner and do not load the developer `.env`.
- Set `BASE_URL`, `PUBLIC_TICKET_ORIGIN`, and exact `CORS_ORIGINS` values to approved staging HTTPS origins. Confirm generated email and WhatsApp links never point at production.
- Do not configure or activate payment credentials for messaging acceptance. Do not create live payments.
- Never print secret values in logs, evidence, shell output, screenshots, or this guide.

## Runtime and infrastructure

- Supported runtime is Node.js 20 or newer for the installed Nodemailer version. Record deployed `process.version` in staging evidence.
- Use isolated MongoDB with the required replica/transaction capabilities and a database-scoped principal.
- Provide the intended HTTPS ingress and deployment topology, including independent instances where cross-instance behavior must be verified.
- Provide one controlled staging mailbox and, only if authorized, a consenting test WhatsApp recipient under a dedicated Meta staging/test sender and template.

## Environment-variable names

Names below are source-derived; no values are included.

Core application and URL configuration: `NODE_ENV`, `MONGODB_URI`, `BASE_URL`, `CORS_ORIGINS`, `PUBLIC_TICKET_ORIGIN`, `BOOKING_OTP_SECRET`, `SCANNER_SESSION_SECRET`, `CHECKOUT_IDEMPOTENCY_SECRET`, `PORT`, `VERCEL`.

Direct Meta WhatsApp only: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_ATTACH_PDF`, and `WHATSAPP_VERIFY_TOKEN` only when explicitly testing the staging webhook handshake. Keep this path unconfigured until a dedicated staging account/template and approved test recipient exist. The app uploads a PDF using the Meta API and references the returned media ID; it does not fall back to a public ticket download URL.

Email providers are independent: SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FROM_EMAIL`), Mailgun (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_URL`), or Brevo (`BREVO_API_KEY`). Use only a verified staging sender.

Generate staging-only secrets with a cryptographically secure random generator and store them in the staging secret manager. Keep each secret independent and least-privilege scoped. Do not commit local `.env` files or copy secret values from production.

## Local and staging validation

Local isolated checks: from `staging/server`, run `npm test`; from `staging/combined-app`, run `npm run build` and `npx tsc --noEmit`. These checks do not establish provider or staging acceptance.

Staging checks require an approved isolated endpoint, database, test identities, staging sender/template and controlled test recipients. Use synthetic events, categories, orders and tickets only. Confirm that event/category IDs and prices in generated records match the selected database event. Verify media upload, template acceptance and recipient-device delivery separately. Do not treat HTTP acceptance alone as successful delivery.

Never send real customer messages. If the provider account or target identity cannot be confirmed as staging-only, stop and mark the test BLOCKED.

## Evidence and rollback

Capture deployed runtime/version, staging hostname labels, code revision, presence-only configuration results, test fixture identifiers, redacted provider request/response IDs, provider status and test-device outcome. Redact all secrets, tokens, full capability URLs, recipient contact data, PDFs and QR images.

Rollback is staging-only: disable the staging messaging configuration or revert the staging revision and remove only synthetic records/media under the approved test cleanup procedure. Preserve ticket IDs, QR identities, quantities, inventory, pricing, payment behavior and historical ticket links. Do not change production settings or communicate a customer cutoff through this guide.

## Still blocked until staging access exists

- Actual staging Node runtime, MongoDB indexes/TTL and multi-instance revocation/rate-limit behavior.
- Staging email configuration and delivery.
- Meta staging account identity, template/document-header support, upload response, accepted/delivered status, media lifecycle and data-retention terms.
- End-to-end event creation, customer recovery, role boundaries, native scanner/seller behavior and delivery workflows.
- Production remains NO-GO until mandatory staging acceptance and the separate legacy-link transition approval are complete.
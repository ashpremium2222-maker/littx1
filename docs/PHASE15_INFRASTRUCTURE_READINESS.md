# Stageway Phase 15 — Staging Infrastructure Readiness

**Assessment date:** 2026-10-20  
**Readiness:** **BLOCKED — infrastructure and accounts are not verified.**  
**Production recommendation:** **NO-GO.** This plan does not authorize deployment, production changes, provider contact, or customer communications.

## Purpose and current evidence

This document turns the Phase 12–14 staging requirements into a provisioning handoff. Phase 14 found no confirmed staging endpoint, deployed runtime, isolated MongoDB database, controlled email account, Meta test account, or RichAutomate staging account. A local ignored `staging/server/.env` had some configured names, but its values were not read and its account identity was unknown; it is not evidence of staging readiness and must not be used. No endpoints or providers were contacted. See [Phase 14 results](PHASE14_STAGING_RESULTS.md) for the acceptance matrix and prior evidence.

The Phase 13 setup guide remains the source for implementation-specific environment names and detailed acceptance commands. This plan adds the provisioning order, isolation checks, authorization gates, test-data controls, and evidence checklist. Previously passed local tests are not repeated here.

## Minimum staging resources

Provision the smallest isolated set that can exercise the required acceptance matrix:

| Resource | Minimum requirement | How staging-only identity is established |
| --- | --- | --- |
| Application target | Dedicated staging project/deployment using supported Node.js `>=20`; HTTPS hostname and test-only accounts. Two independently addressable instances are needed for shared rate-limit checks. | Platform owner identifies project/environment and deployment IDs in its control plane. Confirm the canonical hostname and deployment metadata are explicitly labeled staging; reject redirects to production. |
| MongoDB | Disposable, isolated database and staging-only database principal. The deployment must support the transactions/replica capabilities required by the application. | Database owner confirms cluster/project and database labels in the DB console. The principal must be scoped to this staging database. Verify the configured URI's host/database identity in memory or by redacted metadata only; never print the URI. |
| Secret storage | Encrypted staging secret store with least-privilege access and separate values from production. | Platform owner confirms the secret-store project/environment and references. Names or local `.env` presence do not establish environment identity. |
| Email | One chosen staging email integration, verified staging sender/domain, and controlled test mailbox. | Messaging owner confirms account, sender domain, and recipient mailbox are test-owned/approved. Restrict delivery to an allowlist where supported. |
| WhatsApp | For the selected acceptance path, a dedicated Meta test sender/account or a confirmed RichAutomate staging account, staging template with document header, and controlled opted-in test device. Do not provision both paths unless each needs testing. | Provider account owner confirms business/account and sender IDs, template, and environment using provider administration. A key in a file is not proof. RichAutomate must confirm that this account's upload API returns the `media_id` contract the code requires. |
| Synthetic fixtures and operators | QA principals for required roles, a synthetic event and ticket fixtures, designated mailbox/device owners, and a cleanup owner. | Use test-only labels and identities; verify principals belong to the staging tenant and test recipients are controlled/consenting. No production customer records or copied data. |

Do not add a payment provider, gateway credentials, or payment processing to satisfy this plan. Payment integration remains explicitly deferred. If a test requires a payment-dependent state, stop and record it blocked rather than fabricate a successful payment.

## Isolation boundaries

- Use separate cloud/project environment, deployment, hostname, database/cluster and DB principal, secret store, email account/sender, WhatsApp account/sender/template, and test identities. Do not share production credentials or production customer data.
- Keep `BASE_URL`, `PUBLIC_TICKET_ORIGIN`, and `CORS_ORIGINS` on the exact staging origins. Confirm generated links, redirects, and provider callbacks cannot point to production.
- Apply least privilege: staging database credentials cannot read production; provider credentials belong to the staging account; test email/phone destinations are controlled; operators receive only the roles needed for their test cases.
- Use synthetic-only event, attendee, order, ticket and scan data. No production database snapshots, copied tickets, real QR identities, or real financial operations.
- Keep provider and application secrets out of frontend bundles, logs, screenshots, shell history, chat, and evidence artifacts. Evidence records presence/format checks, never values.
- Do not run the application, local test suite, diagnostics, or any network call while configuration can implicitly load an unverified `.env`. Before any future authorized run, the operator must establish the process configuration source and prove it cannot select the ignored local credentials.

## Environment-variable names

The following names are found in repository code and documented in the Phase 13 guide. They are names only; this plan does not inspect or set their values. Configure only variables required for an authorized staging test.

### Core application and URL configuration

`NODE_ENV`, `MONGODB_URI`, `BASE_URL`, `CORS_ORIGINS`, `PUBLIC_TICKET_ORIGIN`, `BOOKING_OTP_SECRET`, `CHECKOUT_IDEMPOTENCY_SECRET`, `PORT`, `VERCEL`.

For scanner-specific cases: `SCANNER_SESSION_SECRET`, `SCANNER_PASSWORD`, `SCANNER_COMPANY_ID`, `SCANNER_EVENT_NAMES`.

### One email path

SMTP: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FROM_EMAIL`.

Mailgun: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_URL`.

Brevo: `BREVO_API_KEY`.

Use one verified staging provider/sender for a given test. The matching sender configuration must also be verified as staging-only.

### One WhatsApp path

Direct Meta: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_ATTACH_PDF`; `WHATSAPP_VERIFY_TOKEN` only if the staging webhook handshake is explicitly tested.

RichAutomate: `RICHAUTOMATE_API_KEY`, `RICHAUTOMATE_TEMPLATE_NAME`, `RICHAUTOMATE_TEMPLATE_LANG`, `RICHAUTOMATE_ATTACH_PDF`.

Avoid ambiguous dual-provider configuration unless the test specifically verifies provider selection. Confirm the account/template and upload response contract before enabling attachment delivery.

### Role-specific test accounts

Use the Phase 13 guide's source-derived role variable list (admin, company admin, PR, seller, Shadow, scanner and WebAuthn settings) only for the authorization cases being run. Provision unique staging-only credentials in the staging secret store; do not use seed-password variables unless intentionally initializing an empty staging user collection.

Payment names such as `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `PAYMENT_TEST_MODE` are intentionally excluded. Do not set or change them for Phase 15.

## Provisioning and verification responsibilities

### Must be provisioned or confirmed manually first

1. Platform/DevOps owner creates the isolated staging project, HTTPS hostname, supported Node runtime and deployment slots/instances; confirms deployment identity and that no production secrets are inherited.
2. Database owner creates a disposable staging cluster/database and a database-scoped principal with the required capabilities; confirms labels, network restrictions, backup/retention policy and safe synthetic-data cleanup.
3. Security/platform owner creates a staging-only secret-store scope, generates independent random secrets locally in a trusted shell, and stores them without pasting or echoing values. Confirm access logs and least-privilege operators.
4. Messaging owners provision a staging email sender/mailbox and, only if WhatsApp acceptance is in scope, a test sender/account/template and opted-in device. Confirm provider identity and terms; establish an allowlist for controlled recipients where available.
5. QA/event operations create staging-only role principals and approve synthetic fixture cases, controlled recipients, cleanup owner, and a test window. Do not create financial or paid states through an unapproved shortcut.
6. A human operator gives explicit authorization naming the exact staging hostname, cloud project/deployment, database/cluster label, provider account(s), test recipients, and permitted actions. Authorization to inspect does not imply permission to send messages or mutate fixtures; obtain that scope too.

### Codex checks, only after target verification and explicit authorization

Codex may then perform the specifically authorized checks below. No checks in this subsection were run for Phase 15.

| Dependency | Safe verification procedure | Evidence to retain |
| --- | --- | --- |
| App endpoint/runtime | Verify the exact approved host against the platform's staging deployment metadata; inspect runtime version and staging environment label. Check redirect and generated-origin behavior. Never follow an unexpected redirect to a production hostname. | Staging project/deployment labels, Node version, timestamp, sanitized origin, status and code revision. |
| Secrets/config | Check required-name presence and non-secret shape only (for example, boolean present, expected origin hostname, or token length threshold where code specifies one). Do not display, hash for public evidence, or log secret material. | Variable names and pass/fail presence/shape results only. |
| MongoDB | Confirm cluster/database labels via authorized metadata; inspect required index key patterns, uniqueness and TTL values using read-only access. If mutation is separately authorized, insert uniquely labeled synthetic expiry rows and observe TTL cleanup. | Redacted cluster/database labels, index definitions and synthetic fixture IDs; no URI, credentials, attendee data or bucket keys. |
| Cross-instance limits | Send only approved synthetic requests through two confirmed staging instances. Verify common limit behavior and approved fail-closed behavior during a staging-only shared-store fault. | Test ID, instance labels, response codes, timings and fault procedure; no OTPs, tokens or identifiers. |
| Email/OTP | Send only to the explicitly approved controlled mailbox. Verify recovery behavior, expiry/replay and inbox receipt. | Provider message ID redacted as agreed, mailbox pseudonym, delivery state/time and sanitized logs. |
| WhatsApp PDF | With explicit send approval, verify authenticated upload, returned `media_id`, document template reference, provider acceptance and final device/provider delivery status. Exercise missing/empty/oversized PDF, upload failure, invalid/expired media ID, timeout/retry, and no legacy URL fallback using mocks or isolated staging faults. | Redacted provider identifiers, statuses, byte counts and device outcome. Do not retain PDF/QR or full signed URL in general evidence. |
| Authorization, inventory and scanning | Use only approved synthetic role principals and fixtures to execute Phase 14 ST-05–ST-09. Preserve defined booking/payment boundaries; do not contact a gateway or fabricate a paid confirmation. | Test case IDs, role labels, result codes, synthetic ticket labels, quantity/scan outcomes, and code revision. |

Any operation that contacts a provider, sends a message, mutates a database, or creates/cleans fixtures requires the explicit target and action scope described above. Stop if identity, redirect, account, or database checks are inconclusive.

## Staged test-data plan

1. QA creates a fresh event/category and attendee identities that are clearly synthetic and carry a label such as `PHASE15-STAGING-<date>-<case>`. Do not use a real customer's name, email, phone, booking, ticket, QR, or payment data.
2. Use a designated controlled mailbox and opted-in device. Use domain/phone restrictions supported by the chosen staging provider. A `.test` email address is suitable as a non-deliverable fixture but cannot prove actual delivery; use a controlled mailbox for delivery acceptance.
3. Prepare single-admission and group-admission fixtures, plus role principals for only the required matrix. Keep group QR quantity and ticket identity evidence synthetic and redact QR images/payloads.
4. Exercise inventory, OTP recovery, view/download/resend token scopes, staff permissions, duplicate scanning and provider PDF delivery only through approved test paths. Do not use real checkout or provider payment flows. Do not mark any production order paid or represent a mock event as a real capture.
5. Label every fixture and provider operation with a test-case ID. Cleanup only the exact synthetic records and temporary staging media after evidence capture and owner confirmation that no test is in flight. No broad collection/database deletion.

## Evidence-retention checklist

For every executed check, retain:

- Test case ID, UTC timestamp, code revision, operator/approver, and sanitized staging project/deployment/host labels.
- Runtime version; environment variable **names** with presence/shape outcome only; no values, partial values, screenshots of secret consoles, or reversible secret hashes.
- Redacted database/cluster labels, required index definitions, TTL observation timestamps, and synthetic fixture labels.
- Request method and sanitized host/path, status, timing, instance label, and safe error category. Scrub authorization headers, OTPs, cookies, tokens, full query strings, ticket PII and provider payloads.
- Email/WhatsApp account label, recipient pseudonym, redacted provider message/media identifiers, upload/send/delivery states, and final controlled-device/mailbox result. HTTP success alone is not delivery evidence.
- Sanitized screenshots/log excerpts, reviewer decision, any failure/retry, and fixture cleanup confirmation. Never store customer PDFs, QR images, access tokens, full signed URLs, or production records in the evidence package.
- Evidence owner, access group, approved storage location, and retention period set by the organization's policy owner. Do not invent a retention duration; obtain it before collecting provider or personal-data evidence.

## Readiness gates and stop conditions

Infrastructure is ready for staging acceptance only after all manual provisioning items are verified and exact targets/action scopes are authorized. Staging acceptance still requires the Phase 14 matrix to pass with evidence; infrastructure readiness alone is not release acceptance.

Stop and mark the affected case **BLOCKED** if a host redirects to production, environment identity is unclear, a database principal reaches production, provider account/sender/template cannot be established as staging-only, a recipient is not controlled/authorized, secrets could be implicitly loaded from an unknown `.env`, an operation might initiate payment, or evidence would expose credentials/PII. Do not probe alternative hosts or credentials to resolve uncertainty.

**Production remains NO-GO** until mandatory staging acceptance passes, provider behavior and data-handling terms are accepted, legacy-link risks and transition are resolved through the separately approved process, and all other release blockers are explicitly closed. No cutoff, customer notice, deployment, production migration/configuration change, payment integration change, or live financial operation is authorized here.

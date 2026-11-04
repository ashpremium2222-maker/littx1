# Phase 21 — Event Data and RichAutomate Removal

**Status:** Implemented and locally verified. No staging or production acceptance is implied. No external provider was contacted, no production configuration was changed, and no commit/deploy was performed.

## Event hardcoding removed

- Removed the default in-memory event and seeded mock catalog. An empty event store now produces an empty public marketplace, and newly created records remain the source for published listings, categories, price, inventory, dates, venue, and images.
- Replaced UI labels and fallback event data in the admin dashboards, customer dashboard, ticket cards, scan results, PR and seller portals, Shadow portal, and ticket views with selected-event data or neutral empty-state text.
- Admin and seller ticket creation now loads event/category choices from authorized APIs and submits the selected event/category. Shadow creation no longer fills in a first event/category or hardcoded price when none is selected.
- Public event and ticket views use stored event details. Ticket view responses now include event description, category, and images for both legacy lookup and OTP-authorized retrieval; ticket PDFs and email content use the selected event record without campaign-specific details.
- Removed the static event poster from the root deployment copy and the unused Android seller banner. The marketplace remains data-driven through `/api/events` and the event detail API.
- Test fixtures now use synthetic Phase 21 event data. Regression coverage verifies an empty catalogue, multiple event/category resolution and checkout isolation, event-derived email/PDF content, and the existing ticket ID/QR format.
- Admin analytics category sections are grouped from observed ticket types rather than fixed event categories. Existing company/partner authorization and event assignment checks remain server-side.

### Retained compatibility constants and behavior

- New and existing ticket IDs retain the `DGR-` prefix, and QR payloads remain the ticket ID. This is retained to preserve issued-ticket identity and scanner compatibility; it is not an event-selection fallback.
- Existing company/partner identities such as `nitro`/`DGR`, company-wide seller scope, and platform-wide styles remain because they are authorization/account or global presentation data, not event catalogue defaults. They require a separate partner-account migration if the business wants them renamed.
- Legacy event records with no lifecycle status remain discoverable when otherwise active. This is an existing compatibility rule documented in the server; new event records default to draft. Operators must explicitly migrate legacy lifecycle state before changing that behavior.
- Global currency formatting, timezone default, platform logo, email sender fallback, and platform visual styles remain global defaults. Event data itself does not inherit event names, prices, dates, venues, categories, or posters from another event.

## RichAutomate removal

- Removed RichAutomate selection, adapter/request code, media upload handling, fallback routing, active test mocks, active setup instructions, and RichAutomate environment-variable names from application configuration and the tracked `.env.example`.
- No RichAutomate package was present in either dependency manifest/lockfile, so no dependencies or lockfiles were changed. `form-data` and `mailgun.js` remain required for the existing email path; direct Meta PDF upload uses built-in Node APIs.
- WhatsApp delivery uses the pre-existing direct Meta Cloud API only when its explicit Meta configuration is present. With no supported provider configured, the service returns `provider_unavailable`; a RichAutomate-only environment no longer results in a send. Booking/ticket generation does not report WhatsApp as sent when it is unavailable. No alternative provider was added or activated.
- Direct Meta calls in tests use mocked `fetch`; no provider request was made. The existing Meta diagnostic endpoint remains an explicit operator-triggered integration check and was not called during this phase.
- Historical mentions are retained only in `PHASE12_STAGING_ACCEPTANCE.md`, `PHASE13_WHATSAPP_PDF_DELIVERY.md`, and `PHASE14_STAGING_RESULTS.md` as audit history, with superseded/historical notices. Historical event statements in `IMPLEMENTATION_ROADMAP.md`, `MULTI_EVENT_AUDIT.md`, and `PROJECT_AUDIT.md` are likewise labeled as prior-state descriptions.
- `staging/server/.env` was not read or changed because its environment/account is unverified and may contain sensitive or production credentials. Old RichAutomate variables, if present there, are no longer read by application code; the local ignored file must be reviewed and cleaned by its owner after confirming it is not production configuration. Therefore this report does not claim those uninspected local values were removed.

## WhatsApp and remaining limitations

Ticket email and PDF generation continue independently. WhatsApp is **unavailable unless direct Meta Cloud API configuration is explicitly present**. When Meta is unconfigured, missing a required template, or secure PDF upload fails, the delivery result is a failure/unavailable result; it does not fall back to a public legacy ticket download URL or a different provider. Staging must validate Meta account/template behavior and accepted/delivered status before any release.

The public event UI uses event-provided images, but does not execute arbitrary event-supplied CSS branding. Ticket views use a neutral platform theme and event-provided poster/details. Event-specific color palettes remain unsupported until a constrained, validated schema is designed.

## Verification

| Check | Result |
| --- | --- |
| Isolated backend suite (`cd staging/server && npm test`) | PASS — 67 tests, 0 failures. Runner uses its test-only configuration; bootstrap test confirms it does not load `server/.env`. |
| Frontend production build (`cd staging/combined-app && npm run build`) | PASS — Vite build completed; existing warning remains for a JavaScript chunk over 500 kB. |
| TypeScript (`cd staging/combined-app && npx tsc --noEmit`) | PASS — no diagnostics. |
| JavaScript syntax (`node --check` on changed backend and test files) | PASS. |
| Android seller debug build (`seller-native-android/gradlew.bat assembleDebug --offline`) | PASS — compile/package successful; existing Material icon deprecation warnings remain. This is not device acceptance. |
| `git diff --check` | PASS — no whitespace errors. Git emitted only line-ending normalization warnings. |
| Repository search | PASS for active tracked source/config/templates: no RichAutomate integration or environment-template names and no former event names/venue branding in runtime source. Historical documentation references are intentionally retained and listed above. The ignored `.env` was excluded and not inspected. |
| Dependency audit | NOT RUN — dependency manifests/lockfiles did not change, and contacting an external audit service was outside this phase's no-external-service constraint. |
| Staging/provider acceptance | NOT RUN — no verified staging infrastructure/credentials were used or available in this work. |

## Exact changed files

```text
dholida-garba-royale.png (deleted)
docs/PHASE21_HARDCODED_EVENT_AND_RICHAUTOMATE_REMOVAL.md (added)
docs/IMPLEMENTATION_ROADMAP.md
docs/MULTI_EVENT_AUDIT.md
docs/PHASE12_STAGING_ACCEPTANCE.md
docs/PHASE13_STAGING_SETUP.md
docs/PHASE13_WHATSAPP_PDF_DELIVERY.md
docs/PHASE14_STAGING_RESULTS.md
docs/PHASE15_INFRASTRUCTURE_READINESS.md
docs/PROJECT_AUDIT.md
index.html
seller-native-android/app/src/main/java/in/littx/seller/nativeapp/data/SellerApi.kt
seller-native-android/app/src/main/java/in/littx/seller/nativeapp/data/SellerRepository.kt
seller-native-android/app/src/main/java/in/littx/seller/nativeapp/data/model/Models.kt
seller-native-android/app/src/main/java/in/littx/seller/nativeapp/ui/SellerApp.kt
seller-native-android/app/src/main/java/in/littx/seller/nativeapp/ui/SellerViewModel.kt
seller-native-android/app/src/main/res/drawable-nodpi/dholida_seller_banner.png (deleted)
staging/combined-app/src/admin-dash/App.tsx
staging/combined-app/src/admin-dash/DevAdminApp.tsx
staging/combined-app/src/admin-dash/PartnerDashboardApp.tsx
staging/combined-app/src/admin-dash/pages/AdminDashboardPage.tsx
staging/combined-app/src/admin-dash/pages/Analytics.tsx
staging/combined-app/src/admin-dash/pages/Customers.tsx
staging/combined-app/src/admin-dash/pages/Dashboard.tsx
staging/combined-app/src/admin-dash/pages/EmailDelivery.tsx
staging/combined-app/src/admin-dash/pages/Orders.tsx
staging/combined-app/src/admin-dash/pages/PartnerDashboardPage.tsx
staging/combined-app/src/admin-dash/pages/QRScans.tsx
staging/combined-app/src/admin-dash/pages/Refunds.tsx
staging/combined-app/src/admin-dash/pages/Settings.tsx
staging/combined-app/src/admin-dash/pages/Tickets.tsx
staging/combined-app/src/components/CustomerDashboard.tsx
staging/combined-app/src/lib/store.tsx
staging/combined-app/src/pr-portal/PRApp.tsx
staging/combined-app/src/screens/GenerateTicket.tsx
staging/combined-app/src/screens/PublicTicketView.tsx
staging/combined-app/src/screens/ScanRejected.tsx
staging/combined-app/src/screens/ScanSuccess.tsx
staging/combined-app/src/screens/TicketCard.tsx
staging/combined-app/src/seller-portal/SellerPortalApp.tsx
staging/combined-app/src/shadow/ShadowPanelApp.tsx
staging/server/config/seller-mobile.json
staging/server/db.js
staging/server/mailer.js
staging/server/server.js
staging/server/test/event-content.test.js (added)
staging/server/test/isolated-config.test.js
staging/server/test/run-isolated.js
staging/server/test/security.test.js
staging/server/test/whatsapp-service.test.js
staging/server/ticket.js
staging/server/whatsapp-service.js
vercel.json
```

Production remains **NO-GO** pending staging acceptance, including isolated event workflows and direct Meta provider behavior. No migration or production change is required for this cleanup.

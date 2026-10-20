# Phase 22 — Stageway Branding and Dynamic Homepage

## Scope and result

The root homepage now loads its event cards from the existing public event API. The existing layout and non-brand copy were preserved; this phase fixed the broken catalogue script and connected it to the already-defined API. Branding text in existing slots was changed to Stageway. The obsolete static `/littx/` copy now redirects to `/` so old paths no longer show fabricated event listings.

No second event store, API, database model, schema migration, or production configuration was added. No payment, inventory, ticket ID, QR, booking, refund, authorization, or production behavior was changed. Production behavior was not exercised.

## Event publishing to homepage flow

1. Admins create an event through `POST /api/admin/events`; new events start in draft state. The existing event administration UI is in `staging/combined-app/src/admin-dash/pages/Events.tsx`.
2. Organizers can update events within their existing assignment/company authorization. The server rejects unauthorized event changes and organizer publish attempts.
3. An authorized master admin publishes through `POST /api/admin/events/:eventRef/transition` with `status: published`.
4. The root homepage requests same-origin `GET /api/events`, renders the safe public payload into its existing catalogue cards, and links to `/events?event=<slug-or-id>`.
5. The React event marketplace resolves that event and its configured categories through `GET /api/events/:eventRef`. Checkout uses the existing server-side event/category pricing and inventory validation.

`eventIsPublic` and `publicEventPayload` in `staging/server/server.js` enforce public visibility and select public fields server-side. Draft, private, unlisted, cancelled, archived, and inactive events are excluded. Existing legacy event records without a lifecycle status remain public when active, per the established compatibility rule. Public results include configured ticket categories and prices but omit company and organizer assignment data and internal notes.

The existing lifecycle does not support moving a published event back to draft. Authorized master admins can cancel a published event; cancellation removes it from the public list and detail endpoint. That existing behavior is tested. No new unpublish transition was introduced.

The API retains its existing 30-second cache with stale-while-revalidate. The homepage requests without browser caching and refreshes if restored from the back-forward cache; normal homepage navigation performs a fresh request. No polling was added.

## Branding updated

- Root and React page titles/metadata, public marketplace, customer sign-in/register/booking, ticket views, admin, PR, seller, scanner, and event-company surfaces display Stageway.
- Email sender display defaults and generated ticket PDF brand text use Stageway. Existing sender email addresses were retained.
- Android scanner/seller display labels and visible in-app brand text use Stageway. Application/package IDs, signing configuration, WebAuthn RP ID/origins, update User-Agent values, storage keys, and API compatibility identifiers were retained.
- `README.md` and native app READMEs use Stageway in product headings/instructions. Existing hostnames and compatibility URLs remain unchanged.
- `/littx/index.html` remains as a lightweight redirect to `/` for compatibility.

## Names retained intentionally

- `Littx Inc.` is retained as the stated legal entity in the homepage footer.
- `littx.in`, `littx.com`, the legacy Vercel hostname, `littx1` project/path names, database and session identifiers, environment-variable names, API paths, package IDs/namespaces, existing sender email addresses, seeded record/company identifiers, and historical documentation remain compatibility/history references.
- Existing logo and launcher image assets were not redrawn: `logo.png`, the duplicate public logo, the Android `app_logo.png` files, `scanner_logo.png`, and generated splash assets are raster source files whose visual marks cannot be safely rebranded as text. Alt text and surrounding wordmarks now read Stageway where they are used. A proper Stageway logo/icon package is still needed to replace those images cleanly.
- The payment-provider checkout display name remains `LITTX`; it is part of the existing payment checkout configuration and was left unchanged under the Phase 22 restriction against modifying payment integrations.
- Historical phase reports and repository audit history were not rewritten.

## Tests and verification

The isolated backend test runner uses test-only environment values and excludes inherited application credentials/endpoints. The public event test creates a synthetic draft, verifies it is not public, checks organizer authorization, publishes through the authorized route, verifies list/detail output and ticket category pricing, checks private fields are omitted, and cancels the event to verify public removal. Homepage checks compile inline JavaScript and assert API wiring, loading/empty/error handling, detail-link construction, and absence of static demo listings at the legacy path.

Executed local checks:

- `cd staging/server && npm test` — PASS, 70 tests, 0 failures. The isolated runner used its test-only environment and did not load `.env`.
- `cd staging/combined-app && npm run build` — PASS. Vite emitted its existing large-chunk advisory (largest JS bundle about 1.44 MB minified); build completed.
- `cd staging/combined-app && node_modules/.bin/tsc.cmd --noEmit` — PASS.
- `node --check` on `staging/server/server.js`, `mailer.js`, `ticket.js`, and `manual_ticket_sender.js` — PASS.
- The isolated backend suite also compiles homepage inline scripts and checks the API wiring, page states, and legacy redirect — PASS.
- `scanner-native-android/gradlew.bat assembleDebug --offline` — PASS. Existing deprecated Compose icon warnings were reported.
- `seller-native-android/gradlew.bat assembleDebug --offline` — PASS. Existing deprecated Compose icon warnings were reported.
- `git diff --check` — PASS (Git reported expected LF-to-CRLF working-copy notices).

No dependencies changed, so dependency audit was not run. Android builds are compilation evidence only; no device acceptance was performed. The tests and builds are local only; staging acceptance and production behavior remain unverified. Production remains NO-GO until required staging acceptance is complete.

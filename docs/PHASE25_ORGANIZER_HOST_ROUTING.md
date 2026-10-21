# Phase 25 — Organizer Host Routing and Live Event Source

**Status: Code prepared locally; not deployed. Production remains NO-GO pending staging acceptance.** No DNS, hosting settings, production configuration, database records, payment integration, or credentials were changed or accessed.

## Diagnosis

Current repository `HEAD` at inspection: `c2ee881` (`Create PHASE24_COMMIT_AND_SUBDOMAIN_READINESS.md`), with the Phase 23 implementation commit `f6caab1` in its ancestry. This verifies the checked-out repository contains the Phase 23 files. The live deployment's Git revision could not be confirmed: no authorized Vercel deployment metadata was available. The live host serving the public homepage proves that the intended organizer root routing is absent in the response currently being served, but does not identify its source commit.

Read-only public GET observations at **2026-10-21 16:05 UTC**:

- `https://organiser.littx.in/` returned HTTP 200 and the public Stageway homepage title, consistent with the reported wrong panel.
- `https://littx.in/api/events` and `https://organiser.littx.in/api/events` each returned HTTP 200 and two public event rows: `Dholida Garba Royale 2026` (`6a8e09b03c448413e97b8463`) and `Aura Genesis Fest` (`6a8e09b03c448413e97b8466`). Both responses reported `Cache-Control: public, max-age=30` and `x-vercel-cache: MISS` at inspection time.
- The live `organiser` homepage HTML request was not accompanied by Vercel build/deployment metadata. A follow-up request to its organizer path timed out, so no end-to-end browser or live deployment acceptance is claimed.

In the repository, `vercel.json` had path rewrites for `/organizer` and `/organizer/...`, but no rule matching the requested hostname at `/`. The final catch-all sends unmatched requests to `/index.html`; therefore a request to the subdomain root returns the public static homepage. The React app already selects the organizer login/dashboard at `/organizer`; it does not need a new panel implementation.

## Event card source trace

- The root homepage script in `index.html` fetches `/api/events`, displays returned event records, and links to `/events?event=<slug-or-id>`. Its error and empty states do not replace failures with sample events.
- The React marketplace in `staging/combined-app/src/components/EventMarketplace.tsx` fetches `/api/events` or `/api/events/:eventRef`. Its UI has an explicit load-error state and an empty filtered-list state. Checkout submits `eventId: event.id` and `ticketCategoryId: selectedTicket.id`; the server re-resolves the stored event/category and authoritative inventory/price.
- `staging/server/server.js` implements `GET /api/events` by reading `db.getAllEvents()`, filtering with `eventIsPublic` and excluding private/unlisted visibility, then building public payloads. `GET /api/events/:eventRef` applies the same public eligibility checks.
- `staging/server/db.js` reads persisted `Event` records when MongoDB is configured. Its fallback `_mockEvents` map initializes empty and contains no named sample events. Repository search found neither live event name in active source. No record was modified or deleted.
- The public API response and repository code establish that the cards are delivered by the backend API and are not static homepage arrays. The code's configured persistence path is MongoDB, but the live production database itself was not accessed; therefore the underlying live record store was not independently inspected.

## Local code change

`vercel.json` has one exact-host, root-only temporary redirect:

- `organiser.littx.in/` → `/organizer` (HTTP 307 / non-permanent redirect; query strings pass through by Vercel's default behavior).
- `/organizer` and its existing deep-link paths continue to use the SPA rewrite to `app.html`.
- `littx.in/` remains the static public homepage.
- No other panel hostname has a host rule. The similar spelling `organizer.littx.in` is intentionally not matched; the requested host is `organiser.littx.in`.
- Same-origin relative `/api` calls remain unchanged. No cookie domain, session logic, CORS code, CSRF validation, Origin validation, bearer cutoff, or authorization middleware was changed. No organizer data is placed in the public HTML. The organizer dashboard API still requires server authentication and checks explicit event assignments.

The host condition uses Vercel's documented `has` host match feature. Vercel documents that the project owner must add each custom domain to the project and inspect the resulting exact DNS requirements; those external actions are not part of this code change. See [Vercel rewrites and host conditions](https://vercel.com/docs/project-configuration/vercel-json) and [custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain).

## Regression coverage

- `staging/server/test/panel-routing.test.js` checks the exact organizer hostname redirect, verifies the root public page still maps to `index.html`, confirms other proposed/unknown hosts are not redirected, and checks existing organizer direct-entry/deep-link SPA routes plus the frontend authentication gate.
- `staging/server/test/security.test.js` checks anonymous requests to `/api/organizer/overview` receive 401. Existing isolated tests continue to verify assigned-event access and same-company unassigned/cross-company edit denial.
- `staging/server/test/homepage-events.test.js` checks there are no hardcoded named event fallbacks, the homepage and marketplace read the API, failure/empty messaging exists, and checkout binds the selected event/category IDs.
- Existing isolated backend test verifies an empty event store returns an empty catalog rather than a fallback/demo event.

## Verification

- Isolated backend suite (`npm test`, `staging/server`) — **PASS: 79 passed, 0 failed**. The runner removes application environment configuration and supplies test-only values; it does not load `staging/server/.env`.
- Frontend production build (`npm run build`, `staging/combined-app`) — **PASS**. Vite reports the existing ~1.44 MB minified JavaScript chunk advisory.
- TypeScript (`npx tsc --noEmit -p tsconfig.json`, `staging/combined-app`) — **PASS**.
- Syntax (`node --check` on server and all three changed test files) — **PASS**.
- `git diff --check` — **PASS**; Git emitted working-copy LF/CRLF notices only.
- Live public GET checks above are observations, not staging tests. No Vercel config validation through an authorized deployment, browser test, staging acceptance, database access, deployment, DNS change, or production configuration change was performed.

## External setup and acceptance still required

1. The authorized hosting owner must confirm that `organiser.littx.in` is attached to the intended Vercel project. If it is not, add only that approved domain in the project settings. Use the exact project-specific DNS records Vercel displays after inspection; do not copy generic examples. Confirm TLS issuance before HTTPS testing.
2. Provision an isolated staging deployment/database and synthetic assigned/unassigned organizer accounts. Include the exact staging organizer origin in the approved origin allowlist only if required by the current server CORS/CSRF configuration. Never use wildcard credentialed CORS or a broad cookie domain.
3. Test the 307 root redirect, organizer login, unauthenticated API denial, assigned and unassigned event visibility/editing, logout, expiration, cookie flags/CSRF/Origin behavior when cookie mode is enabled in staging, and direct refresh of `/organizer` and a deep path. Confirm `littx.in/` remains the marketplace and every other panel host remains unrouted.
4. Compare the deployed build/revision with the intended source using authorized Vercel deployment metadata. The live `HEAD`/Phase 23 relationship is established locally; the live build commit is not confirmed.

**Release decision: NO-GO.** The repository redirect is ready for the next controlled staging deployment, but it is not live until an authorized deployment occurs. Do not treat the public API observations as proof of staging acceptance or production readiness.

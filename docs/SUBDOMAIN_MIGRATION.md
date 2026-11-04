# Stageway subdomain migration

**Status: NOT IMPLEMENTED — staging and production remain on the existing path-based deployment.** This is an architecture and rollout plan, not DNS, hosting, or production authorization. No hostname or HTTPS endpoint was contacted or verified.

## Repository findings

- The browser app is one Vite/React build in `staging/combined-app`, built into one static output directory. `vercel.json` copies the marketing `index.html` to `/` and rewrites existing panel paths (`/admin`, `/organizer`, `/seller`, `/pr`, `/scanner`, `/bookings`, `/events`) to the shared `app.html`.
- `api/index.js` exports the single Express application from `staging/server/server.js`; the current Vercel rewrite sends `/api/*` to that function. Browser code uses relative `/api/...` requests. There is no separate API base URL setting or per-panel deployment definition in this repository.
- `staging/combined-app/src/App.tsx` selects panels from `window.location.pathname` (and one legacy hostname special case). It is not currently host-routed.
- The admin/organizer/customer/PR/scanner/seller and Shadow authentication flows return bearer credentials to frontend JavaScript. They are stored in `sessionStorage` (some older code migrates/removes `localStorage`) and sent in `x-auth-token`, `x-seller-token`, `Authorization`, or related headers. Current application sessions are server-side records in MongoDB, but no `Set-Cookie` authentication flow, HttpOnly cookie parser, or cookie-based logout exists. CORS is an exact-origin allowlist from `CORS_ORIGINS`/`BASE_URL` and does not enable credentialed requests.
- Since every portal currently calls relative `/api`, a future single-project host rewrite can keep API calls same-origin on each panel hostname. That is preferable to sending host-only cookies to `api.littx.in` or setting a broad `Domain=littx.in` cookie. The optional standalone API hostname is not currently wired as a browser API origin.
- Booking recovery is OTP-based under `/api/customer/bookings/recovery/*`; the booking surface is `/bookings`. The recovery ticket capabilities are short-lived request tokens held by the browser flow, separate from account session tokens. There is no general OAuth callback flow found in the repository. Seller WebAuthn is configured with `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, legacy origin/RP ID variables and an optional Android origin; it needs a deliberate relying-party migration plan.
- `BASE_URL` is used in generated URLs and email paths and currently falls back to localhost. `PUBLIC_TICKET_ORIGIN` defaults to `https://www.littx.in` for WhatsApp booking links. These defaults do not prove the corresponding hostnames are currently configured. `CORS_ORIGINS` is source-derived; no production values were inspected.
- No repository `robots.txt` or sitemap was found in the app's public assets. No canonical host redirect or subdomain sitemap configuration was found. Existing public email/WhatsApp links and older ticket links may already have been distributed, so URL migration must preserve the legacy routes while the new targets are staged.

## Hostname map and route status

All hostnames below are **proposed**. Existing paths are the routes currently implemented; proposed root-host URLs are **pending routing, DNS, TLS and staging verification**.

| Host | Existing application route | Proposed URL | Status |
| --- | --- | --- | --- |
| `littx.in` | `/` (marketing site), `/events`, `/events?event=<slug-or-id>` | `https://littx.in/`, `/events`, `/events?event=<slug-or-id>` | Existing paths implemented; hostname/HTTPS not verified. |
| `admin.littx.in` | `/admin` | `https://admin.littx.in/` | Pending host rewrite and safe cookie auth. |
| `organizer.littx.in` | `/organizer` | `https://organizer.littx.in/` | Pending host rewrite and safe cookie auth. |
| `seller.littx.in` | `/seller` | `https://seller.littx.in/` | Pending host rewrite and safe cookie auth/WebAuthn review. |
| `pr.littx.in` | `/pr` | `https://pr.littx.in/` | Pending host rewrite and safe cookie auth. |
| `scan.littx.in` | `/scanner` | `https://scan.littx.in/` | Pending host rewrite and safe cookie auth. |
| `my.littx.in` | `/bookings` | `https://my.littx.in/` | Pending host rewrite, recovery/email link updates and flow tests. |
| `api.littx.in` | `/api/*` on the current app host | `https://api.littx.in/api/*` | Not configured. Keep browser calls same-origin through each panel's `/api` rewrite unless a separate API/CORS/cookie design is approved and tested. |

The UI uses one public detail route with a query parameter; it does not implement `/events/:slug` as a selected detail page. API routes remain `/api/...` and are not standalone frontend panels.

## Safe implementation decision

Vercel's current `vercel.json` schema supports host conditions (`has: [{"type":"host", ...}]`) on rewrite rules. This makes root-to-existing-panel-path rewrites feasible within a single Vercel project, while preserving the root marketing page and the current `/api/*` function rewrite. See [Vercel static project configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Vercel domain setup](https://vercel.com/docs/domains/set-up-custom-domain).

The host rewrite is **not added yet**. Activating the new panel hosts before changing the credential model would continue to expose session bearer tokens to page JavaScript, contrary to this migration's security requirement. The UI and backend currently depend on those tokens; changing only the login response or adding CORS would break authenticated API calls. Do not solve this by sharing a cookie across all subdomains.

Recommended sequence:

1. **Auth foundation in isolated staging:** add server-managed, opaque session cookies with `HttpOnly`, `Secure` in HTTPS environments, `Path=/`, an intentionally chosen `SameSite` setting, and no `Domain` attribute. Bind each session to its role and server-side session record. Add CSRF/Origin protections for state-changing requests; sibling subdomains are same-site, so `SameSite` alone is not a complete CSRF boundary. Keep secrets/tokens out of JavaScript and logs. Maintain the current path-based bearer flow only as a controlled compatibility phase if a reviewed transition permits it; do not echo a new-host cookie session token in JSON.
2. **Same-host API calls:** each portal hostname should serve the same SPA and its `/api/*` requests through the same host/rewrite to the existing Express function. This keeps cookies host-only per panel and avoids a broad parent-domain cookie. Avoid a separate `api.littx.in` browser origin unless a later design explicitly handles credentialed CORS, CSRF and cookie scope.
3. **Host routing:** after the auth work passes staging tests, add exact host-conditioned `/` rewrites to the existing paths (`/admin`, `/organizer`, `/seller`, `/pr`, `/scanner`, `/bookings`). Keep `/api/*` routing ahead of the general site fallback, preserve root `/` as the marketing website, and retain existing path routes as temporary backward-compatible aliases. Do not use user-controlled query/redirect values to choose a destination.
4. **Host-aware origins and links:** update the controlled staging environment first. `BASE_URL` must be set to an approved canonical public origin for links generated by the backend; `PUBLIC_TICKET_ORIGIN` should point to the chosen customer booking/recovery host (`https://my.littx.in`) only after verified and staged. Update email template links and frontend navigation to canonical public or panel hosts as appropriate, with a fixed allowlist. Continue serving historical ticket routes on the established compatibility host during the approved migration period.
5. **WebAuthn:** decide whether seller passkeys should remain tied to the existing relying-party ID and be re-enrolled at `seller.littx.in`, or use a parent RP ID after a security review. A parent `littx.in` RP ID makes credentials potentially usable across eligible subdomains and is not the default recommendation. Preserve the old origin/RP path during staging; do not change production relying-party values before compatibility testing.
6. **SEO:** choose one canonical public hostname (`https://littx.in` is the proposed root). Add/verify a sitemap and robots policy for public routes only; do not index admin, organizer, seller, PR, scanner, customer recovery, or API hosts. Redirect `www` only after DNS, certificate and legacy-link checks, and never redirect authenticated panel hosts to a user-supplied destination.

## DNS, TLS and hosting checklist

These are operator steps; this repository does not control DNS, domain bindings, certificates, or hosting project settings.

1. Confirm domain ownership and the actual hosting account/project with the platform owner. Decide whether a single Vercel project with exact host-conditioned rewrites is acceptable, or whether platform policy requires separate projects. Do not create a second production deployment as a workaround without a reviewed release plan.
2. Add the apex `littx.in` and each selected subdomain in the hosting provider's domain settings. Use only the exact A/ALIAS/CNAME/TXT values the provider displays for that project. No IP address or CNAME target is prescribed by this document.
3. Add DNS records for `admin`, `organizer`, `seller`, `pr`, `scan`, `my`, and optionally `api` according to the provider's domain verification instructions. Confirm there are no conflicting old records before changing them. Do not change live DNS as part of this task.
4. Verify ownership TXT challenges, DNS resolution, provider project binding, and TLS certificate issuance independently for every host. Confirm HTTP-to-HTTPS behavior and that no host resolves to an unrelated project. DNS/TLS were not queried and are **unverified**.
5. In a staging deployment, verify the host rewrites, asset paths, static fallbacks, `/api/*`, query-string preservation and host-only cookie behavior on every host. Confirm the root site still serves the marketing page and panels do not accidentally render there.
6. If the selected platform cannot route domains to the same project, create separate staging projects from the same repository and configure their project root/build/output and API proxy explicitly. Ensure each panel build still routes its `/api` requests to the same staging backend and staging database. Production multi-project separation requires a new release plan.

## Environment and auth configuration checklist

Names are source-derived; this document contains no secret values. Configure staging first and never copy production credentials into staging.

- `BASE_URL`: current backend absolute-link base; must not remain its localhost fallback in a deployed environment.
- `PUBLIC_TICKET_ORIGIN`: customer booking/recovery origin used by WhatsApp flows; proposed staging equivalent should be a staging host, and production target should only change after link acceptance.
- `CORS_ORIGINS`: exact origins only if browser requests are cross-origin. With same-host `/api` rewrites, avoid adding origins simply for the sake of subdomains. Current CORS middleware does not enable credentialed cookies.
- `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_LEGACY_ORIGIN`, `WEBAUTHN_LEGACY_RP_ID`, `WEBAUTHN_ANDROID_ORIGIN`: seller WebAuthn RP/origin controls; owner review and staging passkey re-registration/compatibility are required.
- Existing role credentials/session configuration remains server-side. The frontend currently consumes sessions from server-issued JSON tokens; new hosts cannot meet the stated HttpOnly requirement until that contract is replaced and all middleware/logout paths accept and revoke cookie sessions.
- Do not add payment environment variables or change payment integration for this routing task. Do not include any environment values in check output.

## Validation checklist

After an explicitly authorized staging environment is provisioned:

- Confirm exact DNS/project ownership and TLS for every hostname, including no redirect to production.
- Test root marketing site and public marketplace list/detail on `littx.in`; verify a detail query string survives rewrites.
- Test each panel root, direct refresh/deep link, assets, logout and role boundary. Verify every panel session uses an opaque host-only HttpOnly cookie; inspect browser storage to confirm no bearer token is accessible to JavaScript. Confirm one panel's session does not authenticate another panel.
- Verify CSRF/Origin protection, cookie `Secure`/`SameSite`/`Path`, session expiry/revocation, rate limits, and server logs with tokens redacted.
- Test `/api/*` through each panel origin, exact CORS behavior for any cross-origin calls, and denial from unapproved origins.
- Test OTP recovery, email links, ticket downloads, customer booking history, WhatsApp PDF flow, legacy ticket links, seller WebAuthn/passkeys, scanner entry, and all existing role boundaries with synthetic data/test recipients. Preserve ticket IDs, QR identity, admissions, pricing and shared-inventory behavior.
- Confirm old path URLs remain available during the approved compatibility window and return to the right panel without loops. Test `BASE_URL`, customer links, email links and WhatsApp links against staging hosts only.
- Review robots/sitemap/canonical output to ensure only public pages are indexable; verify panels, recovery and API paths are excluded.
- Capture redacted request/response statuses, host/project labels, runtime/code revision, cookie attributes (never cookie values), delivery status and controlled-client outcomes. Do not claim success from DNS records or HTTP 200 alone.

## Rollback plan

Before any production rollout, record existing DNS values, domain bindings, Vercel project configuration and environment variable **names** (not values). Rollback requires operator approval and a tested route to restore the old path-based hosting configuration. If a host/cookie/panel test fails, remove or disable only the newly introduced staging host route/domain binding, restore the previous staging rewrite set, and preserve all database records and sessions according to the session-revocation plan. Do not delete or alter tickets, QR identities, inventory, payment state, refund decisions, production DNS, or production credentials during rollback. Keep legacy URLs active until a separately approved customer transition is complete.

## Current outcome

- Existing path routes and the single Vercel SPA/API deployment are confirmed by repository source.
- Conditional host rewrites are supported by Vercel configuration documentation, but are not configured in this checkout.
- None of the proposed subdomain DNS records, project bindings, TLS certificates, staging cookie behavior, callback origins or API reachability were tested. There is no repository OAuth callback to migrate; seller WebAuthn is the relevant origin-bound credential flow.
- No code or hosting route was changed because adding panel aliases while preserving browser-readable session bearer tokens would violate the stated authentication requirement. The next implementation gate is an isolated staging HttpOnly-cookie/CSRF session migration followed by host-specific rewrites and end-to-end tests.
- **Production remains NO-GO** until all hosts are provisioned and verified in staging, the auth migration passes, existing links and passkeys are covered, and the release owner approves the transition.

## Phase 16 authentication audit and original migration contract (historical)

**At Phase 16 close:** AUDITED; cookie authentication was not implemented. The Phase 17 status below supersedes that implementation status. Phase 16 selected a bounded 12-hour compatibility overlap; it did not authorize deployment or production changes.

### Existing authentication flows confirmed in source

| Flow | Backend | Current browser credential behavior | Migration constraint |
|---|---|---|---|
| Admin / dashboard login | `POST /api/portal-auth/login`; persisted `UserSession` keyed by user ID; role is `master_admin` or `company_admin` | `components/LoginPage.tsx` stores `littx_token` and `littx_user` in `sessionStorage`; admin views also use legacy `ft_admin_key` | `requireAdmin`, `requireMasterAdmin`, event and approval guards accept `x-auth-token`; legacy `ADMIN_KEY`/`x-admin-key` bypasses persisted-session authentication on selected routes and must be retired separately from browser code. |
| Organizer / PR / platform seller login | `POST /api/auth/login`; persisted `UserSession`, except legacy sellers use `SellerSession` | `LoginPage.tsx`, `PublicSignInModal.tsx` store `littx_token`/`littx_user`; PR portal also stores its token in `sessionStorage` under `pr_token` | Preserve server-side role checks, organizer assignment checks, PR company scoping, and seller-specific endpoint guards. One `UserSession` record per user means a replacement login overwrites that user's prior session. |
| Logout | `POST /api/auth/logout` deletes the matching `UserSession` by bearer token | Admin settings clear `littx_token` and user cache; not every role has a common logout path | Cookie logout must revoke only the matching active server session and clear the cookie with matching attributes. Seller/scanner/Shadow revocation paths must be covered independently. |
| Seller passkey | `POST /api/seller/login-step1` then `POST /api/seller/login-step2`; WebAuthn challenge and persisted seller session | `seller-portal/SellerPortalApp.tsx` stores `littx_seller_token` in `sessionStorage`; legacy `littix/App.tsx` also has a seller login path | Keep challenge/origin/RP checks and persisted revocation. Do not change WebAuthn origins, RP IDs, or credential enrollment as part of cookie work. |
| Scanner | `POST /api/scanner-login` and `POST /api/scanner-app-session`; signed, 12-hour scanner token | `littx_scanner_token` in `sessionStorage`; sent as `Authorization: Bearer` | Preserve event/company assignments, expiry, scanner app compatibility, and separate scanner role boundary. |
| Shadow panels | `POST /api/shadow/login` and `/api/shadow-private/login`; persisted `UserSession` records with distinct roles | `ShadowPanelApp.tsx` uses `littx_shadow_token` and `littx_shadow_private_token` session keys | Keep the two roles and source-specific data/mutation checks separate. |
| Customer booking recovery | `/api/customer/bookings/recovery/request`, `/verify`, and purpose-specific ticket view/download/resend routes | OTP challenge and ticket capabilities are held in component state and sent as bearer capabilities | These are not account sessions. Preserve their existing purpose, ticket/recipient binding, expiry, and 15-minute retrieval behavior; do not translate them into general session cookies. |
| Customer account UI | `CustomerLogin.tsx` and `CustomerRegister.tsx` call `/api/customer/login` and `/api/customer/register` and cache `littx_customer_token` | Session storage | The authorization matrix/source audit found no corresponding backend customer login/register/session routes. Treat the UI flow as disconnected; do not make it appear authenticated by cookie changes. |
| Admin access-key and reveal capabilities | `x-admin-key` (`ADMIN_KEY`), `PRESENTATION_KEY`, and the scoped Solver reveal token are separate credentials | `ft_admin_key` in `sessionStorage`; Solver reveal credential in component/browser memory | These are not `UserSession` tokens. Never convert them into a broad shared session cookie. Remove browser access-key use only with a compatible server-session login path and route coverage. |

Token consumers are distributed through the shared app: `src/lib/store.tsx`, admin dashboard pages, `screens/GenerateTicket.tsx`, seller and PR portals, scanner UI, Shadow panels, and legacy `src/littix/App.tsx`. A source scan found 119 frontend `fetch` call sites and 65 references to the identified session-storage keys. These counts include unrelated fetches/reads and are a migration-size indicator, not a count of authenticated endpoints. The build should use a shared API request helper rather than ad hoc cookie/CSRF handling at individual screens.

### Required cookie and CSRF design before host routing

- Use opaque, server-validated session cookies with no `Domain` attribute. Keep browser sessions host-only; do not share a parent-domain cookie across panels. Prefer `__Host-` cookies (`Secure`, `Path=/`) on HTTPS; use `HttpOnly`, `SameSite=Lax`, and a lifetime no longer than the server-side session expiry. Secure-cookie behavior must be verified on the actual HTTPS staging hosts.
- Keep role authorization in the existing server-side session records and guards. Cookie extraction must be explicit per session family, then pass through the same role, tenant, event-assignment, account-state, expiry, and revocation checks as header sessions. A cookie must never grant a role based on hostname alone.
- For cookie-authenticated state-changing requests, require an exact trusted `Origin` and a matching CSRF request token using a host-only, Secure, JavaScript-readable CSRF cookie plus a custom request header. SameSite does not protect against every sibling-subdomain request. Reject a missing/invalid Origin or token. Login endpoints also need Origin checks and session-token rotation after successful credential verification to prevent fixation.
- Keep credentialed CORS disabled while every panel calls same-origin `/api`. If a separately hosted API is introduced later, allow only exact configured origins and verify credentialed preflight/CSRF behavior in staging; never combine wildcard origins with credentials.
- Refactor the frontend to a shared API client that sends cookies, attaches CSRF tokens on writes, and no longer reads or transmits session bearer tokens. Remove session-token cache keys only after cookie login, refresh/verification, logout, role changes, expiry and failure recovery work for every panel. Keep non-auth data such as cached role display metadata separate from credentials and never trust it for authorization.
- Audit scanner stateless tokens and legacy `ADMIN_KEY`/presentation access independently. They cannot be silently treated as ordinary user-session cookies. Decide per client whether to migrate to persisted host-only sessions or keep an explicitly constrained non-browser/native credential path.
- Do not change OTP booking recovery capabilities, ticket access scopes, ticket IDs, QR identities, seller WebAuthn RP configuration, payment behavior, or data models as part of this auth migration unless a separate review authorizes it.

### Compatibility and rollout gates

1. Implement cookie auth behind an explicit non-production/staging mode first, with login/session verification/logout and CSRF tests for each session family. Keep the legacy header path available during the accepted 12-hour overlap and preserve existing active server-side records.
2. Roll out one staging panel at a time on the existing path deployment. Verify cookie attributes without exposing cookie values; confirm no token remains in `localStorage`, `sessionStorage`, React state, URLs, logs, or JSON login responses for cookie-mode clients.
3. Verify old bearer sessions continue to work during the overlap and expire under the existing 12-hour server policy. Do not rotate/delete all sessions at rollout. The later bearer cutoff requires staging evidence and an explicit release gate; do not perform it from this phase.
4. Once all panel, native scanner, seller WebAuthn, logout, OTP-recovery and role-boundary checks pass, the host-routing phase may add host rewrites and keep existing path routes as compatibility aliases. No DNS, production host routing, migration, deployment, or production configuration change is included here.

### Remaining Phase 16 blockers

- Cookie authentication and CSRF protection are not implemented, and automated cookie/CSRF/expiry/privilege/WebAuthn compatibility tests have not been added or run.
- The browser still has many scattered header-building and session-storage call sites, plus an admin-key path. A coordinated API-client and login-flow migration is required before the server can stop returning browser-readable tokens.
- The current `UserSession` and `SellerSession` models enforce one session record per user/seller. Confirm that retaining this single-active-session behavior is acceptable during host migration; independent host-only cookies do not imply simultaneous cross-panel sessions.
- The customer account login UI has no matching backend auth routes in the inspected source. OTP booking recovery remains the supported customer ticket-history access path.
- Cross-origin API hosting, staging DNS/TLS, staging database/provider accounts, and production cookie settings remain unverified. Do not claim production readiness based on local checks.

## Phase 17 coordinated authentication migration

**Status:** Cookie-session foundation and browser request integration are implemented locally behind opt-in configuration. Backend automated tests pass locally. Staging integration, HTTPS cookie behavior on actual hosts, native WebAuthn hardware, and production readiness are not verified. Cookie mode defaults off; DNS, host routing, deployment, and production configuration were not changed.

### Implemented behavior

- Browser login routes (`/api/portal-auth/login`, `/api/auth/login`, WebAuthn `/api/seller/login-step2`, `/api/shadow/login`, `/api/shadow-private/login`, and `/api/scanner-login`) issue opaque server-validated, `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only cookies when `SESSION_COOKIE_AUTH_ENABLED=true` and the exact request Origin is in `CORS_ORIGINS` or `BASE_URL`. HTTPS/production cookies are Secure and use `__Host-` names when `NODE_ENV=production`; no cookie `Domain` is set. Login JSON contains a fixed non-secret marker instead of the session secret.
- The frontend installs one same-origin fetch wrapper. It sends same-origin cookies and copies the readable CSRF token into `X-CSRF-Token` for state-changing API requests. The marker may remain in old component/session-storage fields for compatibility; it is not an authentication secret. Session bearer values are not returned by cookie-mode browser login responses.
- Cookie-backed writes require an exact trusted Origin and double-submit CSRF match. The backend rejects missing/expired cookie sessions, invalid CSRF, disallowed Origins at login, and conflicting same-family cookie/bearer values. Existing role and event/company checks still validate the server-side session. OTP booking and ticket-capability bearer tokens remain unchanged and scoped.
- Browser sessions are role-family-specific and host-only: user/admin/organizer/PR, seller, browser scanner, Shadow, and private Shadow. The cookie is a reference to the existing server-side session, not a role claim. User and seller records retain the existing one-active-session-per-user/seller constraint; a successful subsequent login rotates the token by replacing the record. That means a login for the same account/seller on another device or client revokes the earlier session. The shared portal-admin key maps to the fixed `portal-admin-key` session identity, so those logins replace one another; dashboard-key and per-account sessions use their own identities. Account suspension and seller credential/passkey revocation behavior remain in force; organizer event assignments are checked by API authorization on each request.
- Logout is server-revocable for user, seller, Shadow, private Shadow, and scanner sessions. Browser admin, seller, and scanner panels now expose sign-out actions; PR and organizer logout call the server revocation route. Native scanner and seller clients continue to send bearer tokens, identify the client explicitly, and store credentials in their existing native secure stores. Native scanner sessions are opaque persisted records with an explicit expiry no later than 12 hours and a logout endpoint. Scanner requests still require server confirmation; offline scans are not supported. Per the accepted decision, a cached scanner session must stop being used at its 12-hour expiry.
- `x-admin-key` and the read-only presentation key remain distinct legacy credentials during the bounded overlap. At the bearer cutoff, static admin-key access is rejected by middleware; users must use the appropriate persisted browser login. The existing presentation scope is also cutoff with the legacy static credential path. No route receives broader privileges from a cookie.
- Seller WebAuthn challenge/proof verification and native seller WebAuthn requests are retained. The native client labels its requests and is excluded from the browser-login Origin rule only on its two WebAuthn login endpoints; authorization still depends on the verified WebAuthn assertion and the resulting persisted seller session.

### Compatibility window and cutoff

1. For a staging rollout only, the overlap begins when the cookie-mode build is activated with `SESSION_COOKIE_AUTH_ENABLED=true`, `SESSION_BEARER_CUTOFF_ENFORCED=true`, and a valid `SESSION_BEARER_CUTOFF_AT` timestamp (set to 12 hours after activation, preferably in UTC). The explicit enforcement latch is independent of the cookie-mode feature flag and must remain `true` through any rollback after rollout activation. Cookie mode without the latch fails closed. Missing or invalid cutoff with an active latch fails closed for panel credentials; an elapsed cutoff keeps valid cookie login available while legacy bearer/static-key access is rejected.
2. Set the cutoff to exactly 12 hours after staging activation. Existing bearer credentials and static admin keys continue under their current role/expiry rules until then. Existing records are not mass-deleted. A browser that still has a valid legacy bearer can continue during the overlap; it must reauthenticate to receive a cookie session. Cookie-mode login does not return the bearer secret.
3. At/after the cutoff, legacy browser bearer headers and static `ADMIN_KEY`/presentation-key headers are rejected. Native scanner/seller records are allowed only when the request uses the explicit native client identifier and the matching session record is `clientKind=native`; those records still expire after their 12-hour session lifetime and can be revoked by logout/admin action. Old stateless scanner JWTs are not native persisted records and stop at cutoff. A request carrying conflicting cookie and bearer credentials is rejected; the cookie never wins silently.
4. Logout revokes the matching server record and clears only that role-family cookie. During the overlap a legacy bearer session remains valid if a different unrelated client still possesses it; revoke that credential administratively or wait for its existing expiry. User/seller single-active-session behavior still means login can replace the prior server-side session.
5. A rollback before cutoff may disable the cookie feature flag, but existing clients holding the fixed marker must sign in again because the old client/server does not understand it. Preserve session records and retain both the active enforcement latch and valid cutoff during rollback. After cutoff, restore a cookie-compatible release with latch retained. If that release cannot be restored, pause protected panel access and obtain an approved recovery plan rather than re-enabling legacy credentials. Phase 20 implements this guard locally; the behavior remains unverified in staging.

Keep `SESSION_BEARER_CUTOFF_ENFORCED=true` and `SESSION_BEARER_CUTOFF_AT` configured after rollout activation, including rollback. The application defaults an absent latch to pre-rollout mode, so removing the latch after activation cannot be detected from process configuration alone. Deployment review must retain the latch; with it active, a missing/invalid timestamp fails closed for panel credentials. A future cutoff without the latch does not activate the rollout.

### Authentication boundary inventory

| Client/credential | Mechanism after this change | Routes and limits |
|---|---|---|
| Browser admin/dashboard, organizer, PR | Host-only user cookie + CSRF; same existing persisted `UserSession` and role guards | Portal and auth login routes, then existing protected APIs. Static admin key works only before cutoff. No cross-subdomain cookie sharing. |
| Browser seller | Host-only seller cookie + CSRF; existing `SellerSession`, WebAuthn authentication | Login step 1 now checks Origin; login step 2 issues the browser cookie. Seller routes still require seller session/company checks. |
| Browser scanner | Host-only scanner cookie + CSRF; persisted scanner `UserSession` with event/company assignments | `/api/scanner-login`, `/api/scanner-session`, scan/stats APIs; bounded 12h. |
| Native scanner | Opaque bearer tied to persisted scanner session; explicit client header; native secure storage and logout/revocation | `/api/scanner-app-session`, `/api/scanner-session`, `/api/scan-ticket`, `/api/scan-stats`, `/api/scanner-logout`; every scan is online/server-authorized. |
| Native seller | WebAuthn-authenticated bearer tied to persisted seller session; explicit client header and native secure storage | Existing seller app APIs and `/api/seller/logout`; 12h expiry/revocation. |
| Shadow/private Shadow | Separate host-only cookies and role sessions + CSRF; separate logout routes | Existing role-specific API prefix and source checks. |
| OTP booking recovery / ticket access | Existing short-lived purpose/ticket/recipient scoped bearer capabilities | Customer recovery and ticket view/download/resend routes; not affected by session cookie middleware. |
| Legacy admin and presentation keys | Existing static key validation during configured 12-hour overlap; rejected after cutoff | `x-admin-key` routes retain their existing server guards during overlap; presentation remains read-only and sanitized. No cookie upgrade for a static key alone. |
| Customer account token UI | No matching backend session route was found in the prior source audit | Remains disconnected; OTP booking recovery remains the supported ticket-history flow. |

### Local verification and remaining blockers

- Backend automated suite: 60 passed locally, including cookie session rotation, expiry, CSRF rejection/acceptance, logout revocation, host-only production cookie attributes, conflicting credentials, cutoff and rollback behavior, native scanner compatibility, existing role/tenant checks, and existing OTP capability tests. These use isolated mock storage, test-only values, and no provider or customer data.
- The native scanner and seller Android source were updated for explicit client identification and revocable session logout. Both `testDebugUnitTest` tasks compile successfully but report `NO-SOURCE`; no native unit tests exist. The all-variants seller test task is blocked by the repository's guard against unsigned release output. WebAuthn proof verification has no new end-to-end Android hardware test.
- Frontend production build and `tsc --noEmit` both pass locally; Vite reports a >500 kB JavaScript chunk advisory. Both Android `testDebugUnitTest` tasks compile successfully but contain no tests (`NO-SOURCE`); the seller all-variants test task is blocked by the repository's guard against unsigned release output. Staging is still required to prove secure cookie delivery, CSRF, session continuity, cutoff, role authorization, and real Android API compatibility.
- Existing MongoDB session collection fields are additive (`clientKind`, scanner `expiresAt`, `eventNames`); no production migration was run. Staging must verify the deployed schema behavior, indexes, revocation propagation across application instances, expiry, and single-active-session writes.
- No cross-origin credentialed API is enabled. Current browser clients use same-origin `/api`; do not route a panel to `api.littx.in` until an exact-origin credentialed CORS and cookie arrangement is designed and verified.
- Production remains **NO-GO** pending isolated staging acceptance, review of the legacy static-admin-key cutoff and operator recovery plan, native WebAuthn/scanner staging checks, and explicit release approval.

## Phase 18 authentication security verification and staging acceptance

### Configuration prerequisites (names only)

Cookie mode remains disabled unless `SESSION_COOKIE_AUTH_ENABLED=true`. A controlled rollout also requires `SESSION_BEARER_CUTOFF_ENFORCED=true` and a complete ISO-8601 `SESSION_BEARER_CUTOFF_AT` timestamp with timezone, set 12 hours after staging activation. The latch is independent of cookie mode and must remain true through rollback; missing or malformed cutoff with the latch active fails closed for panel credentials. Cookie mode without the latch fails closed. An absent or false latch means rollout has not been activated, so a timestamp alone does not infer rollout state. This guard is implemented locally but has not been verified in staging. Do not copy production values into staging.

The server derives the allowed browser origins from exact entries in `CORS_ORIGINS` and `BASE_URL`. Set staging-only origins and a staging-only base URL. `NODE_ENV=production` controls production cookie names/attributes and should only be used where the staging HTTPS deployment intentionally mirrors production behavior. Cookie helpers never set `Domain`; planned panel subdomains therefore get separate host-only cookies. Do not set `.littx.in` as a cookie domain. Keep the API same-origin through the staging reverse proxy; this release does not support credentialed cross-origin API calls.

### Staging acceptance procedure

Use a disposable staging deployment and a dedicated staging MongoDB database shared by two or more application instances. Provision staging-only email, WebAuthn, and scanner configuration only where a test needs them. Create synthetic accounts with distinct roles: master admin, company admin, organizer assigned to one event, organizer not assigned to that event, PR, seller with a staging passkey, scanner assigned to one event, and scanner assigned elsewhere. Use synthetic events/tickets and a controlled test email address. Never use production credentials, customer records, or real ticket data. Cookie mode and the cutoff remain staging settings; do not activate the cutoff against real users.

Run the backend suite from `staging/server` with `npm test`; run frontend production build and `npx tsc --noEmit` from `staging/combined-app`; run JavaScript syntax checks on the changed server modules. The local tests use the isolated mock database and are simulated coverage only. For actual staging acceptance, repeat the critical flows over HTTPS in a browser and against each deployed application instance:

1. Confirm each panel issues an opaque host-only session cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`; confirm no `Domain` attribute, no session secret in JSON/browser storage, and no session cookie accepted by another panel hostname.
2. Confirm browser login rejects missing and untrusted Origin. On cookie-authenticated writes, verify missing Origin, untrusted Origin, missing CSRF, and incorrect CSRF each fail with 403; a trusted Origin and matching CSRF header succeeds.
3. Verify cookie/bearer conflicts fail closed. Verify normal bearer and static admin-key requests work only before the configured 12-hour cutoff and are rejected after it. Test missing, invalid, and timezone-ambiguous cutoff configuration in a nonproduction deployment and confirm the service reports a safe failure without exposing credentials.
4. Log in on instance A, revoke/logout there, then use the same cookie on instance B. The second instance must reject it promptly using the shared database. Repeat with session expiry and account/role revocation. This cross-instance check is not covered by a single-process mock suite.
5. Verify assigned and unassigned organizer/scanner event access, company boundaries, seller WebAuthn proof, seller session replacement, native scanner/seller login and logout, and scanner's hard 12-hour expiry using authorized staging devices. Confirm a native session cannot authorize browser requests and a browser session cannot authorize native-only behavior.
6. Exercise OTP booking recovery and ticket capabilities independently. Confirm a panel cookie cannot substitute for OTP, cannot change capability scope, and cannot access a different ticket/recipient. Preserve ticket IDs, QR identities, group admission quantities, and existing ticket behavior.

Expected outcomes are the status and role/scope behavior above, with the database session record deleted/replaced/expired as expected. Do not count a successful HTTP response alone as evidence of delivery or authorization. Retain a redacted test record containing staging host/project and code revision, UTC timestamp, runtime version, test identity role (not password/email), request route/method and status, instance label, cookie attribute names only, sanitized session-record state (never token/hash), CSRF/Origin pass/fail results, cutoff configuration presence/format status, and the second-instance revocation result. Redact cookies, bearer values, CSRF values, OTPs, passkey payloads, customer PII, and full query strings.

### Rollback and remaining blockers

Before cutoff, a staging rollback may restore the prior compatible application while preserving database session records; marker-based clients may need to sign in again. The cutoff still applies if cookie mode is rolled back, as long as the latch remains true. At or after cutoff, do not remove the latch or cutoff to restore bearer/static-key access. Restore a cookie-compatible release with the latch retained, or pause protected panel access and follow an approved recovery plan. Do not alter production settings, sessions, or data during a staging rollback.

Local automated tests simulate server-side flows with mock storage; they do not establish real HTTPS cookie behavior, MongoDB TTL/index correctness, cross-instance revocation, native-device secure storage, actual WebAuthn/passkey behavior, or deployed origin configuration. These remain staging blockers. A multi-instance test against shared isolated staging MongoDB is mandatory before release. Subdomain cookies remain host-only with no parent domain; no documented requirement supports widening their scope. No staging infrastructure was accessed for this phase, so staging acceptance is **BLOCKED** and production remains **NO-GO**.

Phase 18 local verification: `npm test` in `staging/server` passed **61/61**; the suite uses isolated mock storage and test-only fixtures. `npm run build` and `npx tsc --noEmit` in `staging/combined-app` passed; Vite reports a JavaScript bundle-size advisory. `node --check` passed for `server.js`, `session-cookie-auth.js`, and `db.js`. `assembleDebug` passed for both scanner and seller Android projects; these are compile/package checks, not device or WebAuthn acceptance. `git diff --check` passed with only Git line-ending conversion warnings. No dependency manifest changed, so no dependency audit was repeated. These results are local only and do not change the staging or production release decision.

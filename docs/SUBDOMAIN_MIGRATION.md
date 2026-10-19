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

# Phase 26 — Organizer Redirect Diagnosis and Fix

**Status: Phase 25 redirect is committed in current `HEAD`; Phase 26 makes query preservation explicit in the working tree. Production remains NO-GO.** No deployment, DNS change, Vercel setting, production database, credential, or payment configuration was changed.

## Proven root cause

At inspection, local `HEAD` was `3828516` (`phasse24`) and the working tree was clean. Phase 25's host redirect is in `3828516`. The reported production deployment is `c2ee881`, which is its parent and does **not** contain the Phase 25 redirect: `git show c2ee881:vercel.json` has no `redirects` property. The only Vercel config change from `c2ee881` to local `HEAD` is the 13-line host redirect in `vercel.json`.

The rule in `3828516` is valid Vercel configuration: `redirects[].has` supports `type: "host"`, and `permanent: false` means a temporary 307. Vercel processes redirects before rewrites. Therefore this production symptom is explained by the deployed commit being behind the commit containing the redirect, rather than an unsupported host-matcher syntax or a rewrite taking precedence. The exact production project Root Directory / dashboard-level redirect settings were not available from this repository and were not inspected.

## Read-only HTTP reproduction

Requests used `curl.exe` GET with redirect following disabled, so `Location` reflects the first response. Timestamp: **2026-10-21 16:09 UTC**.

| URL | Result | Meaning |
| --- | --- | --- |
| `https://organiser.littx.in/` | `200 OK`; no `Location`; Vercel cache `HIT` | Current live root still serves a page instead of redirecting. |
| `https://organiser.littx.in/organizer` | `200 OK`; no `Location` | Existing organizer path is reachable at HTTP level. This is not a browser/authentication acceptance test. |
| `https://littx.in/` | `308 Permanent Redirect`; `Location: https://www.littx.in/` | Apex canonicalizes to `www`. |
| `https://www.littx.in/` | `200 OK` | Public canonical site remains reachable. |
| `https://organiser.littx.in/?phase26_probe=preserve` | `200 OK`; no `Location` | Query probe confirms the live deployment is not applying the root redirect. No query value was sensitive. |

Each response included a Vercel request ID; values are intentionally omitted. No API/customer data was fetched for this Phase 26 check.

## Change

The host redirect already exists in current `HEAD` from Phase 25; Phase 26 explicitly sets query preservation and adds regression coverage:

- Exact host `organiser.littx.in`, root path only → `/organizer`.
- Temporary redirect (`permanent: false`, Vercel 307) avoids a browser-cached permanent decision during rollout.
- Query parameters are explicitly preserved with `preserveQueryParams: true`.
- Direct `/organizer` and `/organizer/...` paths continue to use existing SPA rewrites, avoiding a root redirect loop and preserving deep-link refresh.
- `littx.in` is not matched by this rule; its existing apex-to-`www` behavior and public homepage remain unchanged. No other panel hostname is enabled.
- No React, API, session, cookie, CSRF, Origin, bearer cutoff, organizer authorization, event, payment, or database behavior was changed.

Vercel's documentation confirms host matching for rewrites/redirects and the query-preservation setting: [Vercel `vercel.json` configuration](https://vercel.com/docs/project-configuration/vercel-json), [query parameters in redirects](https://vercel.com/kb/guide/how-do-i-perform-vercel-redirects-based-on-query-strings).

## Regression tests

`staging/server/test/panel-routing.test.js` verifies:

- Exact `organiser.littx.in` host matches; `littx.in`, `organizer.littx.in`, other panel hosts, and an unknown host do not.
- Root redirects to `/organizer`; direct `/organizer` does not redirect again.
- Query string preservation is enabled and modeled with encoded parameters.
- The public root still resolves to `index.html` and organizer path/deep-link requests resolve to `app.html`.
- The existing React organizer route gates the dashboard UI on the expected organizer session role/scope.

Existing API tests continue to verify anonymous organizer overview rejection and server-side explicit event assignment boundaries. These automated checks are local; they do not replace a deployed Vercel test.

## Verification

- Isolated backend tests — **79 passed, 0 failed**.
- Frontend production build — **passed**, with the existing ~1.44 MB minified chunk advisory.
- TypeScript — **passed**.
- Syntax checks — **passed**.
- `vercel.json` JSON parse — **passed**.
- `git diff --check` — **passed** (working-copy LF/CRLF notices only).
- Live HTTP observations — root redirect currently **not applied**; this matches the reported deployment SHA. The public canonical host behavior was preserved.

## Deployment and staging steps

1. No production deployment was initiated. The commit to deploy must include the Phase 25 host redirect and Phase 26 `preserveQueryParams` update. Confirm the Vercel project is connected to this repository and its Root Directory/build settings consume the repository-root `vercel.json`.
2. First deploy to an isolated staging project/host and verify the exact 307 plus `Location: /organizer` for `organiser` root, including a harmless query string. Confirm `/organizer` and nested path refreshes load the organizer login/dashboard shell.
3. Verify organizer login, logout, expiry, CSRF/Origin and cookie behavior with cookie mode enabled only in staging as intended; verify assigned/unassigned event access and anonymous API denial. Do not widen cookie Domain or weaken the bearer cutoff.
4. Confirm `littx.in`/`www.littx.in` still serve the public marketplace and that other panel hostnames remain unrouted.
5. After staging acceptance and separate release approval, deploy the intended commit. Then repeat the read-only status/`Location` checks against production. Do not call the fix live until `organiser.littx.in/` returns the intended temporary redirect and organizer workflows pass.

**Release decision: NO-GO.** The checked-out source contains the route, but the reported production deployment (`c2ee881`) does not. The explicit query-preservation adjustment is currently uncommitted. A newer deployment and required staging authentication/assignment acceptance remain outstanding.

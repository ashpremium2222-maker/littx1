# Phase 28 — Stageway Staging Security Acceptance

**Assessment date:** 2026-10-21
**Repository revision tested:** `657ff10f6fc18d7535acea211ba08be4278b6dec`
**Release decision:** **NO-GO — no isolated deployed staging environment was available, so staging acceptance could not be performed.**
**Production, DNS, deployment, and payment configuration:** unchanged.

## Resource and credential inventory

This inventory deliberately records presence and names only. No `.env` contents, credential values, production customer data, provider accounts, or network targets were read or used.

| Resource | Availability finding | Acceptance consequence |
|---|---|---|
| Isolated staging HTTPS hostname and hosting project identity | Not supplied or discoverable from safe local configuration/process variable names. No staging request was made. | Host-based browser acceptance is blocked. |
| Two deployed application instances | Not supplied; no staging deployment target or instance labels available. | Cross-instance session acceptance is blocked. |
| Isolated staging MongoDB and inspection access | Not supplied. The local test runner uses mock storage; no DB connection was attempted. | Shared session, deployed indexes/TTL, and revocation acceptance are blocked. |
| Staging identities, synthetic event/tickets, and controlled mailbox | Not supplied. No customer identity or data was used. | Login, role, event assignment, OTP, and email/browser workflows are blocked in staging. |
| Android staging devices and staging passkey origin | Not supplied. No device was connected. | Native scanner/seller and WebAuthn acceptance are blocked. |
| Environment-variable names in current process | No staging URL/host, database, cookie-mode, cutoff, scanner/seller, or WebAuthn names were present. Values were not read. | No staging target or configuration can be safely verified. |
| `.env` file presence | `staging/server/.env` exists. It was not opened, loaded, or used; its environment and credential scope are unknown. Root `.env`, `.env.staging`, and `staging/combined-app/.env` are absent. | File presence is not evidence of staging credentials and cannot unblock runtime tests. |
| Local verification environment | Isolated backend test runner, mock storage, local build and source are available. | Local simulated checks can be reported separately; they do not constitute staging acceptance. |

No endpoint was contacted and no server was started for this assessment. No resource was treated as staging based on its name alone.

## Acceptance checklist and evidence still required

For every item below, the actual staging result is **BLOCKED / NOT RUN**. Local automated test coverage is listed separately and is not substituted for deployed evidence.

| Test | Required staging resource and procedure | Evidence required to mark PASS | Local evidence only | Status |
|---|---|---|---|---|
| Shared session and cross-instance revocation (P19-01/02) | Two identified staging instances using one isolated MongoDB; synthetic admin. Login through A, call protected endpoint through B, logout/revoke through A, retry through B. | Redacted project/revision/runtime and instance labels; response outcomes before/after revocation; timestamp; no cookie/token values. | Mock-backed tests cover session login/logout and revocation; no shared database or two instances. | **BLOCKED** |
| Replacement, expiry, indexes and TTL (P19-03/04) | Same isolated DB; synthetic account; controlled expiry fixture; read-only index inspection. Replace session and wait/advance through expiry. | Sanitized index definitions, expiry behavior and cross-instance rejected responses; documented intended cleanup behavior. | Backend tests cover single-active-session replacement and expiry rejection. Phase 19 notes session schemas have no declared TTL index; deployed indexes are unknown. | **BLOCKED** |
| HTTPS cookies and host scope (P19-05) | Actual isolated HTTPS hosts for each enabled browser panel; browser profiles and synthetic roles. Inspect cookie metadata and try cross-host access. | Redacted browser evidence of HttpOnly, Secure, SameSite, Path, absence of Domain, host isolation, session expiry; URLs/redirects without credentials. | Local helper test checks host-only and production-safe attributes. No deployed browser host was tested. | **BLOCKED** |
| Origin and CSRF (P19-06) | Staging cookie session. Try trusted Origin + correct CSRF, untrusted Origin, missing Origin, missing token, and invalid token on state-changing routes. | Sanitized request case labels and HTTP outcomes with timestamp; no token values or sensitive bodies. | Local backend test covers cookie-authenticated valid/missing/invalid CSRF and Origin handling. No deployed reverse-proxy/browser behavior observed. | **BLOCKED** |
| Login, logout, expiry and conflicting credentials (P19-07) | Synthetic accounts on each actual staging panel. Login, rotate/re-login, logout, expire a session, and send conflicting cookie/bearer credentials. | Redacted panel, identity role, request outcomes and revocation evidence across instances; no credentials. | Local security suite exercises cookie rotation/logout, expired sessions, and credential conflicts. | **BLOCKED** |
| Credential exposure (P19-08) | Actual staging browser panels and access to redacted staging logs. Inspect URL/query/redirects, local/session storage, network responses and server logs. | Redacted browser/network/log captures demonstrating no session/CSRF secrets in URLs, storage, or logs. | Source and local tests only; no deployed browser or log inspection. | **BLOCKED** |
| Bearer/admin-key cutoff (P19-09) | Staging-only synthetic administrator, staging static key, explicitly configured cutoff/latch. Test before, exactly at, and after cutoff; verify cookie login after cutoff. | Redacted staging config-presence confirmation and response matrix at the three boundaries; no key/cookie values. | Local test matrix covers latch/cutoff combinations and cookie availability after cutoff. No staging config was read or activated. | **BLOCKED** |
| Rollback behavior (P19-11) | Staging deployment with approved rollback runbook and explicit rollout latch retained. Exercise rollback without removing the latch. | Redacted before/after config-state evidence and endpoint outcomes proving legacy browser auth does not reopen. | Source-level fail-closed guard and isolated tests only. No rollout was attempted. | **BLOCKED** |
| Native scanner/seller and OTP separation (P19-10/12) | Authorized Android test devices, isolated API, synthetic roles and booking/ticket. Exercise native login, secure storage, expiry, logout/re-login, online/offline scanning, OTP recovery. | Device/OS/build, staging revision/host, synthetic identity role, sanitized outcomes, and explicit expiry/offline behavior. | Local tests cover native session separation/revocation and OTP/ticket capability scope. Device acceptance not performed. | **BLOCKED** |
| Seller WebAuthn/passkey (P19-13) | HTTPS staging relying-party origin, real supported browser/device, synthetic seller account. Register and authenticate passkey. | Redacted device/browser, RP/origin, staging build and registration/authentication outcome; no passkey payload or credential. | No hardware/device WebAuthn acceptance. Build success is not evidence. | **BLOCKED** |
| Role and event assignment / OTP regression (P19-14) | Synthetic super-admin, assigned and unassigned organizers, seller, PR, scanner, Shadow, events, tickets and test recipient in isolated staging. Attempt permitted and cross-role/cross-event operations and OTP recovery. | Redacted role/action/HTTP outcome matrix, event assignment identifiers replaced by synthetic labels, and OTP path evidence. | Backend tests cover organizer assignment enforcement, scanner assignment, role checks and OTP recovery using mocks. | **BLOCKED** |
| Organizer direct navigation, refresh, login/logout and API (Phase 28) | Organizer staging hostname and synthetic assigned/unassigned organizers. Load `/organizer`, refresh a nested route, login/logout, and call organizer APIs before and after auth. | Staging host/project/revision/runtime, screenshots or redacted responses, unauthenticated rejection, login/logout behavior, and assigned-vs-unassigned API outcomes. | Routing regression checks `/organizer` and nested SPA rewrites and authenticated screen gate; security tests cover unauthenticated dashboard API rejection and assigned-event isolation. No staging host tested. | **BLOCKED** |
| Organizer-host redirect and public marketplace preservation (Phase 28) | Candidate staging deployment with organizer and public hosts bound. Request organizer root (including safe query), direct organizer route, and public root. | Deployment source SHA; status and `Location` for each host; browser refresh; confirmation that public marketplace remains at its established canonical host. | Candidate source revision `657ff10` contains exact-host redirect; local regression test verifies redirect destination, query preservation, non-loop, public root rewrite, and nonmatching hosts. Live staging behavior not tested. | **BLOCKED** |

## Candidate source and local test results

The candidate revision is `657ff10f6fc18d7535acea211ba08be4278b6dec`. Source-level verification and the isolated routing regression confirm that `vercel.json` has a root redirect only for `organiser.littx.in` to `/organizer`, preserves query parameters, and leaves the root marketplace rewrite at `/index.html`. `/organizer` and nested organizer paths resolve to the SPA. This establishes the candidate code's intended routing, not a deployed host binding or live behavior.

On 2026-10-21, checks completed against local source:

- `npm test` in `staging/server`: **79/79 passed**, through `test/run-isolated.js` with mock storage and test-only configuration.
- `npm run build` in `staging/combined-app`: **passed**; Vite emitted the existing large-chunk advisory (main minified JS bundle exceeds 500 kB).
- `npx tsc --noEmit` in `staging/combined-app`: **passed**.
- The isolated suite includes organizer host redirect/query/public-root coverage, unauthenticated organizer API rejection, assigned/unassigned organizer event authorization, cookie/CSRF/logout, cutoff, native-session and OTP-capability tests. These are **local simulated tests**, not staging checks.
- No external staging runtime, database, browser, Android device, email provider, or identity was used. Therefore zero Phase 19/28 staging rows are PASS.

## Exact setup actions required to unblock acceptance

1. Hosting owner: provision an isolated HTTPS staging project/host and identify its immutable project/deployment identity. Deploy the reviewed candidate revision only to staging, bind the intended staging organizer/public hosts, and provide two application instances or an equivalent repeatable multi-instance test target. Confirm the project is nonproduction in the hosting dashboard.
2. Database owner: provision a disposable staging MongoDB database in an isolated nonproduction project; inject its URI through the approved staging secret manager (do not send it in chat); provide read-only index inspection. Load only synthetic accounts/events/tickets. Confirm cluster/project identity without exposing credentials.
3. Identity/test owner: create synthetic role accounts (including assigned and unassigned organizers), synthetic event/ticket records, a controlled test mailbox, and authorized Android test devices. Register passkeys only on the staging origin.
4. Staging operator: inject cookie-mode and cutoff settings through staging-only secret/configuration management. Define a test cutoff and latch for the staging run; do not copy production settings or activate anything in production. Retain the latch during rollback testing.
5. Test operator: execute every blocked row above, attach redacted evidence with timestamp, source SHA, runtime, host/project and identity-role labels. Never capture secrets, cookie/CSRF/token values, OTPs, passkey payloads, production customer data, or full sensitive request bodies.

Until these resources and evidence are available, runtime acceptance must stop. No security control should be weakened to compensate for missing infrastructure. Production remains **NO-GO**; no DNS, deployment, push, production configuration, data, or payment changes were made.

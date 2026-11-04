# Stageway Phase 19 — Isolated Staging Acceptance

**Assessment timestamp:** 2026-10-21 01:02:16 +05:30 (Asia/Kolkata)  
**Source revision inspected:** `0a9fb37508ec3b653d95b69124eeb72a6d2145d5`  
**Release decision:** **NO-GO — staging acceptance was not run.** Runtime tests were stopped because no isolated staging endpoint, database, or verifiable staging credentials were available. No staging or production HTTP request was sent; no application server or Android device session was started.

## Environment and evidence boundary

- Staging-target-related process environment variable **names** were checked without reading values. No staging URL, `MONGODB_URI`, `BASE_URL`, `CORS_ORIGINS`, cookie-mode, cutoff, scanner, seller, or WebAuthn configuration was present in the process environment.
- `staging/server/.env` exists, but its contents were not opened or used. Its purpose and account cannot be verified safely from file presence. Root `.env`, `.env.staging`, and `staging/combined-app/.env` were absent. No credential from the server `.env` was loaded, tested, or assumed to be staging-only.
- No staging hostname, deployment/project identifier, isolated database, test accounts, authorized Android device, or staging runtime/build identifier was supplied. Host isolation and credential scope therefore cannot be established.
- Local metadata at assessment: Node `v26.5.0`, npm `11.17.0`; these are not evidence of a deployed runtime. No staging build/version is available. The source revision identifies the code reviewed, not a deployed artifact.
- Source inspection confirms the cutoff check rejects legacy credentials when `Date.now() >= cutoff`; cookie login is not rejected solely because the cutoff elapsed. The parser requires a full ISO timestamp with timezone. This is source-level behavior only; no cutoff was configured or activated for acceptance.
- `UserSession.userId` and `SellerSession.sellerId` are unique. Application middleware checks session expiry on requests. The session schemas declare no TTL index. Deployed indexes and cleanup behavior remain unverified. OTP challenge/rate-limit TTL indexes are separate and do not establish session cleanup.

**Evidence captured:** environment-variable names only, env-file presence booleans, repository revision, local Node/npm versions, source review, and prior Phase 18 local-only results in `docs/SUBDOMAIN_MIGRATION.md`. No secret, URL target value, provider, database, or customer data was captured.

## Acceptance matrix

The intended environment for every row is isolated HTTPS staging on the reviewed source (or a specifically recorded later revision), with a dedicated staging database and synthetic identities. That environment was unavailable. Every row below therefore has **actual result: not executed**. Phase 18 mock tests are supporting local evidence only and do not count as staging results.

| ID / test | Preconditions and test identity | Steps and expected result | Actual result | Timestamp / evidence (redacted) | Status |
|---|---|---|---|---|---|
| P19-01 — Login A, use session on B | Two isolated staging instances share one staging MongoDB; synthetic master-admin identity | Log in at A; B accepts the same valid session and derives role from the server record | Not run: no endpoint, instances, or verified DB | 2026-10-21 01:02 +05:30; environment inventory above | **BLOCKED** |
| P19-02 — Cross-instance revocation | P19-01 prerequisites; same synthetic identity | Revoke/logout at A; B promptly rejects the old session | Not run | No staging instance response or DB evidence | **BLOCKED** |
| P19-03 — Replacement and expiry | Staging synthetic account; controllable staging expiry fixture | Replace the single active session; verify old and expired credentials fail on both instances | Not run; Phase 18 local tests simulated rotation/expiry only | Local-only evidence in `docs/SUBDOMAIN_MIGRATION.md`; no staging DB evidence | **BLOCKED** |
| P19-04 — Indexes and TTL | Isolated staging DB; database-owner inspection access | Verify unique session indexes and relevant TTL configuration; observe synthetic expiry cleanup | Not run; source has unique identity indexes but no session TTL index | Source review of `staging/server/db.js`; deployed index evidence absent | **BLOCKED** |
| P19-05 — Cookie attributes and host scope | Actual HTTPS staging host for admin, organizer, seller, PR, scanner, Shadow; synthetic role identities | Inspect cookie metadata only; expect HttpOnly, Secure, SameSite=Lax, Path=/, no Domain; verify no cross-host acceptance | Not run; helper serialization was tested locally only | Phase 18 local test record; no browser capture | **BLOCKED** |
| P19-06 — Origin and CSRF | P19-05 browser sessions | Trusted Origin + valid CSRF succeeds; untrusted/missing Origin and missing/invalid CSRF fail | Not run; local mock coverage only | No staging request evidence | **BLOCKED** |
| P19-07 — Logout, expiry, credential conflict | Staging browser sessions on each panel | Logout revokes; expired sessions and conflicting cookie/bearer credentials are rejected | Not run; local backend coverage is simulated | No staging request evidence | **BLOCKED** |
| P19-08 — Credential exposure | Actual staging browser panels and redacted staging logs | Check URLs, redirects, JSON, local/session storage, and logs; session secrets must not appear | Not run; no browser or staging logs available | No staging browser/log evidence | **BLOCKED** |
| P19-09 — Bearer/static-key cutoff | Staging-only config and synthetic admin identity/key | Legacy bearer/key works before cutoff, is rejected at and after it; cookie login remains available after cutoff | Not run. Source uses inclusive boundary `now >= cutoff`; no staging cutoff was set | Source review only; no boundary responses | **BLOCKED** |
| P19-10 — Native auth and OTP separation | Authorized staging Android devices; synthetic bookings/tickets/recipient | Verify scanner/seller credentials and scoped OTP/ticket capabilities remain independent of panel cookies | Not run; no authorized devices, staging accounts, or test bookings | No device or recovery-flow evidence | **BLOCKED** |
| P19-11 — Rollback | Staging deployment and approved rollback procedure | Exercise before/after-cutoff rollback; prove legacy browser access cannot reopen | Not run. Static source review found a configuration hazard: when cookie mode is disabled and the cutoff is missing or malformed, middleware has no valid cutoff to enforce and can fall through to legacy authentication. A rollback that retains a valid cutoff is part of the documented procedure, but staging acceptance must also prove configuration retention/fail-closed handling. | No staging rollback evidence; source review only | **BLOCKED** |
| P19-12 — Android scanner/seller workflows | Real authorized Android devices and isolated staging API; synthetic roles/events | Login, secure storage, expiry, logout, re-login, scanning, and relevant offline behavior | Not run. Phase 18 Gradle builds are not device acceptance | No device evidence | **BLOCKED** |
| P19-13 — Seller WebAuthn/passkey | Real test device/browser, HTTPS staging relying-party origin, synthetic seller | Register/authenticate passkey; verify origin/RP checks and persisted-session replacement | Not run; no staging origin or authorized test credential | No passkey evidence | **BLOCKED** |
| P19-14 — Role/event and OTP regression | Synthetic super-admin, assigned/unassigned organizer, seller, PR, scanner, Shadow; synthetic event/ticket/recipient | Verify role/company/event boundaries and OTP booking recovery independently of panel sessions | Not run in staging; prior local tests are simulations | Phase 18 local suite reference only; no staging workflow evidence | **BLOCKED** |

No test is marked **PASS** or **FAIL** because staging execution did not occur. No mock or local result substitutes for staging acceptance.

## Required setup and next actions

1. The platform owner must supply the exact nonproduction HTTPS staging host, deployment/project identity, deployed source revision/runtime, and two isolated application instances. Confirm through the hosting console that both instances target only the dedicated staging project.
2. The database owner must provision a disposable staging MongoDB database, confirm its cluster/project identity without disclosing credentials, and enable read-only index/TTL inspection plus synthetic test records. Decide whether session cleanup requires a TTL index or whether application-side expiry and request rejection are the intended retention model. Do not add a session TTL index without reviewing single-active-session and historical-session behavior.
3. Provision synthetic role accounts, events/tickets, a controlled mailbox, and authorized Android test devices. Register seller passkeys on the staging origin. Inject only verified staging credentials through the approved staging secret manager/runtime; do not use the existing unverified `staging/server/.env`.
4. Execute P19-01 through P19-14 and attach redacted evidence: host/project/revision/runtime, UTC timestamp, identity role, statuses, instance labels, cookie attribute names only, sanitized index specifications, expiry/revocation observations, and device/provider outcomes. Never capture secrets, cookie/token/CSRF values, OTPs, passkey payloads, or customer data.
5. Preserve cutoff semantics: the exact configured instant is already after cutoff for legacy browser/static-key credentials (`now >= cutoff`). Use staging-only config and synthetic credentials for boundary testing. No ambiguity was found in the source contract; no setting was changed.

### Rollback configuration blocker

Phase 19's source-level rollback finding was addressed in Phase 20 with an explicit rollout latch. No staging configuration or production setting was changed. No application server, provider, database, device, or network target was contacted. **Production remains NO-GO.**

## Phase 20 fail-closed cutoff guard

### Implemented locally

- Added `SESSION_BEARER_CUTOFF_ENFORCED`. It is off when absent or set to `false`; only the exact string `true` activates cutoff policy. Any other value is a configuration error and fails closed for panel credentials.
- Cookie mode cannot be enabled without the latch. Once rollout is activated, disabling cookie mode does not disable the cutoff. Operators must retain `SESSION_BEARER_CUTOFF_ENFORCED=true` through rollback.
- An activated latch requires a valid timezone-qualified `SESSION_BEARER_CUTOFF_AT`. Missing or malformed cutoff fails closed with service-unavailable responses; at/after the timestamp, browser bearer and static admin/presentation credentials are rejected. Before the timestamp, the overlap remains available.
- A future or elapsed timestamp alone does not activate cutoff policy. Before explicit rollout activation, existing bearer/static-key behavior remains unchanged.
- Valid cookie sessions remain usable after cutoff. Persisted native scanner/seller sessions remain on their explicit native authentication paths and are exempt from the browser cutoff. OTP recovery and ticket-scoped capabilities remain separate and unchanged.
- Backend `npm test` now launches through a sanitized test runner and the server skips `.env` loading in `NODE_ENV=test`; the isolated config test confirms application endpoints and provider credentials are not inherited. This does not read `.env` values.

### Rollout-state limitation

The approved latch is an environment-level operator setting, not a durable database rollout record. Its safety depends on retaining it as `true` once rollout starts. If an operator removes the latch entirely, the default is pre-rollout `false`, which cannot distinguish intentional pre-rollout state from accidental removal after activation. This limitation and the required deployment review/retention control must be addressed before staging rollout; no production default or persistent state was invented.

### Phase 20 local evidence

The new isolated backend regression matrix covers cookie mode on/off against missing, malformed, future, and elapsed cutoff values; browser bearer and static admin-key paths independently; invalid latch values; valid cookie access after cutoff; native scanner and seller behavior with elapsed/malformed browser cutoff; and OTP ticket capability use after cutoff. `npm test` in `staging/server` passed **63/63** on 2026-10-21 using mock storage and test-only values. The launcher strips inherited application/deployment variables, and the server skips `.env` loading in test mode. These are local simulated tests only. `npm run build` and `npx tsc --noEmit` in `staging/combined-app` passed; Vite emitted the existing large-chunk advisory. `node --check` passed for `server.js`, `session-cookie-auth.js`, `db.js`, `test/run-isolated.js`, `test/isolated-config.test.js`, and `test/security.test.js`; `git diff --check` passed with Git line-ending warnings. Cross-instance MongoDB revocation, deployed HTTPS cookies/origins, native-device behavior, and all Phase 19 staging checks remain **BLOCKED**, not passed. Production remains **NO-GO**.

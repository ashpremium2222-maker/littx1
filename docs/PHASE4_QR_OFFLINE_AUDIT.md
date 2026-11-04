# Phase 4 QR and Offline Sales Audit — 2026-10-20

## Existing behavior retained

- The scanner app already validates ticket and company/event scope on the server and uses an atomic sale-state transition. A booking QR represents the full admission count; a concurrent or later scan is rejected.
- Seller and PR login, seller company-wide event scope, server-priced categories, seller attribution, sales history, PR cash requests, and admin approval/rejection remain in place. Company-wide seller scope was explicitly confirmed for this phase.
- PR cash requests remain pending and do not reserve inventory at submission. Admin approval confirms cash collection (as explicitly confirmed for this workflow), reserves shared capacity atomically, marks the internal cash verification source, and issues a ticket only if capacity remains.
- Existing public and PR online checkout continue to use the Phase 3 15-minute inventory hold. Existing gateway/provider code was not expanded or modified.

## Phase 4 changes in this increment

- Scan logs now include scanner identity, order, admission quantity, and optional gate. Unissued orders return a manual-review result without changing the order. Cancelled and duplicate scans are recorded distinctly.
- Direct seller ticket issuance and admin approval of pending offline ticket requests now reserve and consume the same event/category inventory used by online checkout. A sold-out offline approval remains pending for manual review.
- Admin and seller sales responses distinguish confirmed order count, QR count, admission count, online/offline channel, event/category/seller breakdowns, pending/cancelled/manual-review order counts, and remaining inventory. The seller summary surface labels orders, QR codes, and admissions separately.
- Cash verification is recorded as an internal admin action (`admin_cash_approval`); it is not represented as a provider payment, and it does not call a payment gateway.

## Verification

- `npm test` in `staging/server`: **32 passed, 0 failed**. Includes group/concurrent/cancelled/unissued scans, shared online/offline inventory competition, seller attribution and group admissions, report channel metrics, reservation expiry, OTP primitives, and refund-request invariants.
- `npm run build` in `staging/combined-app`: passed. Vite reports the existing large JavaScript bundle warning.
- `node --check` passed for `server.js`, `db.js`, and `test/security.test.js`; `git diff --check` passed.
- Tests use isolated mock storage and explicit non-production payment test mode. No production MongoDB or live provider operation was exercised.

## Remaining limits and manual checks

- PR cash requests that lose the inventory race remain pending for an administrator to resolve. The application intentionally does not issue a ticket, oversell, or refund automatically.
- If an existing payment provider later reports a capture after an online reservation expired, the order requires manual review. Do not automatically issue a ticket, oversell, or refund. No new gateway reconciliation automation is in scope.
- MongoDB schema/index behavior and concurrent writes should be verified against staging before production use. The local suite uses mock storage.
- Manually verify scanner login and event assignment, whole-group admission and duplicate rejection, offline seller issue, PR cash approval when stock remains, and the pending/manual-review response when stock is exhausted. Confirm event-specific printed ticket details and notification delivery in staging; these rely on existing templates/provider configuration and are outside this change.
- No migration, production configuration change, deployment, push, or commit was performed.

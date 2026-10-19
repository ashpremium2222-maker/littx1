# Stageway Booking and Payment Audit

**Audit date:** 2026-10-19  
**Phase:** Phase 3 implementation in progress; verification and owner decisions remain open.  
**Scope:** Customer and PR online checkout, order storage, Razorpay callback/webhook, ticket generation/delivery, refund routes, and test coverage.  
**Safety:** Local mocks only. No production database, customer data, provider calls, live payments, or refunds were used.

## Confirmed baseline issues and Phase 3 status

| Area | Baseline finding | Current Phase 3 status |
|---|---|---|
| Inventory | Checkout only read remaining availability, so concurrent requests could oversell and abandoned orders had no release lifecycle. | Public and PR online checkout now use atomic event-document reservation of individual admissions, with a 15-minute persisted expiry and duplicate-safe release. Cash requests remain admin-approved and do not hold inventory before approval. |
| Razorpay | Callback/webhook did not reconcile captured amount, currency, and expected order total; webhook event replay was not durably tracked. | Server callback fetches and reconciles the payment; webhook verifies exact raw bytes and reconciles payment. Sale records store handled event IDs. No live gateway behavior was tested. |
| Payment/ticket states | Payment and fulfillment were coupled to one legacy status; ticket failure could strand paid orders. | Separate payment/fulfillment states and durable processing leases allow ticket generation retries while preserving legacy status fields. |
| Group admission | Existing model stores one QR per Sale; scanner atomically consumes it once. It does not track per-person admission slots. | Server checkout computes `admissionCount` and reserves that many units. Ticket rendering/scanner changes are paused until owner chooses whole-group entry vs. repeated scans decrementing a group counter. |
| Purchase limits | Backend already enforced a per-order limit; it did not track cumulative customer identity. | Per-order limit stays in force as approved. Cumulative per-customer limits remain out of scope. |
| Recovery | No customer-owned booking history or recovery API exists. | OTP channel is not configured. Recovery is not operational; channel/template choice is waiting on owner input. |
| Refunds | No durable customer request/admin decision workflow was found. | Refund fields are present in the sale schema, but request/approval API and audit tests remain incomplete. No live refund or inventory restoration occurs. |
| Pricing | Existing customer total was persisted ticket price multiplied by product quantity. No new tax, fee, or surcharge was present. | Existing pricing is preserved. New checkout records store integer minor units and provider totals are checked. |
| Delivery | Ticket mail/WhatsApp sends occur inline and no durable retry worker was found. | Still a known limitation; payment confirmation remains separate from notification success, but delivery retry is not complete. |

## State conventions and safeguards

- Legacy `status` values remain for compatibility; `paymentStatus` and `fulfillmentStatus` capture the new lifecycle independently.
- A finite reservation changes the event category remaining count and appends a reservation in one conditional event-document update. Payment consumes the reservation; expiry transitions the sale before idempotent release.
- Captured payments after expiry are recorded as paid reconciliation exceptions and do not receive tickets automatically. No automatic refund is triggered.
- Checkout idempotency records use a unique key. Razorpay provider payment IDs have a partial unique index so one captured payment cannot be attached to multiple orders. Existing records are not rewritten by this work.
- The added sparse unique `Sale.checkoutRequestId` index and partial unique `Sale.providerPaymentId` index require a read-only duplicate report and verified backup/rollback plan before production rollout. No migration has been run.

## Decisions awaiting owner input / remaining risks

1. **Group gate workflow (blocks scanner and ticket UI):** current scan consumes an order QR once. Recommended: one scan admits the full `admissionCount`, rejecting repeated scans. If group members enter separately, implement an atomic remaining-admissions counter and corresponding staff UX. Which workflow should apply?
2. **OTP delivery (blocks operational recovery):** inspected environment had no SMTP/Mailgun or WhatsApp OTP configuration/template. Which approved channel/provider and message template should be used? No provider was selected or called.
3. **Late capture after expiry:** current safe behavior records a paid exception and issues no ticket, preventing oversell. Confirm this should remain the support/manual-reconciliation default; no automatic refund or inventory override is made.
4. **Deployment migration/index safety:** before index creation, run a read-only report for duplicate `checkoutRequestId` values and confirm backup/rollback evidence. No production migration was run.
5. **Cash request capacity:** PR cash requests remain pending admin approval and reserve no inventory. Confirm whether inventory should be reserved on request or only at approval; this policy affects when availability is consumed.

## Verification status

The backend suite passed **24/24** after the public and PR checkout changes. The frontend production build passed with a Vite large-chunk warning; Node syntax checks and `git diff --check` passed. Production readiness is not established: OTP recovery, refund endpoints, delivery retries, group scanner behavior, migration/index verification, and sandbox/live configuration evidence remain open.

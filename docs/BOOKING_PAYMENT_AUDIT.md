# Stageway Booking and Payment Audit

**Audit date:** 2026-10-20
**Phase:** Phase 3 continuation; verification and dependencies remain open.
**Scope:** Customer and PR online checkout, order storage, Razorpay callback/webhook, ticket generation/delivery, refund routes, and test coverage.  
**Safety:** Local mocks only. No production database, customer data, provider calls, live payments, or refunds were used.

## Confirmed baseline issues and Phase 3 status

| Area | Baseline finding | Current Phase 3 status |
|---|---|---|
| Inventory | Checkout only read remaining availability, so concurrent requests could oversell and abandoned orders had no release lifecycle. | Public and PR online checkout now use atomic event-document reservation of individual admissions, with a 15-minute persisted expiry and duplicate-safe release. Cash requests remain admin-approved and do not hold inventory before approval. |
| Razorpay | Callback/webhook did not reconcile captured amount, currency, and expected order total; webhook event replay was not durably tracked. | Server callback fetches and reconciles the payment; webhook verifies exact raw bytes and reconciles payment. Sale records store handled event IDs. No live gateway behavior was tested. |
| Payment/ticket states | Payment and fulfillment were coupled to one legacy status; ticket failure could strand paid orders. | Separate payment/fulfillment states and durable processing leases allow ticket generation retries while preserving legacy status fields. |
| Group admission | Existing model stores one QR per Sale; scanner atomically consumes it once. It did not report how many people that scan admits. | Scanner records and reports the full `admissionCount` on its one atomic scan. Repeat and concurrent scans are rejected; there is no partial group entry counter. |
| Purchase limits | Backend already enforced a per-order limit; it did not track cumulative customer identity. | Per-order limit stays in force as approved. Cumulative per-customer limits remain out of scope. |
| Recovery | No customer-owned booking history or recovery API exists. | Added HMAC-hashed OTP challenges and subject-keyed persistent issue limits with expiry, single use, and attempt caps. No customer OTP API or delivery integration is enabled; recovery is not operational pending a channel/provider decision. |
| Refunds | No durable customer request/admin decision workflow was found. | Added one-time full-refund request state transitions and scoped admin request-list/approve/reject routes. Customer request submission remains unavailable until verified OTP recovery is wired. Approval does not call Razorpay, invalidate a ticket, or restore stock. |
| Pricing | Existing customer total was persisted ticket price multiplied by product quantity. No new tax, fee, or surcharge was present. | Existing pricing is preserved. New checkout records store integer minor units and provider totals are checked. |
| Delivery | Ticket mail/WhatsApp sends occur inline and no durable retry worker was found. | Still a known limitation; payment confirmation remains separate from notification success, but delivery retry is not complete. |

## State conventions and safeguards

- Legacy `status` values remain for compatibility; `paymentStatus` and `fulfillmentStatus` capture the new lifecycle independently.
- A finite reservation changes the event category remaining count and appends a reservation in one conditional event-document update. Payment consumes the reservation; expiry transitions the sale before idempotent release.
- Existing earlier payment code can record a capture after expiry as a paid reconciliation exception. Such a case requires manual review; it must not issue a ticket, oversell inventory, or trigger an automatic refund. This continuation adds no capture-reconciliation automation.
- Checkout idempotency records use a unique key. Razorpay provider payment IDs have a partial unique index so one captured payment cannot be attached to multiple orders. Existing records are not rewritten by this work.
- OTP codes are not persisted: only keyed HMAC digests are stored. Challenge lifetime is 10 minutes, issuance is limited to 3 per 15-minute window per subject/purpose, and verification locks after 5 failed attempts. These storage operations are not production-database integration tested and no delivery route exposes codes.
- Refund requests are full-amount only; duplicate requests and duplicate admin decisions are blocked by conditional Sale transitions. `approved` records admin approval only, not a completed gateway refund; paid ticket validity and inventory remain unchanged.
- The added sparse unique `Sale.checkoutRequestId` index and partial unique `Sale.providerPaymentId` index require a read-only duplicate report and verified backup/rollback plan before production rollout. No migration has been run.

## Decisions awaiting owner input / remaining risks

1. **OTP delivery (blocks operational recovery and customer refund requests):** no approved OTP delivery channel/template is configured. No delivery provider was selected or called. Configure a random `BOOKING_OTP_SECRET` of at least 32 characters before enabling OTP APIs, and specify the approved delivery channel/template.
2. **Late capture after expiry:** manual review is required. Do not automatically issue a ticket, oversell inventory, or refund; no gateway-based reconciliation automation is being added in this scope.
3. **Deployment migration/index safety:** before index creation, run a read-only report for duplicate `checkoutRequestId` values and confirm backup/rollback evidence. No production migration was run.
4. **Cash request capacity:** PR cash requests remain pending admin approval and reserve no inventory. Confirm whether inventory should be reserved on request or only at approval; this policy affects when availability is consumed.

## Verification status

The backend suite passed **29/29**. OTP expiry/reuse/attempt-limit logic is tested against an isolated store; tests do not perform real payments. The frontend production build passed with a Vite large-chunk warning; Node syntax checks and `git diff --check` passed. Production readiness is not established: OTP delivery/recovery, customer refund submission, delivery retries, migration/index verification, and production Mongo index verification remain open. No production or payment-provider operation was performed for this continuation.

## Current scope note

Payment gateway integration is explicitly deferred for the current continuation. Existing provider code/configuration from earlier work is preserved without changes here; this continuation adds no provider SDK, API call, webhook, credential, configuration, or reconciliation automation. Internal reservation and scan operations do not mark orders paid. A late capture reported after inventory expiry requires manual review, with no automatic ticket, oversell, or refund.

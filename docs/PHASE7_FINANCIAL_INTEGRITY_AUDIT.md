# Stageway Phase 7 — Financial Operations and Order Integrity Audit

Audit date: 2026-10-20  
Scope: existing server order/ticket/refund flows, sales reports, inventory reservations, offline seller/PR issuance, and Phase 7 read-only reconciliation. No provider integration was changed and no production operation was run.

## Current state model and transitions

The database keeps the compatibility `status` beside separate `paymentStatus` and `fulfillmentStatus` fields.

- Online checkout: `created` / `pending` → `processing` → `paid`; pending checkout may become `expired`, `failed`, or `cancelled`. A capture after expiry is recorded as `paid` plus `payment_exception` / `inventory_conflict` and requires manual review. The exception path does not issue a ticket or reacquire inventory.
- Online fulfillment: confirmed payment → `pending` → `generating` → `ticketed`, followed by legacy delivery states (`emailed` or `email_failed`). Payment and ticket delivery are separate. Conditional database updates and generation leases guard duplicate payment claims and ticket assignment.
- Offline seller tickets: authenticated seller submissions use server pricing and shared admission inventory. The established manual sale path writes `paymentId: manual`, `source: offline_seller`, and the legacy paid/ticket statuses. Direct-delivery seller issuance counts as collection; seller approval status still gates delivery where configured. This owner-confirmed collection rule is limited to this explicit offline flow.
- PR cash: submission is `pr_cash_pending` / `paymentStatus: pending`; it does not reserve inventory. An authorized admin approval confirms cash, attempts to reserve shared inventory, records `admin_cash_approval`, and then allows ticket issuance. If capacity is unavailable, the request stays for manual review.
- Group admissions: `quantity` is the number of purchased ticket units/QRs; `admissionCount` is the number of people admitted. Shared inventory reserves and consumes admission units. One group QR scan atomically records the full group admission count; it is not a partial-entry counter.
- Refunds: customer request changes `refundStatus` from `none` to `requested`; authorized admin decision changes it to `approved` or `rejected`. Approval is internal only. It does not record a money refund, invalidate the ticket, or restore inventory. There is no partial refund workflow.

## Ticket cancellation and inventory

Master ticket controls can disable/cancel a ticket and can reactivate it. These operations update ticket status and are audited; the reviewed route does not restore inventory. Event reservation expiry and cancellation paths release active reservations idempotently. Consumed inventory is not automatically restored by the refund decision workflow.

The normal online payment and ticket-issuance paths use conditional state transitions. Other legacy ticket workflows still write compatibility statuses directly, so they are checked by the reconciliation report rather than assumed to share the online transition contract. A reconciliation finding is informational only and has no automatic repair action.

## Report semantics

- Order count includes every non-shadow order in scope. Confirmed order count, QR count, and admissions are separate metrics; QR count counts issued ticket IDs and admissions sum recorded admission quantities.
- Confirmed sales require a countable/deliverable legacy order state and either `paymentStatus: paid` or the specific established offline manual-sale evidence (`paymentId: manual`, offline channel, seller/PR/admin attribution, and no pending/rejected approval). A ticket ID by itself is not payment evidence.
- Monetary totals use gross `customerTotal`, falling back to legacy `amount` only when customer total is absent. They exclude pending and unverified records, and are before refund decisions. Pending and unverified amounts are reported separately and are not collected revenue. No fees, tax, commission, or payout treatment is inferred.
- Requested, approved, and rejected internal refund decisions are counted separately. Approval does not imply funds were returned.
- Online and offline channels include confirmed orders only. PR cash pending is not included as confirmed offline revenue.

## Reconciliation checks

`GET /api/admin/reconciliation` returns a read-only, no-store report for master admins, company admins scoped to their company, and organizers scoped to explicitly assigned events. Findings include duplicate ticket identifiers, tickets associated with pending/cancelled/expired/exception states, issued orders without a confirmed payment state, group admission/category-size mismatches, offline sales without attribution, sale/event inventory reservation mismatches, and refund statuses that could be mistaken for completed money returns. It returns order references and state details, not customer names, email addresses, phone numbers, credentials, OTPs, or tokens. It does not update records.

## Known inconsistencies and limits

- Legacy status fields remain in use alongside payment/fulfillment state. Route-by-route behavior is not yet a single centralized transition service; existing conditional guards are retained and read-only reconciliation surfaces known combinations.
- Historical records with no payment status are treated as confirmed only when they match the established attributed manual seller/PR flow. Other legacy records remain unverified until reviewed.
- Existing `refundStatus` schema values include `processing`, `failed`, and `refunded`, although the current internal decision route only writes `approved` or `rejected`. A `refunded` value or provider reference is not proof of money returned and is flagged for review.
- Inventory checks compare recorded sale reservation state with event reservation documents and group quantities with event category size. They cannot prove a historical admission ledger if category configuration has changed or old orders lack canonical event/category IDs.
- Late capture after inventory expiry remains a manual support/reconciliation case. Do not issue a ticket, oversell, or automatically refund.
- This is not a financial ledger or payment settlement report. No gateway capture/refund automation, accounting policy, or automatic correction is included.

## Verification boundary

The automated tests use isolated mock storage and test-only payment fixtures. They do not test production MongoDB indexes, provider credentials, notification delivery, physical scanner devices, production migrations, or live financial operations. Staging review is still needed before operational use.

# Stageway Implementation Roadmap

This roadmap is ordered by risk and dependency. Acceptance criteria stay open until verified by tests or operational evidence; a successful build alone is not sufficient.

| Phase | Priority | Scope and dependencies | Acceptance criteria | Required verification |
|---|---|---|---|---|
| 0. Audit and baseline | P0 | Inventory architecture, Git state, existing scripts, data paths, providers, deployment, and tests. | Audit, roadmap, and changelog exist; current working-tree changes are preserved; risks and unknowns are explicit. | Baseline web build; identify backend test gap; record failures without implying production verification. |
| 1. Security and data protection | P0 | Remove weak/default credentials; close public privileged endpoints; define route-level auth/role/tenant matrix; protect sessions and secrets; rate-limit logins; validate inputs; harden CORS/headers; review data access, logs, uploads, backups. | Protected APIs reject missing/invalid auth; each role can access only authorized company/event records; no default secrets in source; financial/admin actions are auditable; no existing data is changed without a reviewed migration. | Auth matrix tests, credential negative tests, tenant-isolation tests, webhook signature tests, dependency scan, static secret scan. |
| 2. Multi-event model | P1 | Replace global event assumptions with event-specific IDs and configuration; preserve Dholida references and historical tickets. Depends on Phase 1 ownership boundaries. | Admin creates/edits/drafts/reviews/publishes/archives multiple independent events; ticket categories, inventory, sale windows, and event ownership are server-enforced; legacy links resolve. | Multi-event CRUD, isolation, catalog, historic-link and migration tests. |
| 3. Booking and payments | P2 | Inventory reservation/atomic purchase, server-side pricing, order state machine, Razorpay live/test separation, signed/idempotent webhooks, ticket generation and customer retrieval. | No overselling under concurrent load; only verified paid orders generate paid tickets once; duplicate/delayed events are safe; failed and interrupted checkout can recover. | Concurrent purchase tests, gateway sandbox tests, webhook replay/signature tests, reconciliation checks. |
| 4. Scanning and entry | P3 | Event/gate staff assignment, server validation, atomic duplicate prevention, scan audit trail, cancellation/refund invalidation, offline policy. | Scanner identity, event, gate, timestamp, result and duplicate state are stored; unauthorized scanners cannot check in tickets. | Concurrent duplicate-scan tests, invalid/cancelled/refunded ticket tests, role/event isolation. |
| 5. Super-admin | P4 | Review current admin routes and APIs; separate platform-wide powers from company scope; add explicit validation and audit trails. | Every admin action is role-checked on the server; sensitive account, event, and ticket changes are attributable and recoverable. | Route matrix tests and audit-log assertions. |
| 6. Organizer and partner | P5 | Organizer onboarding/profile, event submission, staff assignment, reporting and export; partner permissions tied to records. Depends on event and role model. | Organizer can manage multiple owned events and only permitted guest/sales data; no cross-organizer leakage. | Organizer ownership, staff permissions, export scope, and lifecycle tests. |
| 7. Refunds and financial operations | P7 | Verify refund model and gateway architecture; implement approval, partial refunds where supported, commission/settlement accounting and reconciliation. | Every financial movement is idempotent, reconciled, attributable, and represented with accurate states; no fabricated balances. | Sandbox refund/reconciliation tests, arithmetic invariants, ledger/audit tests. |
| 8. Marketplace and communications | P6/P7 | Multi-event discovery/search/detail, accessible customer flow; email/WhatsApp/SMS configuration, consent, retries, event updates. | Public listings reflect real event status/inventory and clear totals; notifications are consent-aware, retryable and traceable. | Accessibility checks, booking regression, provider sandbox and retry tests. |
| 9. Launch readiness | P8/P9 | End-to-end regression, deployment environments, monitoring, backups/recovery, security/dependency review, documentation and rollback. | All critical acceptance criteria pass; recovery and rollback have evidence; remaining limits and provider configuration are explicit. | CI suite, production build, staging end-to-end, backup restore drill, deployment/rollback review. |

## Phase 1 sequencing

1. Close confirmed public access paths and remove source/default credentials (first set is recorded in the changelog).
2. Complete a route inventory and assign each endpoint a required role and tenant scope; fix remaining unguarded API routes, including legacy PR and account-management paths.
3. Remove client-side gates that contain passwords and replace them with backend identity/role checks; do not rely on hidden UI as authorization.
4. Add shared login throttling, bounded input validation, origin allowlists, safe security headers, and privacy-safe structured audit logging.
5. Review old database accounts and plan a reversible password-hash/session migration; do not rewrite existing rows until backup and rollback steps are verified.
6. Add focused API tests for authentication, role scope, event/company isolation, repeated webhooks, and duplicate scans before starting Phase 2.

## Phase 2 execution checkpoint — 2026-10-19

Phase 2 has started but is **not complete**. `docs/MULTI_EVENT_AUDIT.md` records the repository-wide event-specific findings and the remaining work.

Completed in this foundation increment:

1. Added event slugs, organizer/company ownership, lifecycle/visibility, venue/date/category metadata, and persisted ticket categories with price, currency, inventory, sale windows, per-order limit, status, and group-size fields.
2. Added authorized draft creation, organizer-scoped event listing/editing, submission for review, master-admin publishing, safe cancel/postpone/complete transitions, and no-delete archival behavior.
3. Replaced the Dholida-only public API filter and pricing fallback with exact event-reference resolution and published/public discovery/detail endpoints. Legacy active events without lifecycle fields remain compatible.
4. Bound public and PR order creation to selected event/category references and persisted `Sale.eventId` / `Sale.ticketCategoryId` without removing legacy sale fields.
5. Added the public event catalogue/detail/checkout route and event-driven homepage cards, plus PR event/category selection.
6. Added multi-event HTTP regressions while retaining Phase 1 security tests.

Remaining Phase 2 acceptance work:

1. Add atomic inventory holds, expiry, release, and settlement behavior before relying on finite inventory during concurrent checkout; current checks validate configured availability but are not a reservation lock.
2. Finish event detail/category edit UI and admin event-ID reporting across existing dashboards, manual-ticket flows, Shadow, and native seller clients.
3. Persist staff/scanner assignments by event ID and update scan authorization and analytics.
4. Render each event's own details and artwork in PDF tickets and generic email/WhatsApp templates; retain explicitly campaign-specific Dholida copy separately.
5. Review and run the additive link/index migration only against a verified backup, then validate rollback and orphan reports. The migration has not been run.
6. Implement customer-owned booking retrieval before claiming customer account isolation; the current catalogue/checkout is guest checkout and ticket links remain bearer links.

Phase 3 booking/payment reliability must address concurrency, inventory reservation recovery, payment/webhook idempotency, and reconciliation after this event foundation stabilizes. Do not treat this checkpoint as Phase 2 completion.

## Phase 3 execution checkpoint — 2026-10-19

Phase 3 continuation implements 15-minute inventory holds, individual-admission inventory arithmetic, secure OTP challenge storage primitives, one-scan whole-group admission reporting, and full-refund request/admin decision state transitions. Customer OTP recovery and refund submission remain unavailable pending verified OTP delivery. Payment gateway integration is deferred in this continuation; existing provider code/configuration is preserved without edits. Late captures after reservation expiry require manual review, without automatic ticket issuance, oversell, or refund. This does not close Phase 2: event editor/reporting/staff assignment, dynamic event ticket templates, and migration evidence remain open. Notification retry workers and production index verification also remain open. See `docs/BOOKING_PAYMENT_AUDIT.md`.

## Phase 4 execution checkpoint — 2026-10-20

The scanner audit and shared online/offline inventory integration are recorded in `docs/PHASE4_QR_OFFLINE_AUDIT.md`. Group scans, duplicate/cancelled/manual-review outcomes, seller/PR attribution, report channel counts, and offline inventory competition pass local tests. Phase 4 is not fully operationally verified: seller issue and scanner flows still need staging walkthroughs, MongoDB concurrency/index behavior is unverified, and event-specific ticket templates/notification delivery need staging checks. Payment gateway work remains deferred; late captures after inventory expiry require manual review.
## Dependencies and migration safeguards

- Phase 2 depends on tenant ownership rules from Phase 1.
- Phases 3–4 depend on stable event IDs, sale/order states, and inventory invariants.
- Phases 6–7 depend on event ownership, role permissions, and verified financial records.
- Production data migrations require a reviewed before/after plan, backup evidence, and rollback path. No such migration is included in the current change set.

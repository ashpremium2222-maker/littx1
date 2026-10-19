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

## Dependencies and migration safeguards

- Phase 2 depends on tenant ownership rules from Phase 1.
- Phases 3–4 depend on stable event IDs, sale/order states, and inventory invariants.
- Phases 6–7 depend on event ownership, role permissions, and verified financial records.
- Production data migrations require a reviewed before/after plan, backup evidence, and rollback path. No such migration is included in the current change set.

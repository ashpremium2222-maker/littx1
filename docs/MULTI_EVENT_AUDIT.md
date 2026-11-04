# Stageway Multi-Event Audit

> **Historical audit:** This audit predates Phase 21. Statements below describe the earlier implementation and are not current-state claims. See `PHASE21_HARDCODED_EVENT_AND_RICHAUTOMATE_REMOVAL.md` for current event-driven behavior and compatibility constants.

**Audit date:** 2026-10-19  
**Phase:** 2 foundation in progress; completion criteria are not yet met.  
**Data access:** Local mock-backed HTTP tests only. No production database, payments, or notification provider was accessed.

## Confirmed event-specific business logic

| Location | Issue and impact | Phase 2 change / intended fix |
|---|---|---|
| `staging/server/server.js` event resolver and `getEventPricing` | Pricing silently fell back to a canonical Dholida event, wrote hardcoded pass prices into events, and rewrote known price values. A request for an unknown event could select another event's categories. | Resolution is now exact by event ID, slug, name, or stored legacy alias. Pricing only reads persisted categories or legacy tier records; there is no automatic default event or hardcoded price migration. |
| `staging/server/server.js` `GET /api/events` | Public event list was limited to the Dholida dashboard event and returned a static venue tagline. | Returns eligible public published events with event data and persisted ticket categories; supports search, city, category, and date query filters. A detail route resolves by ID, slug, name, or stored alias. Legacy active records without lifecycle fields remain visible for compatibility. |
| `staging/server/server.js` `/api/create-order` and PR checkout | Customer checkout ignored the selected event and used global/default event pricing. PR checkout also used fixed ticket choices. | Public and PR checkouts now require an event and category reference. The server resolves final price, sale window, category status, customer limit, and configured remaining inventory. Orders retain canonical event and category IDs plus the legacy event label. PR events are filtered to the partner's company. |
| `staging/server/db.js` event and sale schemas | Events lacked stable public slugs, lifecycle, organizer, date/location/category metadata, and first-class ticket-category inventory fields. Sales only stored a free-form event string. | Added slug, organizer/company ownership, lifecycle, visibility, publication timestamps, event metadata, category configuration, and additive `Sale.eventId` / `Sale.ticketCategoryId` references. Existing `Sale.event` stays in place. |
| `staging/combined-app/src/admin-dash/pages/Events.tsx` | Event dashboard and detail statistics normalized/filtered all events to Dholida and contained a fixed lineup. | Dashboard now aggregates all sale event names and loads the authorized event list. Basic draft creation and lifecycle actions use server-side event APIs. |
| `staging/combined-app/src/components/EventMarketplace.tsx`, `src/App.tsx`, `index.html`, `vercel.json` | No mounted customer marketplace existed; homepage displayed one fixed event and a WhatsApp link. The customer dashboard called missing event/booking endpoints. | Added `/events` catalogue/detail/checkout UI, event-name search, city/category/date filters, event-specific persisted ticket selection, and server-priced Razorpay checkout. Homepage event cards render from the public API. Customer booking history/account ownership remains unimplemented. |
| `staging/combined-app/src/pr-portal/PRApp.tsx` | PR selling UI exposed two fixed prices and a Dholida description. | PR seller now selects from events/categories assigned to their company and submits canonical event/category IDs. |

## Related references classified

### Retained as historical data or event branding

- Dholida event names, images, seeded example data, and the `DGR-` ticket ID prefix remain for existing tickets, links, and the current event listing.
- Legacy sale `event` strings, `tiers`, and `ticketTypes` remain readable. They are not overwritten by this change.
- Explicit Dholida influencer invitation copy in `staging/server/mailer.js` remains a campaign-specific notification, not the generic purchase mail path.
- Security regression fixtures use existing sample event names and ticket IDs.

### Still event-specific and requiring follow-up

- `staging/server/ticket.js` still has a Dholida-themed PDF header, event date/time/venue defaults, banner selection, and limited gender-to-ticket labels. New multi-event tickets can still receive incorrect printed details until the ticket template accepts and renders the selected event record end-to-end.
- `staging/server/config/seller-mobile.json` and native seller application content remain tied to the current Dholida event/category list. Native seller event discovery is not implemented.
- Scanner assignment remains configured with event names via `SCANNER_EVENT_NAMES`; it is not persisted as event-ID/staff assignment records.
- Older manual-ticket and Shadow/admin UI flows still contain event names, tier labels, and fixed form conditions. The corresponding inventory/assignment workflows need conversion and tests.
- Several admin analytics components classify Freshers, Aura, and Dholida sales by name and use legacy sample labels. They need canonical event IDs and event-scoped report filters.
- Existing MongoDB deployments may retain the old unique `Event.name` index even though the new schema no longer declares it. Duplicate event titles across organizers remain blocked until the migration below is reviewed and run.

## Data and migration safety

- The schema changes are additive. Existing order IDs, payment IDs, ticket IDs, QR contents, and free-form event labels are not modified by application startup.
- `staging/server/migrations/20261019_multi_event_foundation.js` is a dry-run-by-default migration. It maps only exact unique event names or explicit legacy names, maps ticket categories only on a unique exact match, and reports unmapped/ambiguous records without guessing. It does not regenerate QR codes or change payment/ticket status.
- Run the script first without arguments against a verified backup. After reviewing its report, `--apply` fills missing slug/organizer/event/category references and creates the slug/owner indexes; it drops the legacy unique-name index only after checking slug conflicts. It has not been run against production.
- MongoDB has no relational foreign-key enforcement here; event/category references are validated in application code. Orphan reporting in the migration is the current historical-data safeguard.

## Verification and remaining criteria

- `staging/server/test/security.test.js` now exercises different organizers, draft/private/cancelled public exclusion, ID and slug lookup, organizer list/update scope, publication authorization, event-specific price selection, invalid category rejection, finite availability checks, and preservation of an order's category.
- Existing Phase 1 security regressions remain in the same suite.
- Verification on 2026-10-19: `npm test` in `staging/server` passed 15/15; Node syntax checks passed for server, DB, migration, and test files; `npm run build` in `staging/combined-app` passed with a large-chunk warning; `git diff --check` passed. Tests use isolated mock sales; no production services were accessed.
- Remaining acceptance work: production-grade atomic inventory reservations and expiry/release; UI editing for all event fields/categories; full event-ID sales/report/scanner assignment scope; dynamic PDF and generic notification details; native seller/scanner event selection; migration execution/rollback evidence; and customer booking ownership.
- Phase 2 must remain open until those workflows and concurrency/data migration checks are complete.

## Phase 3 carry-over update — 2026-10-19

The Phase 3 working tree now implements concurrency-safe inventory reservations and expiry/release for public and PR online checkout, with reservations counted in individual admissions. This closes the inventory-reservation item for those online paths only; PR cash requests remain pending admin approval without a hold, and manual/seller issuance paths still need separate inventory policy and integration. Event editor/reporting/staff assignment, event-specific ticket templates, native client updates, customer-owned booking retrieval, and migration validation remain open as previously listed. Full Phase 2 acceptance is therefore still not met.
# Historical audit notice

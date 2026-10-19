# Stageway Phase 11 — Legacy Ticket-Link Security

**Status:** Transition plan approved; legacy cutoff not applied. Production remains **NO-GO** until staging acceptance and a separately approved cutoff date.

## Access-path audit

| Access path | Current behavior / caller | Distribution and migration notes |
| --- | --- | --- |
| `GET /view/:ticketId` | Serves the React shell. The public ticket screen fetches the JSON endpoint below. | Linked by historic ticket emails and WhatsApp templates. The scanner Android app recognizes `/view/<id>` strings when parsing a ticket QR/deep link. This page itself is not scanner authorization. |
| `GET /api/ticket/:ticketId` | Short ID alone returns attendee name, event, ticket type, amount, quantity, scan state/time and issue time. | Called by the public ticket view screen. No caller identity is checked. |
| `GET /api/ticket/:ticketId/download` | Short ID alone downloads/rebuilds the PDF, which contains attendee data and QR identity. | Generated for payment verification/webhook responses, checkout success, manual and shadow issuance, PR cash approval, admin mail and WhatsApp delivery. Also linked from customer dashboard and PR/admin ticket/order screens. Email attaches a PDF as well as its link. Previously sent WhatsApp messages and saved/printed PDFs cannot be recalled. |
| `POST /api/ticket/:ticketId/resend` | Short ID alone sends email to the stored sale recipient and attempts WhatsApp to the stored phone; it records delivery status. The caller cannot choose an arbitrary address, but does not prove access to the stored recipient. | Used by customer TicketCard and admin/dev-admin/partner-admin, PR and Shadow portal controls. `shadowbyash-native-android` also calls the route directly. |
| Email template | Existing template used a `/view/:ticketId` link and attached the PDF. | New email links now point to `/bookings` for OTP recovery; the PDF attachment and QR are unchanged. Old messages remain bearer links until cutoff. |
| WhatsApp template/service | Uses a view URL plus an optional PDF URL (attachment is provider-configurable). | New view links now point to `/bookings`; configured PDF attachment URLs still use the legacy route until the attachment contract is staging-verified. Historic messages cannot be recalled. |
| Customer booking history | OTP request and one-time OTP verification return bookings. The current PDF token is HMAC-signed, 15-minute, ticket/email-bound. | New scoped view and resend tokens and endpoints now complement the PDF endpoint. Tokens travel in Authorization headers and are not URL parameters. Resend targets only the verified booking email. |
| Seller/PR/admin/shadow issuance and scanning | Issuance delivers the same ticket ID and QR identity. Scanner validation looks up that identity and applies `admissionCount`/quantity. | Seller/PR/manual flows create tickets; PR approval and shadow/admin workflows also distribute PDFs. Scanner-native app may parse historic view links, then scan ticket identity. Do not rotate IDs or change QR payloads. Role-scoped PDF/resend endpoints now exist for master/company admins, organizers, the owning PR, the issuing seller, and Shadow; admin, PR, and Shadow UI actions use them. |

Repository-wide searches covered server routes, React clients, mail and WhatsApp services, Vercel routing, scanner-native Android, and Shadow native Android. Source inspection cannot reveal external copies of provider templates or all already-delivered links/PDFs.

## Transition options and decision

The owner selected **secure replacements plus customer notice and an announced cutoff**. Do not apply a cutoff until the replacement paths and real staging workflows pass, customer notice is ready, and a cutoff date is separately confirmed. A compatibility window without a date remains an option if staging or customer communication needs more time. Keeping the current routes forever leaves guessable short IDs as bearer authorization. Rotating IDs is not recommended and is not part of this plan.

The transition keeps every issued ticket ID, QR payload, group admission count, scan record, and printed/PDF ticket identity. Staff replacements must enforce role plus company/event/sale ownership. Customer recovery must remain available through OTP for tickets issued via online, seller, PR, and admin paths whose stored recipient email is valid. If the customer no longer controls that mailbox, support needs a separately verified recovery procedure; short ID alone must not be the exception.

## Non-breaking changes implemented

- Customer booking history now issues separate, purpose-bound, 15-minute HMAC tokens for view, PDF download, and resend. Every token is bound to both ticket ID and normalized recipient email. View/download/resend endpoints reject missing, expired, wrong-purpose, wrong-ticket, and wrong-recipient tokens. Responses are non-cacheable.
- OTP-authorized resend sends only to the stored booking email. It is rate-limited (3 per 15 minutes per client through the shared MongoDB-backed mechanism); it does not accept a destination from the client. Repeat resend is intentionally allowed within the token lifetime so delivery can be retried, with rate limiting.
- Role-scoped staff PDF and resend endpoints are available for admin/organizer, seller, PR and Shadow sessions, with shared MongoDB-backed limits of 20 downloads and 3 resends per 15 minutes per client IP. Admin, PR and Shadow portal resend/download controls now use scoped endpoints; seller endpoint scope is the issuing seller identity. Resend sends email only and does not fan out to WhatsApp.
- New standard ticket emails link to `/bookings` and direct customers through OTP recovery. The attached PDF and QR identity remain unchanged.
- Customer dashboard download, checkout confirmation, and the legacy app's resend control now route customers to OTP booking recovery.
- Legacy public routes remain active during the compatibility phase. No ticket IDs, QR identities, inventory, payment behavior, or production configuration were changed.

## Remaining work before cutoff

1. Verify role-specific staff behavior for admin, organizer, seller, PR and Shadow in staging, and update any external client copies of old URLs. Repository admin, PR and Shadow React controls now use protected routes; the Shadow Android API contract is updated but its resend action is not wired in the UI.
2. Change WhatsApp optional PDF delivery to the approved secure recovery flow and verify the provider template in staging.
3. Migrate the remaining historic public ticket screen and any in-app direct-ID links to OTP recovery. Keep `/view/:ticketId` available during compatibility; at cutoff, show a recovery landing page rather than exposing ticket details.
4. Prepare customer communication and support recovery instructions, including mailbox-loss cases. Publish a cutoff date only after staging acceptance.
5. In staging, verify MongoDB rate-limit indexes and fail-closed behavior, real controlled email/WhatsApp delivery, token expiry and scope, old links during compatibility, QR scanning for individual/group tickets, offline seller/PR tickets, and authorized staff access.

No legacy route invalidation, forced expiry, production change, migration, deployment, commit, push, or live financial operation was performed.

# Stageway Phase 13 — Secure WhatsApp PDF Delivery

**Decision:** Implemented direct authenticated PDF upload for both outbound provider branches already present in the repository. New attachment sends use provider-hosted media IDs, not public ticket URLs. This does not change ticket authorization, IDs, QR payloads, group quantity, legacy routes, payment behavior, or customer communication. Production remains **NO-GO** pending staging acceptance.

## Existing delivery trace

| Code location | Behavior before Phase 13 |
| --- | --- |
| `staging/server/whatsapp-service.js` — `sendTicketWhatsApp()` | Normalizes the recipient, selects direct Meta when both `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are configured; otherwise selects RichAutomate when `RICHAUTOMATE_API_KEY` exists. It passes the public bookings link as template body variable 7. |
| `staging/server/whatsapp-service.js` — `sendViaMetaCloudApi()` | Calls `POST https://graph.facebook.com/v21.0/{phone-number-id}/messages` with the system-user bearer token, approved template, and body variables. When `WHATSAPP_ATTACH_PDF=true`, the document header previously contained `document.link` with a URL. Meta's documented link flow requires a publicly accessible document URL; the old URL resolved to the public legacy download route. |
| `staging/server/whatsapp-service.js` — `sendViaRichAutomate()` | Calls `POST https://richautomate.in/api/v1/send-template` with bearer API key and template variables. When `RICHAUTOMATE_ATTACH_PDF=true`, it previously sent `header_media_type=document`, `header_media_url`, and filename. RichAutomate documentation says `header_media_url` must be publicly accessible. |
| `staging/server/server.js` — `sendAndRecordTicketWhatsApp()` | Keeps sending inside the request lifecycle, passes the `/bookings` view URL, and records status/message ID on the sale. It now passes the already-generated local PDF file path to the service instead of passing a download URL for WhatsApp. |
| `staging/server/server.js` — ticket and notification callers | Calls follow payment-confirmation ticket generation, ticket resend, manual seller/PR delivery, Shadow issuance, and admin ticket re-send flows. Every caller now supplies its generated/rebuilt PDF path. If no PDF exists while attachment is enabled, the secure send fails closed. |
| `staging/server/ticket.js` — `buildTicketPdf()` | Generates the ticket PDF under the server's `TICKETS_DIR` and embeds the existing ticket identity/QR and ticket details. The WhatsApp service reads this file during the same request flow; it does not regenerate or modify the PDF. |
| `staging/server/whatsapp-webhook.js` — `whatsappWebhook()` | Verifies the GET handshake token and acknowledges POST events with a summary. It does not currently verify Meta POST signatures or persist delivery-status events. It is not used to authorize or fetch PDFs. |

The only explicit providers in current code are Meta WhatsApp Cloud API and RichAutomate. There is no other provider fallback. Meta has priority when both Meta credentials are configured; RichAutomate is selected only if that pair is incomplete and its API key exists. The configuration diagnostic helper `getWhatsAppConfigurationStatus()` currently checks RichAutomate first, which can report a different preferred provider in a dual-configured environment; avoid dual-provider staging configuration unless testing that mismatch deliberately.

### Legacy URL callers and fallbacks

- Before Phase 13, `sendAndRecordTicketWhatsApp()` passed each caller's `/api/ticket/:ticketId/download` URL to the provider. If no `pdfUrl` was supplied, `sendTicketWhatsApp()` constructed the same legacy URL from `PUBLIC_TICKET_ORIGIN` (defaulting to `https://www.littx.in`). Both provider attachment branches could therefore expose the short-ID bearer route.
- The React public ticket screen, older emails/PDFs, scanner parsing, and non-WhatsApp server download links still use or preserve legacy paths as documented in Phase 11/12. This phase does not alter those consumers.
- WhatsApp text-template body variable 7 points to `/bookings`, not the legacy ticket page. With document attachment disabled, no PDF is uploaded and no legacy download URL is included in the WhatsApp request. With the attachment flag enabled, the new code uploads a PDF and sends a media ID; it has no legacy URL fallback.
- Known WhatsApp callers in `server.js`: payment/webhook issuance around the checkout ticket delivery handler; retry after ticket generation; public legacy resend handler; `deliverManualTicketSale()`; Shadow ticket issuance; and admin re-send. The source sends one template per call; no separate in-code WhatsApp template caller was found. External/provider dashboard copies or templates cannot be enumerated from source.

## Provider capability and design comparison

Provider behavior was checked against the integration's endpoint shape and provider documentation available during this task. Account-specific feature enablement and actual staging delivery are not verified.

| Design | Fit and risks |
| --- | --- |
| **A. Short-lived random public URL** | Would retain remote provider fetching but make the application host ticket data through a public capability URL. It requires provider fetch timing, retries, cache behavior, and log/query redaction guarantees. A retry after one-time use could fail; a reusable window increases exposure. Recipient binding is also difficult because the provider fetches without the attendee's authenticated context. This is not selected. |
| **B. Authenticated server-to-server upload and provider media ID** | Both existing providers document this path. The app sends the local PDF over HTTPS with provider credentials in an Authorization header and puts only the returned media ID in the template's document header. This avoids public URL fetch/auth timing, bearer query parameters, and ticket-ID access. Credentials stay server-side. RichAutomate documents a 30-day media ID lifetime; the current Meta media reference establishes upload and media-ID use but an expiry value is not recorded in the repository, so confirm the current account/API lifetime in staging. The app does not persist either media ID and uses it immediately. Recipient binding is enforced by the outgoing send request and stored ticket recipient, not by the media object itself. Selected. |
| **C. Another provider-supported secure flow** | No additional provider is configured or referenced by the code. Adding a provider would require business, account, template, cost, privacy, credential, operational and support choices with no repository basis. Not selected. |

Provider documentation links:

- [Meta WhatsApp Cloud API media endpoints and document size/type reference](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3) (Meta's WhatsApp Business Platform collection): media upload uses the phone-number media endpoint and bearer authorization; PDF is a supported document format with a 100 MB maximum.
- [Meta-hosted document object for WhatsApp templates](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/DocumentMediaObject/): the template document object accepts an uploaded media `id`; self-hosted `link` is the alternative.
- [RichAutomate API reference](https://richautomate.in/docs/api): documents `POST /api/v1/public/media` multipart `file` upload (100 MB max), authenticated by bearer API key, and `header_media_id` support in media template headers. Its documented media ID expiry is 30 days.
- [RichAutomate API quickstart](https://www.richautomate.in/docs/api-quickstart): documents template header media as either `header_media_url` or `header_media_id`, including template account requirements.

**Account-specific provider caveats:** Meta's current media-ID expiry/reuse duration is not established by the repository and must be confirmed for the configured account. RichAutomate's API reference says Gupshup-hosted numbers may return `media_url` instead of `media_id`. This implementation intentionally accepts only `media_id` for the authenticated ID-based template flow. If the staging account returns only `media_url`, PDF attachment sends fail closed; confirm the account mode and ask RichAutomate for a provider-hosted media-ID path before enabling attachments. Do not switch back to a public URL automatically.

## Implementation and operational semantics

- When the provider's existing attachment flag is `true`, the server reads the ticket PDF from its local path, rejects missing/empty files and files above 100,000,000 bytes, uploads PDF MIME type over HTTPS with the configured provider credential, and uses the returned provider media ID in the template header.
- When the attachment flag is false, template body behavior remains the same and no media upload occurs. The public `/bookings` link remains the template link.
- Media IDs are held only in request memory; they are not written into logs or sale records. API credentials and message payloads are not logged. Application logs report provider acceptance/failure and HTTP status without printing full URLs, bearer tokens, or document/media IDs.
- Direct upload sends the PDF contents (which include attendee details and QR identity) to the configured provider's media service. Confirm the selected staging account's access, retention, residency, and deletion terms before production use; no provider media was uploaded in this phase.
- Upload or missing-file failure prevents the template send. There is no fallback to `header_media_url`, `document.link`, or `/api/ticket/:ticketId/download`. The sale's WhatsApp channel is recorded failed; email remains independent.
- The current delivery path has no automatic retry. A provider timeout can leave the send outcome uncertain. RichAutomate documents an optional idempotency key for send requests, but current resend calls are distinct intended messages and the repository does not yet define per-attempt operation identity. Do not add generic retry/idempotency behavior until duplicate-send and timeout policy is confirmed with the provider/account. Meta message statuses are not persisted by the current webhook.
- This is not a signed URL token design, so it creates no URL token with view/resend scope, ticket binding, expiry or replay semantics. Existing OTP token scopes and legacy routes are unchanged and remain covered by their current security tests.
- The flow uses Node's built-in `fetch`, `FormData`, `Blob` and `AbortSignal.timeout`, and is compatible with the project minimum runtime (Node 20+). Staging runtime must still be recorded.

## Verification state

Automated local provider mocks verify both upload request shapes, bearer-authenticated upload, PDF MIME type, media-ID-only template payload, disabled attachment behavior, no legacy URL fallback, and failure on missing/oversized PDFs or failed uploads. No WhatsApp credentials were read or configured and no network request was made to Meta or RichAutomate. These tests are not provider acceptance or delivery evidence.

See [Phase 13 staging setup](PHASE13_STAGING_SETUP.md) for isolated account setup, staging sequence, evidence and rollback controls. See [Phase 12 acceptance record](PHASE12_STAGING_ACCEPTANCE.md) for prior staging blockers. Legacy short-ID view/download/resend routes remain available and continue to carry bearer-link risk until a separately approved cutoff. **Production remains NO-GO.**

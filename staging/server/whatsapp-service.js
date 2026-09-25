// Outbound ticket delivery — supports RichAutomate (primary) or Meta Cloud API (fallback).
// Uses only Node built-ins so no extra npm install is needed.
const https = require('https');

/**
 * Sends a WhatsApp ticket message to an attendee.
 * Picks RichAutomate if RICHAUTOMATE_API_KEY is set, otherwise falls back to
 * the direct Meta Cloud API.
 *
 * Template variables (in order): name, event, date, venue, pass type, ticket ID, view URL.
 * Never throws — always resolves with { success, ... }.
 */
async function sendTicketWhatsApp({ phone, name, ticketId, event, date, venue, ticketType, viewUrl, pdfUrl }) {
    if (!phone) {
        console.warn(`[WhatsApp] Skipped: no phone number for ticket ${ticketId}.`);
        return { success: false, reason: 'phone_missing' };
    }

    // Normalise to E.164-ish digits (country code included, no +)
    let to = String(phone).replace(/[^0-9]/g, '');
    if (to.length === 10) to = `91${to}`;

    const publicOrigin = (process.env.PUBLIC_TICKET_ORIGIN || 'https://www.littx.in').replace(/\/+$/, '');
    const resolvedViewUrl  = viewUrl  || `${publicOrigin}/view/${ticketId}`;
    const resolvedPdfUrl   = pdfUrl   || `${publicOrigin}/api/ticket/${ticketId}/download`;
    const resolvedName     = name      || 'Guest';
    const resolvedEvent    = event     || 'Dholida Garba Royale';
    const resolvedDate     = date      || '17 OCT 2026 · 4:00 PM';
    const resolvedVenue    = venue     || 'Pethkar Ground, Kothrud, Pune';
    const resolvedType     = ticketType || 'Pass';

    // Variables match the 7 body placeholders in the approved template:
    // {{1}} name  {{2}} event  {{3}} date  {{4}} venue  {{5}} type  {{6}} ticketId  {{7}} link
    const variables = [resolvedName, resolvedEvent, resolvedDate, resolvedVenue, resolvedType, String(ticketId), resolvedViewUrl];

    // Prefer the configured Meta Cloud API when available. This avoids routing
    // production tickets through a RichAutomate account without API access.
    if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
        return sendViaMetaCloudApi({ to, ticketId, variables, pdfUrl: resolvedPdfUrl });
    }

    if (process.env.RICHAUTOMATE_API_KEY) {
        return sendViaRichAutomate({ to, ticketId, variables, pdfUrl: resolvedPdfUrl });
    }

    console.warn('[WhatsApp] Skipped: set RICHAUTOMATE_API_KEY or WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN.');
    return { success: false, reason: 'credentials_missing' };
}

// ---------------------------------------------------------------------------
// Provider A: RichAutomate  (https://richautomate.in)
// ---------------------------------------------------------------------------
async function sendViaRichAutomate({ to, ticketId, variables, pdfUrl }) {
    const apiKey       = process.env.RICHAUTOMATE_API_KEY;
    const templateName = process.env.RICHAUTOMATE_TEMPLATE_NAME;
    const langCode     = process.env.RICHAUTOMATE_TEMPLATE_LANG || 'en_US';

    if (!templateName) {
        console.warn('[RichAutomate] Skipped: RICHAUTOMATE_TEMPLATE_NAME is not set.');
        return { success: false, reason: 'template_name_missing' };
    }

    const body = { phone: to, template: templateName, language: langCode, variables };

    if (process.env.RICHAUTOMATE_ATTACH_PDF === 'true' && pdfUrl) {
        body.header_media_type = 'document';
        body.header_media_url  = pdfUrl;
        body.filename          = `Ticket-${ticketId}.pdf`;
    }

    const payload = JSON.stringify(body);

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'richautomate.in',
            port: 443,
            path: '/api/v1/send-template',
            method: 'POST',
            agent: false,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const messageId = result?.messageId || result?.message_id || result?.id;
                        console.log(`[RichAutomate] Ticket ${ticketId} queued for ${to} (msgId: ${messageId ?? 'n/a'})`);
                        resolve({ success: true, messageId, provider: 'richautomate' });
                    } else {
                        console.error(`[RichAutomate Error] HTTP ${res.statusCode} for ticket ${ticketId}:`, data);
                        resolve({ success: false, error: data, provider: 'richautomate' });
                    }
                } catch (_) {
                    console.error('[RichAutomate Parse Error] for ticket', ticketId, ':', data);
                    resolve({ success: false, error: 'Invalid JSON from RichAutomate', provider: 'richautomate' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[RichAutomate Network Error] ticket', ticketId, ':', err.message);
            resolve({ success: false, error: err.message, provider: 'richautomate' });
        });

        req.on('timeout', () => {
            console.error('[RichAutomate Timeout] ticket', ticketId);
            req.destroy(new Error('RichAutomate request timed out'));
        });

        req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Provider B: Meta Cloud API  (direct)
// ---------------------------------------------------------------------------
async function sendViaMetaCloudApi({ to, ticketId, variables, pdfUrl }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName  = process.env.WHATSAPP_TEMPLATE_NAME;
    const langCode      = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

    if (!templateName) {
        console.warn('[Meta WhatsApp] Skipped: WHATSAPP_TEMPLATE_NAME is not set.');
        return { success: false, reason: 'template_name_missing' };
    }

    // Map the flat variables array to Meta's component parameter format.
    const bodyParameters = variables.map(v => ({ type: 'text', text: String(v) }));

    const components = [{ type: 'body', parameters: bodyParameters }];

    if (process.env.WHATSAPP_ATTACH_PDF === 'true' && pdfUrl) {
        components.unshift({
            type: 'header',
            parameters: [{ type: 'document', document: { link: pdfUrl, filename: `Ticket-${ticketId}.pdf` } }]
        });
    }

    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: { name: templateName, language: { code: langCode }, components }
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'graph.facebook.com',
            port: 443,
            path: `/v21.0/${phoneNumberId}/messages`,
            method: 'POST',
            agent: false,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 12000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const messageId = result?.messages?.[0]?.id;
                        console.log(`[Meta WhatsApp] Ticket ${ticketId} queued for ${to} (msgId: ${messageId})`);
                        resolve({ success: true, messageId, provider: 'meta' });
                    } else {
                        console.error(`[Meta WhatsApp Error] HTTP ${res.statusCode} for ticket ${ticketId}:`, JSON.stringify(result));
                        resolve({ success: false, error: result, provider: 'meta' });
                    }
                } catch (_) {
                    console.error('[Meta WhatsApp Parse Error] ticket', ticketId, ':', data);
                    resolve({ success: false, error: 'Invalid response from Meta API', provider: 'meta' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Meta WhatsApp Network Error] ticket', ticketId, ':', err.message);
            resolve({ success: false, error: err.message, provider: 'meta' });
        });

        req.on('timeout', () => {
            console.error('[Meta WhatsApp Timeout] ticket', ticketId);
            req.destroy(new Error('Meta WhatsApp request timed out'));
        });

        req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Diagnostic: called by the private panel to check config without sending.
// ---------------------------------------------------------------------------
async function getWhatsAppConfigurationStatus() {
    if (process.env.RICHAUTOMATE_API_KEY) {
        const templateName = process.env.RICHAUTOMATE_TEMPLATE_NAME;
        const langCode     = process.env.RICHAUTOMATE_TEMPLATE_LANG;
        return {
            success: true,
            provider: 'richautomate',
            templateConfigured: Boolean(templateName),
            templateName: templateName || null,
            langCode: langCode || null
        };
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        return {
            success: false,
            reason: 'credentials_missing',
            phoneNumberIdConfigured: Boolean(phoneNumberId),
            accessTokenConfigured: Boolean(accessToken)
        };
    }

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'graph.facebook.com',
            port: 443,
            path: `/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
            method: 'GET',
            agent: false,
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 12000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            success: true,
                            provider: 'meta',
                            phoneNumberId,
                            phone: result.display_phone_number,
                            verifiedName: result.verified_name,
                            quality: result.quality_rating,
                            verificationStatus: result.code_verification_status
                        });
                    } else {
                        const error = result?.error || result;
                        resolve({
                            success: false,
                            provider: 'meta',
                            phoneNumberId,
                            error: error?.message || 'Meta rejected the configuration check',
                            code: error?.code || null
                        });
                    }
                } catch (_) {
                    resolve({ success: false, provider: 'meta', phoneNumberId, error: 'Invalid response from Meta API' });
                }
            });
        });
        req.on('error', err => resolve({ success: false, provider: 'meta', phoneNumberId, error: err.message }));
        req.on('timeout', () => req.destroy(new Error('Meta WhatsApp request timed out')));
        req.end();
    });
}

module.exports = { sendTicketWhatsApp, getWhatsAppConfigurationStatus };

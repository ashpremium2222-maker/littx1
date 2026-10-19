// Outbound ticket delivery — Meta Cloud API when configured, otherwise RichAutomate.
// Uses only Node built-ins so no extra npm install is needed.
const https = require('https');
const fs = require('fs');
const path = require('path');

const MAX_PROVIDER_PDF_BYTES = 100_000_000;
const META_GRAPH_VERSION = 'v21.0';

async function readTicketPdf(pdfPath) {
    if (!pdfPath) throw new Error('Ticket PDF path is required when WhatsApp PDF attachment is enabled.');
    let stat;
    let buffer;
    try {
        stat = await fs.promises.stat(pdfPath);
        if (stat.isFile() && stat.size > 0 && stat.size <= MAX_PROVIDER_PDF_BYTES) buffer = await fs.promises.readFile(pdfPath);
    } catch (_) {
        throw new Error('Ticket PDF is unavailable for secure WhatsApp delivery.');
    }
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PROVIDER_PDF_BYTES) {
        throw new Error('Ticket PDF is empty or exceeds the WhatsApp provider document size limit.');
    }
    const basename = path.basename(pdfPath).replace(/[^A-Za-z0-9._-]/g, '_');
    return {
        filename: basename.toLowerCase().endsWith('.pdf') ? basename : `${basename}.pdf`,
        buffer
    };
}

function makePdfForm(pdf, { meta = false } = {}) {
    const form = new FormData();
    if (meta) {
        form.set('messaging_product', 'whatsapp');
        form.set('type', 'application/pdf');
    }
    form.set('file', new Blob([pdf.buffer], { type: 'application/pdf' }), pdf.filename);
    return form;
}

async function responseJson(response) {
    try { return await response.json(); } catch (_) { return null; }
}

async function uploadMetaPdf({ pdfPath, phoneNumberId, accessToken, fetchImpl = fetch }) {
    const pdf = await readTicketPdf(pdfPath);
    const response = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/media`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
        body: makePdfForm(pdf, { meta: true }), signal: AbortSignal.timeout(15000)
    });
    const result = await responseJson(response);
    if (!response.ok || typeof result?.id !== 'string' || !result.id) {
        throw new Error(`Meta WhatsApp media upload failed${response.status ? ` with HTTP ${response.status}` : ''}.`);
    }
    return { id: result.id, filename: pdf.filename };
}

async function uploadRichAutomatePdf({ pdfPath, apiKey, fetchImpl = fetch }) {
    const pdf = await readTicketPdf(pdfPath);
    const response = await fetchImpl('https://richautomate.in/api/v1/public/media', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: makePdfForm(pdf), signal: AbortSignal.timeout(15000)
    });
    const result = await responseJson(response);
    if (!response.ok || typeof result?.media_id !== 'string' || !result.media_id) {
        throw new Error(`RichAutomate WhatsApp media upload failed${response.status ? ` with HTTP ${response.status}` : ''}.`);
    }
    return { id: result.media_id, filename: pdf.filename };
}

async function postJson({ fetchImpl, url, headers, payload, provider }) {
    try {
        const response = await fetchImpl(url, {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
        });
        const result = await responseJson(response);
        if (!response.ok) {
            console.error(`[${provider === 'meta' ? 'Meta WhatsApp' : 'RichAutomate'}] Ticket message rejected with HTTP ${response.status}.`);
            return { success: false, error: `Provider returned HTTP ${response.status}.`, provider };
        }
        const messageId = provider === 'meta'
            ? result?.messages?.[0]?.id
            : result?.messageId || result?.message_id || result?.id;
        console.log(`[${provider === 'meta' ? 'Meta WhatsApp' : 'RichAutomate'}] Ticket message accepted by provider.`);
        return { success: true, messageId, provider };
    } catch (_) {
        console.error(`[${provider === 'meta' ? 'Meta WhatsApp' : 'RichAutomate'}] Ticket delivery request failed.`);
        return { success: false, error: 'Provider request failed.', provider };
    }
}

/**
 * Sends a WhatsApp ticket message to an attendee.
 * Picks RichAutomate if RICHAUTOMATE_API_KEY is set, otherwise falls back to
 * the direct Meta Cloud API.
 *
 * Template variables (in order): name, event, date, venue, pass type, ticket ID, view URL.
 * Never throws — always resolves with { success, ... }.
 */
async function sendTicketWhatsApp({ phone, name, ticketId, event, date, venue, ticketType, viewUrl, pdfPath, fetchImpl = fetch }) {
    if (!phone) {
        console.warn('[WhatsApp] Skipped ticket delivery because the recipient phone is missing.');
        return { success: false, reason: 'phone_missing' };
    }

    // Normalise to E.164-ish digits (country code included, no +)
    let to = String(phone).replace(/[^0-9]/g, '');
    if (to.length === 10) to = `91${to}`;

    const publicOrigin = (process.env.PUBLIC_TICKET_ORIGIN || 'https://www.littx.in').replace(/\/+$/, '');
    const resolvedViewUrl  = viewUrl  || `${publicOrigin}/bookings`;
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
        try { return await sendViaMetaCloudApi({ to, ticketId, variables, pdfPath, fetchImpl }); }
        catch (_) {
            console.error('[Meta WhatsApp] Secure ticket delivery failed.');
            return { success: false, reason: 'secure_document_delivery_failed', provider: 'meta' };
        }
    }

    if (process.env.RICHAUTOMATE_API_KEY) {
        try { return await sendViaRichAutomate({ to, ticketId, variables, pdfPath, fetchImpl }); }
        catch (_) {
            console.error('[RichAutomate] Secure ticket delivery failed.');
            return { success: false, reason: 'secure_document_delivery_failed', provider: 'richautomate' };
        }
    }

    console.warn('[WhatsApp] Skipped: set RICHAUTOMATE_API_KEY or WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN.');
    return { success: false, reason: 'credentials_missing' };
}

// ---------------------------------------------------------------------------
// Provider A: RichAutomate  (https://richautomate.in)
// ---------------------------------------------------------------------------
async function sendViaRichAutomate({ to, ticketId, variables, pdfPath, fetchImpl }) {
    const apiKey       = process.env.RICHAUTOMATE_API_KEY;
    const templateName = process.env.RICHAUTOMATE_TEMPLATE_NAME;
    const langCode     = process.env.RICHAUTOMATE_TEMPLATE_LANG || 'en_US';

    if (!templateName) {
        console.warn('[RichAutomate] Skipped: RICHAUTOMATE_TEMPLATE_NAME is not set.');
        return { success: false, reason: 'template_name_missing' };
    }

    const body = { phone: to, template: templateName, language: langCode, variables };

    if (process.env.RICHAUTOMATE_ATTACH_PDF === 'true') {
        const media = await uploadRichAutomatePdf({ pdfPath, apiKey, fetchImpl });
        body.header_media_type = 'document';
        body.header_media_id = media.id;
        body.filename = `Ticket-${ticketId}.pdf`;
    }

    return postJson({ fetchImpl, url: 'https://richautomate.in/api/v1/send-template',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        payload: body, provider: 'richautomate' });
}

// ---------------------------------------------------------------------------
// Provider B: Meta Cloud API  (direct)
// ---------------------------------------------------------------------------
async function sendViaMetaCloudApi({ to, ticketId, variables, pdfPath, fetchImpl }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';
    if (!templateName) {
        console.warn('[Meta WhatsApp] Skipped: WHATSAPP_TEMPLATE_NAME is not set.');
        return { success: false, reason: 'template_name_missing' };
    }
    const bodyParameters = variables.map(value => ({ type: 'text', text: String(value) }));
    const components = [{ type: 'body', parameters: bodyParameters }];
    if (process.env.WHATSAPP_ATTACH_PDF === 'true') {
        const media = await uploadMetaPdf({ pdfPath, phoneNumberId, accessToken, fetchImpl });
        components.unshift({ type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename: `Ticket-${ticketId}.pdf` } }] });
    }
    const payload = {
        messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
        template: { name: templateName, language: { code: langCode }, components }
    };
    return postJson({
        fetchImpl,
        url: `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        payload,
        provider: 'meta'
    });
}

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

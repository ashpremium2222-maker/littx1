// Outbound WhatsApp sender supporting RichAutomate & Meta Cloud API
const https = require('https');

/**
 * Sends a ticket confirmation message via RichAutomate or Meta Cloud API.
 * 
 * Priority:
 * 1. If RICHAUTOMATE_API_KEY is provided, uses RichAutomate's official REST API (/api/v1/send-template).
 * 2. Otherwise, uses direct Meta Cloud API (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID).
 * 
 * @param {Object} params
 * @param {string} params.phone - Attendee phone number
 * @param {string} params.name - Attendee name
 * @param {string} params.ticketId - Ticket ID (e.g. DGR-XXXXXX)
 * @param {string} [params.event] - Event name
 * @param {string} [params.date] - Event date & time
 * @param {string} [params.venue] - Event venue
 * @param {string} [params.ticketType] - Pass type (e.g. GA Single, VIP Single)
 * @param {string} [params.viewUrl] - Public ticket web URL
 * @param {string} [params.pdfUrl] - Downloadable ticket PDF URL
 */
async function sendTicketWhatsApp({ phone, name, ticketId, event, date, venue, ticketType, viewUrl, pdfUrl }) {
    if (!phone) {
        console.warn(`[WhatsApp] Skipped: No phone number provided for ticket ${ticketId}.`);
        return { success: false, reason: 'phone_missing' };
    }

    // Sanitize phone number: strip non-numeric characters
    let to = String(phone).replace(/[^0-9]/g, '');
    // If standard 10-digit Indian number without country code, prefix with 91
    if (to.length === 10) {
        to = `91${to}`;
    }

    const attendeeName = name || 'Guest';
    const eventName = event || 'Dholida Garba Royale';
    const eventDate = date || '17 OCT 2026 · 4:00 PM';
    const eventVenue = venue || 'Pethkar Ground, Kothrud, Pune';
    const passType = ticketType || 'Pass';
    const ticketLink = viewUrl || `https://littx1.vercel.app/view/${ticketId}`;
    const downloadLink = pdfUrl || `https://littx1.vercel.app/api/ticket/${ticketId}/download`;

    // 1. Check if RichAutomate is configured
    const richApiKey = process.env.RICHAUTOMATE_API_KEY;
    if (richApiKey) {
        return sendViaRichAutomate({
            to,
            attendeeName,
            eventName,
            eventDate,
            eventVenue,
            passType,
            ticketId,
            ticketLink,
            downloadLink
        });
    }

    // 2. Fallback to direct Meta Cloud API if configured
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (phoneNumberId && accessToken) {
        return sendViaMetaCloudApi({
            to,
            phoneNumberId,
            accessToken,
            attendeeName,
            eventName,
            eventDate,
            eventVenue,
            passType,
            ticketId,
            ticketLink
        });
    }

    console.warn('[WhatsApp] Skipped: Neither RICHAUTOMATE_API_KEY nor WHATSAPP_ACCESS_TOKEN configured in environment.');
    return { success: false, reason: 'credentials_missing' };
}

/**
 * Send via RichAutomate REST API
 */
async function sendViaRichAutomate({ to, attendeeName, eventName, eventDate, eventVenue, passType, ticketId, ticketLink, downloadLink }) {
    const apiKey = process.env.RICHAUTOMATE_API_KEY;
    const template = process.env.RICHAUTOMATE_TEMPLATE_NAME || process.env.WHATSAPP_TEMPLATE_NAME || 'ticket_confirmation_dgr';
    const language = process.env.RICHAUTOMATE_TEMPLATE_LANG || process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    const payloadObj = {
        phone: to,
        template: template,
        language: language,
        variables: [
            attendeeName,
            eventName,
            eventDate,
            eventVenue,
            passType,
            ticketId,
            ticketLink
        ]
    };

    // If PDF attachment is supported in template header
    if (process.env.RICHAUTOMATE_ATTACH_PDF === 'true' && downloadLink) {
        payloadObj.header_media_type = 'document';
        payloadObj.header_media_url = downloadLink;
        payloadObj.filename = `Ticket-${ticketId}.pdf`;
    }

    const payload = JSON.stringify(payloadObj);

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'richautomate.in',
            port: 443,
            path: '/api/v1/send-template',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
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
                        console.log(`[RichAutomate] WhatsApp sent to ${to} (Ticket: ${ticketId}, MessageId: ${result?.message_id})`);
                        resolve({ success: true, messageId: result?.message_id, provider: 'richautomate' });
                    } else {
                        console.error(`[RichAutomate API Error] HTTP ${res.statusCode}:`, JSON.stringify(result));
                        resolve({ success: false, error: result, provider: 'richautomate' });
                    }
                } catch (e) {
                    console.error('[RichAutomate Parse Error]', data);
                    resolve({ success: false, error: 'Invalid response from RichAutomate' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[RichAutomate Network Error]', err.message);
            resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Send via direct Meta Cloud API
 */
async function sendViaMetaCloudApi({ to, phoneNumberId, accessToken, attendeeName, eventName, eventDate, eventVenue, passType, ticketId, ticketLink }) {
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'ticket_confirmation_dgr';
    const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: langCode },
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: attendeeName },
                        { type: 'text', text: eventName },
                        { type: 'text', text: eventDate },
                        { type: 'text', text: eventVenue },
                        { type: 'text', text: passType },
                        { type: 'text', text: ticketId },
                        { type: 'text', text: ticketLink }
                    ]
                }
            ]
        }
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'graph.facebook.com',
            port: 443,
            path: `/v21.0/${phoneNumberId}/messages`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
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
                        console.log(`[Meta WhatsApp] Ticket sent to ${to} (Ticket: ${ticketId}, MessageId: ${messageId})`);
                        resolve({ success: true, messageId, provider: 'meta' });
                    } else {
                        console.error(`[Meta WhatsApp Error] HTTP ${res.statusCode}:`, JSON.stringify(result));
                        resolve({ success: false, error: result, provider: 'meta' });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response from Meta API' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Meta WhatsApp Network Error]', err.message);
            resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
    });
}

module.exports = { sendTicketWhatsApp };

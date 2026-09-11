// Outbound ticket delivery through the Meta WhatsApp Cloud API.
const https = require('https');

/**
 * Queues a Meta-approved WhatsApp ticket template for an attendee.
 * The template body receives seven values in this order: attendee name, event,
 * date, venue, pass type, ticket ID, and ticket-view link.
 */
async function sendTicketWhatsApp({ phone, name, ticketId, event, date, venue, ticketType, viewUrl, pdfUrl }) {
    if (!phone) {
        console.warn(`[WhatsApp] Skipped: No phone number provided for ticket ${ticketId}.`);
        return { success: false, reason: 'phone_missing' };
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[WhatsApp] Skipped: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required.');
        return { success: false, reason: 'credentials_missing' };
    }

    let to = String(phone).replace(/[^0-9]/g, '');
    if (to.length === 10) to = `91${to}`;

    return sendViaMetaCloudApi({
        to,
        phoneNumberId,
        accessToken,
        attendeeName: name || 'Guest',
        eventName: event || 'Dholida Garba Royale',
        eventDate: date || '17 OCT 2026 · 4:00 PM',
        eventVenue: venue || 'Pethkar Ground, Kothrud, Pune',
        passType: ticketType || 'Pass',
        ticketId,
        ticketLink: viewUrl || `https://littx1.vercel.app/view/${ticketId}`,
        downloadLink: pdfUrl || `https://littx1.vercel.app/api/ticket/${ticketId}/download`
    });
}

async function sendViaMetaCloudApi({ to, phoneNumberId, accessToken, attendeeName, eventName, eventDate, eventVenue, passType, ticketId, ticketLink, downloadLink }) {
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const langCode = process.env.WHATSAPP_TEMPLATE_LANG;
    if (!templateName || !langCode) {
        console.warn('[WhatsApp] Skipped: WHATSAPP_TEMPLATE_NAME and WHATSAPP_TEMPLATE_LANG are required.');
        return { success: false, reason: 'template_configuration_missing' };
    }

    const components = [{
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
    }];

    // Enable only when the approved Meta template has a document header.
    if (process.env.WHATSAPP_ATTACH_PDF === 'true' && downloadLink) {
        components.unshift({
            type: 'header',
            parameters: [{ type: 'document', document: { link: downloadLink, filename: `Ticket-${ticketId}.pdf` } }]
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
                        console.log(`[Meta WhatsApp] Ticket queued for ${to} (Ticket: ${ticketId}, MessageId: ${messageId})`);
                        resolve({ success: true, messageId, provider: 'meta' });
                    } else {
                        console.error(`[Meta WhatsApp Error] HTTP ${res.statusCode}:`, JSON.stringify(result));
                        resolve({ success: false, error: result, provider: 'meta' });
                    }
                } catch (_) {
                    console.error('[Meta WhatsApp Parse Error]', data);
                    resolve({ success: false, error: 'Invalid response from Meta API', provider: 'meta' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Meta WhatsApp Network Error]', err.message);
            resolve({ success: false, error: err.message, provider: 'meta' });
        });
        req.on('timeout', () => req.destroy(new Error('Meta WhatsApp request timed out')));
        req.write(payload);
        req.end();
    });
}

module.exports = { sendTicketWhatsApp };

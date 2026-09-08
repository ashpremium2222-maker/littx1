// Outbound WhatsApp sender using Meta Cloud API (Graph API)
const https = require('https');

/**
 * Sends a ticket confirmation message via WhatsApp Cloud API.
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
 */
async function sendTicketWhatsApp({ phone, name, ticketId, event, date, venue, ticketType, viewUrl }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'ticket_confirmation_dgr';
    const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    if (!phoneNumberId || !accessToken) {
        console.warn('[WhatsApp] Skipped: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set in environment.');
        return { success: false, reason: 'credentials_missing' };
    }

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
                        console.log(`[WhatsApp] Ticket sent to ${to} (Ticket: ${ticketId}, MessageId: ${messageId})`);
                        resolve({ success: true, messageId });
                    } else {
                        console.error(`[WhatsApp API Error] HTTP ${res.statusCode}:`, JSON.stringify(result));
                        resolve({ success: false, error: result });
                    }
                } catch (e) {
                    console.error('[WhatsApp Parse Error]', data);
                    resolve({ success: false, error: 'Invalid response from Meta API' });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[WhatsApp Network Error]', err.message);
            resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
    });
}

module.exports = { sendTicketWhatsApp };

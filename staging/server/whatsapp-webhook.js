const crypto = require('crypto');

/**
 * Meta WhatsApp Cloud API webhook handler.
 *
 * Required Vercel environment variable:
 * - WHATSAPP_VERIFY_TOKEN: a high-entropy value chosen by us and entered in
 *   the Meta webhook configuration. It is only used for Meta's GET handshake.
 *
 * This module intentionally does not send WhatsApp messages. Future ticket
 * delivery should be implemented in a separate outbound service that reads
 * WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID from environment
 * variables; neither credential is needed to receive webhooks.
 */

function tokensMatch(expectedToken, suppliedToken) {
    if (typeof expectedToken !== 'string' || !expectedToken || typeof suppliedToken !== 'string') {
        return false;
    }

    const expected = Buffer.from(expectedToken);
    const supplied = Buffer.from(suppliedToken);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function getEventSummary(payload) {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    let changes = 0;
    let incomingMessages = 0;
    let statusUpdates = 0;

    for (const entry of entries) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
            changes += 1;
            const value = change?.value;
            if (Array.isArray(value?.messages)) incomingMessages += value.messages.length;
            if (Array.isArray(value?.statuses)) statusUpdates += value.statuses.length;
        }
    }

    return {
        object: typeof payload?.object === 'string' ? payload.object : 'unknown',
        entryCount: entries.length,
        changeCount: changes,
        incomingMessageCount: incomingMessages,
        statusUpdateCount: statusUpdates,
    };
}

function whatsappWebhook(req, res) {
    // Meta calls GET once while a webhook subscription is being verified.
    if (req.method === 'GET') {
        const mode = req.query?.['hub.mode'];
        const verifyToken = req.query?.['hub.verify_token'];
        const challenge = req.query?.['hub.challenge'];

        if (mode === 'subscribe' && tokensMatch(process.env.WHATSAPP_VERIFY_TOKEN, verifyToken)) {
            return res.status(200).type('text/plain').send(String(challenge ?? ''));
        }

        console.warn('[WhatsApp webhook] Verification rejected');
        return res.sendStatus(403);
    }

    // Meta delivers message and delivery-status events through POST. Acknowledge
    // immediately so Meta does not retry; processing can be added asynchronously
    // later, after durable event storage and signature validation are introduced.
    if (req.method === 'POST') {
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        console.info('[WhatsApp webhook] Event received', getEventSummary(payload));
        return res.status(200).json({ received: true });
    }

    return res.sendStatus(405);
}

module.exports = { whatsappWebhook, getEventSummary };

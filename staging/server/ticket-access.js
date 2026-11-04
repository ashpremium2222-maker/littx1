'use strict';

const crypto = require('crypto');

const CUSTOMER_TICKET_TOKEN_TTL_SECONDS = 15 * 60;

function subjectHash(secret, email) {
    return crypto.createHmac('sha256', secret)
        .update(`customer-email:${String(email || '').trim().toLowerCase()}`)
        .digest('hex');
}

function issueCustomerTicketToken({ ticketId, email, secret, purpose = 'customer_ticket_pdf', now = new Date() }) {
    if (typeof secret !== 'string' || secret.length < 32 || !ticketId || !email) return null;
    if (!['customer_ticket_view', 'customer_ticket_pdf', 'customer_ticket_resend'].includes(purpose)) return null;
    const payload = Buffer.from(JSON.stringify({
        purpose,
        ticketId: String(ticketId),
        subjectHash: subjectHash(secret, email),
        expiresAt: Math.floor(new Date(now).getTime() / 1000) + CUSTOMER_TICKET_TOKEN_TTL_SECONDS
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function verifyCustomerTicketToken({ token, ticketId, email, secret, purpose = 'customer_ticket_pdf', now = new Date() }) {
    if (typeof secret !== 'string' || secret.length < 32 || !['customer_ticket_view', 'customer_ticket_pdf', 'customer_ticket_resend'].includes(purpose) || typeof token !== 'string' || token.length > 2048) return false;
    const [payload, suppliedSignature, extra] = token.split('.');
    if (!payload || !suppliedSignature || extra) return false;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest();
    let actualSignature;
    try { actualSignature = Buffer.from(suppliedSignature, 'base64url'); } catch (_) { return false; }
    if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return false;
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return claims.purpose === purpose && claims.ticketId === ticketId &&
            claims.subjectHash === subjectHash(secret, email) && Number.isInteger(claims.expiresAt) &&
            claims.expiresAt > Math.floor(new Date(now).getTime() / 1000);
    } catch (_) { return false; }
}

module.exports = { CUSTOMER_TICKET_TOKEN_TTL_SECONDS, issueCustomerTicketToken, verifyCustomerTicketToken };

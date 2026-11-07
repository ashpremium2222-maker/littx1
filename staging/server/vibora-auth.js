'use strict';

const crypto = require('crypto');
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function issueViboraSession({ email, sessionVersion = 1, secret, now = new Date() }) {
    if (typeof secret !== 'string' || secret.length < 32) return null;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return null;
    const payload = Buffer.from(JSON.stringify({
        purpose: 'vibora_profile', email: normalizedEmail, sessionVersion,
        expiresAt: Math.floor(new Date(now).getTime() / 1000) + SESSION_TTL_SECONDS
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function verifyViboraSession(token, secret, now = new Date()) {
    if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string' || token.length > 2048) return null;
    const [payload, suppliedSignature, extra] = token.split('.');
    if (!payload || !suppliedSignature || extra) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    let actual;
    try { actual = Buffer.from(suppliedSignature, 'base64url'); } catch (_) { return null; }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims.purpose !== 'vibora_profile' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email || '') ||
            !Number.isInteger(claims.sessionVersion) || !Number.isInteger(claims.expiresAt) ||
            claims.expiresAt <= Math.floor(new Date(now).getTime() / 1000)) return null;
        return { email: claims.email, sessionVersion: claims.sessionVersion };
    } catch (_) { return null; }
}

module.exports = { SESSION_TTL_SECONDS, issueViboraSession, verifyViboraSession };

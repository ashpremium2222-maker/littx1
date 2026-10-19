'use strict';

const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_ISSUE_LIMIT = 3;
const OTP_ISSUE_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ALLOWED_PURPOSES = new Set(['booking_recovery', 'refund_request']);

function keyedHash(secret, value) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('BOOKING_OTP_SECRET must be configured with at least 32 characters.');
    return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function normalizeSubject(subject) {
    const normalized = String(subject || '').trim().toLowerCase();
    if (!normalized || normalized.length > 254) throw new Error('A valid customer verification destination is required.');
    return normalized;
}

async function issueOtp({ subject, purpose, secret, db, now = new Date() }) {
    if (!ALLOWED_PURPOSES.has(purpose)) throw new Error('Unsupported OTP purpose.');
    if (!db) throw new Error('OTP storage is unavailable.');
    const at = new Date(now);
    const normalized = normalizeSubject(subject);
    const subjectHash = keyedHash(secret, `subject:${normalized}`);
    const bucketStartMs = Math.floor(at.getTime() / OTP_ISSUE_WINDOW_MS) * OTP_ISSUE_WINDOW_MS;
    const bucketKey = keyedHash(secret, `rate:${purpose}:${subjectHash}:${bucketStartMs}`);
    const allowed = await db.consumeOtpIssueRateLimit({
        bucketKey, windowStart: new Date(bucketStartMs), windowExpiresAt: new Date(bucketStartMs + OTP_ISSUE_WINDOW_MS), limit: OTP_ISSUE_LIMIT
    });
    if (!allowed) return { ok: false, reason: 'rate_limited' };

    const challengeId = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = keyedHash(secret, `code:${purpose}:${subjectHash}:${challengeId}:${code}`);
    await db.createOtpChallenge({
        challengeId, subjectHash, purpose, codeHash, attempts: 0,
        createdAt: at, expiresAt: new Date(at.getTime() + OTP_TTL_MS), usedAt: null
    });
    // The delivery adapter must send this value and must never return it in an API response or log.
    return { ok: true, challengeId, deliveryCode: code, expiresAt: new Date(at.getTime() + OTP_TTL_MS) };
}

async function verifyOtp({ subject, purpose, challengeId, code, secret, db, now = new Date() }) {
    if (!ALLOWED_PURPOSES.has(purpose) || !/^[0-9]{6}$/.test(String(code || '')) || !challengeId || !db) return { ok: false, reason: 'invalid' };
    const normalized = normalizeSubject(subject);
    const subjectHash = keyedHash(secret, `subject:${normalized}`);
    const codeHash = keyedHash(secret, `code:${purpose}:${subjectHash}:${challengeId}:${code}`);
    return db.consumeOtpChallenge({ challengeId, subjectHash, purpose, codeHash, now: new Date(now), maxAttempts: OTP_MAX_ATTEMPTS });
}

module.exports = { OTP_TTL_MS, OTP_ISSUE_LIMIT, OTP_ISSUE_WINDOW_MS, OTP_MAX_ATTEMPTS, issueOtp, verifyOtp };

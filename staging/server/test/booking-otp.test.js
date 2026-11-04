'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp } = require('../booking-otp');

const secret = 'phase3-otp-test-secret-that-is-at-least-32-characters';

function createIsolatedOtpStore() {
    const challenges = new Map();
    const limits = new Map();
    return {
        challenges,
        consumeOtpIssueRateLimit: async ({ bucketKey, windowStart, windowExpiresAt, limit }) => {
            const current = limits.get(bucketKey);
            if (!current || new Date(current.windowExpiresAt) <= new Date(windowStart)) {
                limits.set(bucketKey, { count: 1, windowExpiresAt });
                return true;
            }
            if (current.count >= limit) return false;
            current.count += 1;
            return true;
        },
        createOtpChallenge: async challenge => { challenges.set(challenge.challengeId, challenge); return challenge; },
        consumeOtpChallenge: async ({ challengeId, subjectHash, purpose, codeHash, now, maxAttempts }) => {
            const challenge = challenges.get(challengeId);
            if (!challenge || challenge.subjectHash !== subjectHash || challenge.purpose !== purpose) return { ok: false, reason: 'invalid' };
            if (challenge.usedAt) return { ok: false, reason: 'used' };
            if (new Date(challenge.expiresAt) <= new Date(now)) return { ok: false, reason: 'expired' };
            if (challenge.attempts >= maxAttempts) return { ok: false, reason: 'locked' };
            if (challenge.codeHash !== codeHash) {
                challenge.attempts += 1;
                return { ok: false, reason: challenge.attempts >= maxAttempts ? 'locked' : 'invalid' };
            }
            challenge.usedAt = now;
            return { ok: true };
        }
    };
}

test('OTP challenges expire and successful codes are single-use without persisting plaintext', async () => {
    const now = new Date('2026-10-20T10:03:00.000Z');
    const subject = `otp-${Date.now()}@example.test`;
    let stored;
    const store = createIsolatedOtpStore();
    const captureStore = { ...store, createOtpChallenge: async challenge => { stored = challenge; return store.createOtpChallenge(challenge); } };
    const created = await issueOtp({ subject, purpose: 'booking_recovery', secret, db: captureStore, now });
    assert.equal(created.ok, true);
    assert.notEqual(stored.codeHash, created.deliveryCode);
    assert.equal(Object.hasOwn(stored, 'deliveryCode'), false);
    const verified = await verifyOtp({ subject, purpose: 'booking_recovery', challengeId: created.challengeId, code: created.deliveryCode, secret, db: store, now: new Date(now.getTime() + 1000) });
    assert.equal(verified.ok, true);
    const repeated = await verifyOtp({ subject, purpose: 'booking_recovery', challengeId: created.challengeId, code: created.deliveryCode, secret, db: store, now: new Date(now.getTime() + 2000) });
    assert.deepEqual(repeated, { ok: false, reason: 'used' });
});

test('OTP issuance is rate-limited and codes expire after ten minutes', async () => {
    const subject = `limit-${Date.now()}@example.test`;
    const now = new Date('2026-10-20T10:03:00.000Z');
    const db = createIsolatedOtpStore();
    const first = await issueOtp({ subject, purpose: 'refund_request', secret, db, now });
    const second = await issueOtp({ subject, purpose: 'refund_request', secret, db, now });
    const third = await issueOtp({ subject, purpose: 'refund_request', secret, db, now });
    const fourth = await issueOtp({ subject, purpose: 'refund_request', secret, db, now });
    assert.equal(first.ok && second.ok && third.ok, true);
    assert.deepEqual(fourth, { ok: false, reason: 'rate_limited' });
    const expired = await verifyOtp({ subject, purpose: 'refund_request', challengeId: first.challengeId, code: first.deliveryCode, secret, db, now: new Date(now.getTime() + 10 * 60 * 1000 + 1) });
    assert.deepEqual(expired, { ok: false, reason: 'expired' });
});

test('OTP verification locks a challenge after five incorrect attempts', async () => {
    const subject = `attempts-${Date.now()}@example.test`;
    const now = new Date('2026-10-20T10:03:00.000Z');
    const db = createIsolatedOtpStore();
    const issued = await issueOtp({ subject, purpose: 'booking_recovery', secret, db, now });
    for (let i = 0; i < 4; i += 1) {
        const result = await verifyOtp({ subject, purpose: 'booking_recovery', challengeId: issued.challengeId, code: '000000', secret, db, now });
        assert.equal(result.ok, false);
    }
    const locked = await verifyOtp({ subject, purpose: 'booking_recovery', challengeId: issued.challengeId, code: '000000', secret, db, now });
    assert.deepEqual(locked, { ok: false, reason: 'locked' });
    const correctAfterLock = await verifyOtp({ subject, purpose: 'booking_recovery', challengeId: issued.challengeId, code: issued.deliveryCode, secret, db, now });
    assert.deepEqual(correctAfterLock, { ok: false, reason: 'locked' });
});

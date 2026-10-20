'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('backend test bootstrap uses test-only credentials and does not load server .env', () => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.SESSION_COOKIE_AUTH_ENABLED, 'false');
    assert.equal(process.env.SESSION_BEARER_CUTOFF_AT, '');
    assert.equal(process.env.SESSION_BEARER_CUTOFF_ENFORCED, 'false');
    assert.equal(process.env.ADMIN_KEY, 'test-legacy-admin-key');
    assert.equal(process.env.RAZORPAY_WEBHOOK_SECRET, 'test-webhook-secret');

    require('../server');

    for (const key of [
        'MONGODB_URI', 'BASE_URL', 'CORS_ORIGINS', 'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'RICHAUTOMATE_API_KEY',
        'SMTP_PASS', 'MAILGUN_API_KEY',
    ]) {
        assert.equal(process.env[key], undefined, key + ' must not be inherited or loaded from .env');
    }
});

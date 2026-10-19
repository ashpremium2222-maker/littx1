const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SCANNER_SESSION_SECRET = 'test-only-session-secret-with-more-than-32-characters';
process.env.SCANNER_PASSWORD = 'test-scanner-password-123';
process.env.SCANNER_EVENT_NAMES = 'DHOLIDA GARBA ROYALE';
process.env.SCANNER_COMPANY_ID = 'littlane';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PRESENTATION_KEY = 'test-presentation-secret';

const app = require('../server');
let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('native scanner session fails closed when scanner password is not configured', async () => {
    const configured = process.env.SCANNER_PASSWORD;
    delete process.env.SCANNER_PASSWORD;
    try {
        const response = await fetch(`${baseUrl}/api/scanner-app-session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: configured }),
        });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).success, false);
    } finally {
        process.env.SCANNER_PASSWORD = configured;
    }
});

test('native scanner requires the configured password and valid session for scan totals', async () => {
    const denied = await fetch(`${baseUrl}/api/scanner-app-session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert.equal(denied.status, 401);

    const unauthenticatedStats = await fetch(`${baseUrl}/api/scan-stats`);
    assert.equal(unauthenticatedStats.status, 401);

    const login = await fetch(`${baseUrl}/api/scanner-app-session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.SCANNER_PASSWORD }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    assert.equal(session.success, true);
    assert.ok(session.token);

    const stats = await fetch(`${baseUrl}/api/scan-stats`, { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(stats.status, 200);
    assert.equal((await stats.json()).success, true);
});

test('PR sales and sale submission routes reject requests without a partner session', async () => {
    const sales = await fetch(`${baseUrl}/api/pr/sales`);
    assert.equal(sales.status, 401);

    for (const route of ['/api/pr/create-order', '/api/pr/cash-request']) {
        const response = await fetch(`${baseUrl}${route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Example', email: 'example@example.test', phone: '1234567890', gender: 'male', prUserId: 'pr1' }),
        });
        assert.equal(response.status, 401, route);
    }
});

test('sensitive master, diagnostics, email and destructive routes reject unauthenticated calls', async () => {
    for (const route of [
        '/api/master/companies',
        '/api/master/companies/littlane/control-center',
        '/api/debug/db-status',
        '/api/test-email?to=attacker@example.test',
        '/api/admin/sellers',
    ]) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 401, route);
    }
    const destructive = await fetch(`${baseUrl}/api/admin/cancel-ticket`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: 'DGR-example' }),
    });
    assert.equal(destructive.status, 401);
    const manual = await fetch(`${baseUrl}/api/admin/generate-ticket`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@example.test', partnerId: 'littlane' }),
    });
    assert.equal(manual.status, 401);
});

test('master routes reject insufficient roles and expired persisted sessions', async () => {
    const db = require('../db');
    const prToken = 'test-pr-session-token';
    await db.setUserSession('test-pr-user', { token: prToken, role: 'pr', companyId: 'littlane', loginAt: new Date().toISOString() });
    const insufficient = await fetch(`${baseUrl}/api/master/companies`, { headers: { 'x-auth-token': prToken } });
    assert.equal(insufficient.status, 403);
    await db.deleteUserSession('test-pr-user');

    const expiredToken = 'test-expired-admin-session-token';
    await db.setUserSession('test-expired-admin', { token: expiredToken, role: 'master_admin', companyId: 'littx', loginAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString() });
    const expired = await fetch(`${baseUrl}/api/master/companies`, { headers: { 'x-auth-token': expiredToken } });
    assert.equal(expired.status, 401);
    await db.deleteUserSession('test-expired-admin');
});

test('scanner cannot scan an event outside its configured company and event assignment', async () => {
    const db = require('../db');
    const orderId = `test-scan-${Date.now()}`;
    const ticketId = `DGR-TEST-${Date.now()}`;
    await db.createSaleRecord({ orderId, ticketId, event: 'Unassigned Event', companyId: 'littlane', status: 'paid', name: 'Test Attendee' });
    try {
        const login = await fetch(`${baseUrl}/api/scanner-app-session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.SCANNER_PASSWORD }),
        });
        const { token } = await login.json();
        const denied = await fetch(`${baseUrl}/api/scan-ticket`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ticketId }),
        });
        assert.equal(denied.status, 403);
        assert.equal((await db.getByTicketId(ticketId)).status, 'paid');
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('Razorpay webhook rejects invalid signatures against the raw request body', async () => {
    const response = await fetch(`${baseUrl}/api/webhook/razorpay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': '0'.repeat(64) },
        body: JSON.stringify({ event: 'payment.captured', payload: {} }),
    });
    assert.equal(response.status, 400);
});

test('order payment claim is atomic and duplicate claims cannot process twice', async () => {
    const db = require('../db');
    const orderId = `test-payment-${Date.now()}`;
    await db.createSaleRecord({ orderId, status: 'created', event: 'Test Event', amount: 1 });
    try {
        const claims = await Promise.all([
            db.atomicClaimOrder(orderId, 'test-payment-a'),
            db.atomicClaimOrder(orderId, 'test-payment-b'),
        ]);
        assert.equal(claims.filter(Boolean).length, 1);
        assert.equal((await db.getByOrderId(orderId)).status, 'paid');
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('CORS does not reflect an untrusted Origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('company admin cannot approve another company ticket or alter its status', async () => {
    const db = require('../db');
    const token = 'test-company-admin-token';
    const orderId = `test-cross-company-${Date.now()}`;
    const ticketId = `DGR-CROSS-${Date.now()}`;
    await db.setUserSession('test-company-admin', { token, role: 'company_admin', companyId: 'littlane', loginAt: new Date().toISOString() });
    await db.createSaleRecord({ orderId, ticketId, event: 'Other Company Event', companyId: 'nitro', status: 'pending_approval', approvalStatus: 'PENDING', deliveryStatus: 'PENDING_APPROVAL' });
    try {
        const response = await fetch(`${baseUrl}/api/admin/ticket-approvals/${orderId}/approve`, { method: 'POST', headers: { 'x-auth-token': token } });
        assert.equal(response.status, 403);
        assert.equal((await db.getByOrderId(orderId)).status, 'pending_approval');
    } finally {
        await db.deleteSaleRecord(orderId);
        await db.deleteUserSession('test-company-admin');
    }
});

test('cash approval transition is atomic and prevents duplicate ticket issuance', async () => {
    const db = require('../db');
    const orderId = `test-cash-approval-${Date.now()}`;
    await db.createSaleRecord({ orderId, status: 'pr_cash_pending', companyId: 'littlane' });
    try {
        const decisions = await Promise.all([
            db.atomicApproveCashSale(orderId, 'admin-a', new Date().toISOString()),
            db.atomicApproveCashSale(orderId, 'admin-b', new Date().toISOString()),
        ]);
        assert.equal(decisions.filter(Boolean).length, 1);
        assert.equal((await db.getByOrderId(orderId)).status, 'paid');
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('presentation key is limited to sanitized presentation sales', async () => {
    const db = require('../db');
    const orderId = `test-presentation-${Date.now()}`;
    await db.createSaleRecord({ orderId, ticketId: `DGR-PRES-${Date.now()}`, name: 'Presenter Guest', email: 'private@example.test', phone: '9999999999', event: 'Dholida Garba Royale', status: 'paid', amount: 100, companyId: 'littlane', showInPres: true });
    try {
        const response = await fetch(`${baseUrl}/api/admin/sales?pres=true`, { headers: { 'x-admin-key': process.env.PRESENTATION_KEY, 'x-presentation': 'true' } });
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.sales.length, 1);
        assert.equal(data.sales[0].email, undefined);
        assert.equal(data.sales[0].phone, undefined);
        const denied = await fetch(`${baseUrl}/api/master/companies?pres=true`, { headers: { 'x-admin-key': process.env.PRESENTATION_KEY, 'x-presentation': 'true' } });
        assert.equal(denied.status, 401);
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('company control center redacts gateway secrets and rejects unsupported config keys', async () => {
    const db = require('../db');
    const token = 'test-master-secret-redaction-token';
    await db.setUserSession('test-master-redaction', { token, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    const original = await db.getCompanyById('littlane');
    const fakeKeySecret = 'test-only-gateway-secret-value';
    const fakeWebhookSecret = 'test-only-webhook-secret-value';
    try {
        await db.updateCompanyConfig('littlane', { razorpayConfig: { enabled: true, keyId: 'rzp_test_public', keySecret: fakeKeySecret, webhookSecret: fakeWebhookSecret, mode: 'TEST' } });
        const response = await fetch(`${baseUrl}/api/master/companies/littlane/control-center`, { headers: { 'x-auth-token': token } });
        assert.equal(response.status, 200);
        const payload = await response.text();
        assert.equal(payload.includes(fakeKeySecret), false);
        assert.equal(payload.includes(fakeWebhookSecret), false);

        const keepSecret = await fetch(`${baseUrl}/api/master/companies/littlane/config`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify({ updates: { razorpayConfig: { enabled: true, keyId: 'rzp_test_public', keySecret: '', mode: 'TEST' } } }),
        });
        assert.equal(keepSecret.status, 200);
        assert.equal((await db.getCompanyById('littlane')).razorpayConfig.keySecret, fakeKeySecret);

        const invalid = await fetch(`${baseUrl}/api/master/companies/littlane/config`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify({ updates: { companyId: 'attacker-company' } }),
        });
        assert.equal(invalid.status, 400);
    } finally {
        await db.updateCompanyConfig('littlane', { razorpayConfig: original.razorpayConfig });
        await db.deleteUserSession('test-master-redaction');
    }
});

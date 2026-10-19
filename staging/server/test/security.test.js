const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.SCANNER_SESSION_SECRET = 'test-only-session-secret-with-more-than-32-characters';
process.env.SCANNER_PASSWORD = 'test-scanner-password-123';
process.env.SCANNER_EVENT_NAMES = 'DHOLIDA GARBA ROYALE';
process.env.SCANNER_COMPANY_ID = 'littlane';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PRESENTATION_KEY = 'test-presentation-secret';
process.env.LITTX_MOCK_SALES_FILE = path.join(os.tmpdir(), `littx-security-test-sales-${process.pid}.json`);

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
    try { fs.unlinkSync(process.env.LITTX_MOCK_SALES_FILE); } catch (_) {}
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

test('multi-event API publishes, scopes and resolves organizer events without name fallbacks', async () => {
    const db = require('../db');
    const companyA = 'phase2-org-a';
    const companyB = 'phase2-org-b';
    await db.ensureCompany(companyA, 'Phase 2 Organizer A');
    await db.ensureCompany(companyB, 'Phase 2 Organizer B');
    const organizerToken = 'phase2-organizer-a-token';
    const masterToken = 'phase2-master-token';
    await db.setUserSession('phase2-organizer-a', { token: organizerToken, role: 'company_admin', companyId: companyA, loginAt: new Date().toISOString() });
    await db.setUserSession('phase2-master', { token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });

    const otherEvent = await db.saveEvent({ id: 'phase2-other-event', slug: 'phase2-other-event', name: 'Organizer B Event', companyId: companyB, organizerId: companyB, active: false, status: 'draft', ticketCategories: [] });
    const create = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken },
        body: JSON.stringify({ companyId: companyB, name: 'Organizer A Event', slug: 'phase2-organizer-a-event', category: 'Music', city: 'Pune', ticketCategories: [{ id: 'general', name: 'General', price: 1250, totalInventory: 100 }] })
    });
    assert.equal(create.status, 201);
    const created = (await create.json()).event;
    assert.equal(created.companyId, companyA, 'company admin cannot select a different organizer');
    assert.equal(created.status, 'draft');

    const ownerUpdate = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(created.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ venue: 'Owner venue', city: 'Pune' })
    });
    assert.equal(ownerUpdate.status, 200);
    assert.equal((await ownerUpdate.json()).event.venue, 'Owner venue');

    const ownList = await fetch(`${baseUrl}/api/admin/events`, { headers: { 'x-auth-token': organizerToken } });
    const ownEvents = (await ownList.json()).events;
    assert.ok(ownEvents.some(event => event.id === created.id));
    assert.equal(ownEvents.some(event => event.id === otherEvent.id), false);

    const forbiddenEdit = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(otherEvent.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ name: 'Stolen Event' })
    });
    assert.equal(forbiddenEdit.status, 403);
    const unauthEdit = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(created.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'No session' })
    });
    assert.equal(unauthEdit.status, 401);

    const submit = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(created.id)}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ status: 'pending_review' })
    });
    assert.equal(submit.status, 200);
    const publishByOrganizer = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(created.id)}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ status: 'published' })
    });
    assert.equal(publishByOrganizer.status, 403);

    const publish = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(created.id)}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken }, body: JSON.stringify({ status: 'published' })
    });
    assert.equal(publish.status, 200);
    const detail = await fetch(`${baseUrl}/api/events/${encodeURIComponent(created.slug)}`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).event.id, created.id);
    const byId = await fetch(`${baseUrl}/api/events/${encodeURIComponent(created.id)}`);
    assert.equal(byId.status, 200);

    await db.saveEvent({ id: 'phase2-private-event', slug: 'phase2-private-event', name: 'Private Phase 2 Event', companyId: companyA, organizerId: companyA, status: 'published', active: true, visibility: 'private', ticketCategories: [] });
    await db.saveEvent({ id: 'phase2-cancelled-event', slug: 'phase2-cancelled-event', name: 'Cancelled Phase 2 Event', companyId: companyA, organizerId: companyA, status: 'cancelled', active: false, visibility: 'public', ticketCategories: [] });

    const publicList = await fetch(`${baseUrl}/api/events?city=Pune&category=Music`);
    const publicEvents = (await publicList.json()).events;
    assert.ok(publicEvents.some(event => event.id === created.id));
    assert.equal(publicEvents.some(event => event.id === otherEvent.id), false, 'draft event must not be public');
    assert.equal(publicEvents.some(event => event.id === 'phase2-private-event'), false, 'private event must not be public');
    assert.equal(publicEvents.some(event => event.id === 'phase2-cancelled-event'), false, 'cancelled event must not be public');
    await db.deleteUserSession('phase2-organizer-a');
    await db.deleteUserSession('phase2-master');
});

test('checkout prices the selected event category and rejects cross-event and unavailable inventory', async () => {
    const db = require('../db');
    const eventId = `phase2-checkout-${Date.now()}`;
    const slug = `${eventId}-slug`;
    await db.saveEvent({
        id: eventId, slug, name: 'Phase 2 Checkout Event', companyId: 'littlane', organizerId: 'littlane',
        status: 'published', active: true, visibility: 'public',
        ticketCategories: [
            { id: 'premium-early', name: 'Premium Early', price: 1299, currency: 'INR', remainingAvailability: 3, totalInventory: 3, maxPerCustomer: 2, status: 'active', groupSize: 1 },
            { id: 'sold-out', name: 'Sold Out', price: 500, currency: 'INR', remainingAvailability: 0, totalInventory: 1, maxPerCustomer: 1, status: 'active', groupSize: 1 }
        ]
    });
    const badCategory = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Buyer', email: 'buyer@example.test', phone: '1234567890', eventId, ticketCategoryId: 'missing', quantity: 1, amount: 1 })
    });
    assert.equal(badCategory.status, 400);
    const soldOut = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Buyer', email: 'buyer@example.test', phone: '1234567890', eventId, ticketCategoryId: 'sold-out', quantity: 1 })
    });
    assert.equal(soldOut.status, 400);

    const orderResponse = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Buyer', email: 'buyer@example.test', phone: '1234567890', eventSlug: slug, ticketCategoryId: 'premium-early', quantity: 2, amount: 1 })
    });
    assert.equal(orderResponse.status, 200);
    const order = await orderResponse.json();
    assert.equal(order.amount, 2598, 'server-side event pricing overrides the client amount');
    const sale = await db.getByOrderId(order.orderId);
    assert.equal(sale.eventId, eventId);
    assert.equal(sale.ticketCategoryId, 'premium-early');
    assert.equal(sale.ticketType, 'Premium Early');

    const masterToken = 'phase2-checkout-master-token';
    await db.setUserSession('phase2-checkout-master', { token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    const removeUsedCategory = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken },
        body: JSON.stringify({ ticketCategories: [] })
    });
    assert.equal(removeUsedCategory.status, 409, 'historical order category cannot be removed');
    await db.deleteUserSession('phase2-checkout-master');
});

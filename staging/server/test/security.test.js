const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { TICKETS_DIR } = require('../ticket');
const { issueCustomerTicketToken } = require('../ticket-access');

process.env.NODE_ENV = 'test';
process.env.SCANNER_SESSION_SECRET = 'test-only-session-secret-with-more-than-32-characters';
process.env.SCANNER_PASSWORD = 'test-scanner-password-123';
process.env.SCANNER_EVENT_NAMES = 'DHOLIDA GARBA ROYALE';
process.env.SCANNER_COMPANY_ID = 'littlane';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PRESENTATION_KEY = 'test-presentation-secret';
process.env.LITTX_MOCK_SALES_FILE = path.join(os.tmpdir(), `littx-security-test-sales-${process.pid}-${crypto.randomUUID()}.json`);

const db = require('../db');
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

test('booking recovery reports the same provider-unavailable response without exposing booking existence', async () => {
    process.env.BOOKING_OTP_SECRET = 'test-only-booking-otp-secret-with-more-than-32-characters';
    const request = email => fetch(`${baseUrl}/api/customer/bookings/recovery/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const [one, two] = await Promise.all([request('known@example.test'), request('unknown@example.test')]);
    assert.equal(one.status, 503);
    assert.equal(two.status, 503);
    assert.deepEqual(await one.json(), await two.json());
});

test('booking history cannot be retrieved by supplying a guessed order reference', async () => {
    const response = await fetch(`${baseUrl}/api/customer/bookings/recovery/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'customer@example.test', challengeId: 'order-guessed-123', code: '123456', orderId: 'order-guessed-123' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, message: 'Verification failed. Request a new code and try again.' });
});

test('verified ticket PDF access requires an unexpired token bound to ticket and booking email', async () => {
    const secret = process.env.BOOKING_OTP_SECRET || 'test-only-booking-otp-secret-with-more-than-32-characters';
    process.env.BOOKING_OTP_SECRET = secret;
    const orderId = `security-ticket-download-${Date.now()}`;
    const ticketId = `DGR-${crypto.randomUUID()}`;
    const email = 'verified-customer@example.test';
    await db.createSaleRecord({ orderId, ticketId, email, name: 'Verified Customer', event: 'Test Event', ticketType: 'General', status: 'ticket_generated', paymentStatus: 'paid', quantity: 2, admissionCount: 2, amount: 246, createdAt: new Date().toISOString() });
    const token = issueCustomerTicketToken({ ticketId, email, secret });
    try {
        const denied = await fetch(`${baseUrl}/api/customer/bookings/ticket-download`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId }),
        });
        assert.equal(denied.status, 401);

        const wrongSubject = issueCustomerTicketToken({ ticketId, email: 'other@example.test', secret });
        const mismatched = await fetch(`${baseUrl}/api/customer/bookings/ticket-download`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrongSubject}` }, body: JSON.stringify({ ticketId }),
        });
        assert.equal(mismatched.status, 401);

        const allowed = await fetch(`${baseUrl}/api/customer/bookings/ticket-download`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ticketId }),
        });
        assert.equal(allowed.status, 200);
        assert.match(allowed.headers.get('content-type') || '', /application\/pdf/);
        assert.match(allowed.headers.get('cache-control') || '', /no-store/);
    } finally {
        await db.deleteSaleRecord(orderId);
        try { fs.unlinkSync(path.join(TICKETS_DIR, `${ticketId}.pdf`)); } catch (_) {}
    }
});

test('production API fails closed instead of using local mock storage without MongoDB configuration', async () => {
    const previousMode = process.env.NODE_ENV;
    const previousConfigured = db.hasConfiguredMongo;
    process.env.NODE_ENV = 'production';
    db.hasConfiguredMongo = false;
    try {
        const response = await fetch(`${baseUrl}/api/events`);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { success: false, message: 'Database service is not configured.' });
    } finally {
        process.env.NODE_ENV = previousMode;
        db.hasConfiguredMongo = previousConfigured;
    }
});

test('cancelled tickets cannot be viewed or downloaded from a stale bearer link', async () => {
    const orderId = `security-cancelled-ticket-${Date.now()}`;
    const ticketId = `DGR-${crypto.randomUUID()}`;
    await db.createSaleRecord({ orderId, ticketId, email: 'cancelled@example.test', name: 'Cancelled Customer', event: 'Test Event', status: 'cancelled', paymentStatus: 'paid', quantity: 1, amount: 100, createdAt: new Date().toISOString() });
    try {
        const view = await fetch(`${baseUrl}/api/ticket/${ticketId}`);
        const download = await fetch(`${baseUrl}/api/ticket/${ticketId}/download`);
        assert.equal(view.status, 410);
        assert.equal(download.status, 410);
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('sensitive master, diagnostics, email and destructive routes reject unauthenticated calls', async () => {
    for (const route of [
        '/api/master/companies',
        '/api/master/overview',
        '/api/master/companies/littlane/control-center',
        '/api/debug/db-status',
        '/api/test-email?to=attacker@example.test',
        '/api/admin/sellers',
        '/api/admin/refund-requests',
        '/api/admin/reconciliation',
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

test('master overview reports verified channel and admission totals without exposing audit values', async () => {
    const db = require('../db');
    const suffix = Date.now();
    const eventId = `test-phase5-overview-${suffix}`;
    const masterId = `test-phase5-master-${suffix}`;
    const token = `test-phase5-token-${suffix}`;
    const onlineOrder = `test-phase5-online-${suffix}`;
    const offlineOrder = `test-phase5-offline-${suffix}`;
    const pendingOrder = `test-phase5-pending-${suffix}`;
    await db.setUserSession(masterId, { userId: masterId, token, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.createUser({ userId: `test-phase5-seller-${suffix}`, role: 'seller', companyId: 'phase5-company', active: true });
    await db.createUser({ userId: `test-phase5-pr-${suffix}`, role: 'pr', companyId: 'phase5-company', active: true });
    await db.saveEvent({ id: eventId, slug: eventId, name: eventId, companyId: 'phase5-company', organizerId: 'phase5-company', status: 'pending_review', active: false, ticketCategories: [{ id: 'cat-5', name: 'Group Five', price: 500, totalInventory: 10, remainingAvailability: 2, groupSize: 5 }] });
    await db.createSaleRecord({ orderId: onlineOrder, ticketId: `DGR-ONLINE-${suffix}`, eventId, event: eventId, companyId: 'phase5-company', status: 'emailed', paymentStatus: 'paid', paymentMethod: 'razorpay', amount: 500, quantity: 1, admissionCount: 5 });
    await db.createSaleRecord({ orderId: offlineOrder, ticketId: `DGR-OFFLINE-${suffix}`, eventId, event: eventId, companyId: 'phase5-company', status: 'ticket_generated', paymentStatus: 'paid', paymentMethod: 'cash', source: 'offline_pr', amount: 500, quantity: 1, admissionCount: 5, prUserId: `test-phase5-pr-${suffix}` });
    await db.createSaleRecord({ orderId: pendingOrder, ticketId: `DGR-PENDING-${suffix}`, eventId, event: eventId, companyId: 'phase5-company', status: 'pr_cash_pending', paymentStatus: 'pending', paymentMethod: 'cash', amount: 500, quantity: 1, admissionCount: 5, manualReview: true });
    await db.createAuditLog({ adminUser: masterId, companyId: 'phase5-company', eventId, category: 'PHASE5_AUDIT_TEST', fieldChanged: 'status', reason: 'safe test record', newValue: 'SECRET_MUST_NOT_BE_RETURNED' });
    try {
        const response = await fetch(`${baseUrl}/api/master/overview`, { headers: { 'x-auth-token': token } });
        assert.equal(response.status, 200);
        const data = await response.json();
        const event = data.byEvent.find(item => item.eventId === eventId);
        assert.equal(event.orders, 3);
        assert.equal(event.confirmedOrders, 2);
        assert.equal(event.ticketsIssued, 2);
        assert.equal(event.admissions, 10);
        assert.equal(event.online.admissions, 5);
        assert.equal(event.offline.admissions, 5);
        assert.equal(event.pendingOrders, 1);
        assert.equal(event.verifiedRevenue, 1000);
        assert.equal(data.queues.pendingOrganizerApprovals >= 1, true);
        assert.equal(data.queues.manualReviewOrders >= 1, true);
        assert.equal(data.accounts.sellers.total >= 1, true);
        assert.equal(data.accounts.pr.total >= 1, true);
        assert.equal(data.recentActivity.some(item => item.action === 'PHASE5_AUDIT_TEST'), true);
        assert.equal(JSON.stringify(data.recentActivity).includes('SECRET_MUST_NOT_BE_RETURNED'), false);

        const list = await fetch(`${baseUrl}/api/admin/events?search=${encodeURIComponent(eventId)}&page=1&pageSize=1`, { headers: { 'x-auth-token': token } });
        assert.equal(list.status, 200);
        const listData = await list.json();
        assert.equal(listData.total, 1);
        assert.equal(listData.events.length, 1);

        const transition = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}/transition`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ status: 'published' }),
        });
        assert.equal(transition.status, 200);
        const activity = await db.getAuditLogs('phase5-company');
        assert.equal(activity.some(item => item.category === 'EVENT_STATUS_CHANGED' && item.adminUser === masterId && item.newValue === 'published'), true);
    } finally {
        for (const orderId of [onlineOrder, offlineOrder, pendingOrder]) await db.deleteSaleRecord(orderId);
        await db.deleteUserSession(masterId);
        await db.deleteUser(`test-phase5-seller-${suffix}`);
        await db.deleteUser(`test-phase5-pr-${suffix}`);
        await db.deleteEvent(eventId);
    }
});

test('master can suspend a PR account, revoke its session, and retain its sale history', async () => {
    const db = require('../db');
    const suffix = Date.now();
    const masterId = `test-account-admin-${suffix}`;
    const masterToken = `test-account-admin-token-${suffix}`;
    const prId = `test-account-pr-${suffix}`;
    const prToken = `test-account-pr-token-${suffix}`;
    const orderId = `test-account-pr-sale-${suffix}`;
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.createUser({ userId: prId, role: 'pr', companyId: 'phase5-company', active: true });
    await db.setUserSession(prId, { userId: prId, token: prToken, role: 'pr', companyId: 'phase5-company', loginAt: new Date().toISOString() });
    await db.createSaleRecord({ orderId, event: 'History Retention Event', companyId: 'phase5-company', prUserId: prId, status: 'pr_cash_pending', paymentStatus: 'pending', amount: 10 });
    try {
        const denied = await fetch(`${baseUrl}/api/master/accounts/${encodeURIComponent(prId)}/status`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': prToken }, body: JSON.stringify({ active: false }),
        });
        assert.equal(denied.status, 403);
        const response = await fetch(`${baseUrl}/api/master/accounts/${encodeURIComponent(prId)}/status`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken }, body: JSON.stringify({ active: false }),
        });
        assert.equal(response.status, 200);
        const oldSession = await fetch(`${baseUrl}/api/pr/sales`, { headers: { 'x-auth-token': prToken } });
        assert.equal(oldSession.status, 401);
        assert.equal((await db.getByOrderId(orderId)).prUserId, prId);
        const logs = await db.getAuditLogs('phase5-company');
        assert.equal(logs.some(log => log.category === 'PARTNER_ACCOUNT_SUSPENDED' && log.adminUser === masterId), true);
    } finally {
        await db.deleteSaleRecord(orderId);
        await db.deleteUserSession(masterId);
        await db.deleteUserSession(prId);
        await db.deleteUser(prId);
    }
});

test('organizers can only view and edit explicitly assigned company events', async () => {
    const db = require('../db');
    const suffix = Date.now();
    const companyId = `phase6-company-${suffix}`;
    const otherCompanyId = `phase6-other-${suffix}`;
    const masterId = `phase6-master-${suffix}`;
    const masterToken = `phase6-master-token-${suffix}`;
    const accountId = `phase6-organizer-${suffix}`;
    const eventId = `phase6-event-${suffix}`;
    const otherEventId = `phase6-other-event-${suffix}`;
    const sameCompanyUnassignedId = `phase6-unassigned-event-${suffix}`;
    const onlineOrder = `phase6-online-${suffix}`;
    const offlineOrder = `phase6-offline-${suffix}`;
    const refundOrder = `phase6-refund-${suffix}`;
    const prId = `phase6-pr-user-${suffix}`;
    const prToken = `phase6-pr-token-${suffix}`;
    const password = 'phase6-strong-organizer-password';
    await db.ensureCompany(companyId, 'Phase 6 Organizer Company');
    await db.ensureCompany(otherCompanyId, 'Phase 6 Other Company');
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.saveEvent({ id: eventId, slug: eventId, name: `Phase 6 Event ${suffix}`, companyId, organizerId: companyId, status: 'published', active: true, ticketCategories: [{ id: 'group', name: 'Group', price: 500, totalInventory: 25, remainingAvailability: 10, groupSize: 5 }] });
    await db.saveEvent({ id: otherEventId, slug: otherEventId, name: `Phase 6 Other ${suffix}`, companyId: otherCompanyId, organizerId: otherCompanyId, status: 'published', active: true, ticketCategories: [] });
    await db.saveEvent({ id: sameCompanyUnassignedId, slug: sameCompanyUnassignedId, name: `Phase 6 Unassigned ${suffix}`, companyId, organizerId: companyId, status: 'published', active: true, ticketCategories: [] });
    await db.createSaleRecord({ orderId: onlineOrder, ticketId: `DGR-P6-ON-${suffix}`, eventId, event: `Phase 6 Event ${suffix}`, companyId, ticketType: 'Group', status: 'emailed', paymentStatus: 'paid', amount: 500, quantity: 1, admissionCount: 5, paymentMethod: 'razorpay' });
    await db.createSaleRecord({ orderId: offlineOrder, ticketId: `DGR-P6-OFF-${suffix}`, eventId, event: `Phase 6 Event ${suffix}`, companyId, ticketType: 'Group', status: 'ticket_generated', paymentStatus: 'paid', amount: 500, quantity: 1, admissionCount: 5, paymentMethod: 'cash', source: 'offline_pr', prUserId: 'phase6-pr' });
    await db.createSaleRecord({ orderId: refundOrder, ticketId: `DGR-P6-REF-${suffix}`, eventId, event: `Phase 6 Event ${suffix}`, companyId, ticketType: 'Group', status: 'emailed', paymentStatus: 'paid', amount: 500, refundStatus: 'requested', refundReason: 'Test request', refundRequestedAt: new Date().toISOString() });
    await db.createScanLog({ ticketId: `DGR-P6-ON-${suffix}`, result: 'accepted', event: `Phase 6 Event ${suffix}`, companyId, admissionCount: 5 });
    await db.createScanLog({ ticketId: `DGR-P6-ON-${suffix}`, result: 'duplicate', event: `Phase 6 Event ${suffix}`, companyId, admissionCount: 5 });
    await db.setUserSession(prId, { userId: prId, token: prToken, role: 'pr', companyId, loginAt: new Date().toISOString() });
    try {
        const create = await fetch(`${baseUrl}/api/master/organizers`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken },
            body: JSON.stringify({ userId: accountId, displayName: 'Phase 6 Organizer', companyId, password })
        });
        assert.equal(create.status, 201);
        const created = await create.json();
        assert.equal(created.organizer.userId, accountId);
        assert.equal(JSON.stringify(created).includes(password), false);
        assert.match((await db.getUserById(accountId)).passwordHash, /^scrypt:/);

        const login = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: accountId, password })
        });
        assert.equal(login.status, 200);
        const session = await login.json();
        const organizerToken = session.token;
        assert.equal(session.user.role, 'organizer');
        const unassigned = await fetch(`${baseUrl}/api/organizer/overview`, { headers: { 'x-auth-token': organizerToken } });
        assert.equal((await unassigned.json()).events.length, 0);

        const assign = await fetch(`${baseUrl}/api/master/events/${encodeURIComponent(eventId)}/organizers`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken }, body: JSON.stringify({ organizerUserIds: [accountId] })
        });
        assert.equal(assign.status, 200);
        const assignmentAudit = await db.getAuditLogs(companyId);
        assert.equal(assignmentAudit.some(log => log.category === 'EVENT_ORGANIZER_ASSIGNMENTS_CHANGED' && log.eventId === eventId), true);
        const crossCompanyAssignment = await fetch(`${baseUrl}/api/master/events/${encodeURIComponent(otherEventId)}/organizers`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken }, body: JSON.stringify({ organizerUserIds: [accountId] })
        });
        assert.equal(crossCompanyAssignment.status, 400);

        const overview = await fetch(`${baseUrl}/api/organizer/overview`, { headers: { 'x-auth-token': organizerToken } });
        assert.equal(overview.status, 200);
        const overviewData = await overview.json();
        assert.equal(overviewData.events.length, 1);
        assert.equal(overviewData.events[0].scans.accepted, 1);
        assert.equal(overviewData.events[0].scans.duplicate, 1);
        assert.equal(overviewData.events[0].scans.admissions, 5);
        assert.equal(overviewData.events[0].sales.admissions, 11);
        assert.equal(overviewData.events[0].sales.online.admissions, 6);
        assert.equal(overviewData.events[0].sales.offline.admissions, 5);
        assert.equal(overviewData.events[0].refundRequests.length, 1);
        assert.equal((await db.getByOrderId(refundOrder)).refundStatus, 'requested');
        assert.equal(overviewData.events[0].orders.every(order => !('email' in order) && !('name' in order) && !('phone' in order)), true);
        assert.equal(overviewData.events[0].orders.some(order => order.orderId === refundOrder), true);
        const eventList = await fetch(`${baseUrl}/api/admin/events`, { headers: { 'x-auth-token': organizerToken } });
        const eventListData = await eventList.json();
        assert.equal(eventList.status, 200);
        assert.deepEqual(eventListData.events.map(event => event.id), [eventId]);
        assert.equal('overrides' in eventListData.events[0], false);
        const prAccess = await fetch(`${baseUrl}/api/organizer/overview`, { headers: { 'x-auth-token': prToken } });
        assert.equal(prAccess.status, 403);
        const adminSales = await fetch(`${baseUrl}/api/admin/sales`, { headers: { 'x-auth-token': organizerToken } });
        assert.equal(adminSales.status, 403);

        const deniedEvent = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(otherEventId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ venue: 'Unauthorized' })
        });
        assert.equal(deniedEvent.status, 403);
        const sameCompanyDenied = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(sameCompanyUnassignedId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ venue: 'Unassigned edit' })
        });
        assert.equal(sameCompanyDenied.status, 403);
        const protectedCapacity = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ ticketCategories: [{ id: 'group', name: 'Group', price: 600, totalInventory: 26, groupSize: 5 }] })
        });
        assert.equal(protectedCapacity.status, 409);
        const ownEventEdit = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken }, body: JSON.stringify({ venue: 'Organizer Venue' })
        });
        assert.equal(ownEventEdit.status, 200);
        const categoryEdit = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': organizerToken },
            body: JSON.stringify({ ticketCategories: [{ id: 'group', name: 'Group', price: 600, totalInventory: 25, groupSize: 5 }] })
        });
        assert.equal(categoryEdit.status, 200);
        const audits = await db.getAuditLogs(companyId);
        assert.equal(audits.some(log => log.category === 'EVENT_UPDATED' && log.adminUser === accountId && log.fieldChanged === 'venue'), true);
        assert.equal(audits.some(log => log.category === 'EVENT_UPDATED' && log.adminUser === accountId && log.fieldChanged === 'ticketCategories' && log.newValue?.[0]?.price === 600), true);

        const suspended = await fetch(`${baseUrl}/api/master/accounts/${encodeURIComponent(accountId)}/status`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken }, body: JSON.stringify({ active: false })
        });
        assert.equal(suspended.status, 200);
        const blocked = await fetch(`${baseUrl}/api/organizer/overview`, { headers: { 'x-auth-token': organizerToken } });
        assert.equal(blocked.status, 401);
        const suspendedLogin = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: accountId, password })
        });
        assert.equal(suspendedLogin.status, 403);
        assert.equal((await db.getByOrderId(onlineOrder)).ticketId, `DGR-P6-ON-${suffix}`);
    } finally {
        await db.deleteSaleRecord(onlineOrder);
        await db.deleteSaleRecord(offlineOrder);
        await db.deleteSaleRecord(refundOrder);
        await db.deleteUserSession(masterId);
        await db.deleteUserSession(prId);
        await db.deleteUserSession(accountId);
        await db.deleteUser(accountId);
        await db.deleteEvent(eventId);
        await db.deleteEvent(otherEventId);
        await db.deleteEvent(sameCompanyUnassignedId);
    }
});

test('seller access is limited to events owned by the seller company', async () => {
    const db = require('../db');
    const sellerId = `test-seller-scope-${Date.now()}`;
    const token = `test-seller-scope-token-${Date.now()}`;
    const ownedId = `test-seller-owned-event-${Date.now()}`;
    const otherId = `test-seller-other-event-${Date.now()}`;
    await db.createUser({ userId: sellerId, role: 'seller', companyId: 'phase4-seller-company', active: true, displayName: 'Scope Seller' });
    await db.setSellerSession(sellerId, { sellerId, token, loginAt: new Date().toISOString() });
    await db.saveEvent({ id: ownedId, name: ownedId, companyId: 'phase4-seller-company', status: 'published', visibility: 'public', active: true, ticketCategories: [] });
    await db.saveEvent({ id: otherId, name: otherId, companyId: 'another-company', status: 'published', visibility: 'public', active: true, ticketCategories: [] });
    try {
        const allowed = await fetch(`${baseUrl}/api/seller/pricing?event=${encodeURIComponent(ownedId)}`, { headers: { 'x-seller-token': token } });
        assert.notEqual(allowed.status, 403);
        const denied = await fetch(`${baseUrl}/api/seller/pricing?event=${encodeURIComponent(otherId)}`, { headers: { 'x-seller-token': token } });
        assert.equal(denied.status, 403);
    } finally {
        await db.deleteUserSession(sellerId);
        await db.deleteSellerSession(sellerId);
        await db.deleteUser(sellerId);
        await db.deleteEvent(ownedId);
        await db.deleteEvent(otherId);
    }
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

test('group ticket scan admits its full admission count once and rejects concurrent duplicate scans', async () => {
    const db = require('../db');
    const orderId = `test-group-scan-${Date.now()}`;
    const ticketId = `DGR-GROUP-${Date.now()}`;
    await db.createSaleRecord({
        orderId, ticketId, event: 'DHOLIDA GARBA ROYALE', companyId: 'littlane',
        status: 'ticket_generated', name: 'Group Contact', quantity: 1, admissionCount: 5,
    });
    try {
        const login = await fetch(`${baseUrl}/api/scanner-app-session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: process.env.SCANNER_PASSWORD }),
        });
        const { token } = await login.json();
        const scan = () => fetch(`${baseUrl}/api/scan-ticket`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ticketId }),
        }).then(response => response.json());
        const results = await Promise.all([scan(), scan()]);
        assert.equal(results.filter(result => result.result === 'success').length, 1);
        assert.equal(results.filter(result => result.result === 'rejected').length, 1);
        const accepted = results.find(result => result.result === 'success');
        assert.equal(accepted.ticket.admissionCount, 5);
        const sale = await db.getByTicketId(ticketId);
        assert.equal(sale.status, 'scanned');
        assert.equal(sale.scannedAdmissionCount, 5);
        const stats = await db.getScanStats('littlane', new Date(Date.now() - 10_000));
        assert.equal(stats.declinedByReason.duplicate >= 1, true);
    } finally {
        await db.deleteSaleRecord(orderId);
    }
});

test('cancelled tickets are rejected by the scanner without changing their status', async () => {
    const db = require('../db');
    const orderId = `test-cancelled-scan-${Date.now()}`;
    const ticketId = `DGR-CANCELLED-${Date.now()}`;
    await db.createSaleRecord({ orderId, ticketId, event: 'DHOLIDA GARBA ROYALE', companyId: 'littlane', status: 'cancelled', admissionCount: 2, quantity: 1, name: 'Cancelled Buyer' });
    try {
        const login = await fetch(`${baseUrl}/api/scanner-app-session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.SCANNER_PASSWORD }),
        });
        const { token } = await login.json();
        const response = await fetch(`${baseUrl}/api/scan-ticket`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ticketId }),
        });
        const result = await response.json();
        assert.equal(result.result, 'rejected');
        assert.equal(result.ticket.status, 'cancelled');
        assert.equal((await db.getByTicketId(ticketId)).status, 'cancelled');
    } finally { await db.deleteSaleRecord(orderId); }
});

test('unissued offline order requires manual review and remains unchanged when scanned', async () => {
    const db = require('../db');
    const orderId = `test-manual-review-${Date.now()}`;
    const ticketId = `DGR-REVIEW-${Date.now()}`;
    const since = new Date(Date.now() - 10_000);
    await db.createSaleRecord({ orderId, ticketId, event: 'DHOLIDA GARBA ROYALE', companyId: 'littlane', status: 'pr_cash_pending', paymentStatus: 'pending', admissionCount: 5, quantity: 1, name: 'Pending Buyer' });
    try {
        const login = await fetch(`${baseUrl}/api/scanner-app-session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: process.env.SCANNER_PASSWORD }),
        });
        const { token } = await login.json();
        const response = await fetch(`${baseUrl}/api/scan-ticket`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ticketId }),
        });
        const result = await response.json();
        assert.equal(result.result, 'manual_review');
        assert.match(result.message, /manual review/i);
        assert.equal((await db.getByTicketId(ticketId)).status, 'pr_cash_pending');
        const stats = await db.getScanStats('littlane', since);
        assert.equal(stats.declinedByReason.manualReview >= 1, true);
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

test('online and offline sales share event inventory and group admissions', async () => {
    const db = require('../db');
    const eventId = `phase4-shared-inventory-${Date.now()}`;
    const eventName = `Phase 4 Shared Inventory ${Date.now()}`;
    const prToken = `test-pr-${Date.now()}`;
    const adminToken = `test-admin-${Date.now()}`;
    const prUserId = `phase4-pr-${Date.now()}`;
    const adminSessionId = `phase4-admin-${Date.now()}`;
    const categoryId = 'group-five';
    const createdOrders = [];
    let generatedTicketId = null;
    await db.saveEvent({
        id: eventId, slug: eventId, name: eventName, companyId: 'littlane', organizerId: 'littlane',
        status: 'published', visibility: 'public', active: true,
        ticketCategories: [{ id: categoryId, name: 'Group of 5', price: 50, currency: 'INR', totalInventory: 5, remainingAvailability: 5, groupSize: 5, maxPerCustomer: 5, status: 'active' }],
    });
    await db.setUserSession(prUserId, { userId: prUserId, token: prToken, role: 'pr', companyId: 'littlane', displayName: 'Phase 4 PR', loginAt: new Date().toISOString() });
    await db.setUserSession(adminSessionId, { userId: adminSessionId, token: adminToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    try {
        const cashResponse = await fetch(`${baseUrl}/api/pr/cash-request`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': prToken },
            body: JSON.stringify({ name: 'Offline Group', email: 'offline-group@example.test', phone: '9999999999', eventId, ticketCategoryId: categoryId, quantity: 1 }),
        });
        assert.equal(cashResponse.status, 200);
        const cash = await cashResponse.json();
        const cashSale = await db.getByOrderId(cash.orderId);
        createdOrders.push(cash.orderId);
        assert.equal(cashSale.admissionCount, 5);
        assert.equal(cashSale.amount, 50);
        assert.equal(cashSale.paymentStatus, 'pending');
        assert.equal(cashSale.prUserId, prUserId);
        assert.equal(cashSale.inventoryReserved, false);

        const onlineResponse = await fetch(`${baseUrl}/api/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `online-${Date.now()}-phase4` },
            body: JSON.stringify({ name: 'Online Group', email: 'online-group@example.test', phone: '8888888888', eventId, ticketCategoryId: categoryId, quantity: 1 }),
        });
        assert.equal(onlineResponse.status, 200);
        const online = await onlineResponse.json();
        createdOrders.push(online.orderId);
        assert.equal((await db.getByOrderId(online.orderId)).admissionCount, 5);

        const approvalResponse = await fetch(`${baseUrl}/api/admin/pr-approve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': adminToken },
            body: JSON.stringify({ orderId: cash.orderId }),
        });
        assert.equal(approvalResponse.status, 409);
        const stillPending = await db.getByOrderId(cash.orderId);
        assert.equal(stillPending.status, 'pr_cash_pending');
        assert.equal(stillPending.paymentStatus, 'pending');
        assert.equal(stillPending.manualReview, true);
        assert.equal(stillPending.ticketId, cashSale.ticketId);
        assert.equal((await db.getAllEvents()).find(event => event.id === eventId).ticketCategories[0].remainingAvailability, 0);

        const secondEventId = `${eventId}-offline-wins`;
        await db.saveEvent({
            id: secondEventId, slug: secondEventId, name: `${eventName} Offline Wins`, companyId: 'littlane', organizerId: 'littlane',
            status: 'published', visibility: 'public', active: true,
            ticketCategories: [{ id: categoryId, name: 'Group of 5', price: 50, currency: 'INR', totalInventory: 5, remainingAvailability: 5, groupSize: 5, maxPerCustomer: 5, status: 'active' }],
        });
        const offlineFirstResponse = await fetch(`${baseUrl}/api/pr/cash-request`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': prToken },
            body: JSON.stringify({ name: 'Verified Cash Group', email: 'cash-group@example.test', phone: '7777777777', eventId: secondEventId, ticketCategoryId: categoryId, quantity: 1 }),
        });
        assert.equal(offlineFirstResponse.status, 200);
        const offlineFirst = await offlineFirstResponse.json();
        createdOrders.push(offlineFirst.orderId);
        const approved = await fetch(`${baseUrl}/api/admin/pr-approve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': adminToken },
            body: JSON.stringify({ orderId: offlineFirst.orderId }),
        });
        assert.equal(approved.status, 200);
        const verifiedSale = await db.getByOrderId(offlineFirst.orderId);
        generatedTicketId = verifiedSale.ticketId;
        assert.equal(verifiedSale.paymentStatus, 'paid');
        assert.equal(verifiedSale.paymentVerificationSource, 'admin_cash_approval');
        assert.equal(verifiedSale.paymentVerifiedBy, adminSessionId);
        assert.equal(verifiedSale.admissionCount, 5);
        assert.equal((await db.getAllEvents()).find(event => event.id === secondEventId).ticketCategories[0].remainingAvailability, 0);

        const reportResponse = await fetch(`${baseUrl}/api/admin/sales`, { headers: { 'x-auth-token': adminToken } });
        assert.equal(reportResponse.status, 200);
        const reportData = await reportResponse.json();
        assert.equal(reportData.report.offline.orders, 1);
        assert.equal(reportData.report.offline.qrCodes, 1);
        assert.equal(reportData.report.offline.admissions, 5);
        assert.equal(reportData.report.online.orders, 0);
        assert.equal(reportData.report.remainingInventory.find(event => event.eventId === secondEventId).categories[0].remaining, 0);

        const competingOnline = await fetch(`${baseUrl}/api/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `online-${Date.now()}-phase4b` },
            body: JSON.stringify({ name: 'Too Late Online', email: 'late@example.test', phone: '6666666666', eventId: secondEventId, ticketCategoryId: categoryId, quantity: 1 }),
        });
        assert.equal(competingOnline.status, 400);
    } finally {
        for (const orderId of createdOrders) await db.deleteSaleRecord(orderId);
        await db.deleteEvent(eventId);
        await db.deleteEvent(`${eventId}-offline-wins`);
        await db.deleteUserSession(prUserId);
        await db.deleteUserSession(adminSessionId);
        if (generatedTicketId) { try { fs.unlinkSync(path.join(TICKETS_DIR, `${generatedTicketId}.pdf`)); } catch (_) {} }
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

    const checkoutKey = `phase2-checkout-key-${Date.now()}`;
    const checkoutBody = { name: 'Test Buyer', email: 'buyer@example.test', phone: '1234567890', eventSlug: slug, ticketCategoryId: 'premium-early', quantity: 2, amount: 1 };
    const orderResponse = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': checkoutKey },
        body: JSON.stringify(checkoutBody)
    });
    assert.equal(orderResponse.status, 200);
    const order = await orderResponse.json();
    assert.equal(order.amount, 2598, 'server-side event pricing overrides the client amount');
    assert.equal(order.amountMinor, 259800);
    const replay = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': checkoutKey }, body: JSON.stringify(checkoutBody)
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).orderId, order.orderId, 'retries reuse the same gateway order');
    const sale = await db.getByOrderId(order.orderId);
    assert.equal(sale.eventId, eventId);
    assert.equal(sale.ticketCategoryId, 'premium-early');
    assert.equal(sale.ticketType, 'Premium Early');
    assert.equal(sale.admissionCount, 2);
    assert.equal(sale.inventoryReserved, true);
    const remainingAfterHold = (await db.getAllEvents()).find(event => event.id === eventId).ticketCategories.find(category => category.id === 'premium-early').remainingAvailability;
    assert.equal(remainingAfterHold, 1, 'reservation decrements admission inventory before payment');

    const verification = await fetch(`${baseUrl}/api/verify-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId })
    });
    assert.equal(verification.status, 200);
    const verified = await verification.json();
    assert.equal(verified.success, true);
    assert.ok(verified.ticketId);
    const paidSale = await db.getByOrderId(order.orderId);
    assert.equal(paidSale.paymentStatus, 'paid');
    assert.equal(paidSale.fulfillmentStatus, 'ticketed');
    assert.equal(paidSale.inventoryReserved, false);

    const repeatedVerification = await fetch(`${baseUrl}/api/verify-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId })
    });
    assert.equal(repeatedVerification.status, 200);
    assert.equal((await repeatedVerification.json()).ticketId, verified.ticketId, 'repeat callback reuses the same ticket');
    const { unlink } = require('node:fs/promises');
    await unlink(path.join(TICKETS_DIR, `${verified.ticketId}.pdf`)).catch(() => {});

    const masterToken = 'phase2-checkout-master-token';
    await db.setUserSession('phase2-checkout-master', { token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    const removeUsedCategory = await fetch(`${baseUrl}/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': masterToken },
        body: JSON.stringify({ ticketCategories: [] })
    });
    assert.equal(removeUsedCategory.status, 409, 'historical order category cannot be removed');
    await db.deleteUserSession('phase2-checkout-master');
});

test('group checkout reserves individual admissions atomically and a reservation can release only once', async () => {
    const db = require('../db');
    const eventId = `phase3-group-${Date.now()}`;
    const slug = `${eventId}-slug`;
    await db.saveEvent({
        id: eventId, slug, name: 'Phase 3 Group Event', companyId: 'littlane', organizerId: 'littlane',
        status: 'published', active: true, visibility: 'public',
        ticketCategories: [{ id: 'group-five', name: 'Group of Five', price: 2000, currency: 'INR', totalInventory: 5, remainingAvailability: 5, maxPerCustomer: 2, status: 'active', groupSize: 5 }]
    });
    const create = key => fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ name: 'Group Buyer', email: 'group@example.test', phone: '1234567890', eventId, ticketCategoryId: 'group-five', quantity: 1 })
    });
    const responses = await Promise.all([create(`phase3-group-key-a-${Date.now()}`), create(`phase3-group-key-b-${Date.now()}`)]);
    const statuses = responses.map(response => response.status).sort();
    assert.ok(statuses.includes(200));
    assert.ok(statuses.every(status => status === 200 || status === 400 || status === 409));
    assert.equal(statuses.filter(status => status === 200).length, 1, 'only one checkout can reserve the five remaining admissions');
    const event = (await db.getAllEvents()).find(item => item.id === eventId);
    assert.equal(event.ticketCategories[0].remainingAvailability, 0);
    const sale = (await db.getAll()).find(item => item.eventId === eventId && item.ticketCategoryId === 'group-five' && item.paymentStatus === 'pending');
    assert.equal(sale.admissionCount, 5);

    const released = await db.releaseEventInventoryReservation({ eventId, reservationId: sale.orderId, now: new Date(Date.now() + 16 * 60 * 1000), expiredOnly: true });
    const duplicateRelease = await db.releaseEventInventoryReservation({ eventId, reservationId: sale.orderId, now: new Date(Date.now() + 16 * 60 * 1000), expiredOnly: true });
    assert.equal(released, true);
    assert.equal(duplicateRelease, false);
    assert.equal(event.ticketCategories[0].remainingAvailability, 5, 'inventory is restored once despite duplicate cleanup attempts');
});

test('PR online checkout reserves admission inventory and reuses an idempotent order', async () => {
    const db = require('../db');
    const eventId = `phase3-pr-${Date.now()}`;
    const slug = `${eventId}-slug`;
    await db.saveEvent({
        id: eventId, slug, name: 'Phase 3 PR Event', companyId: 'littlane', organizerId: 'littlane',
        status: 'published', active: true, visibility: 'public',
        ticketCategories: [{ id: 'group-two', name: 'Group of Two', price: 900, currency: 'INR', totalInventory: 4, remainingAvailability: 4, maxPerCustomer: 2, status: 'active', groupSize: 2 }]
    });
    const token = `phase3-pr-session-${Date.now()}`;
    await db.setUserSession('phase3-pr-user', { token, role: 'pr', companyId: 'littlane', loginAt: new Date().toISOString() });
    const key = `phase3-pr-checkout-${Date.now()}`;
    const body = { name: 'PR Buyer', email: 'prbuyer@example.test', phone: '1234567890', eventId, ticketCategoryId: 'group-two', quantity: 1 };
    const create = () => fetch(`${baseUrl}/api/pr/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token, 'Idempotency-Key': key }, body: JSON.stringify(body)
    });
    const firstResponse = await create();
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.amountMinor, 90000);
    const replayResponse = await create();
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json();
    assert.equal(replay.orderId, first.orderId);
    assert.equal(replay.idempotentReplay, true);
    const sale = await db.getByOrderId(first.orderId);
    assert.equal(sale.admissionCount, 2);
    assert.equal(sale.inventoryReserved, true);
    const event = (await db.getAllEvents()).find(item => item.id === eventId);
    assert.equal(event.ticketCategories[0].remainingAvailability, 2);
    await db.deleteUserSession('phase3-pr-user');
});

test('expired checkout transitions to expired and releases its admission hold', async () => {
    const db = require('../db');
    const eventId = `phase3-expiry-${Date.now()}`;
    const slug = `${eventId}-slug`;
    await db.saveEvent({
        id: eventId, slug, name: 'Phase 3 Expiry Event', companyId: 'littlane', organizerId: 'littlane',
        status: 'published', active: true, visibility: 'public',
        ticketCategories: [{ id: 'single', name: 'Single', price: 100, currency: 'INR', totalInventory: 1, remainingAvailability: 1, maxPerCustomer: 1, status: 'active', groupSize: 1 }]
    });
    const key = `phase3-expiry-key-${Date.now()}`;
    const response = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ name: 'Expiry Buyer', email: 'expiry@example.test', phone: '1234567890', eventId, ticketCategoryId: 'single', quantity: 1 })
    });
    assert.equal(response.status, 200);
    const { orderId } = await response.json();
    const past = new Date(Date.now() - 1000);
    await db.updateSaleRecord(orderId, { reservationExpiresAt: past });
    const event = (await db.getAllEvents()).find(item => item.id === eventId);
    event.inventoryReservations[0].expiresAt = past;
    await db.saveEvent(event);

    const cleanupTrigger = await fetch(`${baseUrl}/api/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `phase3-expiry-trigger-${Date.now()}` },
        body: JSON.stringify({ name: 'Expiry Buyer', email: 'expiry@example.test', phone: '1234567890', eventId, ticketCategoryId: 'missing', quantity: 1 })
    });
    assert.equal(cleanupTrigger.status, 400);
    const expiredSale = await db.getByOrderId(orderId);
    assert.equal(expiredSale.paymentStatus, 'expired');
    assert.equal(expiredSale.inventoryReserved, false);
    assert.equal((await db.getAllEvents()).find(item => item.id === eventId).ticketCategories[0].remainingAvailability, 1);
});

test('a captured payment reference cannot be attached to a second order', async () => {
    const db = require('../db');
    const paymentId = `pay-unique-${Date.now()}`;
    await db.createSaleRecord({
        orderId: `order-first-${Date.now()}`, paymentId, providerPaymentId: paymentId,
        paymentStatus: 'paid', fulfillmentStatus: 'ticketed', status: 'ticket_generated', ticketId: `DGR-FIRST-${Date.now()}`,
        amount: 100, amountMinor: 10000, currency: 'INR'
    });
    const orderId = `order-second-${Date.now()}`;
    await db.createSaleRecord({ orderId, paymentStatus: 'pending', fulfillmentStatus: 'pending', status: 'created', amount: 100, amountMinor: 10000, currency: 'INR' });
    const response = await fetch(`${baseUrl}/api/verify-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, razorpay_payment_id: paymentId })
    });
    assert.equal(response.status, 409);
    assert.equal((await db.getByOrderId(orderId)).paymentStatus, 'exception');
    assert.equal((await db.getByOrderId(orderId)).ticketId, undefined);
});

test('refund request and admin decision are single-use and never restore inventory automatically', async () => {
    const db = require('../db');
    const orderId = `order-refund-${Date.now()}`;
    const eventId = `phase3-refund-${Date.now()}`;
    await db.saveEvent({
        id: eventId, name: 'Refund Inventory Event', companyId: 'littlane', organizerId: 'littlane',
        ticketCategories: [{ id: 'single', name: 'Single', price: 100, currency: 'INR', totalInventory: 2, remainingAvailability: 1, maxPerCustomer: 2, status: 'active', groupSize: 1 }]
    });
    await db.createSaleRecord({
        orderId, eventId, event: 'Refund Inventory Event', ticketCategoryId: 'single', amount: 100, amountMinor: 10000, currency: 'INR',
        paymentStatus: 'paid', fulfillmentStatus: 'ticketed', status: 'ticket_generated', ticketId: `DGR-REFUND-${Date.now()}`,
        refundStatus: 'none'
    });
    const request = await db.atomicRequestRefund(orderId, {
        requestId: `refund-request-${Date.now()}`, requesterHash: 'opaque-verified-subject-hash', reason: 'Duplicate purchase', now: new Date().toISOString()
    });
    assert.equal(request.refundStatus, 'requested');
    assert.equal(await db.atomicRequestRefund(orderId, {
        requestId: 'duplicate', requesterHash: 'opaque-verified-subject-hash', reason: 'Duplicate', now: new Date().toISOString()
    }), null);

    const token = `phase3-refund-admin-${Date.now()}`;
    await db.setUserSession('phase3-refund-admin', { token, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    const decision = await fetch(`${baseUrl}/api/admin/refund-requests/${encodeURIComponent(orderId)}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ decision: 'approved', reason: 'Reviewed' })
    });
    assert.equal(decision.status, 200);
    const decisionBody = await decision.json();
    assert.equal(decisionBody.liveRefundTriggered, false);
    assert.equal(decisionBody.ticketInvalidated, false);
    assert.equal(decisionBody.inventoryRestored, false);
    assert.equal(await db.atomicDecideRefund(orderId, { decision: 'rejected', actor: 'Master Admin', reason: '', now: new Date().toISOString() }), null);
    assert.equal((await db.getByOrderId(orderId)).paymentStatus, 'paid');
    assert.equal((await db.getAllEvents()).find(item => item.id === eventId).ticketCategories[0].remainingAvailability, 1);
    const refundAudit = await db.getAuditLogs('littlane');
    assert.equal(refundAudit.some(log => log.category === 'INTERNAL_REFUND_DECISION' && log.newValue === 'approved'), true);
    await db.deleteUserSession('phase3-refund-admin');
});

test('captured webhook reconciliation rejects mismatched totals and safely handles retry and out-of-order events', async () => {
    const db = require('../db');
    const orderId = `order-phase3-webhook-${Date.now()}`;
    await db.createSaleRecord({
        orderId, name: 'Webhook Buyer', email: 'webhook@example.test', phone: '1234567890', event: 'Webhook Event',
        eventId: 'event-webhook-test', ticketCategoryId: 'single', quantity: 1, admissionCount: 1,
        amount: 123, amountMinor: 12300, currency: 'INR', status: 'created', paymentStatus: 'pending',
        fulfillmentStatus: 'pending', reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000), inventoryReserved: false
    });
    const postWebhook = async (eventId, body) => {
        const raw = JSON.stringify(body);
        const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
        return fetch(`${baseUrl}/api/webhook/razorpay`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId }, body: raw
        });
    };
    const payment = { id: `pay-phase3-${Date.now()}`, order_id: orderId, amount: 12300, currency: 'INR', status: 'captured', captured: true };
    const mismatch = await postWebhook(`evt-mismatch-${Date.now()}`, { event: 'payment.captured', payload: { payment: { entity: { ...payment, amount: 1 } } } });
    assert.equal(mismatch.status, 200);
    assert.equal((await db.getByOrderId(orderId)).paymentStatus, 'pending');

    const failedEventId = `evt-failed-${Date.now()}`;
    const failedAttempt = await postWebhook(failedEventId, { event: 'payment.failed', payload: { payment: { entity: { ...payment, status: 'failed', captured: false } } } });
    assert.equal(failedAttempt.status, 200);
    assert.equal((await db.getByOrderId(orderId)).paymentStatus, 'pending', 'a failed attempt does not block a later successful payment');

    const capturedEventId = `evt-captured-${Date.now()}`;
    const captured = await postWebhook(capturedEventId, { event: 'payment.captured', payload: { payment: { entity: payment } } });
    assert.equal(captured.status, 200);
    const paid = await db.getByOrderId(orderId);
    assert.equal(paid.paymentStatus, 'paid');
    assert.ok(paid.ticketId);
    assert.ok(paid.razorpayEventIds.includes(failedEventId));
    assert.ok(paid.razorpayEventIds.includes(capturedEventId));

    const duplicate = await postWebhook(capturedEventId, { event: 'payment.captured', payload: { payment: { entity: payment } } });
    assert.equal(duplicate.status, 200);
    assert.match(await duplicate.text(), /Duplicate event/);
    assert.equal((await db.getByOrderId(orderId)).ticketId, paid.ticketId);
    await require('node:fs/promises').unlink(path.join(TICKETS_DIR, `${paid.ticketId}.pdf`)).catch(() => {});
});

test('financial report separates order, confirmed and pending amounts; reconciliation is read-only, scoped and redacted', async () => {
    const db = require('../db');
    const suffix = Date.now();
    const companyId = `phase7-company-${suffix}`;
    const eventId = `phase7-event-${suffix}`;
    const otherEventId = `phase7-other-event-${suffix}`;
    const masterId = `phase7-master-${suffix}`;
    const masterToken = `phase7-master-token-${suffix}`;
    const organizerId = `phase7-organizer-${suffix}`;
    const organizerToken = `phase7-organizer-token-${suffix}`;
    const confirmedOrder = `phase7-confirmed-${suffix}`;
    const pendingOrder = `phase7-pending-${suffix}`;
    const legacyOrder = `phase7-legacy-unverified-${suffix}`;
    const otherOrder = `phase7-other-order-${suffix}`;
    const duplicatedTicket = `DGR-PHASE7-DUP-${suffix}`;
    await db.ensureCompany(companyId, 'Phase 7 Company');
    await db.createUser({ userId: organizerId, role: 'organizer', companyId, active: true, displayName: 'Phase 7 Organizer' });
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.setUserSession(organizerId, { userId: organizerId, token: organizerToken, role: 'organizer', companyId, loginAt: new Date().toISOString() });
    await db.saveEvent({ id: eventId, name: `Phase 7 Event ${suffix}`, companyId, organizerId: companyId, organizerUserIds: [organizerId], status: 'published', active: true, ticketCategories: [{ id: 'group-five', name: 'Group Five', price: 100, totalInventory: 30, remainingAvailability: 20, groupSize: 5 }], inventoryReservations: [] });
    await db.saveEvent({ id: otherEventId, name: `Phase 7 Other Event ${suffix}`, companyId, organizerId: companyId, status: 'published', active: true, ticketCategories: [{ id: 'group-five', name: 'Group Five', price: 100, totalInventory: 30, remainingAvailability: 20, groupSize: 5 }], inventoryReservations: [] });
    await db.createSaleRecord({ orderId: confirmedOrder, eventId, ticketCategoryId: 'group-five', event: `Phase 7 Event ${suffix}`, companyId, status: 'emailed', paymentStatus: 'paid', paymentId: 'test-verified-reference', refundStatus: 'approved', ticketId: duplicatedTicket, amount: 100, customerTotal: 125, quantity: 2, admissionCount: 5, name: 'PRIVATE CUSTOMER', email: 'private@example.test', source: 'online' });
    await db.createSaleRecord({ orderId: pendingOrder, eventId, ticketCategoryId: 'group-five', event: `Phase 7 Event ${suffix}`, companyId, status: 'emailed', paymentStatus: 'pending', paymentMethod: 'cash', source: 'offline_seller', ticketId: duplicatedTicket, amount: 250, quantity: 1, admissionCount: 5, name: 'PRIVATE CUSTOMER', email: 'private@example.test' });
    await db.createSaleRecord({ orderId: legacyOrder, eventId, ticketCategoryId: 'group-five', event: `Phase 7 Event ${suffix}`, companyId, status: 'emailed', ticketId: `DGR-PHASE7-LEGACY-${suffix}`, amount: 300, quantity: 1, admissionCount: 5 });
    await db.createSaleRecord({ orderId: otherOrder, eventId: otherEventId, ticketCategoryId: 'group-five', event: `Phase 7 Other Event ${suffix}`, companyId, status: 'emailed', paymentStatus: 'paid', paymentId: 'test-other-reference', ticketId: `DGR-PHASE7-OTHER-${suffix}`, amount: 100, quantity: 1, admissionCount: 1 });
    const beforeSales = (await db.getAll()).filter(sale => [confirmedOrder, pendingOrder, legacyOrder, otherOrder].includes(sale.orderId)).map(sale => ({ orderId: sale.orderId, status: sale.status, paymentStatus: sale.paymentStatus, ticketId: sale.ticketId }));
    const beforeEvents = (await db.getAllEvents()).filter(event => [eventId, otherEventId].includes(event.id)).map(event => ({ id: event.id, remaining: event.ticketCategories[0].remainingAvailability }));
    try {
        const reportResponse = await fetch(`${baseUrl}/api/master/overview`, { headers: { 'x-auth-token': masterToken } });
        assert.equal(reportResponse.status, 200);
        const report = await reportResponse.json();
        const eventReport = report.byEvent.find(event => event.eventId === eventId);
        assert.equal(eventReport.orders, 3);
        assert.equal(eventReport.confirmedOrders, 1);
        assert.equal(eventReport.pendingOrders, 1);
        assert.equal(eventReport.unverifiedOrders, 1);
        assert.equal(eventReport.verifiedRevenue, 125);
        assert.equal(report.sales.refundApprovals >= 1, true);
        assert.equal(report.sales.pendingAmount >= 250, true);

        const auditResponse = await fetch(`${baseUrl}/api/admin/reconciliation`, { headers: { 'x-auth-token': masterToken } });
        assert.equal(auditResponse.status, 200);
        const audit = await auditResponse.json();
        assert.equal(audit.readOnly, true);
        assert.equal(audit.findings.some(item => item.code === 'duplicate_ticket_identifier' && item.orderIds.includes(confirmedOrder) && item.orderIds.includes(pendingOrder)), true);
        assert.equal(audit.findings.some(item => item.code === 'group_admission_quantity_mismatch' && item.orderIds.includes(confirmedOrder)), true);
        assert.equal(audit.findings.some(item => item.code === 'offline_attribution_missing' && item.orderIds.includes(pendingOrder)), true);
        assert.equal(audit.findings.some(item => item.code === 'issued_without_confirmed_payment_state' && item.orderIds.includes(legacyOrder)), true);
        assert.equal(audit.findings.some(item => item.orderIds.includes(otherOrder)), true);
        assert.equal(JSON.stringify(audit).includes('PRIVATE CUSTOMER'), false);
        assert.equal(JSON.stringify(audit).includes('private@example.test'), false);

        const organizerAuditResponse = await fetch(`${baseUrl}/api/admin/reconciliation`, { headers: { 'x-auth-token': organizerToken } });
        assert.equal(organizerAuditResponse.status, 200);
        const organizerAudit = await organizerAuditResponse.json();
        assert.equal(organizerAudit.findings.some(item => item.orderIds.includes(confirmedOrder)), true);
        assert.equal(organizerAudit.findings.some(item => item.orderIds.includes(otherOrder)), false);
        const afterSales = (await db.getAll()).filter(sale => [confirmedOrder, pendingOrder, legacyOrder, otherOrder].includes(sale.orderId)).map(sale => ({ orderId: sale.orderId, status: sale.status, paymentStatus: sale.paymentStatus, ticketId: sale.ticketId }));
        const afterEvents = (await db.getAllEvents()).filter(event => [eventId, otherEventId].includes(event.id)).map(event => ({ id: event.id, remaining: event.ticketCategories[0].remainingAvailability }));
        assert.deepEqual(afterSales, beforeSales);
        assert.deepEqual(afterEvents, beforeEvents);
    } finally {
        await db.deleteSaleRecord(confirmedOrder);
        await db.deleteSaleRecord(pendingOrder);
        await db.deleteSaleRecord(legacyOrder);
        await db.deleteSaleRecord(otherOrder);
        await db.deleteUserSession(masterId);
        await db.deleteUserSession(organizerId);
        await db.deleteUser(organizerId);
        await db.deleteEvent(eventId);
        await db.deleteEvent(otherEventId);
    }
});

test('public ticket view request budget is enforced by the shared rate-limit store', async () => {
    let throttled = false;
    for (let attempt = 0; attempt < 31; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/ticket/nonexistent-rate-limit-fixture`);
        if (response.status === 429) throttled = true;
    }
    assert.equal(throttled, true);
});

test('sensitive route rate limiting fails closed if the shared store is unavailable', async () => {
    const consume = db.consumeOtpIssueRateLimit;
    db.consumeOtpIssueRateLimit = async () => { throw new Error('synthetic store outage'); };
    try {
        const response = await fetch(`${baseUrl}/api/customer/bookings/recovery/request`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'limit@example.test' }),
        });
        assert.equal(response.status, 503);
    } finally {
        db.consumeOtpIssueRateLimit = consume;
    }
});

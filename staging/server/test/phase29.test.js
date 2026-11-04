'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.SESSION_COOKIE_AUTH_ENABLED = 'false';
process.env.SESSION_BEARER_CUTOFF_AT = '';
process.env.SESSION_BEARER_CUTOFF_ENFORCED = 'false';
process.env.SCANNER_SESSION_SECRET = 'phase29-isolated-session-secret-at-least-32-chars';
process.env.BOOKING_OTP_SECRET = 'phase29-isolated-otp-secret-at-least-32-characters';
process.env.ADMIN_KEY = 'phase29-isolated-admin-key';
process.env.PORTAL_ADMIN_KEY = 'phase29-isolated-portal-admin-key';
process.env.WEBAUTHN_ORIGIN = 'http://localhost:5173';
process.env.WEBAUTHN_RP_ID = 'localhost';
process.env.LITTX_MOCK_SALES_FILE = path.join(os.tmpdir(), `littx-phase29-isolated-${process.pid}-${crypto.randomUUID()}.json`);

const db = require('../db');
const app = require('../server');
const mailer = require('../mailer');
let server;
let baseUrl;
let ip = 60;

before(async () => {
    app.set('trust proxy', 1);
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try { fs.unlinkSync(process.env.LITTX_MOCK_SALES_FILE); } catch (_) {}
});

async function api(route, { method = 'GET', body, token, clientIp } = {}) {
    const headers = { 'X-Forwarded-For': clientIp || `192.0.2.${ip++}` };
    if (token) headers[route.startsWith('/api/seller/') ? 'x-seller-token' : 'x-auth-token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function latestTestMessage(to, purpose) {
    const messages = mailer.getTestMessageOutbox();
    return [...messages].reverse().find(message => message.to === to && message.purpose === purpose);
}

function challengeFrom(message) {
    const match = message?.text.match(/challenge ([A-Za-z0-9_-]+) code ([0-9]{6})/);
    assert.ok(match, 'test-only mail outbox should contain an OTP and challenge reference');
    return { challengeId: match[1], code: match[2] };
}

function invitationTokenFrom(message) {
    const match = message?.text.match(/invitation token ([A-Za-z0-9_-]+)/);
    assert.ok(match, 'test-only mail outbox should contain the invitation token');
    return match[1];
}

test('organizer application verifies email, receives a new company on approval, activates safely, and owns created drafts', async () => {
    const suffix = crypto.randomUUID();
    const email = `organizer-${suffix}@example.test`;
    const masterId = `phase29-master-${suffix}`;
    const masterToken = `phase29-master-token-${suffix}`;
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    try {
        const submission = await api('/api/organizer/applications', { method: 'POST', body: { organizationName: `Org ${suffix}`, contactName: 'Test Organizer', email }, clientIp: `198.51.100.${ip++}` });
        assert.equal(submission.status, 202);
        const submitted = await submission.json();
        assert.ok(submitted.applicationId);
        const verifyCode = challengeFrom(latestTestMessage(email, 'organizer_application'));
        assert.equal(submitted.challengeId, verifyCode.challengeId);
        const verified = await api(`/api/organizer/applications/${submitted.applicationId}/verify`, { method: 'POST', body: { email, ...verifyCode }, clientIp: `198.51.100.${ip++}` });
        assert.equal(verified.status, 200);
        assert.equal((await db.getOrganizerApplication(submitted.applicationId)).status, 'pending_review');

        const approval = await api(`/api/master/organizer-applications/${submitted.applicationId}/decision`, { method: 'POST', token: masterToken, body: { decision: 'approved', reason: 'Synthetic test approval' } });
        assert.equal(approval.status, 200, await approval.clone().text());
        const approved = await approval.json();
        assert.equal(approved.status, 'approved');
        assert.equal(approved.activationEmailSent, true);
        const account = await db.getUserById(email);
        assert.equal(account.role, 'organizer');
        assert.equal(account.active, false);
        assert.equal(account.accountStatus, 'pending_activation');
        assert.notEqual(account.companyId, 'littlane');
        const activationCode = challengeFrom(latestTestMessage(email, 'organizer_activation'));
        const activated = await api('/api/organizer/activate', { method: 'POST', body: { email, ...activationCode, password: 'phase29-strong-password-123' }, clientIp: `198.51.100.${ip++}` });
        assert.equal(activated.status, 200);
        assert.equal((await db.getUserById(email)).active, true);
        const login = await api('/api/auth/login', { method: 'POST', body: { username: email, password: 'phase29-strong-password-123' } });
        assert.equal(login.status, 200);
        let { token: organizerToken } = await login.json();
        const suspended = await api(`/api/master/accounts/${encodeURIComponent(email)}/status`, { method: 'PATCH', token: masterToken, body: { active: false } });
        assert.equal(suspended.status, 200);
        assert.equal((await db.getOrganizerApplication(submitted.applicationId)).status, 'suspended');
        const suspendedAccess = await api('/api/organizer/overview', { token: organizerToken });
        assert.notEqual(suspendedAccess.status, 200);
        const reactivated = await api(`/api/master/accounts/${encodeURIComponent(email)}/status`, { method: 'PATCH', token: masterToken, body: { active: true } });
        assert.equal(reactivated.status, 200);
        assert.equal((await db.getOrganizerApplication(submitted.applicationId)).status, 'approved');
        const relogin = await api('/api/auth/login', { method: 'POST', body: { username: email, password: 'phase29-strong-password-123' } });
        organizerToken = (await relogin.json()).token;

        const created = await api('/api/admin/events', { method: 'POST', token: organizerToken, body: { name: `Organizer Draft ${suffix}`, companyId: 'littlane', category: 'Music', venue: 'Test venue', city: 'Test city', startsAt: new Date(Date.now() + 86400000).toISOString(), ticketCategories: [{ id: 'general', name: 'General', price: 100, totalInventory: 20, groupSize: 1 }] } });
        assert.equal(created.status, 201, await created.clone().text());
        const createdBody = await created.json();
        assert.equal(createdBody.event.companyId, account.companyId);
        assert.deepEqual(createdBody.event.organizerUserIds, [email]);
        assert.equal(createdBody.event.status, 'draft');
        const eventId = createdBody.event.id;
        const submitForReview = await api(`/api/admin/events/${encodeURIComponent(eventId)}/transition`, { method: 'POST', token: organizerToken, body: { status: 'pending_review' } });
        assert.equal(submitForReview.status, 200);
        const organizerPublish = await api(`/api/admin/events/${encodeURIComponent(eventId)}/transition`, { method: 'POST', token: organizerToken, body: { status: 'published' } });
        assert.equal(organizerPublish.status, 403);
        const eventRecord = (await db.getAllEvents()).find(event => event.id === eventId);
        await db.saveEvent({ ...eventRecord, status: 'pending_review', active: false });
        const publish = await api(`/api/admin/events/${encodeURIComponent(eventId)}/transition`, { method: 'POST', token: masterToken, body: { status: 'published' } });
        assert.equal(publish.status, 200);
        const publicEvents = await (await api('/api/events')).json();
        assert.equal(publicEvents.events.some(event => event.id === eventId), true);
        await db.deleteEvent(eventId);
    } finally {
        await db.deleteUserSession(masterId);
        await db.deleteUserSession(email);
        await db.deleteUser(email);
    }
});

test('seller and PR invitations are recipient-bound, single-use, event-scoped, and preserve separate seller WebAuthn login', async () => {
    const suffix = crypto.randomUUID();
    const companyId = `phase29-company-${suffix}`;
    const organizerId = `phase29-organizer-${suffix}@example.test`;
    const organizerToken = `phase29-organizer-token-${suffix}`;
    const masterId = `phase29-master-${suffix}`;
    const masterToken = `phase29-master-token-${suffix}`;
    const eventA = `phase29-event-a-${suffix}`;
    const eventB = `phase29-event-b-${suffix}`;
    const sellerEmail = `seller-${suffix}@example.test`;
    const prEmail = `pr-${suffix}@example.test`;
    const password = 'phase29-strong-team-password-123';
    await db.ensureCompany(companyId, `Company ${suffix}`);
    await db.createUser({ userId: organizerId, email: organizerId, companyId, role: 'organizer', displayName: 'Synthetic Organizer', passwordHash: 'unused', active: true, accountStatus: 'active' });
    await db.setUserSession(organizerId, { userId: organizerId, token: organizerToken, role: 'organizer', companyId, loginAt: new Date().toISOString() });
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.saveEvent({ id: eventA, slug: eventA, name: eventA, companyId, organizerId: companyId, organizerUserIds: [organizerId], status: 'published', active: true, visibility: 'public', ticketCategories: [{ id: 'general', name: 'General', price: 100, totalInventory: 50, remainingAvailability: 50, groupSize: 1 }] });
    await db.saveEvent({ id: eventB, slug: eventB, name: eventB, companyId, organizerId: companyId, organizerUserIds: [organizerId], status: 'published', active: true, visibility: 'public', ticketCategories: [{ id: 'general', name: 'General', price: 100, totalInventory: 50, remainingAvailability: 50, groupSize: 1 }] });
    try {
        const sellerInvite = await api(`/api/organizer/events/${eventA}/invitations`, { method: 'POST', token: organizerToken, body: { role: 'seller', email: sellerEmail } });
        assert.equal(sellerInvite.status, 201, await sellerInvite.clone().text());
        const sellerInviteBody = await sellerInvite.json();
        const sellerToken = invitationTokenFrom(latestTestMessage(sellerEmail, 'event_invitation'));
        assert.equal(JSON.stringify(sellerInviteBody).includes(sellerToken), false);
        const storedSellerInvite = await db.getEventInvitationByTokenHash(crypto.createHash('sha256').update(sellerToken).digest('hex'));
        assert.notEqual(storedSellerInvite.tokenHash, sellerToken);
        assert.ok(new Date(storedSellerInvite.expiresAt).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000);
        const sellerWrongEmail = await api('/api/invitations/accept', { method: 'POST', body: { token: sellerToken, email: `wrong-${sellerEmail}`, password } });
        assert.equal(sellerWrongEmail.status, 400);
        const sellerAccepted = await api('/api/invitations/accept', { method: 'POST', body: { token: sellerToken, email: sellerEmail, password } });
        assert.equal(sellerAccepted.status, 200, await sellerAccepted.clone().text());
        assert.equal((await db.getEventInvitationByTokenHash(crypto.createHash('sha256').update(sellerToken).digest('hex'))).status, 'accepted');
        const sellerReplay = await api('/api/invitations/accept', { method: 'POST', body: { token: sellerToken, email: sellerEmail, password } });
        assert.equal(sellerReplay.status, 400);
        const webauthn = await api('/api/seller/login-step1', { method: 'POST', body: { partnerId: sellerEmail, password } });
        assert.equal(webauthn.status, 200, await webauthn.clone().text());
        assert.equal((await webauthn.json()).isRegistration, true);
        const sellerSecondInvite = await api(`/api/organizer/events/${eventB}/invitations`, { method: 'POST', token: organizerToken, body: { role: 'seller', email: sellerEmail } });
        assert.equal(sellerSecondInvite.status, 201, await sellerSecondInvite.clone().text());
        const sellerSecondToken = invitationTokenFrom(latestTestMessage(sellerEmail, 'event_invitation'));
        const sellerSecondAccept = await api('/api/invitations/accept', { method: 'POST', body: { token: sellerSecondToken, email: sellerEmail, password } });
        assert.equal(sellerSecondAccept.status, 200, await sellerSecondAccept.clone().text());
        const sellerPolicy = await db.getPartnerAccessPolicy('seller', sellerEmail);
        assert.deepEqual(new Set(sellerPolicy.eventIds), new Set([eventA, eventB]));

        const prInvite = await api(`/api/organizer/events/${eventA}/invitations`, { method: 'POST', token: organizerToken, body: { role: 'pr', email: prEmail } });
        assert.equal(prInvite.status, 201, await prInvite.clone().text());
        const stalePrToken = invitationTokenFrom(latestTestMessage(prEmail, 'event_invitation'));
        const prResent = await api(`/api/organizer/events/${eventA}/invitations/${(await prInvite.json()).invitation.invitationId}/resend`, { method: 'POST', token: organizerToken });
        assert.equal(prResent.status, 200);
        const prToken = invitationTokenFrom(latestTestMessage(prEmail, 'event_invitation'));
        assert.notEqual(prToken, stalePrToken);
        const priorLink = await api('/api/invitations/accept', { method: 'POST', body: { token: stalePrToken, email: prEmail, password } });
        assert.equal(priorLink.status, 400);
        const prAccepted = await api('/api/invitations/accept', { method: 'POST', body: { token: prToken, email: prEmail, password } });
        assert.equal(prAccepted.status, 200, await prAccepted.clone().text());
        const prLogin = await api('/api/auth/login', { method: 'POST', body: { username: prEmail, password } });
        assert.equal(prLogin.status, 200);
        const prSession = await prLogin.json();
        const prEvents = await api('/api/pr/events', { token: prSession.token });
        assert.deepEqual((await prEvents.json()).events.map(event => event.id), [eventA]);
        const disallowedCashRequest = await api('/api/pr/cash-request', { method: 'POST', token: prSession.token, body: { name: 'Synthetic Buyer', email: 'buyer@example.test', phone: '0000000000', eventId: eventB, ticketCategoryId: 'general', quantity: 1 } });
        assert.equal(disallowedCashRequest.status, 403);

        const team = await api(`/api/organizer/events/${eventA}/team`, { token: organizerToken });
        assert.equal(team.status, 200);
        assert.equal((await team.json()).team.some(item => item.principalId === prEmail && item.role === 'pr'), true);
        const secondInvitation = await api(`/api/organizer/events/${eventA}/invitations`, { method: 'POST', token: organizerToken, body: { role: 'seller', email: `expired-${suffix}@example.test` } });
        assert.equal(secondInvitation.status, 201);
        const expiredInvitationBody = await secondInvitation.json();
        const expiredInvitation = await db.getEventInvitations({ invitationId: expiredInvitationBody.invitation.invitationId });
        assert.equal(expiredInvitation.length, 1);
        await db.updateEventInvitation(expiredInvitation[0].invitationId, { expiresAt: new Date(Date.now() - 1000) }, 'pending');
        const expiredToken = invitationTokenFrom(latestTestMessage(`expired-${suffix}@example.test`, 'event_invitation'));
        const expiredAccept = await api('/api/invitations/accept', { method: 'POST', body: { token: expiredToken, email: `expired-${suffix}@example.test`, password } });
        assert.equal(expiredAccept.status, 400);

        const removePr = await api(`/api/organizer/events/${eventA}/team/pr/${encodeURIComponent(prEmail)}`, { method: 'DELETE', token: organizerToken });
        assert.equal(removePr.status, 200);
        const afterRevocation = await api('/api/pr/events', { token: prSession.token });
        assert.deepEqual((await afterRevocation.json()).events, []);

        const raceEmail = `race-${suffix}@example.test`;
        const raceInvite = await api(`/api/organizer/events/${eventA}/invitations`, { method: 'POST', token: organizerToken, body: { role: 'pr', email: raceEmail } });
        assert.equal(raceInvite.status, 201);
        const raceToken = invitationTokenFrom(latestTestMessage(raceEmail, 'event_invitation'));
        const acceptRace = () => api('/api/invitations/accept', { method: 'POST', body: { token: raceToken, email: raceEmail, password } });
        const raceResults = await Promise.all([acceptRace(), acceptRace()]);
        assert.equal(raceResults.filter(response => response.status === 200).length, 1);
        assert.equal(raceResults.filter(response => [400, 409].includes(response.status)).length, 1);
    } finally {
        await db.deleteUserSession(organizerId);
        await db.deleteUserSession(masterId);
        await db.deleteUserSession(sellerEmail);
        await db.deleteSellerSession(sellerEmail);
        await db.deleteUserSession(prEmail);
        await db.deleteUserSession(`race-${suffix}@example.test`);
        await db.deleteUser(organizerId);
        await db.deleteUser(sellerEmail);
        await db.deleteUser(prEmail);
        await db.deleteUser(`race-${suffix}@example.test`);
        await db.deleteEvent(eventA);
        await db.deleteEvent(eventB);
    }
});

test('verified organizer application rejection preserves the reason and does not create a tenant account', async () => {
    const suffix = crypto.randomUUID();
    const email = `rejected-${suffix}@example.test`;
    const masterId = `phase29-reject-master-${suffix}`;
    const masterToken = `phase29-reject-token-${suffix}`;
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    try {
        const submitted = await api('/api/organizer/applications', { method: 'POST', body: { organizationName: 'Rejected synthetic org', contactName: 'Synthetic Contact', email }, clientIp: `198.51.100.${ip++}` });
        assert.equal(submitted.status, 202);
        const application = await submitted.json();
        const otp = challengeFrom(latestTestMessage(email, 'organizer_application'));
        const verified = await api(`/api/organizer/applications/${application.applicationId}/verify`, { method: 'POST', body: { email, ...otp }, clientIp: `198.51.100.${ip++}` });
        assert.equal(verified.status, 200);
        const rejected = await api(`/api/master/organizer-applications/${application.applicationId}/decision`, { method: 'POST', token: masterToken, body: { decision: 'rejected', reason: 'Synthetic test rejection' } });
        assert.equal(rejected.status, 200);
        const saved = await db.getOrganizerApplication(application.applicationId);
        assert.equal(saved.status, 'rejected');
        assert.equal(saved.decisionReason, 'Synthetic test rejection');
        assert.equal(await db.getUserById(email), null);
    } finally { await db.deleteUserSession(masterId); }
});

test('partner access migration report is read-only and explicit assignment immediately narrows legacy seller access', async () => {
    const suffix = crypto.randomUUID();
    const masterId = `phase29-master-${suffix}`;
    const masterToken = `phase29-master-token-${suffix}`;
    const sellerId = `phase29-legacy-seller-${suffix}`;
    const sellerToken = `phase29-legacy-token-${suffix}`;
    const companyId = `phase29-legacy-company-${suffix}`;
    const eventA = `phase29-legacy-a-${suffix}`;
    const eventB = `phase29-legacy-b-${suffix}`;
    await db.ensureCompany(companyId, 'Legacy synthetic company');
    await db.createUser({ userId: sellerId, displayName: 'Legacy seller', companyId, role: 'seller', active: true });
    await db.setSellerSession(sellerId, { sellerId, token: sellerToken, loginAt: new Date().toISOString() });
    await db.setUserSession(masterId, { userId: masterId, token: masterToken, role: 'master_admin', companyId: 'littx', loginAt: new Date().toISOString() });
    await db.saveEvent({ id: eventA, name: eventA, companyId, status: 'published', active: true, visibility: 'public', ticketCategories: [{ id: 'general', name: 'General', price: 10, totalInventory: 10, remainingAvailability: 10 }] });
    await db.saveEvent({ id: eventB, name: eventB, companyId, status: 'published', active: true, visibility: 'public', ticketCategories: [{ id: 'general', name: 'General', price: 10, totalInventory: 10, remainingAvailability: 10 }] });
    try {
        const reportResponse = await api('/api/master/partner-access-report', { token: masterToken });
        assert.equal(reportResponse.status, 200);
        const row = (await reportResponse.json()).accounts.find(item => item.principalId === sellerId);
        assert.equal(row.assignmentMode, 'legacy_company_wide');
        assert.equal(row.effectiveEventIds.includes(eventA), true);
        const before = await api('/api/seller/events', { token: sellerToken });
        const beforeBody = await before.json();
        assert.equal(beforeBody.events.some(event => event.id === eventA), true);
        assert.equal(beforeBody.events.some(event => event.id === eventB), true);
        const assignment = await api(`/api/master/accounts/${encodeURIComponent(sellerId)}/event-assignments`, { method: 'PUT', token: masterToken, body: { role: 'seller', eventIds: [eventA] } });
        assert.equal(assignment.status, 200, await assignment.clone().text());
        const after = await api('/api/seller/events', { token: sellerToken });
        const afterBody = await after.json();
        assert.deepEqual(afterBody.events.map(event => event.id), [eventA]);
        const denied = await api(`/api/seller/pricing?event=${encodeURIComponent(eventB)}`, { token: sellerToken });
        assert.equal(denied.status, 403);
    } finally {
        await db.deleteUserSession(masterId);
        await db.deleteSellerSession(sellerId);
        await db.deleteUser(sellerId);
        await db.deleteEvent(eventA);
        await db.deleteEvent(eventB);
    }
});

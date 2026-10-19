const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SCANNER_SESSION_SECRET = 'test-only-session-secret-with-more-than-32-characters';
process.env.SCANNER_PASSWORD = 'test-scanner-password-123';

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

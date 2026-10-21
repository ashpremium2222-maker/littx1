'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../vercel.json'), 'utf8'));
const frontendRoot = path.resolve(__dirname, '../../combined-app/src');

function rewriteFor(urlPath) {
    const route = vercelConfig.rewrites.find(({ source }) => {
        if (source === urlPath) return true;
        if (source.endsWith('/(.*)')) {
            const prefix = source.slice(0, -5);
            return urlPath === prefix || urlPath.startsWith(`${prefix}/`);
        }
        if (source === '/(.*)') return true;
        return false;
    });
    return route?.destination;
}

function redirectFor(urlPath, hostname) {
    return (vercelConfig.redirects || []).find(({ source, has }) => {
        if (source !== urlPath) return false;
        return (has || []).every(condition => condition.type !== 'host' || condition.value === hostname);
    });
}

function redirectLocation(urlPath, hostname, search = '') {
    const redirect = redirectFor(urlPath, hostname);
    if (!redirect) return null;
    return `${redirect.destination}${redirect.preserveQueryParams ? search : ''}`;
}

function runtimeSourceText(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', 'dist', 'test', 'tests', '__tests__'].includes(entry.name)) return [];
            return runtimeSourceText(filePath);
        }
        return /\.(js|jsx|ts|tsx|html|kt|java)$/i.test(entry.name) ? [fs.readFileSync(filePath, 'utf8')] : [];
    }).join('\n');
}

test('path-based admin, organizer, and booking routes serve the React app on direct entry and refresh', () => {
    for (const route of ['/admin', '/admin/events', '/organizer', '/organizer/reports', '/organizer/apply', '/organizer/activate', '/bookings', '/accept-invitation']) {
        assert.equal(rewriteFor(route), '/app.html', `${route} should resolve to the SPA entry`);
    }
});

test('existing seller, PR, scanner, marketplace, and ticket paths remain routed to the React app', () => {
    for (const route of ['/seller', '/seller/orders', '/pr', '/pr/requests', '/scanner', '/scanner/check', '/events', '/events/synthetic-slug', '/view/synthetic-ticket']) {
        assert.equal(rewriteFor(route), '/app.html', `${route} should resolve to the SPA entry`);
    }
});

test('the root public homepage remains static and only the organiser host opens the organizer route', () => {
    assert.equal(rewriteFor('/'), '/index.html');
    const organizerRedirect = redirectFor('/', 'organiser.littx.in');
    assert.equal(organizerRedirect?.destination, '/organizer');
    assert.equal(organizerRedirect?.permanent, false);
    assert.equal(organizerRedirect?.preserveQueryParams, true);
    assert.equal(redirectLocation('/', 'organiser.littx.in', '?campaign=spring%2026&event=sample'), '/organizer?campaign=spring%2026&event=sample');
    assert.equal(redirectLocation('/organizer', 'organiser.littx.in'), null, 'direct panel routes must not be redirected again');
    for (const hostname of ['littx.in', 'admin.littx.in', 'organizer.littx.in', 'seller.littx.in', 'pr.littx.in', 'scan.littx.in', 'my.littx.in', 'unknown.example.test']) {
        assert.equal(redirectFor('/', hostname), undefined, `${hostname} must not be redirected to the organizer panel`);
    }
});

test('organizer hostname destination retains existing SPA deep-link routes and authenticated screen gate', () => {
    assert.equal(rewriteFor('/organizer'), '/app.html');
    assert.equal(rewriteFor('/organizer/reports'), '/app.html');
    const app = fs.readFileSync(path.join(frontendRoot, 'App.tsx'), 'utf8');
    assert.match(app, /path\.startsWith\('\/organizer'\)/);
    assert.match(app, /userSession\?\.role === 'organizer' && userSession\.portalScope === 'organizer'/);
    assert.match(app, /<LoginPage portal="organizer"/);
});

test('admin company workspace uses the authenticated session instead of a hardcoded key or no-op resend action', () => {
    const app = fs.readFileSync(path.join(frontendRoot, 'App.tsx'), 'utf8');
    const companyPortal = fs.readFileSync(path.join(frontendRoot, 'admin-dash/pages/CompanyPortal.tsx'), 'utf8');
    assert.match(app, /path\.startsWith\('\/admin'\)/);
    assert.match(app, /path\.startsWith\('\/organizer'\)/);
    assert.match(companyPortal, /'x-auth-token': adminKey/);
    assert.match(companyPortal, /adminKey=\{adminKey\}/);
    assert.match(companyPortal, /const resendTicket = async/);
    assert.doesNotMatch(companyPortal, /littx-admin|onResend=\{async \(\) => \{\}\}/);
});

test('event reporting binds configured sales to event IDs and keeps historical no-ID records separate', () => {
    const eventManagement = fs.readFileSync(path.join(frontendRoot, 'admin-dash/pages/Events.tsx'), 'utf8');
    assert.match(eventManagement, /function eventKeyForSale\(sale: Sale\)/);
    assert.match(eventManagement, /sale\.eventId \? `event:\$\{sale\.eventId\}`/);
    assert.match(eventManagement, /catalogEvents\.find\(item => item\.id === event\.eventId\)/);
});

test('active frontend and backend source contains no RichAutomate calls or removed static demo event listings', () => {
    const activeSource = [
        runtimeSourceText(path.resolve(__dirname, '../../combined-app/src')),
        runtimeSourceText(path.resolve(__dirname, '..')),
    ].join('\n');
    assert.doesNotMatch(activeSource, /rich\s*automate/i);
    assert.doesNotMatch(activeSource, /Dholida|Garba Royale|Static & Sirens|Sundowner Vol/i);
});

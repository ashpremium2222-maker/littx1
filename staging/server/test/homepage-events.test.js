'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repositoryRoot = path.resolve(__dirname, '../../..');
const homepage = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');

test('public homepage scripts parse and catalogue is connected to the published-events API', () => {
    const scripts = [...homepage.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .map(match => match[1].trim()).filter(Boolean);
    assert.ok(scripts.length > 0, 'homepage has inline behavior');
    for (const source of scripts) new vm.Script(source, { filename: 'homepage-inline-script.js' });

    assert.match(homepage, /id="categories"[^>]*aria-live="polite"/);
    assert.match(homepage, /fetch\('\/api\/events'/);
    assert.match(homepage, /\/events\?event=\$\{encodeURIComponent\(event\.slug \|\| event\.id\)\}/);
    assert.match(homepage, /There are no published events yet\./);
    assert.match(homepage, /temporarily unavailable/);
    assert.match(homepage, /Loading published events/);
    assert.doesNotMatch(homepage, /const catalogue\s+const catalogue/);
});

test('public event cards have no static demo fallback and the marketplace reports API errors and empty results', () => {
    const marketplace = fs.readFileSync(path.join(repositoryRoot, 'staging/combined-app/src/components/EventMarketplace.tsx'), 'utf8');
    assert.match(homepage, /fetch\('\/api\/events'/);
    assert.doesNotMatch(homepage, /Dholida Garba Royale 2026|Aura Genesis Fest/);
    assert.match(marketplace, /fetch\(url\)/);
    assert.match(marketplace, /Events could not be loaded\./);
    assert.match(marketplace, /No published events match these filters\./);
    assert.match(marketplace, /eventId: event\.id/);
    assert.match(marketplace, /ticketCategoryId: selectedTicket\.id/);
});

test('active marketplace and install metadata display Stageway without renaming compatibility identifiers', () => {
    const appIndex = fs.readFileSync(path.join(repositoryRoot, 'staging/combined-app/index.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'staging/combined-app/public/manifest.json'), 'utf8'));
    const publicSite = fs.readFileSync(path.join(repositoryRoot, 'staging/combined-app/src/components/PublicWebsite.tsx'), 'utf8');
    assert.match(homepage, /<title>Stageway/);
    assert.match(homepage, /property="og:site_name" content="Stageway"/);
    assert.match(appIndex, /<title>Stageway<\/title>/);
    assert.match(publicSite, />Stageway<\/span>/);
    assert.equal(manifest.name, 'Stageway Seller Portal');
    assert.equal(manifest.id, 'in.littx.seller', 'PWA compatibility identifier remains stable');
});

test('legacy /littx page redirects to the live homepage without static demo listings', () => {
    const legacyPage = fs.readFileSync(path.join(repositoryRoot, 'staging/combined-app/public/littx/index.html'), 'utf8');
    assert.match(legacyPage, /location\.replace\('\/'\)/);
    assert.match(legacyPage, /href="\/"/);
    assert.doesNotMatch(legacyPage, /Static & Sirens|Sundowner|2\.4M tickets|180 cities/i);
});


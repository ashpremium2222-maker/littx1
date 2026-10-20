const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTicketEmailContent } = require('../mailer');
const { generateTicketId, buildTicketPdf, buildQrBuffer, TICKETS_DIR } = require('../ticket');
const fs = require('node:fs/promises');
const path = require('node:path');

test('ticket email content uses selected event details and only configured recovery origin', () => {
    const email = renderTicketEmailContent({
        name: 'Synthetic Guest', ticketId: 'DGR-PH21-TEST',
        event: { name: 'Phase 21 Event', startsAt: '2030-05-06T18:00:00Z', venue: 'Synthetic Hall', city: 'Test City' },
        publicOrigin: 'https://stageway.example.test/'
    });
    assert.match(email.subject, /Phase 21 Event/);
    assert.match(email.html, /Phase 21 Event/);
    assert.match(email.html, /Synthetic Hall/);
    assert.match(email.html, /https:\/\/stageway\.example\.test\/bookings/);
    assert.doesNotMatch(email.html, /Dholida|Pethkar|₹499|17 October/);

    const noOrigin = renderTicketEmailContent({ name: 'Guest', ticketId: 'DGR-PH21-TEST', event: 'Synthetic Event', publicOrigin: '' });
    assert.doesNotMatch(noOrigin.html, /href=/);
    assert.doesNotMatch(noOrigin.text, /https?:\/\//);
});

test('generic event PDF and QR retain the existing ticket identity format', async () => {
    const ticketId = generateTicketId();
    assert.match(ticketId, /^DGR-[0-9A-F-]{36}$/);
    const qr = await buildQrBuffer(ticketId);
    assert.ok(qr.length > 0);
    const pdfPath = await buildTicketPdf({
        ticketId, name: 'Synthetic Guest', email: 'guest@example.test',
        ticketType: 'Balcony Group', quantity: 2, amount: 850,
        event: { name: 'Phase 21 Event', date: '2030-05-06', time: '18:00', venue: 'Synthetic Hall' }
    });
    try {
        const pdf = await fs.readFile(pdfPath);
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        assert.ok(pdf.length > 1000);
    } finally {
        await fs.rm(path.join(TICKETS_DIR, `${ticketId}.pdf`), { force: true });
    }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { issueCustomerTicketToken, verifyCustomerTicketToken, CUSTOMER_TICKET_TOKEN_TTL_SECONDS } = require('../ticket-access');

const secret = 'ticket-access-test-key-with-at-least-32-characters';
const ticketId = 'DGR-legacy-73fa2c8a';
const email = 'customer@example.test';

test('ticket recovery access tokens are purpose, ticket, and email bound', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    const token = issueCustomerTicketToken({ ticketId, email, secret, now });
    assert.ok(token);
    assert.equal(verifyCustomerTicketToken({ token, ticketId, email, secret, now }), true);
    assert.equal(verifyCustomerTicketToken({ token, ticketId: 'another-ticket', email, secret, now }), false);
    assert.equal(verifyCustomerTicketToken({ token, ticketId, email: 'another@example.test', secret, now }), false);
    assert.equal(verifyCustomerTicketToken({ token, ticketId, email, secret: `${secret}x`, now }), false);
});

test('ticket recovery access tokens expire after fifteen minutes and reject tampering', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    const token = issueCustomerTicketToken({ ticketId, email, secret, now });
    assert.equal(CUSTOMER_TICKET_TOKEN_TTL_SECONDS, 15 * 60);
    assert.equal(verifyCustomerTicketToken({ token, ticketId, email, secret, now: new Date(now.getTime() + 15 * 60 * 1000) }), false);
    assert.equal(verifyCustomerTicketToken({ token: `${token}x`, ticketId, email, secret, now }), false);
});

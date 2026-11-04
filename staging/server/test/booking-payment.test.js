const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
    toMinorUnits, fromMinorUnits, expectedSaleAmountMinor,
    verifyRazorpaySignature, reconcileCapturedPayment, normalizePaymentStatus
} = require('../booking-payment');

test('booking money conversion uses the configured currency minor unit safely', () => {
    assert.equal(toMinorUnits(1299.5, 'INR'), 129950);
    assert.equal(fromMinorUnits(129950, 'INR'), 1299.5);
    assert.equal(toMinorUnits(1299, 'JPY'), 1299);
    assert.equal(toMinorUnits(Number.MAX_SAFE_INTEGER, 'INR'), null);
    assert.equal(expectedSaleAmountMinor({ amount: 1299.5, currency: 'INR' }), 129950);
});

test('Razorpay callback signatures are compared in constant-time after strict format checks', () => {
    const secret = 'server-side-test-secret';
    const signature = crypto.createHmac('sha256', secret).update('order_123|pay_456').digest('hex');
    assert.equal(verifyRazorpaySignature({ orderId: 'order_123', paymentId: 'pay_456', signature, secret }), true);
    assert.equal(verifyRazorpaySignature({ orderId: 'order_123', paymentId: 'pay_456', signature: 'bad', secret }), false);
    assert.equal(verifyRazorpaySignature({ orderId: 'order_other', paymentId: 'pay_456', signature, secret }), false);
});

test('captured provider payment must match order, amount, currency, and captured status', () => {
    const base = { id: 'pay_456', order_id: 'order_123', amount: 129950, currency: 'INR', status: 'captured', captured: true };
    assert.deepEqual(reconcileCapturedPayment({ payment: base, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }), { ok: true });
    assert.equal(reconcileCapturedPayment({ payment: { ...base, amount: 1 }, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }).reason, 'amount_mismatch');
    assert.equal(reconcileCapturedPayment({ payment: { ...base, currency: 'USD' }, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }).reason, 'currency_mismatch');
    assert.equal(reconcileCapturedPayment({ payment: { ...base, order_id: 'order_other' }, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }).reason, 'order_mismatch');
    assert.equal(reconcileCapturedPayment({ payment: { ...base, captured: false, status: 'authorized' }, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }).pending, true);
    assert.equal(reconcileCapturedPayment({ payment: { ...base, captured: false, status: 'failed' }, orderId: 'order_123', expectedAmountMinor: 129950, expectedCurrency: 'INR' }).failed, true);
});

test('legacy order statuses map to the new payment state model without rewriting history', () => {
    assert.equal(normalizePaymentStatus({ status: 'created' }), 'pending');
    assert.equal(normalizePaymentStatus({ status: 'emailed' }), 'paid');
    assert.equal(normalizePaymentStatus({ status: 'cancelled' }), 'cancelled');
});

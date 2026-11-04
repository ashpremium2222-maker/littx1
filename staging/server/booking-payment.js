'use strict';

const crypto = require('crypto');

function currencyMinorDigits(currency) {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency: String(currency || '').toUpperCase() })
            .resolvedOptions().maximumFractionDigits;
    } catch {
        return null;
    }
}

function toMinorUnits(amount, currency) {
    const digits = currencyMinorDigits(currency);
    const numeric = Number(amount);
    if (digits === null || !Number.isFinite(numeric) || numeric < 0) return null;
    const multiplier = 10 ** digits;
    const minor = Math.round((numeric + Number.EPSILON) * multiplier);
    return Number.isSafeInteger(minor) ? minor : null;
}

function fromMinorUnits(amountMinor, currency) {
    const digits = currencyMinorDigits(currency);
    if (digits === null || !Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
    return amountMinor / (10 ** digits);
}

function expectedSaleAmountMinor(sale) {
    if (Number.isSafeInteger(sale?.amountMinor) && sale.amountMinor >= 0) return sale.amountMinor;
    return toMinorUnits(sale?.amount, sale?.currency || 'INR');
}

function verifyRazorpaySignature({ orderId, paymentId, signature, secret }) {
    if (!orderId || !paymentId || !signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
    const suppliedText = String(signature);
    if (!/^[a-f0-9]{64}$/i.test(suppliedText)) return false;
    const supplied = Buffer.from(suppliedText, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function reconcileCapturedPayment({ payment, orderId, expectedAmountMinor, expectedCurrency }) {
    if (!payment || typeof payment !== 'object') return { ok: false, reason: 'missing_payment' };
    if (payment.order_id !== orderId) return { ok: false, reason: 'order_mismatch' };
    if (Number(payment.amount) !== expectedAmountMinor) return { ok: false, reason: 'amount_mismatch' };
    if (String(payment.currency || '').toUpperCase() !== String(expectedCurrency || '').toUpperCase()) return { ok: false, reason: 'currency_mismatch' };
    if (payment.status === 'failed') return { ok: false, failed: true, reason: 'payment_failed' };
    if (payment.status !== 'captured' || payment.captured !== true) return { ok: false, pending: true, reason: 'not_captured' };
    return { ok: true };
}

function normalizePaymentStatus(sale) {
    if (sale?.paymentStatus) return sale.paymentStatus;
    const legacy = String(sale?.status || '').toLowerCase();
    if (['created', 'payment_processing'].includes(legacy)) return 'pending';
    if (['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(legacy)) return 'paid';
    if (legacy === 'cancelled') return 'cancelled';
    if (legacy === 'expired') return 'expired';
    if (legacy === 'failed') return 'failed';
    return 'pending';
}

module.exports = { currencyMinorDigits, toMinorUnits, fromMinorUnits, expectedSaleAmountMinor, verifyRazorpaySignature, reconcileCapturedPayment, normalizePaymentStatus };

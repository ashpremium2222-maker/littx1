'use strict';

const crypto = require('node:crypto');

const COOKIE_SESSION_MARKER = 'stageway-cookie-session';
const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_FAMILIES = ['user', 'seller', 'scanner', 'shadow', 'shadow_private'];

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function cookieName(family) {
  if (!SESSION_FAMILIES.includes(family)) throw new TypeError('Unknown session cookie family.');
  const base = `stageway_${family}_session`;
  return isProduction() ? `__Host-${base}` : base;
}

function csrfCookieName() {
  return isProduction() ? '__Host-stageway_csrf' : 'stageway_csrf';
}

function parseCookies(header = '') {
  const cookies = Object.create(null);
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name || Object.hasOwn(cookies, name)) continue;
    try { cookies[name] = decodeURIComponent(rawValue); } catch (_) { /* malformed cookie is ignored */ }
  }
  return cookies;
}

function serializeCookie(name, value, { httpOnly, maxAgeMs = COOKIE_TTL_MS, sameSite = 'Lax', secure = isProduction() } = {}) {
  const safeValue = encodeURIComponent(value);
  const parts = [`${name}=${safeValue}`, 'Path=/', `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  const cookies = current == null ? [] : Array.isArray(current) ? current : [current];
  res.setHeader('Set-Cookie', [...cookies, value]);
}

function setSessionCookies(res, family, token, expiresAt, secure = isProduction()) {
  const remaining = Math.min(COOKIE_TTL_MS, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Cannot issue an expired session cookie.');
  const csrf = crypto.randomBytes(32).toString('base64url');
  appendSetCookie(res, serializeCookie(cookieName(family), token, { httpOnly: true, maxAgeMs: remaining, secure }));
  appendSetCookie(res, serializeCookie(csrfCookieName(), csrf, { httpOnly: false, maxAgeMs: remaining, secure }));
  res.set('Cache-Control', 'no-store');
  return csrf;
}

function clearSessionCookies(res, family, secure = isProduction()) {
  appendSetCookie(res, serializeCookie(cookieName(family), '', { httpOnly: true, maxAgeMs: 0, secure }));
  // Keep the non-authenticating CSRF value while another role cookie may still
  // be active on this host. It expires on its own after the session lifetime.
}

function timingSafeEqualText(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isMutationMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

module.exports = {
  COOKIE_SESSION_MARKER,
  COOKIE_TTL_MS,
  SESSION_FAMILIES,
  cookieName,
  csrfCookieName,
  parseCookies,
  serializeCookie,
  setSessionCookies,
  clearSessionCookies,
  timingSafeEqualText,
  isMutationMethod,
};

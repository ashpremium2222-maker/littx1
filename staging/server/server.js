
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { toMinorUnits, fromMinorUnits, expectedSaleAmountMinor, verifyRazorpaySignature, reconcileCapturedPayment, normalizePaymentStatus } = require('./booking-payment');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// WebAuthn state for Sellers
const rpName = 'Littx Seller Portal';

const PARTNER_PASSWORDS = {
    'littlane': process.env.SELLER_LITTLANE_PASS,
    'nitro': process.env.SELLER_NITRO_PASS,
    '7th-heaven': process.env.SELLER_7TH_HEAVEN_PASS
};

const PARTNER_NAMES = {
    'littlane': 'Littlane Ent',
    'nitro': 'DGR',
    '7th-heaven': '7th Heaven'
};

const SELLER_COMPANY_NAMES = {
    ...PARTNER_NAMES,
    'partner-slot-1': 'ASTEX Testing',
    'partner-slot-2': 'Wolfera'
};

function displayCompanyName(companyId, currentName) {
    if (companyId === 'littlane') return 'Littlane Ent';
    return currentName;
}

function redactCompanySecrets(value) {
    if (Array.isArray(value)) return value.map(redactCompanySecrets);
    if (!value || typeof value !== 'object') return value;
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
        if (/secret|password|token/i.test(key)) {
            redacted[key] = '';
            redacted[`has${key[0].toUpperCase()}${key.slice(1)}`] = Boolean(item);
        } else {
            redacted[key] = redactCompanySecrets(item);
        }
    }
    return redacted;
}

const PARTNER_LOGIN_SLOTS = ['partner-slot-1', 'partner-slot-2'];
const PARTNER_SLOT_COMPANY_IDS = {
    'partner-slot-1': 'astex-testing',
    'partner-slot-2': 'wolfera'
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const digest = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${digest}`;
}

function partnerCompanyId(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
}

async function syncManagedPartnerCompanies(users) {
    for (const user of users.filter(item => item.role === 'seller' && PARTNER_LOGIN_SLOTS.includes(item.sellerSlot))) {
        const companyId = PARTNER_SLOT_COMPANY_IDS[user.sellerSlot] || partnerCompanyId(user.displayName);
        if (!companyId || user.companyId !== 'littlane') continue;
        await db.ensureCompany(companyId, user.displayName || companyId);
        const updated = await db.updateUser(user.userId, { companyId });
        if (updated) user.companyId = companyId;
    }
}

function verifyPassword(password, passwordHash) {
    if (!passwordHash || !passwordHash.startsWith('scrypt:')) return false;
    const [, salt, expected] = passwordHash.split(':');
    const actual = crypto.scryptSync(password, salt, 64).toString('hex');
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function safeStringEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeErrorMessage(error, fallback = 'Request failed.') {
    if (process.env.NODE_ENV === 'production') return fallback;
    return error?.message || fallback;
}

async function resolveSellerPartner(partnerId) {
    if (PARTNER_NAMES[partnerId]) {
        const lock = await db.getPartnerLock(partnerId);
        return { id: partnerId, name: PARTNER_NAMES[partnerId], active: !lock?.blocked, blocked: Boolean(lock?.blocked), legacyPassword: PARTNER_PASSWORDS[partnerId] };
    }
    if (!PARTNER_LOGIN_SLOTS.includes(partnerId)) return null;
    const user = await db.getUserBySellerSlot(partnerId);
    if (!user || user.role !== 'seller') return null;
    return {
        id: partnerId,
        name: SELLER_COMPANY_NAMES[user.companyId] || user.displayName || SELLER_COMPANY_NAMES[partnerId] || 'Managed Seller',
        active: user.active !== false && !user.blocked,
        passwordHash: user.passwordHash,
        user
    };
}

async function findSellerPartnerByPassword(password) {
    if (typeof password !== 'string' || !password) return null;
    const matches = [];
    for (const [partnerId, expected] of Object.entries(PARTNER_PASSWORDS)) {
        if (expected && safeStringEqual(password, expected)) {
            const partner = await resolveSellerPartner(partnerId);
            if (partner?.active) matches.push(partner);
        }
    }
    for (const partnerId of PARTNER_LOGIN_SLOTS) {
        const partner = await resolveSellerPartner(partnerId);
        if (!partner?.active) continue;
        const matchesPassword = partner.passwordHash
            ? verifyPassword(password, partner.passwordHash)
            : typeof partner.user?.password === 'string' && safeStringEqual(password, partner.user.password);
        if (matchesPassword) matches.push(partner);
    }
    // A shared password across tenants cannot identify the intended account.
    return matches.length === 1 ? matches[0] : null;
}

// Persistent WebAuthn authenticators in tmp/local to survive serverless cold starts
const WEBAUTHN_FILE = path.join(os.tmpdir(), 'littx_seller_webauthn.json');
const SESSIONS_FILE = path.join(os.tmpdir(), 'littx_seller_sessions.json');

function loadPersisted(file) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {}
    return {};
}

function savePersisted(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data));
    } catch (_) {}
}

const webauthnAuthenticators = loadPersisted(WEBAUTHN_FILE); // partnerId -> { credentialID, credentialPublicKey, counter }
const webauthnChallenges = new Map(); // loginId -> { partnerId, challenge, rpID, origin, createdAt }
const sellerSessions = loadPersisted(SESSIONS_FILE); // sid/token -> session
const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SELLER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

async function createWebAuthnLogin(partnerId, challenge, rpID, origin) {
    const loginId = crypto.randomBytes(24).toString('base64url');
    const login = { partnerId, challenge, rpID, origin, createdAt: Date.now() };
    webauthnChallenges.set(loginId, login);
    // Vercel requests can run on different instances, so the challenge must be
    // available outside process memory as well.
    await db.savePartnerLock(partnerId, { currentChallenge: JSON.stringify({ loginId, ...login }) });
    return loginId;
}

async function consumeWebAuthnLogin(loginId, partnerId) {
    let login = webauthnChallenges.get(loginId);
    if (!login) {
        const lock = await db.getPartnerLock(partnerId);
        try {
            const stored = lock?.currentChallenge ? JSON.parse(lock.currentChallenge) : null;
            if (stored?.loginId === loginId) login = stored;
        } catch (_) {}
    }
    webauthnChallenges.delete(loginId); // Challenges must be single-use, even if verification fails.
    await db.savePartnerLock(partnerId, { currentChallenge: null });
    if (!login || login.partnerId !== partnerId || Date.now() - login.createdAt > WEBAUTHN_CHALLENGE_TTL_MS) {
        return null;
    }
    return login;
}

function getWebAuthnRelyingParty(req) {
    const configuredOrigin = process.env.WEBAUTHN_ORIGIN;
    const legacyOrigin = process.env.WEBAUTHN_LEGACY_ORIGIN || 'https://littx1.vercel.app';
    const legacyRpId = process.env.WEBAUTHN_LEGACY_RP_ID || 'littx1.vercel.app';
    const requestHost = String(req.hostname || '').toLowerCase();
    // Keep previously issued passkeys working while users move from the
    // Vercel hostname to the custom domain. This is host-gated rather than
    // derived from request headers, so an arbitrary Host cannot choose an RP.
    const useLegacyRelyingParty = legacyOrigin && requestHost === new URL(legacyOrigin).hostname.toLowerCase();
    const activeOrigin = useLegacyRelyingParty ? legacyOrigin : configuredOrigin;
    const activeRpId = useLegacyRelyingParty ? legacyRpId : process.env.WEBAUTHN_RP_ID;
    if (activeOrigin) {
        const origin = new URL(activeOrigin).origin;
        // A native Android passkey has a signed-app origin rather than the
        // browser HTTPS origin. It is opt-in through Vercel/server config and
        // must be the SHA-256 hash of this app's release signing certificate.
        const androidOrigin = process.env.WEBAUTHN_ANDROID_ORIGIN;
        const expectedOrigin = androidOrigin ? [origin, androidOrigin] : origin;
        // Environment dashboards often receive a full URL or a trailing slash.
        // WebAuthn rp.id must be a bare hostname, never a URL or path.
        const configuredRpId = (activeRpId || '').trim();
        const rpID = configuredRpId
            ? new URL(configuredRpId.includes('://') ? configuredRpId : `https://${configuredRpId}`).hostname
            : new URL(origin).hostname;
        return { rpID, origin: expectedOrigin };
    }

    // Dynamic hosts are safe only for local development. Requiring an explicit
    // production origin prevents a hostile Host/Origin header from creating a
    // credential for an attacker-controlled domain.
    const host = req.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
        throw new Error('WEBAUTHN_ORIGIN must be configured for seller authentication.');
    }
    const origin = req.headers.origin || `http://${host}`;
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.hostname !== host) throw new Error('Invalid WebAuthn origin.');
    return { rpID: host, origin: parsedOrigin.origin };
}

function isValidSellerSession(session, token, persistent = false) {
    if (!session || typeof session.token !== 'string') {
        return false;
    }
    const expected = Buffer.from(session.token);
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return false;
    const loginAt = new Date(session.loginAt || 0).getTime();
    return Number.isFinite(loginAt) && Date.now() - loginAt <= SELLER_SESSION_TTL_MS;
}

const USER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
function isValidUserSession(session, token) {
    if (!session || typeof session.token !== 'string' || typeof token !== 'string') return false;
    const expected = Buffer.from(session.token);
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return false;
    const loginAt = new Date(session.loginAt || 0).getTime();
    return Number.isFinite(loginAt) && loginAt <= Date.now() && Date.now() - loginAt <= USER_SESSION_TTL_MS;
}

function clientIp(req) {
    return String(req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimit({ limit, windowMs, keyPrefix }) {
    return async (req, res, next) => {
        const now = Date.now();
        const windowStartMs = Math.floor(now / windowMs) * windowMs;
        const windowStart = new Date(windowStartMs);
        const windowExpiresAt = new Date(windowStartMs + windowMs);
        const secret = process.env.BOOKING_OTP_SECRET || process.env.SCANNER_SESSION_SECRET;
        if (!secret || secret.length < 32) {
            return res.status(503).json({ success: false, message: 'Request protection is temporarily unavailable.' });
        }
        const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
        const bucketKey = crypto.createHmac('sha256', secret).update(`request:${keyPrefix}:${ip}:${windowStartMs}`).digest('hex');
        try {
            const allowed = await db.consumeOtpIssueRateLimit({ bucketKey, windowStart, windowExpiresAt, limit });
            if (!allowed) return res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.' });
            return next();
        } catch (error) {
            console.error('[RateLimit] Shared request limiter unavailable.');
            return res.status(503).json({ success: false, message: 'Request protection is temporarily unavailable.' });
        }
    };
}
const loginRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'login' });
const ticketResendRateLimit = rateLimit({ limit: 3, windowMs: 15 * 60 * 1000, keyPrefix: 'ticket-resend' });
const bookingRecoveryRequestRateLimit = rateLimit({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'booking-recovery-request' });
const bookingRecoveryVerifyRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'booking-recovery-verify' });
const recoveredTicketDownloadRateLimit = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000, keyPrefix: 'recovered-ticket-download' });
const recoveredTicketViewRateLimit = rateLimit({ limit: 30, windowMs: 15 * 60 * 1000, keyPrefix: 'recovered-ticket-view' });
const recoveredTicketResendRateLimit = rateLimit({ limit: 3, windowMs: 15 * 60 * 1000, keyPrefix: 'recovered-ticket-resend' });
const staffTicketDownloadRateLimit = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000, keyPrefix: 'staff-ticket-download' });
const staffTicketResendRateLimit = rateLimit({ limit: 3, windowMs: 15 * 60 * 1000, keyPrefix: 'staff-ticket-resend' });
const CHECKOUT_RESERVATION_MS = 15 * 60 * 1000;
const checkoutRateLimit = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000, keyPrefix: 'checkout' });

function deviceNameFromUserAgent(userAgent = '') {
    if (/iPhone/i.test(userAgent)) return 'iPhone passkey';
    if (/iPad/i.test(userAgent)) return 'iPad passkey';
    if (/Android/i.test(userAgent)) return 'Android passkey';
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac passkey';
    if (/Windows/i.test(userAgent)) return 'Windows passkey';
    return 'Passkey device';
}

async function authenticateSeller(token) {
    if (!token || typeof token !== 'string') return null;
    const [users, storedSessions] = await Promise.all([db.getAllUsers(), db.getAllSellerSessions()]);
    const sessionsBySeller = new Map(storedSessions.map(session => [session.sellerId, session]));
    const sellerIds = [...new Set([
        ...Object.keys(PARTNER_NAMES),
        ...Object.keys(SELLER_ACCOUNTS),
        ...PARTNER_LOGIN_SLOTS,
        ...users.filter(user => user.role === 'seller').flatMap(user => [user.sellerSlot, user.userId]).filter(Boolean),
    ])];
    // Check persistent state on every request so Master Admin revocation takes
    // effect across serverless instances without a stale local session cache.
    for (const sid of sellerIds) {
        const session = sessionsBySeller.get(sid);
        if (!isValidSellerSession(session, token)) continue;
        const partner = users.find(user => user.role === 'seller' && (user.sellerSlot === sid || user.userId === sid));
        if (partner && (partner.active === false || partner.blocked)) return null;
        if (PARTNER_NAMES[sid] && (await db.getPartnerLock(sid))?.blocked) return null;
        sellerSessions[sid] = session;
        return sid;
    }
    return null;
}


const express = require('express');
const cors = require('cors');
const { whatsappWebhook } = require('./whatsapp-webhook');

const db = require('./db');
const { issueOtp, verifyOtp } = require('./booking-otp');
const { issueCustomerTicketToken, verifyCustomerTicketToken } = require('./ticket-access');
const { EVENT_NAME, EVENT_DETAILS, generateTicketId, buildTicketPdf, buildQrDataUrl, buildQrBuffer, TICKETS_DIR } = require('./ticket');
const { sendTicketEmail, sendBookingRecoveryOtp, hasConfiguredEmailDelivery } = require('./mailer');
const { sendTicketWhatsApp, getWhatsAppConfigurationStatus } = require('./whatsapp-service');
const {
    COOKIE_SESSION_MARKER,
    cookieName: sessionCookieName,
    csrfCookieName,
    parseCookies,
    setSessionCookies,
    clearSessionCookies,
    timingSafeEqualText,
    isMutationMethod,
} = require('./session-cookie-auth');

const SCANNER_SESSION_TTL_SECONDS = 12 * 60 * 60;
function scannerAssignments() {
    const eventNames = String(process.env.SCANNER_EVENT_NAMES || '').split(',').map(value => value.trim()).filter(Boolean);
    const companyId = String(process.env.SCANNER_COMPANY_ID || '').trim();
    return eventNames.length && companyId ? { eventNames, companyId } : null;
}
function scannerSessionSecret() {
    const secret = process.env.SCANNER_SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('SCANNER_SESSION_SECRET must contain at least 32 characters.');
    return secret;
}
function signScannerSession(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', scannerSessionSecret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}
async function readScannerSession(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || token === COOKIE_SESSION_MARKER) return null;
    const persisted = await db.getUserSessionByToken(token).catch(() => null);
    if (persisted?.role === 'scanner' && isValidUserSession(persisted, token)) {
        const expiresAt = persisted.expiresAt ? new Date(persisted.expiresAt).getTime() : new Date(persisted.loginAt).getTime() + SCANNER_SESSION_TTL_SECONDS * 1000;
        if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return {
            role: 'scanner', name: persisted.displayName || 'Gate Staff', companyId: persisted.companyId,
            eventNames: persisted.eventNames || [], exp: Math.floor(expiresAt / 1000),
        };
    }
    // Existing signed scanner tokens remain valid only until the explicitly
    // configured overlap cutoff and their original 12-hour expiry.
    const cutoff = sessionBearerCutoffMs();
    if (cutoff && Date.now() >= cutoff) return null;
    const [encoded, suppliedSignature, extra] = token.split('.');
    if (!encoded || !suppliedSignature || extra) return null;
    let expectedSignature;
    try { expectedSignature = crypto.createHmac('sha256', scannerSessionSecret()).update(encoded).digest(); }
    catch (_) { return null; }
    let actualSignature;
    try { actualSignature = Buffer.from(suppliedSignature, 'base64url'); } catch (_) { return null; }
    if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;
    try {
        const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (session.role !== 'scanner' || typeof session.name !== 'string' || !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
        return session;
    } catch (_) { return null; }
}

// Keep WhatsApp delivery inside the request lifecycle. Vercel may freeze a
// serverless invocation as soon as the response is sent, so fire-and-forget
// sends can be dropped before Meta receives them.
async function sendAndRecordTicketWhatsApp({ orderId, phone, name, ticketId, event, ticketType, pdfPath }) {
    if (!phone) return { success: false, reason: 'phone_missing' };

    // WhatsApp ticket links must always use the public canonical domain.
    // Keep this independent from BASE_URL so an internal or legacy base URL
    // can never be sent to attendees.
    const ticketPublicOrigin = (process.env.PUBLIC_TICKET_ORIGIN || 'https://www.littx.in').replace(/\/+$/, '');

    try {
        const result = await sendTicketWhatsApp({
            phone,
            name,
            ticketId,
            event,
            ticketType,
            viewUrl: `${ticketPublicOrigin}/bookings`,
            pdfPath
        });

        if (orderId) {
            await db.updateSaleRecord(orderId, {
                whatsappStatus: result.success ? 'sent' : 'failed',
                whatsappError: result.success ? null : (typeof result.error === 'string' ? result.error : JSON.stringify(result.error || result.reason || 'Unknown WhatsApp error')),
                whatsappMessageId: result.messageId ? String(result.messageId) : null
            });
        }
        return result;
    } catch (error) {
        console.error('[WhatsApp] Ticket delivery failed.', { name: error.name || 'Error' });
        if (orderId) {
            await db.updateSaleRecord(orderId, {
                whatsappStatus: 'failed',
                whatsappError: error.message,
                whatsappMessageId: null
            }).catch(() => {});
        }
        return { success: false, error: error.message };
    }
}

// Meta error responses contain a useful message/code but no credential. Return
// just that actionable part to the ticket screen rather than incorrectly
// claiming a message was delivered.
function publicWhatsAppError(result) {
    if (!result || result.success) return null;
    if (typeof result.error === 'string') return result.error;
    const metaError = result.error?.error || result.error;
    if (metaError?.message) {
        return metaError.code ? `Meta error ${metaError.code}: ${metaError.message}` : metaError.message;
    }
    return result.reason || 'Meta did not accept the WhatsApp message.';
}

const app = express();
if (process.env.VERCEL === '1') app.set('trust proxy', 1);
const trustedOrigins = new Set((process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
if (process.env.BASE_URL) trustedOrigins.add(process.env.BASE_URL.replace(/\/$/, ''));
if (process.env.NODE_ENV !== 'production') {
    trustedOrigins.add('http://localhost:5173');
    trustedOrigins.add('http://127.0.0.1:5173');
    trustedOrigins.add('http://localhost:3000');
    trustedOrigins.add('http://127.0.0.1:3000');
}
app.use(cors({ origin(origin, callback) {
    if (!origin || trustedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
} }));
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});
app.use(express.json({ limit: '256kb', verify(req, res, buffer) {
    if (req.path === '/api/webhook/razorpay') req.rawBody = Buffer.from(buffer);
} }));

function sessionCookieModeEnabled() {
    return process.env.SESSION_COOKIE_AUTH_ENABLED === 'true';
}

function sessionBearerCutoffMs() {
    const raw = process.env.SESSION_BEARER_CUTOFF_AT;
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function secureCookieRequest(req) {
    return process.env.NODE_ENV === 'production'
        || req.secure === true
        || String(req.get('origin') || '').startsWith('https://')
        || String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

function browserSessionLoginGuard(req, res, next) {
    if (!sessionCookieModeEnabled()) return next();
    if (!req.get('origin')) {
        if (req.get('x-stageway-client') === 'native-seller' && ['/api/seller/login-step1', '/api/seller/login-step2'].includes(req.path)) return next();
        return res.status(403).json({ success: false, message: 'Browser login requires an Origin header.' });
    }
    if (!trustedOrigins.has(req.get('origin'))) return res.status(403).json({ success: false, message: 'Request origin is not allowed.' });
    const cutoff = sessionBearerCutoffMs();
    if (!cutoff) return res.status(503).json({ success: false, message: 'A valid session compatibility cutoff is required.' });
    next();
}

function sessionCookieFamilyForRequest(req, headerName) {
    const pathname = req.path || '';
    if (headerName === 'x-seller-token') return 'seller';
    if (pathname.startsWith('/api/scanner-') || pathname.startsWith('/api/scan-')) return 'scanner';
    if (pathname.startsWith('/api/shadow-private/')) return 'shadow_private';
    if (pathname.startsWith('/api/shadow/')) return 'shadow';
    return 'user';
}

function issueBrowserSessionCookie(req, res, family, token, loginAt = new Date()) {
    if (!sessionCookieModeEnabled()) return { cookieSession: false, token };
    const origin = req.get('origin');
    if (!origin) return { cookieSession: false, token }; // Native clients do not receive browser cookies.
    if (!trustedOrigins.has(origin)) return { error: 403, message: 'Request origin is not allowed.' };
    const cutoff = sessionBearerCutoffMs();
    if (!cutoff) return { error: 503, message: 'A valid session compatibility cutoff is required.' };
    const ttl = family === 'scanner' ? SCANNER_SESSION_TTL_SECONDS * 1000 : USER_SESSION_TTL_MS;
    setSessionCookies(res, family, token, new Date(new Date(loginAt).getTime() + ttl), secureCookieRequest(req));
    return { cookieSession: true, token: COOKIE_SESSION_MARKER };
}

function respondWithSession(req, res, family, token, extra = {}, tokenField = 'token', loginAt = new Date()) {
    const auth = issueBrowserSessionCookie(req, res, family, token, loginAt);
    if (auth?.error) return res.status(auth.error).json({ success: false, message: auth.message });
    return res.json({ success: true, ...extra, [tokenField]: auth.token, cookieSession: auth.cookieSession });
}

async function cookieSessionCompatibilityMiddleware(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const isScopedCustomerTicketCapability = /^\/api\/customer\/bookings\/ticket-(view|download|resend)$/.test(req.path || '');
    const candidates = [
        ['x-auth-token', 'user'], ['x-seller-token', 'seller'], ['x-shadow-token', null],
        ['authorization', null], ['x-admin-key', 'user'],
    ];
    const supplied = [];
    for (const [headerName, explicitFamily] of candidates) {
        const raw = req.headers[headerName];
        if (typeof raw !== 'string') continue;
        const value = headerName === 'authorization' ? raw.replace(/^Bearer\s+/i, '') : raw;
        if (!value || value === COOKIE_SESSION_MARKER) continue;
        if (headerName === 'authorization' && (req.path.startsWith('/api/customer/bookings/recovery/') || isScopedCustomerTicketCapability)) continue;
        supplied.push({ headerName, value, family: explicitFamily || sessionCookieFamilyForRequest(req, headerName) });
    }

    if (isScopedCustomerTicketCapability && ['x-auth-token', 'x-seller-token', 'x-shadow-token', 'x-admin-key'].some(name => typeof req.headers[name] === 'string' && req.headers[name].trim())) {
        return res.status(401).json({ success: false, message: 'Ticket capability cannot be combined with a panel session credential.' });
    }

    const isLoginOrRecovery = req.path.endsWith('/login') || req.path.endsWith('/login-step1') || req.path.endsWith('/login-step2') || req.path.startsWith('/api/customer/bookings/recovery/') || isScopedCustomerTicketCapability;
    const cookieCandidates = isLoginOrRecovery ? [] : supplied.map(item => ({ ...item, cookie: cookies[sessionCookieName(item.family)] })).filter(item => item.cookie);
    if (cookieCandidates.some(item => !timingSafeEqualText(item.value, item.cookie))) {
        return res.status(401).json({ success: false, message: 'Conflicting session credentials.' });
    }

    let familyFromMarker = null;
    for (const [headerName, configuredFamily] of candidates) {
        const raw = req.headers[headerName];
        if (typeof raw !== 'string') continue;
        const value = headerName === 'authorization' ? raw.replace(/^Bearer\s+/i, '') : raw;
        if (value !== COOKIE_SESSION_MARKER) continue;
        if (!sessionCookieModeEnabled()) return res.status(401).json({ success: false, message: 'Cookie authentication is disabled; sign in again.' });
        const family = configuredFamily || sessionCookieFamilyForRequest(req, headerName);
        familyFromMarker = family;
        const cookie = cookies[sessionCookieName(family)];
        if (!cookie) return res.status(401).json({ success: false, message: 'Cookie session is missing or expired.' });
        if (headerName === 'authorization') req.headers.authorization = `Bearer ${cookie}`;
        else req.headers[headerName] = cookie;
    }

    if (sessionCookieModeEnabled() && !isLoginOrRecovery) {
        const cookieAuth = familyFromMarker || cookieCandidates[0]?.family || null;
        if (cookieAuth) {
            const origin = req.get('origin');
            if (origin && !trustedOrigins.has(origin)) return res.status(403).json({ success: false, message: 'Request origin is not allowed.' });
            if (isMutationMethod(req.method)) {
                const csrf = cookies[csrfCookieName()];
                const suppliedCsrf = req.get('x-csrf-token');
                if (!origin || !trustedOrigins.has(origin) || !timingSafeEqualText(csrf, suppliedCsrf)) {
                    return res.status(403).json({ success: false, message: 'CSRF validation failed.' });
                }
            }
            req.cookieSessionFamily = cookieAuth;
        }

        const cutoff = sessionBearerCutoffMs();
        if (!cutoff && supplied.length) return res.status(503).json({ success: false, message: 'Session compatibility cutoff is not configured.' });
    }

    // Enforce the configured cutoff even if cookie mode is rolled back. This
    // prevents rollback from restoring an indefinite static/bearer fallback.
    const cutoff = sessionBearerCutoffMs();
    if (!isLoginOrRecovery && cutoff && Date.now() >= cutoff && supplied.length) {
        const clientKind = req.get('x-stageway-client');
        let nativeSession = false;
        const scannerCredential = supplied.find(item => item.family === 'scanner');
        const sellerCredential = supplied.find(item => item.family === 'seller');
        if (clientKind === 'native-scanner' && scannerCredential) {
            const token = scannerCredential.value;
            const scanner = await db.getUserSessionByToken(token).catch(() => null);
            nativeSession = scanner?.role === 'scanner' && scanner.clientKind === 'native' && isValidUserSession(scanner, token);
        } else if (clientKind === 'native-seller' && sellerCredential) {
            const token = sellerCredential.value;
            const sessions = await db.getAllSellerSessions().catch(() => []);
            const seller = sessions.find(item => timingSafeEqualText(item.token, token));
            nativeSession = seller?.clientKind === 'native' && isValidSellerSession(seller, token);
        }
        if (!nativeSession) return res.status(401).json({ success: false, message: 'Legacy browser authentication has expired. Sign in again.' });
    }
    next();
}
app.use((req, res, next) => cookieSessionCompatibilityMiddleware(req, res, next).catch(next));

// A malformed Meta payload should still be acknowledged promptly. This handler
// is deliberately limited to the WhatsApp endpoint so existing API error
// behavior remains unchanged.
app.use((err, req, res, next) => {
    if (req.path === '/api/whatsapp/webhook' && err?.type === 'entity.parse.failed') {
        console.warn('[WhatsApp webhook] Ignored malformed JSON payload');
        return res.status(200).json({ received: true });
    }
    next(err);
});

// Keep this before the /api database middleware. Meta only needs a quick 200
// acknowledgement and webhook verification must not depend on MongoDB.
app.all('/api/whatsapp/webhook', whatsappWebhook);

// Public, non-sensitive deployment diagnostic. This intentionally exposes
// only the WebAuthn relying-party values that must also be public in Android
// asset links; it never exposes credentials, sessions, challenges, or keys.
app.get('/api/seller/webauthn-public-config', (req, res) => {
    try {
        const relyingParty = getWebAuthnRelyingParty(req);
        res.json({
            success: true,
            rpID: relyingParty.rpID,
            origin: relyingParty.origin,
        });
    } catch (err) {
        res.status(503).json({ success: false, message: 'WebAuthn relying-party configuration is unavailable.' });
    }
});

// The seller login page uses these database-backed slot names, so changing a
// Partner Login in Admin is reflected in /seller without a frontend deploy.
app.get('/api/seller/partners', async (_req, res) => {
    try {
        const users = await db.getAllUsers();
        const systemPartners = Object.entries(PARTNER_NAMES).map(([id, name]) => ({
            id,
            name,
            active: true,
            configured: true,
        }));
        const systemStatuses = await Promise.all(systemPartners.map(async partner => {
            const lock = await db.getPartnerLock(partner.id);
            return { ...partner, active: !lock?.blocked, blocked: Boolean(lock?.blocked) };
        }));
        const configuredSlots = PARTNER_LOGIN_SLOTS.map((id, index) => {
            const user = users.find(item => item.sellerSlot === id && item.role === 'seller');
            return {
                id,
                name: user?.displayName || `Partner Login ${index + 1}`,
                active: Boolean(user && user.active !== false && !user.blocked),
                configured: Boolean(user),
            };
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, partners: [...systemStatuses, ...configuredSlots] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to load seller partners.' });
    }
});

// Vercel may invoke an API route before the module-level MongoDB connection
// has completed. Awaiting the shared connection here avoids Mongoose's
// "buffering timed out" failure on cold starts.
app.use('/api', async (req, res, next) => {
    if (!db.hasConfiguredMongo) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ success: false, message: 'Database service is not configured.' });
        }
        return next();
    }

    try {
        await db.connectDb();
        next();
    } catch (err) {
        console.error('[Database unavailable]', err.message);
        res.status(503).json({
            success: false,
            message: 'Database connection is temporarily unavailable. Please try again shortly.'
        });
    }
});

app.post('/api/master/seller-access/:partnerId', requireMasterAdmin, async (req, res) => {
    try {
        const { partnerId } = req.params;
        const partner = await resolveSellerPartner(partnerId);
        if (!partner || partner.active === false) {
            return res.status(404).json({ success: false, message: 'Seller partner is not available.' });
        }

        const token = generateToken();
        const session = {
            token,
            loginAt: new Date().toISOString(),
            ip: clientIp(req),
            issuedBy: req.adminSession?.userId || req.adminSession?.displayName || 'Master Admin',
            masterIssued: true
        };
        sellerSessions[partnerId] = session;
        savePersisted(SESSIONS_FILE, sellerSessions);
        await db.setSellerSession(partnerId, session);
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: partner.user?.companyId || 'littlane', category: 'SELLER_PANEL_ACCESS_ISSUED', fieldChanged: 'sellerSession', reason: `Master admin issued a seller-panel session for ${partnerId}.` });

        res.json({
            success: true,
            token,
            partner: {
                id: partnerId,
                name: partner.name || partnerId,
                masterIssued: true
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) || 'Unable to open seller panel.' });
    }
});

// ==================== EVENT & PRICING ====================
const EVENT = { name: EVENT_NAME };
const CANONICAL_EVENT_GRADIENT = 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)';

function visibleDashboardEvents(events) {
    return (events || []).filter(event => !event.archived && event.status !== 'archived');
}

function eventRef(event) {
    return String(event?.id || event?._id || '');
}

function pickCanonicalEvent(events, requestedEventRef) {
    if (!requestedEventRef) return null;
    const ref = String(requestedEventRef).trim();
    const lower = ref.toLowerCase();
    return (events || []).find(item =>
        [item.id, item._id, item.slug, item.name, ...(Array.isArray(item.legacyNames) ? item.legacyNames : [])]
            .some(value => String(value || '').toLowerCase() === lower)
    ) || null;
}

function eventIsPublic(event) {
    if (!event || event.archived || event.active === false || event.visibility === 'private' || event.visibility === 'unlisted') return false;
    // Legacy active event documents predate lifecycle fields. Keep them visible
    // until an operator explicitly migrates their status; new records default to draft.
    return event.status === 'published' || (!event.status && event.active !== false);
}

function slugifyEvent(value) {
    return String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function publicEventPayload(event, pricing) {
    return {
        id: eventRef(event), slug: event.slug || slugifyEvent(event.name), name: event.name,
        description: event.description || '', category: event.category || '', images: event.images || [],
        city: event.city || '', venue: event.venue || '', address: event.address || '',
        date: event.date || event.startsAt || null, time: event.time || null, startsAt: event.startsAt || null,
        endsAt: event.endsAt || null, timezone: event.timezone || 'Asia/Kolkata',
        ticketCategories: (pricing?.passes || []).map(pass => ({
            id: pass.id, name: pass.name, description: pass.description || '', price: pass.price,
            currency: pass.currency || 'INR', remainingAvailability: pass.remainingAvailability,
            maxPerCustomer: pass.maxPerCustomer, status: pass.status || 'active', groupSize: pass.groupSize || 1,
            inclusions: pass.inclusions || []
        })),
        // Legacy admin summary widgets still consume `tiers`; retain this
        // read-only projection while new customer surfaces use ticketCategories.
        tiers: (pricing?.passes || []).map(pass => ({ id: pass.id, name: pass.name, price: pass.price, gender: pass.gender }))
    };
}

function canManageEvent(req, event) {
    if (req.adminSession?.role === 'master_admin') return true;
    if (req.adminSession?.role === 'organizer') return Array.isArray(event?.organizerUserIds) && event.organizerUserIds.includes(req.adminSession.userId);
    const owner = event?.organizerId || event?.companyId;
    return req.adminSession?.role === 'company_admin' && Boolean(owner) && owner === req.adminSession.companyId;
}

function organizerSafeEvent(event) {
    return {
        id: eventRef(event), slug: event.slug || null, name: event.name,
        description: event.description || '', category: event.category || '', images: event.images || [],
        date: event.date || null, time: event.time || null, venue: event.venue || '', city: event.city || '',
        address: event.address || '', timezone: event.timezone || 'Asia/Kolkata',
        startsAt: event.startsAt || null, endsAt: event.endsAt || null,
        salesStartAt: event.salesStartAt || null, salesEndAt: event.salesEndAt || null,
        status: lifecycleStatus(event), visibility: event.visibility || 'public',
        ticketCategories: (event.ticketCategories || []).map(category => ({
            id: category.id, name: category.name, description: category.description || '', price: category.price,
            currency: category.currency || 'INR', totalInventory: category.totalInventory ?? null,
            remainingAvailability: category.remainingAvailability ?? null, salesStartAt: category.salesStartAt || null,
            salesEndAt: category.salesEndAt || null, maxPerCustomer: category.maxPerCustomer || 20,
            status: category.status || 'active', groupSize: category.groupSize || 1, inclusions: category.inclusions || []
        }))
    };
}

function normalizeTicketCategories(input) {
    if (!Array.isArray(input) || input.length > 100) return { error: 'Ticket categories must be a list with at most 100 entries.' };
    const categories = [];
    const usedIds = new Set();
    for (const [index, raw] of input.entries()) {
        const name = String(raw?.name || '').trim();
        const id = slugifyPassId(raw?.id || name, `ticket-${index + 1}`);
        const price = raw?.price === '' || raw?.price === null || raw?.price === undefined ? null : normalizePrice(raw?.price);
        const inventory = raw?.totalInventory === null || raw?.totalInventory === undefined || raw?.totalInventory === ''
            ? null : Number(raw.totalInventory);
        const maxPerCustomer = raw?.maxPerCustomer === undefined ? 20 : Number(raw.maxPerCustomer);
        const groupSize = raw?.groupSize === undefined ? 1 : Number(raw.groupSize);
        const validDate = value => value === null || value === undefined || value === '' || Number.isFinite(new Date(value).getTime());
        if (!name || name.length > 100 || price === null || !Number.isFinite(price) || price > 100000000 ||
            (inventory !== null && (!Number.isInteger(inventory) || inventory < 0 || inventory > 100000000)) ||
            !Number.isInteger(maxPerCustomer) || maxPerCustomer < 1 || maxPerCustomer > 20 ||
            !Number.isInteger(groupSize) || groupSize < 1 || groupSize > 100 ||
            !['active', 'paused', 'sold_out'].includes(raw?.status || 'active') ||
            !validDate(raw?.salesStartAt) || !validDate(raw?.salesEndAt)) {
            return { error: `Ticket category ${index + 1} has invalid name, price, inventory, limits, status, or sale dates.` };
        }
        if (usedIds.has(id) || categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
            return { error: 'Ticket category IDs and names must be unique within an event.' };
        }
        usedIds.add(id);
        categories.push({
            id, name, price, currency: String(raw?.currency || 'INR').toUpperCase(),
            description: String(raw?.description || '').slice(0, 2000),
            totalInventory: inventory,
            remainingAvailability: inventory === null ? null : Math.max(0, Math.min(inventory, Number.isInteger(raw?.remainingAvailability) ? raw.remainingAvailability : inventory)),
            salesStartAt: raw?.salesStartAt ? new Date(raw.salesStartAt) : null,
            salesEndAt: raw?.salesEndAt ? new Date(raw.salesEndAt) : null,
            maxPerCustomer, status: raw?.status || 'active', groupSize,
            inclusions: Array.isArray(raw?.inclusions) ? raw.inclusions.map(item => String(item).slice(0, 300)).slice(0, 50) : []
        });
    }
    return { categories };
}

function lifecycleStatus(event) {
    if (event?.status) return event.status;
    return event?.active === false || event?.archived ? 'draft' : 'published';
}

// Native seller apps fetch this additive, authenticated configuration. Keeping it
// in Git means a normal backend deployment can update content without a new APK.
// Ticket issuance still validates ticket type and price from this server-owned source.
const SELLER_MOBILE_CONFIG_FILE = path.join(__dirname, 'config', 'seller-mobile.json');
function getSellerMobileConfig() {
    const parsed = JSON.parse(fs.readFileSync(SELLER_MOBILE_CONFIG_FILE, 'utf8'));
    if (!parsed?.event?.name || !Array.isArray(parsed?.passes) || !parsed.passes.length ||
        !parsed.passes.every(pass => typeof pass.id === 'string' && pass.id && typeof pass.label === 'string' && Number.isFinite(pass.price) && pass.price >= 0)) {
        throw new Error('Invalid seller mobile configuration');
    }
    return parsed;
}
function normalizePrice(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) / 100 : null;
}

function slugifyPassId(value, fallback = 'pass') {
    const slug = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function normalizePassCategory(value) {
    const cleaned = String(value || 'unisex').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned || 'unisex';
}

function normalizeCommissionPercentage(value, maximum = 20) {
    if (value === undefined || value === null || value === '') return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    // Check before rounding so 20.001 cannot become a permitted 20.00.
    if (maximum !== null && numeric > maximum) return 'maximum_exceeded';
    return Math.round(numeric * 100) / 100;
}

function normalizeCommissionAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.round(numeric * 100);
}

function applyCommission(customerTotal, commissionPercentage, quantity, commissionAmountPaise = null) {
    const customerTotalPaise = Math.round(Number(customerTotal) * 100);
    const percentageBasisPoints = Math.round(commissionPercentage * 100);
    const commissionPaise = commissionAmountPaise === null
        ? Math.round((customerTotalPaise * percentageBasisPoints) / 10000)
        : commissionAmountPaise;
    return {
        officialRate: Math.round((customerTotalPaise / Math.max(1, quantity))) / 100,
        customerTotal: customerTotalPaise / 100,
        commissionAmount: commissionPaise / 100,
        rateAfterCommission: (customerTotalPaise - commissionPaise) / 100,
    };
}

async function getEventPricing(eventName) {
    const events = await db.getAllEvents();
    let event = pickCanonicalEvent(events, eventName);
    if (!event) return null;
    let sourcePasses = Array.isArray(event.ticketCategories) && event.ticketCategories.length
        ? event.ticketCategories
        : [...(event.tiers || []), ...(event.ticketTypes || [])];
    const passes = sourcePasses
        .map(pass => ({
            id: pass.id || pass.name,
            name: pass.name,
            price: normalizePrice(pass.price),
            gender: pass.gender || 'unisex', description: pass.description || '',
            currency: pass.currency || 'INR',
            totalInventory: pass.totalInventory === undefined ? null : pass.totalInventory,
            remainingAvailability: pass.remainingAvailability === undefined ? null : pass.remainingAvailability,
            salesStartAt: pass.salesStartAt || null, salesEndAt: pass.salesEndAt || null,
            maxPerCustomer: Number(pass.maxPerCustomer) || 20,
            status: pass.status || 'active', groupSize: Number(pass.groupSize) || 1,
            inclusions: Array.isArray(pass.inclusions) ? pass.inclusions : []
        }))
        .filter(pass => pass.name && pass.price !== null)
        .filter((pass, index, all) => all.findIndex(item => item.id === pass.id || item.name === pass.name) === index);
    return { event, passes };
}

async function resolveTicketAmount(eventName, ticketType, quantity) {
    const pricing = await getEventPricing(eventName);
    if (!pricing) return null;
    if (!eventIsPublic(pricing.event)) return null;
    const pass = pricing.passes.find(item => item.name === ticketType || item.id === ticketType || item.gender === ticketType);
    if (!pass || pass.status !== 'active') return null;
    const now = Date.now();
    if (pass.salesStartAt && new Date(pass.salesStartAt).getTime() > now) return null;
    if (pass.salesEndAt && new Date(pass.salesEndAt).getTime() < now) return null;
    const qty = Number(quantity === undefined || quantity === null || quantity === '' ? 1 : quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > Math.min(20, pass.maxPerCustomer || 20)) return null;
    const admissionCount = qty * pass.groupSize;
    if (!Number.isSafeInteger(admissionCount) || admissionCount < 1) return null;
    if (pass.totalInventory !== null && pass.totalInventory !== undefined && !Number.isInteger(pass.remainingAvailability)) return null;
    if (pass.remainingAvailability !== null && pass.remainingAvailability !== undefined && pass.remainingAvailability < admissionCount) return null;
    const unitPriceMinor = toMinorUnits(pass.price, pass.currency || 'INR');
    if (!Number.isSafeInteger(unitPriceMinor)) return null;
    const amountMinor = unitPriceMinor * qty;
    const amount = fromMinorUnits(amountMinor, pass.currency || 'INR');
    if (!Number.isSafeInteger(amountMinor) || amount === null) return null;
    return {
        amount, amountMinor, qty, admissionCount,
        inventoryLimited: pass.totalInventory !== null && pass.totalInventory !== undefined,
        ticketType: pass.name, ticketCategoryId: pass.id,
        event: pricing.event.name, eventId: eventRef(pricing.event), currency: pass.currency || 'INR'
    };
}

async function expireEventReservations(eventId = null) {
    const now = new Date();
    const events = (await db.getAllEvents()).filter(event => !eventId || String(event.id || event._id) === String(eventId));
    for (const event of events) {
        for (const reservation of event.inventoryReservations || []) {
            if (reservation.status !== 'active' || new Date(reservation.expiresAt).getTime() > now.getTime()) continue;
            const sale = await db.getByOrderId(reservation.reservationId);
            if (sale) {
                const expired = await db.atomicExpireOrder(reservation.reservationId, now.toISOString());
                if (!expired) {
                    const current = await db.getByOrderId(reservation.reservationId);
                    const awaitingAdmin = current && (current.status === 'pr_cash_pending' || current.approvalStatus === 'PENDING' || current.status === 'pending_approval');
                    if (awaitingAdmin) {
                        const released = await db.releaseEventInventoryReservation({ eventId: event.id || event._id, reservationId: reservation.reservationId, now, expiredOnly: true });
                        if (released) await db.updateSaleRecord(reservation.reservationId, { inventoryReserved: false, reservationStatus: 'released', reservationExpiresAt: null });
                        continue;
                    }
                    if (current?.inventoryReserved && current.eventId) {
                        const consuming = await db.consumeEventInventoryReservation({ eventId: current.eventId, reservationId: reservation.reservationId });
                        if (consuming) {
                            await db.finalizeConsumedInventoryReservation({ eventId: current.eventId, reservationId: reservation.reservationId });
                            await db.updateSaleRecord(reservation.reservationId, { inventoryReserved: false, reservationStatus: 'consumed', reservationExpiresAt: null });
                        }
                    }
                    continue;
                }
                const released = await db.releaseEventInventoryReservation({
                    eventId: event.id || event._id, reservationId: reservation.reservationId, now, expiredOnly: true
                });
                if (released) await db.updateSaleRecord(reservation.reservationId, { inventoryReserved: false, reservationStatus: 'expired' });
            } else {
                await db.releaseEventInventoryReservation({
                    eventId: event.id || event._id, reservationId: reservation.reservationId, now, expiredOnly: true
                });
            }
        }
    }
    for (const sale of await db.getAll()) {
        if (normalizePaymentStatus(sale) !== 'pending' || !sale.reservationExpiresAt || new Date(sale.reservationExpiresAt) > now) continue;
        const expired = await db.atomicExpireOrder(sale.orderId, now.toISOString());
        if (!expired) continue;
        if (sale.inventoryReserved) {
            const released = await db.releaseEventInventoryReservation({ eventId: sale.eventId, reservationId: sale.orderId, now, expiredOnly: true });
            if (released) await db.updateSaleRecord(sale.orderId, { inventoryReserved: false, reservationStatus: 'expired' });
        }
    }
}

async function reserveOfflineSaleInventory(sale) {
    if (!sale.inventoryLimited) return { ok: true, limited: false, reserved: false, expiresAt: null };
    await expireEventReservations(sale.eventId);
    const expiresAt = new Date(Date.now() + CHECKOUT_RESERVATION_MS);
    const result = await db.reserveEventInventory({
        eventId: sale.eventId,
        reservationId: sale.orderId,
        categoryId: sale.ticketCategoryId,
        admissionCount: sale.admissionCount,
        expiresAt
    });
    return { ...result, limited: true, expiresAt };
}

async function settleOfflineSaleInventory(sale, reservation) {
    if (!reservation?.reserved) return true;
    const consumed = await db.consumeEventInventoryReservation({ eventId: sale.eventId, reservationId: sale.orderId });
    if (!consumed) return false;
    await db.finalizeConsumedInventoryReservation({ eventId: sale.eventId, reservationId: sale.orderId });
    await db.updateSaleRecord(sale.orderId, { inventoryReserved: false, reservationStatus: 'consumed', reservationExpiresAt: null });
    return true;
}

async function acceptCapturedPayment(sale, paymentId) {
    const now = new Date();
    let state = normalizePaymentStatus(sale);
    if (state === 'pending' && sale.reservationExpiresAt && new Date(sale.reservationExpiresAt) <= now) {
        const expired = await db.atomicExpireOrder(sale.orderId, now.toISOString());
        if (expired) {
            await db.releaseEventInventoryReservation({ eventId: sale.eventId, reservationId: sale.orderId, now, expiredOnly: true });
            await db.updateSaleRecord(sale.orderId, { inventoryReserved: false, reservationStatus: 'expired' });
            sale = await db.getByOrderId(sale.orderId);
            state = normalizePaymentStatus(sale);
        }
    }
    if (state === 'expired') {
        await db.releaseEventInventoryReservation({ eventId: sale.eventId, reservationId: sale.orderId, now, expiredOnly: true });
        const late = await db.atomicRecordLateCapturedPayment(sale.orderId, paymentId, now.toISOString());
        if (late && sale.inventoryReserved) await db.updateSaleRecord(sale.orderId, { inventoryReserved: false, reservationStatus: 'expired' });
        return { kind: 'late_payment', sale: late || await db.getByOrderId(sale.orderId) };
    }
    if (state === 'paid') return { kind: 'already_paid', sale };

    const leaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
    const processingSale = await db.atomicClaimPaymentProcessing(sale.orderId, now.toISOString(), leaseUntil.toISOString());
    if (!processingSale) {
        const current = await db.getByOrderId(sale.orderId);
        const currentState = normalizePaymentStatus(current);
        if (currentState === 'expired') {
            const late = await db.atomicRecordLateCapturedPayment(sale.orderId, paymentId, now.toISOString());
            if (late && current.inventoryReserved) await db.updateSaleRecord(sale.orderId, { inventoryReserved: false, reservationStatus: 'expired' });
            return { kind: 'late_payment', sale: late || current };
        }
        if (currentState === 'paid') return { kind: 'already_paid', sale: current };
        return { kind: 'processing', sale: current };
    }

    if (processingSale.inventoryReserved) {
        const consumed = await db.consumeEventInventoryReservation({ eventId: processingSale.eventId, reservationId: processingSale.orderId });
        if (!consumed) {
            const exception = await db.atomicRecordCapturedPaymentException(
                processingSale.orderId, paymentId, now.toISOString(),
                'Captured payment could not consume its reserved inventory; manual reconciliation is required.'
            );
            return { kind: 'inventory_conflict', sale: exception || await db.getByOrderId(sale.orderId) };
        }
    }
    let paidSale;
    try {
        paidSale = await db.atomicMarkPaymentPaid(
            processingSale.orderId, paymentId, now.toISOString(), processingSale.inventoryReserved ? 'consumed' : 'not_required'
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
        if (processingSale.inventoryReserved) {
            await db.releaseEventInventoryReservation({ eventId: processingSale.eventId, reservationId: processingSale.orderId });
        }
        await db.updateSaleRecord(processingSale.orderId, {
            paymentStatus: 'exception', fulfillmentStatus: 'inventory_conflict', paymentProcessingLeaseUntil: null,
            inventoryReserved: false, reservationStatus: processingSale.inventoryReserved ? 'released' : processingSale.reservationStatus,
            lastPaymentAttemptId: paymentId, lastPaymentAttemptStatus: 'duplicate_payment_reference',
            paymentException: 'Captured provider payment is already associated with another order; manual reconciliation required.',
            status: 'payment_exception', updatedAt: now.toISOString()
        });
        return { kind: 'payment_conflict', sale: await db.getByOrderId(processingSale.orderId) };
    }
    if (!paidSale) return { kind: 'processing', sale: await db.getByOrderId(sale.orderId) };
    if (processingSale.inventoryReserved) {
        await db.finalizeConsumedInventoryReservation({ eventId: processingSale.eventId, reservationId: processingSale.orderId })
            .catch(err => console.error('[inventory] Reservation settlement cleanup failed:', err.message));
    }
    return { kind: 'paid', sale: paidSale };
}

async function ensureTicketGenerated(sale) {
    let current = sale;
    if (!current.ticketId) {
        const now = new Date();
        current = await db.atomicClaimTicketGeneration(
            sale.orderId, now.toISOString(), new Date(now.getTime() + 2 * 60 * 1000).toISOString()
        );
        if (!current) {
            const latest = await db.getByOrderId(sale.orderId);
            if (!latest?.ticketId) return { pending: true, sale: latest };
            current = latest;
        } else {
            const ticketId = generateTicketId();
            const generatedAt = new Date().toISOString();
            try {
                await buildTicketPdf({
                    ticketId, name: current.name, email: current.email, gender: current.gender,
                    quantity: current.quantity, amount: current.amount, createdAt: generatedAt,
                    event: current.event || 'DHOLIDA GARBA ROYALE'
                });
                const assigned = await db.atomicAssignGeneratedTicket(current.orderId, ticketId, generatedAt);
                if (!assigned) {
                    await fs.promises.unlink(path.join(TICKETS_DIR, `${ticketId}.pdf`)).catch(() => {});
                    const latest = await db.getByOrderId(sale.orderId);
                    if (!latest?.ticketId) return { pending: true, sale: latest };
                    current = latest;
                } else current = assigned;
            } catch (error) {
                await db.atomicFailTicketGeneration(current.orderId, error.message, new Date().toISOString());
                console.error('[ticket] Generation failed for paid order:', error.message);
                return { failed: true, sale: await db.getByOrderId(sale.orderId) };
            }
        }
    }
    const pdfPath = path.join(TICKETS_DIR, `${current.ticketId}.pdf`);
    if (!fs.existsSync(pdfPath)) {
        try {
            await buildTicketPdf({
                ticketId: current.ticketId, name: current.name, email: current.email, gender: current.gender,
                quantity: current.quantity, amount: current.amount, createdAt: current.generatedAt || current.paidAt,
                event: current.event || 'DHOLIDA GARBA ROYALE'
            });
        } catch (error) {
            console.error('[ticket] Existing ticket PDF could not be rebuilt:', error.message);
            return { failed: true, sale: current };
        }
    }
    const qrBuffer = await buildQrBuffer(current.ticketId);
    const qrDataUrl = await buildQrDataUrl(current.ticketId);
    return { sale: current, ticketId: current.ticketId, pdfPath, qrBuffer, qrDataUrl };
}

// ==================== RAZORPAY SETUP ====================
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const PAYMENT_CREDENTIALS_CONFIGURED = Boolean(RZP_KEY_ID && RZP_KEY_SECRET);
const TEST_MODE = process.env.NODE_ENV === 'test' || (process.env.NODE_ENV === 'development' && process.env.PAYMENT_TEST_MODE === 'true');

let razorpay = null;
if (PAYMENT_CREDENTIALS_CONFIGURED) {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
}
if (TEST_MODE) console.warn('[Payments] Explicit non-production test mode enabled.');

// Privileged routes fail closed until an operator supplies a secret.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
// Littlane Ent, DGR, and ASTEX Media can send tickets immediately. Every
// other event company must appear in Master Admin's approval queue first.
const DIRECT_DELIVERY_COMPANY_IDS = new Set(['littlane', 'nitro', 'astex-media', 'astex-testing']);

function normalizeSellerId(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sellerCompanyIdFromValue(value) {
    const normalized = normalizeSellerId(value);
    if (!normalized) return '';
    if (normalized === 'LITTLANE' || normalized === 'SELLER-A') return 'littlane';
    if (normalized === 'NITRO' || normalized === 'SELLER-B') return 'nitro';
    if (normalized === '7TH-HEAVEN' || normalized === 'SELLER-C') return '7th-heaven';
    if (normalized === 'PARTNER-SLOT-1') return 'partner-slot-1';
    if (normalized === 'PARTNER-SLOT-2') return 'partner-slot-2';
    return normalized.toLowerCase();
}

function isDirectDeliveryCompany(companyId) {
    return DIRECT_DELIVERY_COMPANY_IDS.has(String(companyId || '').trim().toLowerCase());
}

function isDirectDeliverySeller(sellerId) {
    return isDirectDeliveryCompany(sellerCompanyIdFromValue(sellerId));
}

function sellerHasUnlimitedCommission(sellerId) {
    const companyId = sellerCompanyIdFromValue(sellerId);
    if (companyId === 'littlane' || companyId === 'astex-testing') return true;
    return companyId === 'partner-slot-1' && PARTNER_SLOT_COMPANY_IDS[companyId] === 'astex-testing';
}

function resolveSaleCompanyId(sale, slotCompanyMap = new Map()) {
    if (sale?.companyId) return sale.companyId;
    const baseCompanyId = sellerCompanyIdFromValue(sale?.sellerId || sale?.generatedBy || sale?.prUserId || '');
    return slotCompanyMap.get(baseCompanyId) || baseCompanyId || 'littlane';
}

function saleGrossAmount(sale) {
    const amount = Number(sale?.customerTotal ?? sale?.amount ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

function saleRevenueAfterCommission(sale) {
    const amount = Number(sale?.rateAfterCommission ?? sale?.amount ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

function canDeliverSale(sale) {
    if (!sale) return false;
    if (isDirectDeliveryCompany(sale.companyId) || isDirectDeliverySeller(sale.sellerId || sale.generatedBy || sale.prUserId)) return true;
    if (sale.approvalStatus === 'APPROVED' || sale.approvalStatus === 'NOT_REQUIRED') return true;
    if (sale.approvalStatus === 'PENDING' || sale.approvalStatus === 'REJECTED') return false;
    if (sale.approvalRequired || sale.status === 'pending_approval' || sale.deliveryStatus === 'PENDING_APPROVAL') return false;
    return true;
}

function ticketPdfPath(ticketId) {
    const normalized = String(ticketId || '');
    if (!/^[A-Za-z0-9-]{1,128}$/.test(normalized)) throw new Error('Invalid ticket reference.');
    const root = path.resolve(TICKETS_DIR);
    const resolved = path.resolve(root, `${normalized}.pdf`);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid ticket file path.');
    return resolved;
}

function isCountableTicketSale(sale) {
    const status = String(sale?.status || '').toLowerCase();
    return !['cancelled', 'canceled'].includes(status) && canDeliverSale(sale) && ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(status);
}
function isVerifiedSalesRecord(sale) {
    if (!isCountableTicketSale(sale)) return false;
    if (sale.paymentStatus === 'paid') return true;
    if (sale.paymentStatus !== undefined && sale.paymentStatus !== null && sale.paymentStatus !== '') return false;
    // Established offline ticket sale flow: the authenticated seller records a
    // manual sale, then direct-delivery accounts issue it (or an admin approves
    // it). Do not extend this compatibility rule to online or unknown records.
    const offline = ['offline_seller', 'offline_pr'].includes(String(sale.source || '').toLowerCase())
        || ['cash', 'manual'].includes(String(sale.paymentMethod || '').toLowerCase());
    return offline && sale.paymentId === 'manual' && sale.status !== 'pr_cash_pending'
        && ['NOT_REQUIRED', 'APPROVED', undefined, null].includes(sale.approvalStatus)
        && Boolean(sale.sellerId || sale.prUserId || sale.generatedBy || sale.paymentVerificationSource === 'admin_cash_approval');
}

function buildReconciliationFindings(events, sales) {
    const findings = [];
    const add = (code, orderIds, sale, detail) => findings.push({
        code, severity: 'review', orderIds: [...new Set(orderIds)].filter(Boolean),
        eventId: sale?.eventId || null, detail
    });
    const saleById = new Map(sales.map(sale => [String(sale.orderId), sale]));
    const eventsById = new Map(events.map(event => [eventRef(event), event]));
    const ticketGroups = new Map();
    for (const sale of sales) {
        if (sale.ticketId) ticketGroups.set(sale.ticketId, [...(ticketGroups.get(sale.ticketId) || []), sale]);
        const status = String(sale.status || '').toLowerCase();
        const offline = ['offline_seller', 'offline_pr'].includes(String(sale.source || '').toLowerCase())
            || ['cash', 'manual'].includes(String(sale.paymentMethod || '').toLowerCase());
        if (isCountableTicketSale(sale) && !isVerifiedSalesRecord(sale)) {
            add('issued_without_confirmed_payment_state', [sale.orderId], sale, 'A ticket or paid order lacks a confirmed payment state under the recorded online or offline workflow.');
        }
        if (offline && !sale.sellerId && !sale.prUserId && !sale.generatedBy && !sale.issuedByAdmin) {
            add('offline_attribution_missing', [sale.orderId], sale, 'Offline sale has no seller, PR, or admin attribution.');
        }
        if (sale.ticketId && (['cancelled', 'canceled', 'expired', 'payment_exception', 'pr_cash_pending', 'pending_approval'].includes(status)
            || ['pending', 'processing', 'failed', 'expired', 'cancelled', 'exception'].includes(String(sale.paymentStatus || '').toLowerCase()))) {
            add('ticket_with_non_deliverable_order_state', [sale.orderId], sale, 'A ticket identifier exists while the order is cancelled, expired, pending, or in payment exception.');
        }
        if (sale.inventoryReserved && ['consumed', 'released', 'expired', 'not_required'].includes(String(sale.reservationStatus || '').toLowerCase())) {
            add('inventory_reservation_state_conflict', [sale.orderId], sale, 'Inventory is marked reserved while its reservation state is terminal or not required.');
        }
        const event = eventsById.get(String(sale.eventId || ''));
        const category = event?.ticketCategories?.find(item => String(item.id) === String(sale.ticketCategoryId));
        if (category && Number.isInteger(Number(sale.quantity)) && Number.isInteger(Number(sale.admissionCount))) {
            const expected = Number(sale.quantity) * Math.max(1, Number(category.groupSize) || 1);
            if (expected !== Number(sale.admissionCount)) add('group_admission_quantity_mismatch', [sale.orderId], sale, `Recorded admissions differ from quantity multiplied by the category group size (${expected}).`);
        }
        if (sale.refundStatus === 'approved' && (sale.paymentStatus === 'refunded' || sale.refundStatus === 'refunded' || sale.refundProviderReference)) {
            add('internal_refund_looks_like_money_returned', [sale.orderId], sale, 'Internal refund approval is accompanied by a provider refund state or reference; verify separately.');
        }
        if (sale.refundStatus === 'refunded' && !sale.refundProviderReference) {
            add('refund_marked_complete_without_provider_reference', [sale.orderId], sale, 'Refund status says completed but no provider refund reference is recorded.');
        }
    }
    for (const [ticketId, group] of ticketGroups) {
        if (group.length > 1) add('duplicate_ticket_identifier', group.map(sale => sale.orderId), group[0], `Ticket identifier ${ticketId} is assigned to multiple orders.`);
    }
    for (const event of events) {
        for (const reservation of event.inventoryReservations || []) {
            if (reservation.status !== 'active') continue;
            const sale = saleById.get(String(reservation.reservationId));
            if (!sale || !sale.inventoryReserved || String(sale.eventId || '') !== eventRef(event)) {
                add('inventory_reservation_without_matching_order', [reservation.reservationId], { eventId: eventRef(event) }, 'An active event reservation has no matching order reservation record.');
            }
        }
        for (const sale of sales.filter(item => String(item.eventId || '') === eventRef(event) && item.inventoryReserved)) {
            const hasActiveReservation = (event.inventoryReservations || []).some(item => String(item.reservationId) === String(sale.orderId) && item.status === 'active');
            if (!hasActiveReservation && sale.reservationStatus === 'active') {
                add('order_reservation_missing_from_event_inventory', [sale.orderId], sale, 'Order says inventory is actively reserved but the event has no matching active reservation.');
            }
        }
    }
    return findings;
}

function buildSalesReport(sales) {
    const countable = sales.filter(isVerifiedSalesRecord);
    const isOffline = sale => ['offline_seller', 'offline_pr'].includes(String(sale.source || '').toLowerCase()) || ['cash', 'manual'].includes(String(sale.paymentMethod || '').toLowerCase());
    const amountFor = sale => Number(sale.customerTotal ?? sale.amount ?? 0) || 0;
    const money = records => {
        const byCurrency = {};
        for (const sale of records) {
            const currency = String(sale.currency || 'INR').toUpperCase();
            byCurrency[currency] = (byCurrency[currency] || 0) + amountFor(sale);
        }
        const currencies = Object.keys(byCurrency);
        return { total: currencies.length <= 1 ? (currencies.length ? byCurrency[currencies[0]] : 0) : null, currency: currencies.length === 1 ? currencies[0] : null, byCurrency };
    };
    const pending = sales.filter(sale => ['pending', 'processing'].includes(String(sale.paymentStatus || '').toLowerCase()) || ['pending', 'pr_cash_pending', 'pending_approval', 'ticket_approval_pending'].includes(String(sale.status || '').toLowerCase()) || sale.approvalStatus === 'PENDING');
    const cancelled = sales.filter(sale => ['cancelled', 'canceled'].includes(String(sale.status || '').toLowerCase()) || sale.paymentStatus === 'cancelled');
    const expired = sales.filter(sale => sale.status === 'expired' || sale.paymentStatus === 'expired');
    const excluded = new Set([...countable, ...pending, ...cancelled, ...expired]);
    const unverified = sales.filter(sale => !excluded.has(sale) && !['failed', 'rejected', 'pr_cash_rejected'].includes(String(sale.status || '').toLowerCase()) && !['failed', 'cancelled'].includes(String(sale.paymentStatus || '').toLowerCase()));
    const grouped = (keyFor, eligible = countable) => {
        const groups = new Map();
        for (const sale of eligible) {
            const key = keyFor(sale) || 'Unknown';
            const item = groups.get(key) || { key, orders: 0, qrCodes: 0, admissions: 0, verifiedRevenue: 0, verifiedRevenueByCurrency: {} };
            item.orders += 1; item.qrCodes += sale.ticketId ? 1 : 0;
            item.admissions += Math.max(0, Number(sale.admissionCount) || Number(sale.quantity) || 1);
            const currency = String(sale.currency || 'INR').toUpperCase();
            item.verifiedRevenueByCurrency[currency] = (item.verifiedRevenueByCurrency[currency] || 0) + amountFor(sale);
            item.verifiedRevenue = Object.keys(item.verifiedRevenueByCurrency).length === 1 ? item.verifiedRevenueByCurrency[currency] : null;
            groups.set(key, item);
        }
        return [...groups.values()];
    };
    const channel = records => {
        const gross = money(records);
        return { orders: records.length, qrCodes: records.filter(sale => Boolean(sale.ticketId)).length, admissions: records.reduce((sum, sale) => sum + Math.max(0, Number(sale.admissionCount) || Number(sale.quantity) || 1), 0), verifiedRevenue: gross.total, verifiedRevenueCurrency: gross.currency, verifiedRevenueByCurrency: gross.byCurrency };
    };
    const confirmedMoney = money(countable), pendingMoney = money(pending), unverifiedMoney = money(unverified);
    const online = countable.filter(sale => !isOffline(sale)), offline = countable.filter(isOffline);
    return {
        totalOrders: sales.length, confirmedOrders: countable.length, qrCodes: countable.filter(sale => Boolean(sale.ticketId)).length,
        admissions: countable.reduce((sum, sale) => sum + Math.max(0, Number(sale.admissionCount) || Number(sale.quantity) || 1), 0),
        verifiedRevenue: confirmedMoney.total, verifiedRevenueCurrency: confirmedMoney.currency, verifiedRevenueByCurrency: confirmedMoney.byCurrency,
        revenueBasis: 'Gross confirmed customerTotal; legacy amount fallback where customerTotal is absent. Excludes unverified and pending orders; internal refund approvals are not subtracted or represented as money returned. Amounts are grouped by currency; mixed-currency totals are not combined.',
        pendingOrders: pending.length, pendingAmount: pendingMoney.total, pendingAmountCurrency: pendingMoney.currency, pendingAmountByCurrency: pendingMoney.byCurrency,
        unverifiedOrders: unverified.length, unverifiedAmount: unverifiedMoney.total, unverifiedAmountCurrency: unverifiedMoney.currency, unverifiedAmountByCurrency: unverifiedMoney.byCurrency,
        expiredOrders: expired.length, cancelledOrders: cancelled.length,
        refundRequests: sales.filter(sale => sale.refundStatus === 'requested').length,
        refundApprovals: sales.filter(sale => sale.refundStatus === 'approved').length,
        refundRejections: sales.filter(sale => sale.refundStatus === 'rejected').length,
        online: channel(online), offline: channel(offline),
        manualReviewOrders: sales.filter(sale => sale.manualReview === true || sale.status === 'manual_review').length,
        byEvent: grouped(sale => sale.event || sale.eventId),
        byCategory: grouped(sale => sale.ticketType || sale.gender || sale.ticketCategoryId),
        bySeller: grouped(sale => sale.sellerId || sale.generatedBy || sale.prUserId || (isOffline(sale) ? 'Offline team' : null)),
    };
}


// ==================== LITTX SELLER ACCOUNTS (max 3 devices) ====================
// Credentials are deployment configuration; never provide source-code defaults.
const SELLER_ACCOUNTS = {
    'SELLER-A': process.env.SELLER_A_PASS || '',
    'SELLER-B': process.env.SELLER_B_PASS || '',
    'SELLER-C': process.env.SELLER_C_PASS || '',
};

function dashboardSaleKey(sale) {
    return String(sale?.orderId || sale?.ticketId || sale?._id || '').trim();
}

function isAdminIssuedSale(sale) {
    if (sale?.issuedByAdmin === true) return true;
    const issuer = normalizeSellerId(sale?.sellerId || sale?.generatedBy || sale?.prUserId);
    return issuer === 'ADMIN' || issuer === 'MASTER-ADMIN' || issuer === 'LITTX-ADMIN';
}

async function getDashboardSaleVisibility(sales) {
    const [users, companies, storedVisibility] = await Promise.all([
        db.getAllUsers(),
        db.getAllCompanies(),
        db.getAllDashboardSaleVisibility(),
    ]);
    const savedByKey = new Map(storedVisibility.map(item => [item.saleKey, item]));
    const companyNames = new Map(companies.map(company => [company.companyId, company.name]));
    Object.entries(SELLER_COMPANY_NAMES).forEach(([id, name]) => companyNames.set(id, companyNames.get(id) || name));
    const slotCompanyMap = new Map(users.filter(user => user.sellerSlot && user.companyId).map(user => [user.sellerSlot, user.companyId]));

    const items = sales.filter(isCountableTicketSale).map(sale => {
        const key = dashboardSaleKey(sale);
        const sources = [sale.sellerId, sale.generatedBy, sale.prUserId, sale.prName].filter(Boolean).map(String);
        const seller = users.find(user => ['seller', 'pr'].includes(user.role) && [user.userId, user.sellerSlot, user.displayName]
            .some(value => value && sources.some(source => normalizeSellerId(source) === normalizeSellerId(value))));
        const sellerId = seller?.userId || sale.sellerId || sale.generatedBy || sale.prUserId || 'Admin';
        const companyId = seller?.companyId || resolveSaleCompanyId(sale, slotCompanyMap) || 'littlane';
        const companyName = companyNames.get(companyId) || displayCompanyName(companyId, companyId);
        const saved = savedByKey.get(key);
        return {
            saleKey: key,
            orderId: sale.orderId || '',
            ticketId: sale.ticketId || '',
            sellerId: String(sellerId),
            sellerName: seller?.displayName || sale.prName || sale.generatedBy || String(sellerId),
            companyId,
            companyName,
            attendee: sale.name || sale.email || 'Unknown attendee',
            passName: sale.ticketType || sale.gender || 'Ticket',
            quantity: Number(sale.quantity) || 1,
            grossRevenue: saleGrossAmount(sale),
            soldAt: sale.paidAt || sale.generatedAt || sale.createdAt || null,
            included: typeof saved?.included === 'boolean' ? saved.included : !isAdminIssuedSale(sale),
        };
    }).filter(item => item.saleKey);
    return { items, savedByKey };
}

async function filterDashboardVisibleSales(sales) {
    const { items } = await getDashboardSaleVisibility(sales);
    const includedByKey = new Map(items.map(item => [item.saleKey, item.included]));
    return sales.filter(sale => {
        if (!isCountableTicketSale(sale)) return true;
        return includedByKey.get(dashboardSaleKey(sale)) !== false;
    });
}



function requireSeller(req, res, next) {
    const token = req.headers['x-seller-token'];
    authenticateSeller(token).then(sellerId => {
        if (!sellerId) return res.status(401).json({ success: false, message: 'Seller not authenticated. Please log in.' });
        req.sellerId = sellerId;
        next();
    }).catch(next);
}

async function sellerOwnsEvent(sellerId, eventName) {
    const users = await db.getAllUsers();
    const seller = users.find(user => user.role === 'seller' && (user.userId === sellerId || user.sellerSlot === sellerId));
    const companyId = seller?.companyId || sellerCompanyIdFromValue(sellerId);
    const event = pickCanonicalEvent(await db.getAllEvents(), eventName);
    return Boolean(companyId && event?.companyId && event.companyId === companyId);
}

// Ticket PDFs contain attendee PII. Serve them only through the ticket
// delivery handler so a guessed static filename cannot bypass ticket checks.

// ==================== SPA ROUTES — /tickets and /dashboard serve React app ====================
// Try multiple candidate paths for the React build (handles local dev + Railway)
const _distCandidates = [
    path.join(__dirname, '../combined-app/dist'),
    path.join(process.cwd(), 'combined-app/dist'),
    path.join(process.cwd(), '../combined-app/dist'),
    '/app/combined-app/dist',
];
const fs2 = require('fs');
const _distDir = _distCandidates.find(p => fs2.existsSync(path.join(p, 'index.html'))) || _distCandidates[0];
const distIndexHtml = path.join(_distDir, 'index.html');
console.log(`React dist: ${_distDir} (exists: ${fs2.existsSync(distIndexHtml)})`);

// Serve static JS/CSS assets from the React build
app.use('/assets', express.static(path.join(_distDir, 'assets')));

app.get('/tickets', (req, res) => res.sendFile(distIndexHtml));
app.get('/tickets/:splat', (req, res) => res.sendFile(distIndexHtml));

// Partner portal
app.get('/pr', (req, res) => res.sendFile(distIndexHtml));
app.get('/pr/:splat', (req, res) => res.sendFile(distIndexHtml));

// Admin dashboard — serve the React build
app.get('/admin', (req, res) => res.sendFile(distIndexHtml));
app.get('/admin/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashboard', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashboard/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashhboard', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashhboard/:splat', (req, res) => res.sendFile(distIndexHtml));

// Seller portal
app.get('/seller', (req, res) => res.sendFile(distIndexHtml));
app.get('/seller/:splat', (req, res) => res.sendFile(distIndexHtml));

// Shadow panel
app.get('/shadowbyash', (req, res) => res.sendFile(distIndexHtml));
app.get('/shadowbyash/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/shadow', (req, res) => res.sendFile(distIndexHtml));
app.get('/shadow/:splat', (req, res) => res.sendFile(distIndexHtml));

// Legacy public ticket view — retained for historic /view/:ticketId links until cutoff.
app.get('/view/:ticketId', (req, res) => res.sendFile(distIndexHtml));


// Serve original LITTX HTML site (index.html + script.js + styles.css) for everything else
const _staticCandidates = [
    path.join(__dirname, '..'),
    process.cwd(),
    '/app',
];
const _staticDir = _staticCandidates.find(p => fs2.existsSync(path.join(p, 'index.html'))) || _staticCandidates[0];
console.log(`Static dir: ${_staticDir} (exists: ${fs2.existsSync(path.join(_staticDir, 'index.html'))})`);
app.use(express.static(_staticDir));

// ==================== HELPERS ====================
// In-memory token store for unified auth sessions (populated by /api/auth/login)
const solverRevealAttempts = new Map();

function solverActor(req) {
    return req.adminSession?.displayName || req.adminSession?.userId || 'Master Admin';
}

function solverRevealAllowed(req, res) {
    const secret = process.env.SOLVER_REVEAL_PASSWORD;
    if (!secret) return false;
    const token = String(req.headers['x-solver-reveal-token'] || '');
    const [issued, supplied] = token.split('.');
    const issuedMs = Number(issued);
    if (!Number.isFinite(issuedMs) || Date.now() - issuedMs > 10 * 60 * 1000 || issuedMs > Date.now() + 30000) return false;
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', secret).update(`${req.adminSession?.userId || 'Legacy Admin'}:${issued}`).digest('hex');
    return supplied && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function solverTierFamily(name) {
    const value = String(name || '').toLowerCase();
    const group = value.match(/(?:group\s*(?:of\s*)?|of\s*)(5|10)/)?.[1] || '1';
    if (!/(vip|premium)/.test(value) && !/(general|ga\b)/.test(value)) return null;
    return { size: Number(group), level: /(vip|premium)/.test(value) ? 2 : 1 };
}

function solverStatus(sale) {
    if (sale.disabledAt) return 'disabled';
    if (sale.status === 'cancelled') return 'cancelled';
    if (sale.status === 'scanned' || (sale.scannedAt && !sale.reactivatedAt)) return 'used';
    return ['paid', 'ticket_generated', 'emailed', 'email_failed'].includes(sale.status) ? 'active' : String(sale.status || 'unknown');
}

function solverSource(sale) {
    const raw = String(sale.source || '').toLowerCase();
    if (sale.isShadow || raw.includes('shadow')) return 'Shadow';
    if (raw.includes('pr') || sale.prUserId || sale.prName) return 'PR';
    if (raw.includes('offline')) return 'Offline';
    if (raw.includes('manual') || sale.paymentMethod?.toLowerCase?.().includes('manual')) return 'Manual';
    if (sale.sellerId || raw.includes('seller')) return 'Seller';
    return 'Admin';
}

async function getSolverEventPricing(eventName) {
    const events = await db.getAllEvents();
    const event = pickCanonicalEvent(events, eventName);
    if (!event) return null;
    const passes = [...(event.tiers || []), ...(event.ticketTypes || [])]
        .filter(pass => pass?.name && Number.isFinite(Number(pass.price)))
        .map(pass => ({ id: pass.id || pass.name, name: pass.name, price: Number(pass.price), gender: pass.gender || 'unisex' }))
        .filter((pass, index, all) => all.findIndex(other => other.name === pass.name) === index);
    return { event, passes };
}

function solverTicketPayload(sale, reveal) {
    const quantity = Math.max(1, Number(sale.quantity) || 1);
    const storedUnitPrice = Number(sale.passUnitPrice ?? sale.officialRate);
    const unitPrice = Number.isFinite(storedUnitPrice) && storedUnitPrice >= 0
        ? storedUnitPrice
        : (Number(sale.amount ?? sale.customerTotal) || 0) / quantity;
    return {
        ticketId: sale.ticketId, event: sale.event || EVENT.name, attendee: sale.name || '—', phone: sale.phone || '', email: sale.email || '',
        tier: ticketTypeForSale(sale), quantity, price: unitPrice,
        amount: Number(sale.amount) || 0, createdAt: sale.createdAt || sale.generatedAt || sale.paidAt || null,
        status: solverStatus(sale), generatedBy: reveal ? (sale.generatedBy || sale.prName || (sale.issuedByAdmin ? 'Admin' : 'Unknown')) : null,
        sellerId: reveal ? (sale.sellerId || sale.prUserId || '') : null,
        company: reveal ? (sale.companyId || 'Unknown') : null,
        source: reveal ? solverSource(sale) : null, devicePortal: reveal ? (sale.deviceName || sale.portal || sale.paymentMethod || 'Unknown') : null,
        scannedAt: sale.scannedAt || null, scannedBy: sale.scannedBy || null, disabledAt: sale.disabledAt || null,
        originalTier: sale.solverOriginalTier || null, upgradedAt: sale.solverUpgradedAt || null, upgradedBy: sale.solverUpgradedBy || null,
        solverCanReactivate: sale.status === 'scanned' || Boolean(sale.disabledAt),
        solverCanDisable: !sale.disabledAt && ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(sale.status),
        solverCanUpgrade: !sale.disabledAt && sale.status !== 'cancelled' && sale.status !== 'scanned' && !(sale.scannedAt && !sale.reactivatedAt),
    };
}

async function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    const token = req.headers['x-auth-token'];
    const isPres = req.headers['x-presentation'] === 'true' || req.query.pres === 'true';

    if (isPres) {
        const presentationKey = process.env.PRESENTATION_KEY;
        if (presentationKey && req.method === 'GET' && req.path === '/api/admin/sales' && key === presentationKey) {
            req.presentationOnly = true;
            return next();
        }
        return res.status(401).json({ success: false, message: 'Access Denied: Use the presentation password.' });
    }

    // Accept ADMIN_KEY (legacy)
    if (ADMIN_KEY && key && key === ADMIN_KEY) {
        req.adminSession = { userId: 'Legacy Admin', role: 'master_admin', companyId: 'littx' };
        return next();
    }

    // Persisted sessions are the source of truth across serverless instances.
    if (token) {
        try {
            const session = await db.getUserSessionByToken(token);
            if (isValidUserSession(session, token) && ['master_admin', 'company_admin'].includes(session.role)) {
                req.adminSession = session;
                return next();
            }
            if (session) return res.status(403).json({ success: false, message: 'Administrator access is not authorized.' });
        } catch (err) {
            return next(err);
        }
    }

    return res.status(401).json({ success: false, message: 'Access Denied: Invalid admin credentials.' });
}

// Event-specific management accepts explicit organizer assignments while the
// broader admin middleware remains limited to master/company administrators.
async function requireEventManager(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (ADMIN_KEY && key && key === ADMIN_KEY) {
        req.adminSession = { userId: 'Legacy Admin', role: 'master_admin', companyId: 'littx' };
        return next();
    }
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Administrator or organizer authentication is required.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        if (!['master_admin', 'company_admin', 'organizer'].includes(session.role)) return res.status(403).json({ success: false, message: 'Event management is not authorized for this role.' });
        if (session.role === 'organizer') {
            const account = await db.getUserById(session.userId);
            if (!account || account.role !== 'organizer' || account.active === false || account.blocked) {
                await db.deleteUserSession(session.userId);
                return res.status(403).json({ success: false, message: 'Organizer account is inactive or suspended.' });
            }
        }
        req.adminSession = session;
        return next();
    } catch (error) { return next(error); }
}

async function requireOrganizer(req, res, next) {
    const token = req.headers['x-auth-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Organizer authentication is required.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        const account = await db.getUserById(session.userId);
        if (session.role !== 'organizer' || !account || account.role !== 'organizer' || account.active === false || account.blocked) {
            if (session.role === 'organizer') await db.deleteUserSession(session.userId);
            return res.status(403).json({ success: false, message: 'Organizer access is not authorized or the account is suspended.' });
        }
        req.adminSession = session;
        req.organizerAccount = account;
        return next();
    } catch (error) { return next(error); }
}

async function requireMasterAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (key && key === ADMIN_KEY) {
        req.adminSession = {
            userId: 'Legacy Admin',
            displayName: 'Legacy Admin',
            role: 'master_admin',
            companyId: 'littx'
        };
        return next();
    }

    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Master admin authentication is required.' });

    try {
        const session = await db.getUserSessionByToken(token);
        if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        if (session.role !== 'master_admin') {
            return res.status(403).json({ success: false, message: 'Only master admin can access seller company panels.' });
        }
        req.adminSession = session;
        return next();
    } catch (err) {
        return next(err);
    }
}

// PR ticket review is available to the dashboard company admin as well as the
// master admin. Keep this scope limited to approval queue/actions; all other
// master-only routes continue using requireMasterAdmin.
async function requireApprovalAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (key && key === ADMIN_KEY) return requireMasterAdmin(req, res, next);
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Dashboard or master admin authentication is required.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        const allowedMaster = session.role === 'master_admin';
        const allowedDashboard = session.role === 'company_admin' && session.companyId === 'littlane';
        if (!allowedMaster && !allowedDashboard) {
            return res.status(403).json({ success: false, message: 'Only dashboard or master administrators can review ticket approvals.' });
        }
        req.adminSession = session;
        return next();
    } catch (err) {
        return next(err);
    }
}

function approvalAdminOwnsSale(req, sale) {
    if (req.adminSession?.role === 'master_admin') return true;
    const companyId = sale?.companyId || sellerCompanyIdFromValue(sale?.sellerId || sale?.generatedBy || sale?.prUserId) || 'littlane';
    return req.adminSession?.role === 'company_admin' && req.adminSession.companyId === companyId;
}

async function resolveAdminPrincipal(req) {
    const key = req.headers['x-admin-key'];
    if (key && key === ADMIN_KEY) return 'Legacy Admin';
    const token = req.headers['x-auth-token'];
    if (!token) return 'Admin';
    try {
        const session = await db.getUserSessionByToken(token);
        return session?.userId || session?.displayName || 'Admin';
    } catch (_) {
        return 'Admin';
    }
}

async function requirePartnerAdmin(req, res, next) {
    return requireMasterAdmin(req, res, next);
}

async function requirePR(req, res, next) {
    const token = req.headers['x-auth-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Partner authentication is required.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        if (session.role !== 'pr' || !session.userId) {
            return res.status(403).json({ success: false, message: 'Partner access is not authorized.' });
        }
        const account = await db.getUserById(session.userId);
        if (account && (account.role !== 'pr' || account.active === false || account.blocked)) {
            await db.deleteUserSession(session.userId);
            return res.status(403).json({ success: false, message: 'Partner account is inactive or suspended.' });
        }
        req.prSession = session;
        return next();
    } catch (err) {
        return next(err);
    }
}

// ==================== 1. CREATE ORDER (start of checkout) ====================
app.post('/api/create-order', checkoutRateLimit, async (req, res) => {
    if (!TEST_MODE && !PAYMENT_CREDENTIALS_CONFIGURED) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    const { name, email, phone, gender, quantity, eventId, eventSlug, event, ticketCategoryId, ticketType } = req.body || {};
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();

    if (!name || !email || !phone || !(eventId || eventSlug || event) || !(ticketCategoryId || ticketType || gender)) {
        return res.status(400).json({ success: false, message: 'Name, email, phone, event and ticket category are all required.' });
    }
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ success: false, message: 'A valid Idempotency-Key header is required.' });
    const requestedEvent = eventId || eventSlug || event;
    const requestedCategory = ticketCategoryId || ticketType || gender;
    await expireEventReservations();
    const requestHash = crypto.createHmac('sha256', RZP_KEY_SECRET || process.env.CHECKOUT_IDEMPOTENCY_SECRET || 'stageway-test-idempotency-key')
        .update(JSON.stringify({ name: String(name).trim(), email: String(email).trim().toLowerCase(), phone: String(phone).trim(), event: String(requestedEvent), category: String(requestedCategory), quantity: String(quantity ?? 1) }))
        .digest('hex');
    const idempotency = await db.claimCheckoutRequest(idempotencyKey, requestHash);
    if (!idempotency.claimed) {
        const previous = idempotency.request;
        if (previous.requestHash !== requestHash) return res.status(409).json({ success: false, message: 'This checkout key was already used for different checkout details.' });
        if (previous.status === 'processing') return res.status(202).json({ success: false, pending: true, message: 'This checkout request is already being prepared. Retry shortly using the same key.' });
        if (previous.status !== 'completed') return res.status(409).json({ success: false, message: 'This checkout attempt could not be completed. Start a new attempt.' });
        const existing = await db.getByOrderId(previous.orderId);
        if (!existing || normalizePaymentStatus(existing) === 'expired') return res.status(409).json({ success: false, expired: true, message: 'This checkout has expired. Start a new attempt.' });
        if (normalizePaymentStatus(existing) !== 'pending') return res.status(409).json({ success: false, finalized: true, message: 'This checkout has already been finalized.' });
        return res.json({ success: true, testMode: TEST_MODE, orderId: existing.orderId, amount: existing.amount, amountMinor: expectedSaleAmountMinor(existing), currency: existing.currency, reservationExpiresAt: existing.reservationExpiresAt, keyId: RZP_KEY_ID || null, event: existing.event, eventId: existing.eventId, ticketCategoryId: existing.ticketCategoryId, ticketType: existing.ticketType, idempotentReplay: true });
    }
    if (idempotency.reclaimed) {
        const interrupted = await db.getSaleByCheckoutRequestId(idempotencyKey);
        if (interrupted && normalizePaymentStatus(interrupted) === 'pending' && new Date(interrupted.reservationExpiresAt) > new Date()) {
            if (interrupted.inventoryLimited && !interrupted.inventoryReserved) {
                const reserved = await db.reserveEventInventory({
                    eventId: interrupted.eventId, reservationId: interrupted.orderId, categoryId: interrupted.ticketCategoryId,
                    admissionCount: interrupted.admissionCount, expiresAt: interrupted.reservationExpiresAt
                });
                if (!reserved.ok || !reserved.reserved) {
                    await db.failCheckoutRequest(idempotencyKey);
                    return res.status(409).json({ success: false, message: 'The interrupted checkout could not safely restore its inventory hold. Start a new attempt.' });
                }
                await db.updateSaleRecord(interrupted.orderId, { inventoryReserved: true, reservationStatus: 'active' });
            }
            await db.completeCheckoutRequest(idempotencyKey, interrupted.orderId);
            return res.json({ success: true, testMode: TEST_MODE, orderId: interrupted.orderId, amount: interrupted.amount, amountMinor: expectedSaleAmountMinor(interrupted), currency: interrupted.currency, reservationExpiresAt: interrupted.reservationExpiresAt, keyId: RZP_KEY_ID || null, event: interrupted.event, eventId: interrupted.eventId, ticketCategoryId: interrupted.ticketCategoryId, ticketType: interrupted.ticketType, idempotentReplay: true });
        }
    }
    let computed;
    try { computed = await resolveTicketAmount(requestedEvent, requestedCategory, quantity); }
    catch (error) { await db.failCheckoutRequest(idempotencyKey); throw error; }
    if (!computed) {
        await db.failCheckoutRequest(idempotencyKey);
        return res.status(400).json({ success: false, message: 'Event or ticket category is unavailable. Check the event, sale window, quantity and inventory.' });
    }
    const { amount, qty, admissionCount, inventoryLimited, event: eventName, eventId: canonicalEventId, ticketCategoryId: canonicalCategoryId, ticketType: categoryName, currency } = computed;

    try {
        let orderId;

        if (TEST_MODE) {
            orderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            const order = await razorpay.orders.create({
                amount: computed.amountMinor,
                currency,
                receipt: `ft_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
            });
            if (order.amount !== computed.amountMinor || String(order.currency).toUpperCase() !== String(currency).toUpperCase()) {
                console.error('[create-order] Gateway order amount/currency did not match the server calculation.');
                await db.failCheckoutRequest(idempotencyKey);
                return res.status(502).json({ success: false, message: 'Payment order could not be reconciled. Please retry.' });
            }
            orderId = order.id;
        }

        const reservationExpiresAt = new Date(Date.now() + CHECKOUT_RESERVATION_MS);
        await db.createSaleRecord({
            orderId,
            event: eventName,
            eventId: canonicalEventId,
            ticketCategoryId: canonicalCategoryId,
            name, email, phone, gender: gender || categoryName,
            ticketType: categoryName,
            quantity: qty,
            admissionCount: computed.admissionCount,
            amount,
            amountMinor: computed.amountMinor,
            currency,
            status: 'created',
            paymentStatus: 'pending',
            fulfillmentStatus: 'pending',
            reservationExpiresAt,
            reservationStatus: computed.inventoryLimited ? 'active' : 'not_required',
            inventoryReserved: false,
            inventoryLimited: computed.inventoryLimited,
            checkoutRequestId: idempotencyKey,
            paymentId: null,
            ticketId: null,
            emailStatus: null,
            emailError: null,
            errorLog: [],
            createdAt: new Date().toISOString()
        });

        if (computed.inventoryLimited) {
            const reservation = await db.reserveEventInventory({
                eventId: canonicalEventId, reservationId: orderId, categoryId: canonicalCategoryId,
                admissionCount: computed.admissionCount, expiresAt: reservationExpiresAt
            });
            if (!reservation.ok || !reservation.reserved) {
                await db.updateSaleRecord(orderId, {
                    status: 'failed', paymentStatus: 'failed', reservationStatus: 'released',
                    errorLog: [{ at: new Date().toISOString(), stage: 'inventory_reservation', error: reservation.reason || 'Inventory unavailable.' }]
                });
                await db.failCheckoutRequest(idempotencyKey);
                return res.status(409).json({ success: false, message: 'The selected ticket inventory is no longer available. Please refresh and try again.' });
            }
            await db.updateSaleRecord(orderId, { inventoryReserved: true, reservationStatus: 'active' });
        }
        await db.completeCheckoutRequest(idempotencyKey, orderId);

        console.log(`[Order Created] ${categoryName} x${qty} | amount ${amount} ${currency}`);

        res.json({
            success: true,
            testMode: TEST_MODE,
            orderId,
            amount,
            amountMinor: computed.amountMinor,
            currency,
            reservationExpiresAt,
            keyId: RZP_KEY_ID || null,
            event: eventName,
            eventId: canonicalEventId,
            ticketCategoryId: canonicalCategoryId,
            ticketType: categoryName
        });
    } catch (err) {
        await db.failCheckoutRequest(idempotencyKey).catch(() => {});
        console.error('[create-order] Failed to create checkout order.', { status: err.statusCode || 'n/a', name: err.name || 'Error' });
        res.status(err.statusCode === 401 ? 401 : 500).json({
            success: false,
            message: err.statusCode === 401
                ? 'Payment gateway rejected our credentials. Check RAZORPAY_KEY_ID/SECRET in server/.env.'
                : 'Could not start checkout. Please try again.'
        });
    }
});

// ==================== 2. VERIFY PAYMENT (after gateway completes) ====================
app.post('/api/verify-payment', checkoutRateLimit, async (req, res) => {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};

    let sale = await db.getByOrderId(orderId);
    if (!sale) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (!TEST_MODE && (!PAYMENT_CREDENTIALS_CONFIGURED || !razorpay)) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    if (!TEST_MODE && (!razorpay_order_id || razorpay_order_id !== sale.orderId || !razorpay_payment_id || !razorpay_signature)) {
        return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    try {
        let paymentId = razorpay_payment_id;

        if (TEST_MODE) {
            paymentId = paymentId || `pay_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            if (!verifyRazorpaySignature({ orderId: sale.orderId, paymentId: razorpay_payment_id, signature: razorpay_signature, secret: RZP_KEY_SECRET })) {
                return res.status(400).json({ success: false, message: 'Payment verification failed (signature mismatch).' });
            }
            const providerPayment = await razorpay.payments.fetch(razorpay_payment_id);
            const reconciliation = reconcileCapturedPayment({
                payment: providerPayment, orderId: sale.orderId,
                expectedAmountMinor: expectedSaleAmountMinor(sale), expectedCurrency: sale.currency || 'INR'
            });
            if (!reconciliation.ok) {
                if (reconciliation.failed) {
                    await db.updateSaleRecord(orderId, { lastPaymentAttemptId: razorpay_payment_id, lastPaymentAttemptStatus: 'failed', lastPaymentAttemptAt: new Date() });
                    return res.status(409).json({ success: false, retryable: true, paymentStatus: normalizePaymentStatus(sale), message: 'This payment attempt failed. You may retry checkout while the order remains valid.' });
                }
                if (reconciliation.pending) return res.status(202).json({ success: false, pending: true, paymentStatus: 'processing', message: 'Payment is still being confirmed. You can safely retry this status check.' });
                await db.updateSaleRecord(orderId, {
                    paymentException: `Provider payment reconciliation failed: ${reconciliation.reason}`,
                    errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'payment_reconciliation', error: reconciliation.reason }]
                });
                return res.status(409).json({ success: false, reconciliationRequired: true, message: 'Payment details need reconciliation. No ticket has been issued.' });
            }
        }

        const accepted = await acceptCapturedPayment(sale, paymentId);
        if (accepted.kind === 'late_payment') return res.status(409).json({ success: false, paid: true, reconciliationRequired: true, paymentStatus: 'paid', message: 'Payment was received after the inventory hold expired. The booking needs support review.' });
        if (accepted.kind === 'inventory_conflict') return res.status(409).json({ success: false, paid: true, reconciliationRequired: true, message: 'Payment was received but inventory needs support review. No ticket has been issued.' });
        if (accepted.kind === 'payment_conflict') return res.status(409).json({ success: false, reconciliationRequired: true, message: 'This payment reference is already associated with another booking. Support review is required; no ticket has been issued.' });
        if (accepted.kind === 'processing') return res.status(202).json({ success: false, pending: true, paymentStatus: 'processing', message: 'Payment is being processed. Retry this status check shortly.' });
        sale = accepted.sale || sale;
        if (accepted.kind === 'already_paid' && sale.ticketId) {
            return res.json({ success: true, ticketId: sale.ticketId, downloadUrl: `${BASE_URL}/api/ticket/${sale.ticketId}/download`, emailSent: sale.emailStatus === 'sent', event: sale.event, name: sale.name, email: sale.email, quantity: sale.quantity, amount: sale.amount, generatedAt: sale.generatedAt || sale.paidAt, alreadyProcessed: true });
        }

        const ticket = await ensureTicketGenerated(sale);
        if (ticket.pending) return res.status(202).json({ success: false, pending: true, paymentStatus: 'paid', message: 'Payment is confirmed. Your ticket is being generated; retry this status check shortly.' });
        if (ticket.failed) {
            return res.status(500).json({
                success: false,
                message: 'Payment succeeded but ticket generation failed. Our team has been notified — contact support with your payment ID.',
                paymentId
            });
        }
        sale = ticket.sale;
        const { ticketId, pdfPath, qrBuffer, qrDataUrl } = ticket;
        const generatedAt = sale.generatedAt || sale.paidAt;

        const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;

        // ---- Email the ticket ----
        const emailResult = process.env.NODE_ENV === 'test' ? { success: false, error: 'Notification delivery is disabled in tests.' } : await sendTicketEmail({
            to: sale.email,
            name: sale.name,
            ticketId,
            gender: sale.gender,
            quantity: sale.quantity,
            amount: sale.amount,
            pdfPath,
            qrBuffer,
            downloadUrl,
            event: sale.event || 'DHOLIDA GARBA ROYALE'
        });

        if (emailResult.success) {
            await db.updateSaleRecord(orderId, { status: 'emailed', emailStatus: 'sent', emailError: null, emailPreviewUrl: emailResult.previewUrl || null });
        } else {
            await db.updateSaleRecord(orderId, {
                status: 'email_failed',
                emailStatus: 'failed',
                emailError: emailResult.error,
                errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'email', error: emailResult.error }]
            });
        }

        console.log(`[Ticket Issued] Email delivery ${emailResult.success ? 'accepted' : 'failed'}.`);

        const whatsappResult = process.env.NODE_ENV === 'test' ? { success: false, reason: 'Notification delivery is disabled in tests.' } : await sendAndRecordTicketWhatsApp({
            orderId, phone: sale.phone, name: sale.name, ticketId,
            event: sale.event || EVENT.name, ticketType: ticketTypeForSale(sale), pdfPath
        });

        res.json({
            success: true,
            ticketId,
            downloadUrl,
            qrDataUrl,
            emailSent: emailResult.success,
            emailError: emailResult.success ? null : emailResult.error,
            whatsappSent: whatsappResult.success,
            event: EVENT.name,
            name: sale.name,
            email: sale.email,
            gender: sale.gender,
            quantity: sale.quantity,
            amount: sale.amount,
            generatedAt,
            details: EVENT_DETAILS
        });
    } catch (err) {
        console.error('[verify-payment] Error:', err.message);
        await db.updateSaleRecord(orderId, {
            status: 'payment_error',
            errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'verify-payment', error: safeErrorMessage(err) }]
        });
        res.status(500).json({ success: false, message: 'Something went wrong verifying your payment. Please contact support.' });
    }
});

// ==================== 2B. RAZORPAY WEBHOOK ====================
const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

app.post('/api/webhook/razorpay', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        if (!signature || !RZP_WEBHOOK_SECRET || !Buffer.isBuffer(req.rawBody)) {
            return res.status(400).send('Missing signature or secret');
        }

        const expectedSignature = crypto
            .createHmac('sha256', RZP_WEBHOOK_SECRET)
            .update(req.rawBody)
            .digest('hex');

        const suppliedSignature = Buffer.from(String(signature));
        const expectedSignatureBuffer = Buffer.from(expectedSignature);
        if (suppliedSignature.length !== expectedSignatureBuffer.length || !crypto.timingSafeEqual(suppliedSignature, expectedSignatureBuffer)) {
            console.error('[webhook] Invalid signature');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body.event;
        if (!['order.paid', 'payment.captured', 'payment.failed'].includes(event)) return res.status(200).send('Ignored');
        let paymentEntity = req.body?.payload?.payment?.entity;
        let orderId = paymentEntity?.order_id || req.body?.payload?.order?.entity?.id;
        if (!orderId) return res.status(200).send('No order ID');
        if (!paymentEntity && razorpay) {
            const payments = await razorpay.orders.fetchPayments(orderId);
            paymentEntity = (payments.items || []).find(payment => payment.status === 'captured' && payment.order_id === orderId);
        }
        if (!paymentEntity?.id) return res.status(500).send('Captured payment details unavailable');
        const sale = await db.getByOrderId(orderId);
        if (!sale) return res.status(200).send('Unknown order');
        const providerEventId = String(req.headers['x-razorpay-event-id'] || `sha256:${crypto.createHash('sha256').update(req.rawBody).digest('hex')}`);
        if ((sale.razorpayEventIds || []).includes(providerEventId)) return res.status(200).send('Duplicate event');
        if (event === 'payment.failed') {
            await db.updateSaleRecord(orderId, { lastPaymentAttemptId: paymentEntity?.id || null, lastPaymentAttemptStatus: 'failed', lastPaymentAttemptAt: new Date() });
            await db.recordRazorpayEvent(orderId, providerEventId);
            return res.status(200).send('Payment attempt failed; order remains retryable');
        }
        const reconciliation = reconcileCapturedPayment({
            payment: paymentEntity, orderId: sale.orderId,
            expectedAmountMinor: expectedSaleAmountMinor(sale), expectedCurrency: sale.currency || 'INR'
        });
        if (!reconciliation.ok) {
            if (reconciliation.pending) return res.status(200).send('Payment not captured');
            await db.updateSaleRecord(orderId, {
                paymentException: `Webhook payment reconciliation failed: ${reconciliation.reason}`,
                errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'webhook_reconciliation', error: reconciliation.reason }]
            });
            console.error('[webhook] Payment reconciliation failed.', { reason: reconciliation.reason });
            return res.status(200).send('Payment requires reconciliation');
        }
        const accepted = await acceptCapturedPayment(sale, paymentEntity.id);
        if (['late_payment', 'inventory_conflict', 'payment_conflict'].includes(accepted.kind)) return res.status(200).send('Payment requires manual reconciliation');
        if (accepted.kind === 'processing') return res.status(500).send('Payment processing is in progress; retry later');
        const issued = await ensureTicketGenerated(accepted.sale || sale);
        if (issued.pending || issued.failed) return res.status(500).send('Ticket issuance pending; retry later');
        const currentSale = issued.sale;
        const downloadUrl = `${BASE_URL}/api/ticket/${issued.ticketId}/download`;

        if (currentSale.emailStatus !== 'sent') {
            const emailResult = process.env.NODE_ENV === 'test' ? { success: false, error: 'Notification delivery is disabled in tests.' } : await sendTicketEmail({
                to: currentSale.email, name: currentSale.name, ticketId: issued.ticketId, gender: currentSale.gender,
                quantity: currentSale.quantity, amount: currentSale.amount, pdfPath: issued.pdfPath, qrBuffer: issued.qrBuffer,
                downloadUrl, event: currentSale.event || 'DHOLIDA GARBA ROYALE'
            });
            await db.updateSaleRecord(orderId, emailResult.success
                ? { status: 'emailed', emailStatus: 'sent', emailError: null, emailPreviewUrl: emailResult.previewUrl || null }
                : { status: 'email_failed', emailStatus: 'failed', emailError: emailResult.error });
        }
        if (currentSale.whatsappStatus !== 'sent') {
            if (process.env.NODE_ENV !== 'test') await sendAndRecordTicketWhatsApp({
                orderId, phone: currentSale.phone, name: currentSale.name, ticketId: issued.ticketId,
                event: currentSale.event || EVENT.name, ticketType: ticketTypeForSale(currentSale), pdfPath: issued.pdfPath
            });
        }
        await db.recordRazorpayEvent(orderId, providerEventId);
        return res.status(200).send('OK');
    } catch (err) {
        console.error('[webhook error]', err.message);
        res.status(500).send('Webhook Error');
    }
});

// ==================== 3. PUBLIC TICKET VIEW (JSON for /view/:ticketId page) ====================
function ticketTypeForSale(sale) {
    const storedType = String(sale?.ticketType || '').trim();
    if (storedType) return storedType;
    const legacyGender = String(sale?.gender || '').trim();
    const legacyLabels = { male: 'GA Single', female: 'VIP Single', aura: 'Dholida Garba Royale', exclusive: 'VIP Single' };
    return legacyLabels[legacyGender] || legacyGender || 'General';
}

async function publicTicketAmount(sale) {
    const quantity = Math.max(1, Number.parseInt(sale?.quantity, 10) || 1);

    // A public ticket always shows its official pass value, even when an
    // outlet issued it complimentary. Free/Chai Pani changes revenue only.
    // New records retain this immutable unit-price snapshot, so later price
    // edits cannot alter a ticket that was already issued.
    const storedUnitPrice = Number(sale?.passUnitPrice ?? sale?.officialRate);
    if (Number.isFinite(storedUnitPrice) && storedUnitPrice > 0) return Math.round(storedUnitPrice * quantity * 100) / 100;

    // Repair legacy records that were stored with the default single-pass
    // amount despite carrying a group/VIP pass type. This also recovers
    // complimentary tickets created before the snapshot fix, which saved a
    // zero unit price.
    const pricing = await getEventPricing(sale?.event).catch(() => null);
    const pass = pricing?.passes?.find(item => item.name === ticketTypeForSale(sale) || item.id === ticketTypeForSale(sale));
    if (pass && Number.isFinite(pass.price)) return Math.round(pass.price * quantity * 100) / 100;

    if (Number.isFinite(storedUnitPrice) && storedUnitPrice >= 0) return Math.round(storedUnitPrice * quantity * 100) / 100;
    const customerTotal = Number(sale?.customerTotal);
    if (Number.isFinite(customerTotal) && customerTotal >= 0) return customerTotal;
    const legacyAmount = Number(sale?.amount);
    return Number.isFinite(legacyAmount) ? legacyAmount : 0;
}

app.get('/api/ticket/:ticketId', rateLimit({ limit: 30, windowMs: 15 * 60 * 1000, keyPrefix: 'ticket-view' }), async (req, res) => {
    const { ticketId } = req.params;
    if (!ticketId) return res.status(400).json({ success: false, message: 'Ticket ID required' });
    const sale = await db.getByTicketId(ticketId);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found. Please check the link or contact support.' });
    if (sale.disabledAt) return res.status(410).json({ success: false, message: 'This ticket has been disabled. Contact the organizer.' });
    if (!canDeliverSale(sale)) {
        return res.status(403).json({ success: false, message: 'This ticket is awaiting dashboard approval.' });
    }
    if (!isCountableTicketSale(sale)) return res.status(410).json({ success: false, message: 'This ticket is no longer active.' });

    // Build event details (mirrors ticket.js)
    const isAura = sale.event && sale.event.toUpperCase().includes('AURA');
    const dateLabel = isAura
        ? '17 OCT 2026 · 4:00 PM'
        : '17 OCT 2026 · 4:00 PM';
    const venue = 'Pethkar Ground, Kothrud, Pune';
    const amount = await publicTicketAmount(sale);
    const quantity = Math.max(1, Number.parseInt(sale.quantity, 10) || 1);
    const passUnitPrice = Math.round((amount / quantity) * 100) / 100;
    // Public lookup stays read-only; legacy pricing repair belongs in a
    // controlled migration rather than an unauthenticated GET request.
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
    res.json({ success: true, ticket: {
        ticketId: sale.ticketId, event: sale.event || 'DHOLIDA GARBA ROYALE', name: sale.name,
        attendee: sale.name, dateLabel, venue, ticketType: ticketTypeForSale(sale), amount,
        quantity: sale.quantity || 1, status: sale.scannedAt ? 'scanned' : 'paid',
        scannedAt: sale.scannedAt, generatedAt: sale.generatedAt || sale.createdAt
    } });
});

// OTP-verified customer view. The signed token is scoped to this operation,
// ticket and stored recipient; the ticket ID alone is not authorization here.
app.post('/api/customer/bookings/ticket-view', recoveredTicketViewRateLimit, async (req, res) => {
    const ticketId = String(req.body?.ticketId || '');
    const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[A-Za-z0-9-]{1,128}$/.test(ticketId)) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale || !verifyCustomerTicketToken({ token, ticketId, email: sale.email || '', secret: process.env.BOOKING_OTP_SECRET, purpose: 'customer_ticket_view' })) {
            return res.status(401).json({ success: false, message: 'Ticket access is invalid or expired. Verify your booking again.' });
        }
        if (sale.disabledAt || !canDeliverSale(sale) || !isCountableTicketSale(sale)) return res.status(410).json({ success: false, message: 'This ticket is no longer active.' });
        const amount = await publicTicketAmount(sale);
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
        return res.json({ success: true, ticket: {
            ticketId: sale.ticketId, event: sale.event || 'DHOLIDA GARBA ROYALE', name: sale.name,
            attendee: sale.name, dateLabel: '17 OCT 2026 · 4:00 PM', venue: 'Pethkar Ground, Kothrud, Pune',
            ticketType: ticketTypeForSale(sale), amount, quantity: sale.quantity || 1,
            status: sale.scannedAt ? 'scanned' : 'paid', scannedAt: sale.scannedAt,
            generatedAt: sale.generatedAt || sale.createdAt
        } });
    } catch (_) {
        return res.status(503).json({ success: false, message: 'Ticket view is temporarily unavailable.' });
    }
});

// ==================== 3b. TICKET DOWNLOAD ====================
app.get('/api/ticket/:ticketId/download', rateLimit({ limit: 30, windowMs: 15 * 60 * 1000, keyPrefix: 'ticket-download' }), async (req, res) => {
    const sale = await db.getByTicketId(req.params.ticketId);
    if (!sale) return res.status(404).send('Ticket not found.');
    if (sale.disabledAt) return res.status(410).send('This ticket has been disabled.');
    if (!canDeliverSale(sale)) return res.status(403).send('Ticket is awaiting dashboard approval.');
    if (!isCountableTicketSale(sale)) return res.status(410).send('This ticket is no longer active.');
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
    
    const filePath = ticketPdfPath(sale.ticketId);
    
    // Dynamically rebuild the PDF if it has been deleted or lost on restart/redeploy
    if (!fs2.existsSync(filePath)) {
        try {
            console.log('[Ticket Download] Ticket file missing; rebuilding.');
            const tType = ticketTypeForSale(sale);
            await buildTicketPdf({
                ticketId: sale.ticketId,
                name: sale.name,
                email: sale.email,
                gender: tType,
                quantity: sale.quantity || 1,
                amount: sale.amount || 0,
                createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
                event: sale.event || EVENT.name,
                timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
            });
        } catch (err) {
            console.error('[Ticket Download] Failed to rebuild ticket PDF.', { name: err.name || 'Error' });
        }
    }

    res.download(filePath, `${EVENT.name.replace(/\s+/g, '-')}-${sale.ticketId}.pdf`, err => {
        if (err && !res.headersSent) res.status(404).send('Ticket file not found. Please contact support.');
    });
});


// ==================== 4. RESEND TICKET EMAIL (self-serve retry) ====================
app.post('/api/ticket/:ticketId/resend', ticketResendRateLimit, async (req, res) => {
    const sale = await db.getByTicketId(req.params.ticketId);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    if (sale.disabledAt) return res.status(410).json({ success: false, message: 'This ticket has been disabled.' });
    if (!canDeliverSale(sale)) {
        return res.status(403).json({ success: false, message: 'Ticket delivery is blocked until dashboard approval.' });
    }
    if (!isCountableTicketSale(sale)) return res.status(410).json({ success: false, message: 'This ticket is no longer active.' });
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');

    const pdfPath = ticketPdfPath(sale.ticketId);
    
    // Rebuild the PDF if it has been deleted or lost on restart/redeploy
    if (!fs2.existsSync(pdfPath)) {
        try {
            console.log('[Ticket Resend] Ticket file missing; rebuilding.');
            const tType = ticketTypeForSale(sale);
            await buildTicketPdf({
                ticketId: sale.ticketId,
                name: sale.name,
                email: sale.email,
                gender: tType,
                quantity: sale.quantity || 1,
                amount: sale.amount || 0,
                createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
                event: sale.event || EVENT.name,
                timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
            });
        } catch (err) {
            console.error('[Ticket Resend] Failed to rebuild ticket PDF.', { name: err.name || 'Error' });
        }
    }

    const downloadUrl = `${BASE_URL}/api/ticket/${sale.ticketId}/download`;
    let result;
    try {
        result = await sendTicketEmail({
            to: sale.email, name: sale.name, ticketId: sale.ticketId,
            gender: ticketTypeForSale(sale), quantity: sale.quantity || 1, amount: sale.amount || 0,
            pdfPath, downloadUrl, event: sale.event || EVENT.name
        });
    } catch (err) {
        console.error('[Ticket Resend] Email delivery failed.', { name: err.name || 'Error' });
        result = { success: false, error: safeErrorMessage(err) || 'Email delivery failed.' };
    }

    try {
        await db.updateSaleRecord(sale.orderId, {
            emailStatus: result.success ? 'sent' : 'failed',
            emailError: result.success ? null : result.error,
            status: result.success ? 'emailed' : 'email_failed'
        });
    } catch (err) {
        console.error('[Ticket Resend] Could not record email delivery status.', { name: err.name || 'Error' });
    }

    let whatsappResult;
    try {
        whatsappResult = await sendAndRecordTicketWhatsApp({
            orderId: sale.orderId, phone: sale.phone, name: sale.name,
            ticketId: sale.ticketId, event: sale.event || EVENT.name,
            ticketType: ticketTypeForSale(sale), pdfPath
        });
    } catch (err) {
        console.error('[Ticket Resend] WhatsApp delivery failed.', { name: err.name || 'Error' });
        whatsappResult = { success: false, error: safeErrorMessage(err) || 'WhatsApp delivery failed.' };
    }

    const emailMessage = result.success ? 'Email sent' : `Email failed: ${result.error || 'invalid recipient'}`;
    const whatsappMessage = whatsappResult.success
        ? 'WhatsApp sent'
        : `WhatsApp failed: ${publicWhatsAppError(whatsappResult)}`;
    res.json({
        success: Boolean(result.success || whatsappResult.success),
        emailSent: Boolean(result.success),
        whatsappSent: Boolean(whatsappResult.success),
        message: `${emailMessage}. ${whatsappMessage}.`
    });
});

async function scopedStaffTicket(req, scope) {
    const sale = await db.getByTicketId(req.params.ticketId);
    if (!sale || sale.disabledAt || !canDeliverSale(sale) || !isCountableTicketSale(sale)) return null;
    if (scope === 'admin') {
        if (req.adminSession?.role === 'master_admin' || approvalAdminOwnsSale(req, sale)) return sale;
        if (req.adminSession?.role === 'organizer') {
            const event = pickCanonicalEvent(await db.getAllEvents(), sale.eventId || sale.event);
            if (event && canManageEvent(req, event)) return sale;
        }
        return null;
    }
    if (scope === 'pr') return sale.prUserId && sale.prUserId === req.prSession?.userId ? sale : null;
    if (scope === 'seller') return (sale.sellerId || sale.generatedBy) === req.sellerId ? sale : null;
    if (scope === 'shadow') return sale.source === 'shadow' || sale.isShadow ? sale : null;
    return null;
}

async function sendScopedTicketPdf(req, res, scope) {
    const sale = await scopedStaffTicket(req, scope);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    try {
        const filePath = ticketPdfPath(sale.ticketId);
        if (!fs2.existsSync(filePath)) await buildTicketPdf({
            ticketId: sale.ticketId, name: sale.name, email: sale.email, gender: ticketTypeForSale(sale),
            quantity: sale.quantity || 1, amount: sale.amount || 0,
            createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
            event: sale.event || EVENT.name, timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
        });
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
        return res.download(filePath, `${EVENT.name.replace(/\s+/g, '-')}-${sale.ticketId}.pdf`, error => {
            if (error && !res.headersSent) res.status(404).send('Ticket file not found. Please contact support.');
        });
    } catch (_) {
        return res.status(503).json({ success: false, message: 'Ticket download is temporarily unavailable.' });
    }
}

async function resendScopedTicket(req, res, scope) {
    const sale = await scopedStaffTicket(req, scope);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
    try {
        const filePath = ticketPdfPath(sale.ticketId);
        if (!fs2.existsSync(filePath)) await buildTicketPdf({
            ticketId: sale.ticketId, name: sale.name, email: sale.email, gender: ticketTypeForSale(sale),
            quantity: sale.quantity || 1, amount: sale.amount || 0,
            createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
            event: sale.event || EVENT.name, timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
        });
        const result = await sendTicketEmail({ to: sale.email, name: sale.name, ticketId: sale.ticketId,
            gender: ticketTypeForSale(sale), quantity: sale.quantity || 1, amount: sale.amount || 0,
            pdfPath: filePath, downloadUrl: `${BASE_URL}/bookings`, event: sale.event || EVENT.name });
        await db.updateSaleRecord(sale.orderId, { emailStatus: result.success ? 'sent' : 'failed', emailError: result.success ? null : result.error, status: result.success ? 'emailed' : 'email_failed' });
        return res.json({ success: Boolean(result.success), message: result.success ? 'Ticket email sent to the stored booking address.' : 'Ticket email could not be sent.' });
    } catch (_) {
        return res.status(503).json({ success: false, message: 'Ticket email is temporarily unavailable.' });
    }
}

app.get('/api/admin/tickets/:ticketId/download', requireEventManager, staffTicketDownloadRateLimit, (req, res) => sendScopedTicketPdf(req, res, 'admin'));
app.post('/api/admin/tickets/:ticketId/resend', requireEventManager, staffTicketResendRateLimit, (req, res) => resendScopedTicket(req, res, 'admin'));
app.get('/api/pr/tickets/:ticketId/download', requirePR, staffTicketDownloadRateLimit, (req, res) => sendScopedTicketPdf(req, res, 'pr'));
app.post('/api/pr/tickets/:ticketId/resend', requirePR, staffTicketResendRateLimit, (req, res) => resendScopedTicket(req, res, 'pr'));
app.get('/api/seller/tickets/:ticketId/download', requireSeller, staffTicketDownloadRateLimit, (req, res) => sendScopedTicketPdf(req, res, 'seller'));
app.post('/api/seller/tickets/:ticketId/resend', requireSeller, staffTicketResendRateLimit, (req, res) => resendScopedTicket(req, res, 'seller'));
app.get('/api/shadow/tickets/:ticketId/download', requireShadowAuth, staffTicketDownloadRateLimit, (req, res) => sendScopedTicketPdf(req, res, 'shadow'));
app.post('/api/shadow/tickets/:ticketId/resend', requireShadowAuth, staffTicketResendRateLimit, (req, res) => resendScopedTicket(req, res, 'shadow'));
app.get('/api/shadow-private/tickets/:ticketId/download', requirePrivateShadowAuth, staffTicketDownloadRateLimit, (req, res) => sendScopedTicketPdf(req, res, 'shadow'));
app.post('/api/shadow-private/tickets/:ticketId/resend', requirePrivateShadowAuth, staffTicketResendRateLimit, (req, res) => resendScopedTicket(req, res, 'shadow'));

app.post('/api/admin/ticket-approvals/:orderId/approve', requireApprovalAdmin, async (req, res) => {
    const existing = await db.getByOrderId(req.params.orderId);
    if (!existing) return res.status(404).json({ success: false, message: 'Sale not found.' });
    if (!approvalAdminOwnsSale(req, existing)) return res.status(403).json({ success: false, message: 'This sale belongs to another company.' });
    const approvedBy = await resolveAdminPrincipal(req);
    const approvedAt = new Date().toISOString();
    let inventoryReservation;
    try {
        inventoryReservation = await reserveOfflineSaleInventory(existing);
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
    if (!inventoryReservation.ok || (existing.inventoryLimited && !inventoryReservation.reserved)) {
        await db.updateSaleRecord(existing.orderId, { manualReview: true, manualReviewReason: 'offline_inventory_unavailable', manualReviewAt: new Date().toISOString() });
        return res.status(409).json({ success: false, manualReview: true, message: 'Inventory is unavailable. This ticket remains pending for manual review.' });
    }
    const claimed = await db.atomicApprovePendingSale(req.params.orderId, approvedBy, approvedAt, inventoryReservation);

    if (!claimed) {
        if (inventoryReservation.reserved && !inventoryReservation.reused) await db.releaseEventInventoryReservation({ eventId: existing.eventId, reservationId: existing.orderId });
        const current = await db.getByOrderId(req.params.orderId);
        if (!current) return res.status(404).json({ success: false, message: 'Sale not found.' });
        if (current.deliveryStatus === 'DELIVERED' || current.status === 'emailed') {
            return res.json({ success: true, message: 'Ticket was already approved and delivered.', sale: current, alreadyDelivered: true });
        }
        return res.status(409).json({ success: false, message: `Ticket is not pending approval. Current status: ${current.approvalStatus || current.status}.`, sale: current });
    }

    if (!await settleOfflineSaleInventory(claimed, inventoryReservation)) {
        return res.status(500).json({ success: false, message: 'Ticket approval was recorded, but inventory finalization requires manual review.' });
    }

    await db.createAuditLog({
        adminUser: approvedBy,
        companyId: claimed.companyId || 'littlane',
        eventId: claimed.eventId || null,
        category: 'OFFLINE_TICKET_APPROVAL',
        fieldChanged: 'approvalStatus',
        previousValue: 'PENDING',
        newValue: 'APPROVED',
        reason: `Approved offline seller ticket ${claimed.ticketId || claimed.orderId}`,
        timestamp: approvedAt
    }).catch(error => console.error('[offline ticket approval audit]', error.message));

    try {
        const filePath = path.join(TICKETS_DIR, `${claimed.ticketId}.pdf`);
        if (!fs2.existsSync(filePath)) {
            await buildTicketPdf({
                ticketId: claimed.ticketId,
                name: claimed.name,
                email: claimed.email,
                gender: claimed.ticketType || claimed.gender || 'General',
                quantity: claimed.quantity || 1,
                amount: claimed.amount || 0,
                createdAt: claimed.generatedAt || claimed.createdAt || approvedAt,
                event: claimed.event || EVENT.name
            });
        }
        const delivery = await deliverManualTicketSale(claimed, { pdfPath: filePath });
        const sale = await db.getByOrderId(req.params.orderId);
        res.json({
            success: true,
            message: delivery.success ? 'Approved and ticket delivered.' : 'Approved, but delivery failed.',
            sale,
            whatsappSent: Boolean(delivery.whatsappResult?.success)
        });
    } catch (err) {
        await db.updateSaleRecord(req.params.orderId, {
            status: 'email_failed',
            deliveryStatus: 'FAILED',
            errorLog: [...(claimed.errorLog || []), { at: new Date().toISOString(), stage: 'approved_delivery', error: safeErrorMessage(err) }]
        });
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.post('/api/admin/ticket-approvals/:orderId/reject', requireApprovalAdmin, async (req, res) => {
    const existing = await db.getByOrderId(req.params.orderId);
    if (!existing) return res.status(404).json({ success: false, message: 'Sale not found.' });
    if (!approvalAdminOwnsSale(req, existing)) return res.status(403).json({ success: false, message: 'This sale belongs to another company.' });
    const rejectedBy = await resolveAdminPrincipal(req);
    const rejectedAt = new Date().toISOString();
    const rejected = await db.atomicRejectPendingSale(req.params.orderId, rejectedBy, rejectedAt);
    if (!rejected) {
        const current = await db.getByOrderId(req.params.orderId);
        if (!current) return res.status(404).json({ success: false, message: 'Sale not found.' });
        return res.status(409).json({ success: false, message: `Ticket is not pending approval. Current status: ${current.approvalStatus || current.status}.`, sale: current });
    }

    await db.createAuditLog({
        adminUser: rejectedBy,
        companyId: rejected.companyId || 'littlane',
        category: 'TICKET_APPROVAL',
        fieldChanged: 'approvalStatus',
        previousValue: 'PENDING',
        newValue: 'REJECTED',
        reason: req.body?.reason || `Rejected ticket ${rejected.ticketId}`,
        timestamp: rejectedAt
    }).catch(err => console.error('[ticket rejection audit]', err.message));

    res.json({ success: true, message: 'Ticket rejected.', sale: rejected });
});

// ==================== 5. ADMIN — MONITOR EVERY SALE ====================
// Shadow sales are isolated. /shadowbyash sees source="shadow"; /shadow sees
// source="shadow_private". Admin, dashboard, seller, master, and scanner stats
// must never include either stream.
const isShadowSale = (sale) => sale?.source === 'shadow' || sale?.source === 'shadow_private' || sale?.isShadow === true;

app.get('/api/solver/meta', requireMasterAdmin, async (_req, res) => {
    try {
        const events = await db.getAllEvents();
        res.json({ success: true, events: events.map(event => event.name).filter(Boolean), tiers: [...new Set(events.flatMap(event => [...(event.tiers || []), ...(event.ticketTypes || [])].map(tier => tier.name).filter(Boolean)))] });
    } catch (_) { res.status(500).json({ success: false, message: 'Could not load ticket filters.' }); }
});

app.post('/api/solver/reveal-generator', requireMasterAdmin, (req, res) => {
    const address = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (solverRevealAttempts.get(address) || []).filter(time => now - time < 15 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    recent.push(now); solverRevealAttempts.set(address, recent);
    const secret = process.env.SOLVER_REVEAL_PASSWORD;
    if (!secret) return res.status(503).json({ success: false, message: 'Generator reveal is not configured on the server.' });
    const supplied = String(req.body?.password || '');
    const crypto = require('crypto');
    const expected = crypto.createHash('sha256').update(secret).digest();
    const actual = crypto.createHash('sha256').update(supplied).digest();
    if (!crypto.timingSafeEqual(actual, expected)) return res.status(401).json({ success: false, message: 'Invalid password.' });
    const issued = String(now);
    const signature = crypto.createHmac('sha256', secret).update(`${req.adminSession?.userId || 'Legacy Admin'}:${issued}`).digest('hex');
    return res.json({ success: true, revealToken: `${issued}.${signature}`, expiresIn: 600 });
});

app.get('/api/solver/tickets', requireMasterAdmin, async (req, res) => {
    try {
        const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 50));
        const status = String(req.query.status || '').toLowerCase();
        const statusMap = { disabled: ['cancelled'], cancelled: ['cancelled'] };
        const filter = {
            status: statusMap[status], statusState: ['active', 'used'].includes(status) ? status : '', event: String(req.query.event || ''), ticketType: String(req.query.tier || ''),
            source: String(req.query.source || ''), from: String(req.query.from || ''), to: String(req.query.to || '')
        };
        if (status === 'disabled') filter.disabledOnly = true;
        if (status === 'cancelled') filter.cancelledOnly = true;
        for (const key of Object.keys(filter)) if (!filter[key] || (Array.isArray(filter[key]) && !filter[key].length)) delete filter[key];
        const query = String(req.query.q || '').trim().slice(0, 120);
        const reveal = solverRevealAllowed(req, res);
        const [result, stats] = await Promise.all([db.solverListSales({ filter, search: query, skip: (page - 1) * limit, limit }), db.solverCountSales()]);
        res.json({ success: true, tickets: result.rows.map(sale => solverTicketPayload(sale, reveal)), total: result.total, page, limit, pages: Math.ceil(result.total / limit), stats });
    } catch (err) {
        console.error('[solver tickets]', err.message);
        res.status(500).json({ success: false, message: 'Could not load tickets.' });
    }
});

app.get('/api/solver/tickets/:ticketId', requireMasterAdmin, async (req, res) => {
    try {
        const sale = await db.getByTicketId(req.params.ticketId);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        const reveal = solverRevealAllowed(req, res);
        let upgrades = [];
        if (solverTicketPayload(sale, false).solverCanUpgrade) {
            const pricing = await getSolverEventPricing(sale.event || EVENT.name);
            const currentName = ticketTypeForSale(sale);
            const current = pricing?.passes?.find(pass => pass.name === currentName || pass.id === currentName);
            const family = solverTierFamily(currentName);
            if (current && family) upgrades = (pricing?.passes || []).filter(pass => {
                const next = solverTierFamily(pass.name);
                return next && next.size === family.size && next.level > family.level;
            }).map(pass => ({ tier: pass.name, difference: Math.max(0, Math.round((pass.price - current.price) * Math.max(1, Number(sale.quantity) || 1) * 100) / 100), currentPrice: current.price * Math.max(1, Number(sale.quantity) || 1), newPrice: pass.price * Math.max(1, Number(sale.quantity) || 1) }));
        }
        const history = await db.getTicketHistory(sale.ticketId);
        res.json({ success: true, ticket: solverTicketPayload(sale, reveal), upgrades, history });
    } catch (err) { console.error('[solver detail]', err.message); res.status(500).json({ success: false, message: 'Could not load ticket details.' }); }
});

app.post('/api/solver/tickets/:ticketId/disable', requireMasterAdmin, async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ success: false, message: 'A reason is required.' });
    try {
        const sale = await db.getByTicketId(req.params.ticketId);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        if (sale.disabledAt || sale.status === 'cancelled') return res.status(409).json({ success: false, message: 'Ticket is already disabled or cancelled.' });
        const now = new Date().toISOString();
        const updated = await db.solverUpdateSale(sale.orderId, sale.status, { status: 'cancelled', disabledAt: now, disabledBy: solverActor(req), disabledPreviousStatus: sale.status });
        if (!updated) return res.status(409).json({ success: false, message: 'Ticket changed. Refresh and try again.' });
        await db.createAuditLog({ adminUser: solverActor(req), companyId: sale.companyId || 'littlane', category: 'TICKET_CONTROL', fieldChanged: `solver:${sale.ticketId}:status`, previousValue: sale.status, newValue: 'disabled', reason });
        res.json({ success: true, message: 'Ticket disabled.' });
    } catch (err) { console.error('[solver disable]', err.message); res.status(500).json({ success: false, message: 'Could not disable ticket.' }); }
});

app.post('/api/solver/tickets/:ticketId/reactivate', requireMasterAdmin, async (req, res) => {
    try {
        const sale = await db.getByTicketId(req.params.ticketId);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        if (!sale.disabledAt && sale.status !== 'scanned' && !(sale.scannedAt && !sale.reactivatedAt)) return res.status(409).json({ success: false, message: 'Ticket is already active.' });
        const restored = sale.disabledAt ? (['paid', 'ticket_generated', 'emailed', 'email_failed'].includes(sale.disabledPreviousStatus) ? sale.disabledPreviousStatus : 'ticket_generated') : 'ticket_generated';
        const now = new Date().toISOString();
        const updated = await db.solverUpdateSale(sale.orderId, sale.status, { status: restored, reactivatedAt: now, disabledAt: null, disabledBy: null, disabledPreviousStatus: null });
        if (!updated) return res.status(409).json({ success: false, message: 'Ticket changed. Refresh and try again.' });
        await db.createAuditLog({ adminUser: solverActor(req), companyId: sale.companyId || 'littlane', category: 'TICKET_CONTROL', fieldChanged: `solver:${sale.ticketId}:status`, previousValue: solverStatus(sale), newValue: 'active', reason: 'Reactivated by Solver.' });
        res.json({ success: true, message: 'Ticket reactivated.' });
    } catch (err) { console.error('[solver reactivate]', err.message); res.status(500).json({ success: false, message: 'Could not reactivate ticket.' }); }
});

app.post('/api/solver/tickets/:ticketId/upgrade', requireMasterAdmin, async (req, res) => {
    try {
        const sale = await db.getByTicketId(req.params.ticketId);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        if (sale.status === 'scanned' || (sale.scannedAt && !sale.reactivatedAt)) return res.status(409).json({ success: false, message: 'This ticket has already been used. Reactivate it first if you want the upgraded ticket to be usable again.' });
        if (sale.disabledAt || sale.status === 'cancelled') return res.status(409).json({ success: false, message: 'Reactivate this ticket before upgrading.' });
        const pricing = await getSolverEventPricing(sale.event || EVENT.name);
        const currentName = ticketTypeForSale(sale);
        const targetName = String(req.body?.tier || '');
        const current = pricing?.passes?.find(pass => pass.name === currentName || pass.id === currentName);
        const target = pricing?.passes?.find(pass => pass.name === targetName || pass.id === targetName);
        const currentFamily = solverTierFamily(currentName), targetFamily = solverTierFamily(target?.name);
        if (!current || !target || !currentFamily || !targetFamily || targetFamily.level <= currentFamily.level || targetFamily.size !== currentFamily.size) return res.status(400).json({ success: false, message: 'Invalid upgrade for this ticket.' });
        const quantity = Math.max(1, Number(sale.quantity) || 1);
        const difference = Math.max(0, Math.round((target.price - current.price) * quantity * 100) / 100);
        const now = new Date().toISOString();
        const updated = await db.solverUpdateSale(sale.orderId, sale.status, { ticketType: target.name, gender: target.gender || sale.gender, passUnitPrice: target.price, officialRate: target.price, solverOriginalTier: sale.solverOriginalTier || currentName, solverUpgradedAt: now, solverUpgradedBy: solverActor(req), solverUpgradeDifference: difference });
        if (!updated) return res.status(409).json({ success: false, message: 'Ticket changed. Refresh and try again.' });
        await db.createAuditLog({ adminUser: solverActor(req), companyId: sale.companyId || 'littlane', category: 'TICKET_CONTROL', fieldChanged: `solver:${sale.ticketId}:tier`, previousValue: currentName, newValue: target.name, reason: `Upgrade difference calculated from server pricing: ${difference}.` });
        res.json({ success: true, message: 'Ticket upgraded.', difference, tier: target.name });
    } catch (err) { console.error('[solver upgrade]', err.message); res.status(500).json({ success: false, message: 'Could not upgrade ticket.' }); }
});

app.get('/api/solver/tickets/:ticketId/history', requireMasterAdmin, async (req, res) => {
    try { const sale = await db.getByTicketId(req.params.ticketId); if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' }); res.json({ success: true, history: await db.getTicketHistory(sale.ticketId) }); }
    catch (_) { res.status(500).json({ success: false, message: 'Could not load ticket history.' }); }
});

app.get('/api/admin/sales', requireAdmin, async (req, res) => {
    let sales = (await db.getAll()).filter(s => !isShadowSale(s));
    if (req.presentationOnly) {
        const reportSales = sales.filter(s => s.showInPres === true);
        const countable = reportSales.filter(isVerifiedSalesRecord);
        sales = reportSales.map(s => ({
            orderId: s.orderId, ticketId: s.ticketId, event: s.event, name: s.name,
            gender: s.gender, ticketType: ticketTypeForSale(s), quantity: s.quantity,
            amount: saleGrossAmount(s), customerTotal: saleGrossAmount(s), status: s.status,
            paymentStatus: s.paymentStatus || null, source: s.source || null,
            paymentMethod: s.paymentMethod || null, paymentId: s.paymentId || null,
            sellerId: s.sellerId || null, prUserId: s.prUserId || null,
            approvalStatus: s.approvalStatus || null, scannedAt: s.scannedAt,
            scannedBy: s.scannedBy, generatedAt: s.generatedAt, showInPres: true,
        }));
        const summary = {
            totalOrders: reportSales.length,
            paidOrders: countable.length,
            totalRevenue: countable.reduce((sum, s) => sum + saleGrossAmount(s), 0),
            emailFailures: 0,
            ticketFailures: 0,
        };
        return res.json({ success: true, summary, sales });
    }
    if (req.adminSession?.role === 'company_admin') {
        sales = sales.filter(s => (s.companyId || sellerCompanyIdFromValue(s.sellerId || s.generatedBy)) === req.adminSession.companyId);
    }
    if (req.query.dashboardView === 'true') {
        sales = await filterDashboardVisibleSales(sales);
    }

    const countableSales = sales.filter(isVerifiedSalesRecord);
    const summary = {
        totalOrders: sales.length,
        paidOrders: countableSales.length,
        totalRevenue: countableSales.reduce((sum, s) => sum + saleGrossAmount(s), 0),
        emailFailures: sales.filter(s => s.emailStatus === 'failed').length,
        ticketFailures: sales.filter(s => s.status === 'ticket_generation_failed').length
    };
    const report = buildSalesReport(sales);
    const reportEvents = await db.getAllEvents();
    report.remainingInventory = reportEvents
        .filter(event => req.adminSession?.role !== 'company_admin' || event.companyId === req.adminSession.companyId)
        .map(event => ({ eventId: event.id || event._id, event: event.name, categories: (event.ticketCategories || []).map(category => ({ categoryId: category.id, category: category.name, remaining: Number.isInteger(category.remainingAvailability) ? category.remainingAvailability : (Number.isInteger(category.totalInventory) ? category.totalInventory : null) })) }));
    res.json({ success: true, testMode: TEST_MODE, summary: { ...summary, ...report, totalOrders: sales.length, paidOrders: report.confirmedOrders, totalRevenue: report.verifiedRevenue }, report, sales });
});

app.get('/api/admin/config', requireAdmin, async (req, res) => {
    if (req.adminSession?.role === 'company_admin' && !(await sellerOwnsEvent(req.adminSession.companyId, EVENT.name))) {
        return res.status(403).json({ success: false, message: 'Administrator is not assigned to this event.' });
    }
    const pricing = await getEventPricing(EVENT.name);
    res.json({ success: true, event: pricing?.event.name || EVENT.name, pricing: pricing?.passes || [], testMode: TEST_MODE });
});

// ==================== PRESENTATION CONFIG ====================
app.post('/api/admin/toggle-presentation', requireAdmin, async (req, res) => {
    try {
        const { orderId, showInPres } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Missing orderId' });
        }
        const existing = await db.getByOrderId(orderId);
        if (req.adminSession?.role === 'company_admin' && !approvalAdminOwnsSale(req, existing)) {
            return res.status(403).json({ success: false, message: 'This sale belongs to another company.' });
        }
        const updated = await db.updateSaleRecord(orderId, { showInPres });
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.json({ success: true, sale: updated });
    } catch (err) {
        console.error('Error toggling presentation:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Remove old config endpoints as we are using real DB now
// app.get('/api/admin/presentation-config', requireAdmin, (req, res) => { ... })
// app.post('/api/admin/presentation-config', requireAdmin, (req, res) => { ... })

// ==================== 6. ADMIN — GENERATE TICKET MANUALLY ====================
app.get('/api/admin/partners', requirePartnerAdmin, async (_req, res) => {
    const users = await db.getAllUsers();
    await syncManagedPartnerCompanies(users);
    const systemPartners = await Promise.all(Object.entries(PARTNER_NAMES).map(async ([userId, displayName]) => {
        const blocked = Boolean((await db.getPartnerLock(userId))?.blocked);
        return { userId, displayName, companyId: 'littlane', sellerSlot: null, active: !blocked, blocked, managed: false };
    }));
    const managedPartners = users
        .filter(user => user.role === 'seller' && PARTNER_LOGIN_SLOTS.includes(user.sellerSlot))
        .map(({ password, passwordHash, ...user }) => ({ ...user, active: user.active !== false && !user.blocked, managed: true }));
    res.json({
        success: true,
        partners: [...systemPartners, ...managedPartners]
    });
});

app.post('/api/admin/partners', requirePartnerAdmin, async (req, res) => {
    const { userId, displayName, password, sellerSlot } = req.body || {};
    const normalizedId = String(userId || '').trim().toLowerCase();
    const normalizedName = String(displayName || '').trim();
    const companyId = PARTNER_SLOT_COMPANY_IDS[sellerSlot] || partnerCompanyId(normalizedName);
    if (!normalizedId || !normalizedName || !companyId || !password || password.length < 8 || !PARTNER_LOGIN_SLOTS.includes(sellerSlot)) {
        return res.status(400).json({ success: false, message: 'Provide a unique identifier, name, 8+ character password, and available partner slot.' });
    }
    try {
        const existing = await db.getAllUsers();
        const existingIdentifier = existing.find(user => user.userId.toLowerCase() === normalizedId);
        if (existingIdentifier) {
            return res.status(409).json({ success: false, message: 'That identifier is already in use.' });
        }
        const slotOwner = existing.find(user => user.sellerSlot === sellerSlot);
        if (slotOwner && slotOwner.active !== false && !slotOwner.blocked) {
            return res.status(409).json({ success: false, message: 'That partner login slot is assigned to an active partner.' });
        }
        await db.ensureCompany(companyId, normalizedName);
        if (slotOwner) {
            // An inactive partner must not permanently consume a scarce login slot.
            await db.releaseSellerSlot(slotOwner.userId);
            await db.deleteSellerSession(slotOwner.sellerSlot || slotOwner.userId);
        }
        const created = await db.createUser({
            userId: normalizedId,
            displayName: normalizedName,
            companyId,
            role: 'seller',
            sellerSlot,
            active: true,
            blocked: false,
            password: '__hashed__',
            passwordHash: hashPassword(password),
        });
        const { password: _, passwordHash: __, ...partner } = created.toObject ? created.toObject() : created;
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId, category: 'SELLER_ACCOUNT_CREATED', fieldChanged: 'sellerAccount', newValue: normalizedId, reason: `Created seller account for slot ${sellerSlot}.` });
        res.status(201).json({ success: true, partner });
    } catch (err) {
        res.status(err?.code === 11000 ? 409 : 500).json({ success: false, message: err?.code === 11000 ? 'That partner already exists.' : 'Unable to create partner.' });
    }
});

app.patch('/api/admin/partners/:userId', requirePartnerAdmin, async (req, res) => {
    const { displayName, companyId, active, password } = req.body || {};
    if (typeof active === 'boolean' && req.adminSession?.role !== 'master_admin') {
        return res.status(403).json({ success: false, message: 'Only Master Admin can block or unblock seller accounts.' });
    }
    const updates = {};
    const passwordChanged = password !== undefined;
    if (typeof displayName === 'string' && displayName.trim()) updates.displayName = displayName.trim();
    if (typeof companyId === 'string' && companyId.trim()) updates.companyId = companyId.trim();
    if (typeof active === 'boolean') { updates.active = active; updates.blocked = !active; }
    if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, message: 'Passwords must be at least 8 characters.' });
        updates.passwordHash = hashPassword(password);
    }
    const updated = await db.updateUser(req.params.userId, updates);
    if (!updated || updated.role !== 'seller') return res.status(404).json({ success: false, message: 'Partner not found.' });
    if (passwordChanged) {
        const sessionIds = [updated.sellerSlot, updated.userId].filter(Boolean);
        for (const sessionId of sessionIds) delete sellerSessions[sessionId];
        savePersisted(SESSIONS_FILE, sellerSessions);
        await Promise.all(sessionIds.map(sessionId => db.deleteSellerSession(sessionId)));
    }
    if (active === false) {
        const sessionIds = [updated.sellerSlot, updated.userId].filter(Boolean);
        for (const sessionId of sessionIds) delete sellerSessions[sessionId];
        savePersisted(SESSIONS_FILE, sellerSessions);
        await Promise.all(sessionIds.map(sessionId => db.deleteSellerSession(sessionId)));
    }
    await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: updated.companyId || 'littlane', category: 'SELLER_ACCOUNT_UPDATED', fieldChanged: Object.keys(updates).filter(field => field !== 'passwordHash').join(','), reason: `Updated seller account ${updated.userId}.` });
    const { password: _, passwordHash: __, ...partner } = updated.toObject ? updated.toObject() : updated;
    res.json({ success: true, partner });
});

app.delete('/api/admin/partners/:userId', requirePartnerAdmin, async (req, res) => {
    const user = await db.getUserById(req.params.userId);
    if (!user || user.role !== 'seller' || !PARTNER_LOGIN_SLOTS.includes(user.sellerSlot)) {
        return res.status(404).json({ success: false, message: 'Only managed Partner Login accounts can be deleted.' });
    }

    const slot = user.sellerSlot;
    try {
        await Promise.all([
            db.deleteUser(user.userId),
            db.deleteSellerSession(slot),
            db.deleteSellerDevice(slot),
            db.resetPartnerLock(slot),
        ]);
        delete sellerSessions[slot];
        delete webauthnAuthenticators[slot];
        savePersisted(SESSIONS_FILE, sellerSessions);
        savePersisted(WEBAUTHN_FILE, webauthnAuthenticators);
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: user.companyId || 'littlane', category: 'SELLER_ACCOUNT_CLEARED', fieldChanged: 'sellerAccount', previousValue: user.userId, reason: `Cleared managed seller login slot ${slot}; sales and tickets were retained.` });
        res.json({ success: true, message: `${slot === 'partner-slot-1' ? 'Partner Login 1' : 'Partner Login 2'} was cleared and is ready for a new partner.` });
    } catch (err) {
        console.error('[DELETE PARTNER ERROR]', err);
        res.status(500).json({ success: false, message: 'Unable to delete the partner account.' });
    }
});

app.get('/api/admin/pricing', requireAdmin, async (req, res) => {
    const allEvents = await db.getAllEvents();
    const events = visibleDashboardEvents(allEvents).filter(event => canManageEvent(req, event));
    const pricedEvents = await Promise.all(events.map(async event => {
        const pricing = await getEventPricing(eventRef(event));
        return { id: pricing?.event.id || pricing?.event._id || event.id || event._id, name: pricing?.event.name || event.name, tiers: pricing?.passes || [] };
    }));
    res.json({ success: true, events: pricedEvents });
});

app.patch('/api/admin/pricing/:eventId', requireAdmin, async (req, res) => {
    const { tiers } = req.body || {};
    if (!Array.isArray(tiers) || !tiers.length || tiers.some(tier => !String(tier.name || '').trim() || normalizePrice(tier.price) === null)) {
        return res.status(400).json({ success: false, message: 'Every ticket type needs a valid non-negative price.' });
    }

    const normalizedTiers = tiers.map((tier, index) => {
        const name = String(tier.name || '').trim();
        return {
            id: slugifyPassId(tier.id || name, `pass-${index + 1}`),
            name,
            price: normalizePrice(tier.price),
            gender: normalizePassCategory(tier.gender || tier.category)
        };
    });
    const duplicateKey = normalizedTiers
        .map(tier => tier.name.toLowerCase())
        .find((name, index, all) => all.indexOf(name) !== index);
    if (duplicateKey) {
        return res.status(400).json({ success: false, message: 'Each pass category needs a unique name.' });
    }
    const usedIds = new Map();
    const tiersWithUniqueIds = normalizedTiers.map(tier => {
        const count = usedIds.get(tier.id) || 0;
        usedIds.set(tier.id, count + 1);
        return count ? { ...tier, id: `${tier.id}-${count + 1}` } : tier;
    });

    const events = await db.getAllEvents();
    const event = pickCanonicalEvent(events, req.params.eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    if (!canManageEvent(req, event)) return res.status(403).json({ success: false, message: 'You cannot manage this event.' });
    const categories = tiersWithUniqueIds.map(tier => ({ ...tier, currency: 'INR', maxPerCustomer: 20, status: 'active', groupSize: 1 }));
    const updated = await db.saveEvent({ ...event, ticketCategories: categories, tiers: tiersWithUniqueIds, ticketTypes: tiersWithUniqueIds });
    res.json({ success: true, event: { id: updated.id || updated._id, name: updated.name, tiers: updated.tiers, ticketCategories: updated.ticketCategories } });
});

app.get('/api/seller/events', requireSeller, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        const seller = users.find(user => user.role === 'seller' && (user.userId === req.sellerId || user.sellerSlot === req.sellerId));
        const companyId = seller?.companyId || sellerCompanyIdFromValue(req.sellerId);
        if (!companyId) return res.status(403).json({ success: false, message: 'Seller company is not configured.' });
        const events = (await db.getAllEvents())
            .filter(event => event.companyId === companyId && eventIsPublic(event))
            .map(event => ({ id: eventRef(event), slug: event.slug || slugifyEvent(event.name), name: event.name, city: event.city || '', venue: event.venue || '', startsAt: event.startsAt || event.date || null }));
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, events });
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

app.get('/api/seller/pricing', requireSeller, async (req, res) => {
    const requestedEvent = typeof req.query.event === 'string' ? req.query.event : EVENT.name;
    if (!(await sellerOwnsEvent(req.sellerId, requestedEvent))) return res.status(403).json({ success: false, message: 'Seller is not assigned to this event.' });
    const pricing = await getEventPricing(requestedEvent);
    if (!pricing) return res.status(404).json({ success: false, message: 'No active event pricing is available.' });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, event: pricing.event.name, passes: pricing.passes });
});

async function deliverManualTicketSale(sale, { pdfPath = null, qrBuffer = null, qrDataUrl = null } = {}) {
    if (!canDeliverSale(sale)) {
        await db.updateSaleRecord(sale.orderId, {
            deliveryStatus: 'BLOCKED',
            errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'delivery_gate', error: 'Ticket delivery blocked until approval.' }]
        });
        return { success: false, blocked: true, message: 'Ticket is pending approval or rejected and cannot be delivered.' };
    }

    const ticketType = sale.ticketType || sale.gender || 'General';
    const downloadUrl = `${BASE_URL}/api/ticket/${sale.ticketId}/download`;
    const existingPdfPath = pdfPath || path.join(TICKETS_DIR, `${sale.ticketId}.pdf`);

    await db.updateSaleRecord(sale.orderId, {
        status: 'ticket_generated',
        deliveryStatus: 'IN_PROGRESS',
        deliveryStartedAt: new Date().toISOString()
    });

    const emailResult = await sendTicketEmail({
        to: sale.email,
        name: sale.name,
        ticketId: sale.ticketId,
        gender: ticketType,
        quantity: sale.quantity || 1,
        amount: sale.amount || sale.customerTotal || 0,
        pdfPath: existingPdfPath,
        qrBuffer,
        downloadUrl,
        event: sale.event || EVENT.name
    });

    const deliveredAt = new Date().toISOString();
    if (emailResult.success) {
        await db.updateSaleRecord(sale.orderId, {
            status: 'emailed',
            emailStatus: 'sent',
            emailError: null,
            emailPreviewUrl: emailResult.previewUrl || null,
            deliveryStatus: 'DELIVERED',
            deliveredAt
        });
    } else {
        await db.updateSaleRecord(sale.orderId, {
            status: 'email_failed',
            emailStatus: 'failed',
            emailError: emailResult.error,
            deliveryStatus: 'FAILED',
            errorLog: [...(sale.errorLog || []), { at: deliveredAt, stage: 'email', error: emailResult.error }]
        });
    }

    const whatsappResult = await sendAndRecordTicketWhatsApp({
        orderId: sale.orderId,
        phone: sale.phone,
        name: sale.name,
        ticketId: sale.ticketId,
        event: sale.event || EVENT.name,
        ticketType,
        pdfPath: existingPdfPath
    });

    return {
        success: emailResult.success,
        emailResult,
        whatsappResult,
        downloadUrl,
        qrDataUrl
    };
}

app.post('/api/admin/generate-ticket', async (req, res) => {
    const { name, email, phone, nickname: requestedNickname, gender, ticketType, quantity, event, commissionPercentage, commissionAmount: requestedCommissionAmount } = req.body || {};
    const nickname = typeof requestedNickname === 'string' ? requestedNickname.trim().slice(0, 60) : '';

    const sellerToken = req.headers['x-seller-token'];
    const sellerId = await authenticateSeller(sellerToken);
    const adminKeyHdr = req.headers['x-admin-key'];
    const adminToken = req.headers['x-auth-token'];
    let adminSession = adminKeyHdr && ADMIN_KEY && adminKeyHdr === ADMIN_KEY
        ? { userId: 'Legacy Admin', role: 'master_admin', companyId: 'littx' }
        : null;
    if (!adminSession && adminToken) {
        const session = await db.getUserSessionByToken(adminToken);
        if (isValidUserSession(session, adminToken) && ['master_admin', 'company_admin'].includes(session.role)) adminSession = session;
    }
    const isAdmin = Boolean(adminSession);
    req.adminSession = adminSession;
    if (!sellerId && !isAdmin) {
        return res.status(401).json({ success: false, message: 'Authentication is required to issue tickets.' });
    }

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    const requestedEvent = event || EVENT.name;
    const requestedType = ticketType || gender;
    const pricedTicket = await resolveTicketAmount(requestedEvent, requestedType, quantity);
    if (!pricedTicket) {
        return res.status(400).json({ success: false, message: 'Select a valid ticket type from the current event pricing.' });
    }
    const { qty, admissionCount, inventoryLimited, event: evtName, eventId: canonicalEventId, ticketCategoryId: canonicalCategoryId, ticketType: tType, amount: customerTotal } = pricedTicket;
    const events = await db.getAllEvents();
    const eventRecord = pickCanonicalEvent(events, evtName);
    const users = await db.getAllUsers();
    const sellerUser = sellerId && users.find(user => user.role === 'seller' && (user.userId === sellerId || user.sellerSlot === sellerId));
    const sellerCompanyId = sellerUser?.companyId || sellerCompanyIdFromValue(sellerId);
    if (sellerId && (!eventRecord?.companyId || !sellerCompanyId || eventRecord.companyId !== sellerCompanyId)) {
        return res.status(403).json({ success: false, message: 'Seller is not assigned to this event.' });
    }
    if (adminSession?.role === 'company_admin' && eventRecord?.companyId !== adminSession.companyId) {
        return res.status(403).json({ success: false, message: 'Administrator is not assigned to this event.' });
    }
    // Only authenticated Littlane and ASTEX seller sessions are exempt. Admin
    // supplied partner IDs cannot grant the exemption.
    const commissionMaximum = sellerId && sellerHasUnlimitedCommission(sellerId) ? null : 20;
    const hasCustomCommissionAmount = Object.prototype.hasOwnProperty.call(req.body || {}, 'commissionAmount');
    let normalizedCommission;
    let commission;

    if (hasCustomCommissionAmount) {
        const commissionAmountPaise = normalizeCommissionAmount(requestedCommissionAmount);
        const customerTotalPaise = Math.round(customerTotal * 100);
        if (commissionAmountPaise === null) {
            return res.status(400).json({ success: false, message: 'Commission amount must be a valid non-negative number.' });
        }
        // Use the server-derived official total to enforce the seller's limit.
        if (commissionMaximum !== null && commissionAmountPaise * 100 > customerTotalPaise * commissionMaximum) {
            return res.status(400).json({ success: false, message: 'Commission cannot exceed 20% of the official ticket total.' });
        }
        normalizedCommission = customerTotalPaise ? (commissionAmountPaise * 100) / customerTotalPaise : 0;
        commission = applyCommission(customerTotal, normalizedCommission, qty, commissionAmountPaise);
    } else {
        normalizedCommission = normalizeCommissionPercentage(commissionPercentage, commissionMaximum);
        if (normalizedCommission === 'maximum_exceeded') {
            return res.status(400).json({ success: false, message: 'Commission cannot exceed 20%.' });
        }
        if (normalizedCommission === null) {
            return res.status(400).json({ success: false, message: 'Commission must be a valid non-negative percentage.' });
        }
        commission = applyCommission(customerTotal, normalizedCommission, qty);
    }

    let orderId;
    let inventoryReservation = null;
    try {
        orderId = `order_manual_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();

        const resolvedSellerId = sellerId || adminSession?.userId || 'Admin';
        const normalizedResolvedSellerId = normalizeSellerId(resolvedSellerId);
        let resolvedCompanyId = sellerCompanyId || eventRecord?.companyId || adminSession?.companyId || 'littlane';
        if (PARTNER_LOGIN_SLOTS.includes(resolvedCompanyId)) {
            const slotUser = await db.getUserBySellerSlot(resolvedCompanyId);
            if (slotUser?.companyId) resolvedCompanyId = slotUser.companyId;
        }
        const directDelivery = isDirectDeliveryCompany(resolvedCompanyId);
        const approvalStatus = directDelivery ? 'NOT_REQUIRED' : 'PENDING';
        const deliveryStatus = directDelivery ? 'NOT_STARTED' : 'PENDING_APPROVAL';
        const publicStatus = directDelivery ? 'pending' : 'pending_approval';
        const offlineSale = { orderId, eventId: canonicalEventId, ticketCategoryId: canonicalCategoryId, admissionCount, inventoryLimited };
        if (directDelivery) {
            inventoryReservation = await reserveOfflineSaleInventory(offlineSale);
            if (!inventoryReservation.ok || (inventoryLimited && !inventoryReservation.reserved)) {
                return res.status(409).json({ success: false, message: 'Inventory is no longer available for this ticket. No ticket was issued.' });
            }
        }

        await db.createSaleRecord({
            orderId,
            event: evtName,
            eventId: canonicalEventId,
            ticketCategoryId: canonicalCategoryId,
            admissionCount,
            inventoryLimited,
            inventoryReserved: Boolean(directDelivery && inventoryReservation?.reserved),
            reservationStatus: directDelivery && inventoryLimited ? 'active' : 'not_required',
            reservationExpiresAt: directDelivery ? inventoryReservation?.expiresAt || null : null,
            name, email, phone: phone || '', nickname, gender: gender || 'general', ticketType: tType,
            quantity: qty, ...commission, passUnitPrice: commission.officialRate, commissionPercentage: normalizedCommission, amount: commission.customerTotal, currency: 'INR',
            status: 'paid', paymentId: 'manual', paymentMethod: 'manual', source: 'offline_seller', ticketId,
            emailStatus: 'pending', emailError: null,
            whatsappStatus: directDelivery ? 'pending' : 'blocked_pending_approval',
            whatsappError: null,
            errorLog: [],
            createdAt: generatedAt, paidAt: generatedAt, generatedAt,
            generatedBy: resolvedSellerId,
            issuedByAdmin: isAdmin && !sellerId,
            sellerId: sellerId ? normalizedResolvedSellerId : null,
            prUserId: sellerId ? resolvedSellerId : null,
            companyId: resolvedCompanyId,
            approvalRequired: !directDelivery,
            approvalStatus,
            approvalRequestedAt: directDelivery ? null : generatedAt,
            deliveryStatus,
            scannedBy: null, scannedAt: null
        });

        if (directDelivery && !await settleOfflineSaleInventory(offlineSale, inventoryReservation)) {
            return res.status(500).json({ success: false, message: 'Ticket was recorded but inventory finalization requires administrator review.' });
        }

        // Build PDF and QR
        const pdfPath = await buildTicketPdf({
            ticketId,
            name,
            email,
            gender: tType,
            quantity: qty,
            amount: commission.customerTotal,
            createdAt: generatedAt,
            event: evtName
        });
        const qrBuffer = await buildQrBuffer(ticketId);
        const qrDataUrl = await buildQrDataUrl(ticketId);

        await db.updateSaleRecord(orderId, { status: directDelivery ? 'ticket_generated' : 'pending_approval' });

        const saleForDelivery = await db.getByOrderId(orderId);
        const deliveryResult = directDelivery
            ? await deliverManualTicketSale(saleForDelivery, { pdfPath, qrBuffer, qrDataUrl })
            : { success: false, whatsappResult: { success: false }, downloadUrl: null, qrDataUrl };

        const finalSale = await db.getByOrderId(orderId);

        res.json({
            success: true,
            approvalRequired: !directDelivery,
            approvalStatus,
            message: directDelivery ? 'Ticket delivered.' : 'Ticket sent to dashboard for approval.',
            ticket: {
                id: ticketId,
                orderId,
                event: evtName,
                attendee: name,
                email,
                phone,
                nickname,
                whatsappSent: Boolean(deliveryResult.whatsappResult?.success),
                ticketType: tType,
                // Public ticket fields always represent the official price.
                price: commission.customerTotal.toString(),
                officialRate: commission.officialRate.toString(),
                customerTotal: commission.customerTotal.toString(),
                commissionPercentage: normalizedCommission,
                commissionAmount: commission.commissionAmount.toString(),
                rateAfterCommission: commission.rateAfterCommission.toString(),
                qty,
                generatedBy: resolvedSellerId,
                sellerId: normalizedResolvedSellerId,
                generatedAt,
                status: finalSale?.status || publicStatus,
                approvalStatus,
                deliveryStatus: finalSale?.deliveryStatus || deliveryStatus,
                downloadUrl: deliveryResult.downloadUrl,
                qrDataUrl
            }
        });
    } catch (err) {
        if (inventoryReservation?.reserved && !inventoryReservation.reused && orderId && !(await db.getByOrderId(orderId).catch(() => null))) {
            await db.releaseEventInventoryReservation({ eventId: canonicalEventId, reservationId: orderId }).catch(() => {});
        }
        console.error('[manual-generate] Error:', err);
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// ==================== SHADOW SALES PANEL ENDPOINTS (/shadowbyash) ====================

const SHADOW_PASSWORD = process.env.SHADOW_PASS;
const SHADOW_PRIVATE_PASSWORD = process.env.SHADOW_PRIVATE_PASS;

async function requireShadowAuth(req, res, next) {
    const token = req.headers['x-shadow-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized Shadow Panel Access.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (session?.role === 'shadow' && isValidUserSession(session, token)) return next();
    } catch (err) {
        return next(err);
    }
    return res.status(401).json({ success: false, message: 'Shadow session expired. Please log in again.' });
}

// POST /api/shadow/login — Password auth for /shadowbyash
app.post('/api/shadow/login', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    const { password } = req.body || {};
    if (!SHADOW_PASSWORD) {
        return res.status(503).json({ success: false, message: 'Shadow authentication is not configured.' });
    }
    if (!safeStringEqual(password, SHADOW_PASSWORD)) {
        return res.status(401).json({ success: false, message: 'Invalid Shadow Access Password.' });
    }

    const shadowToken = `shadow_${crypto.randomBytes(24).toString('hex')}`;
    const loginAt = new Date().toISOString();
    await db.setUserSession('shadowbyash', {
        token: shadowToken,
        ip: clientIp(req),
        loginAt,
        role: 'shadow',
        companyId: 'littlane',
        displayName: 'Shadow Panel',
    });
    return respondWithSession(req, res, 'shadow', shadowToken, {}, 'shadowToken', loginAt);
});

async function requirePrivateShadowAuth(req, res, next) {
    const token = req.headers['x-shadow-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized private Shadow access.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (session?.role === 'shadow_private' && isValidUserSession(session, token)) return next();
    } catch (err) {
        return next(err);
    }
    return res.status(401).json({ success: false, message: 'Private Shadow session expired. Please log in again.' });
}

app.post('/api/shadow-private/login', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    const { password } = req.body || {};
    if (!SHADOW_PRIVATE_PASSWORD) {
        return res.status(503).json({ success: false, message: 'Private Shadow authentication is not configured.' });
    }
    if (!safeStringEqual(password, SHADOW_PRIVATE_PASSWORD)) {
        return res.status(401).json({ success: false, message: 'Invalid private Shadow access password.' });
    }

    const shadowToken = `shadow_private_${crypto.randomBytes(24).toString('hex')}`;
    const loginAt = new Date().toISOString();
    await db.setUserSession('shadow-private', {
        token: shadowToken,
        ip: clientIp(req),
        loginAt,
        role: 'shadow_private',
        companyId: 'littlane',
        displayName: 'Private Shadow Panel',
    });
    return respondWithSession(req, res, 'shadow_private', shadowToken, {}, 'shadowToken', loginAt);
});

async function logoutShadowSession(req, res, role, family) {
    const token = req.headers['x-shadow-token'];
    const session = await db.getUserSessionByToken(token).catch(() => null);
    if (!token || session?.role !== role || !isValidUserSession(session, token)) {
        return res.status(401).json({ success: false, message: 'Shadow session expired or invalid.' });
    }
    await db.deleteUserSessionByToken(token);
    clearSessionCookies(res, family, secureCookieRequest(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true });
}
app.post('/api/shadow/logout', (req, res) => logoutShadowSession(req, res, 'shadow', 'shadow'));
app.post('/api/shadow-private/logout', (req, res) => logoutShadowSession(req, res, 'shadow_private', 'shadow_private'));

// The Shadow panels must read the same editable catalogue as Seller. Keep this
// authenticated so the complete ticket-rate list is not exposed as a public API.
async function getShadowPricing(req, res) {
    try {
        const allEvents = visibleDashboardEvents(await db.getAllEvents());
        const events = (await Promise.all(allEvents.map(async (event) => {
            const pricing = await getEventPricing(event.name);
            return {
                id: event.id || event._id,
                name: event.name,
                gradient: event.gradient || CANONICAL_EVENT_GRADIENT,
                icon: event.icon || '🎟️',
                tagline: event.tagline || 'Pethkar Ground, Kothrud, Pune · 17th October',
                tiers: pricing?.passes || []
            };
        }))).filter(event => event.tiers.length > 0);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
}

app.get('/api/shadow/pricing', requireShadowAuth, getShadowPricing);
app.get('/api/shadow-private/pricing', requirePrivateShadowAuth, getShadowPricing);

app.get('/api/shadow-private/whatsapp-status', requirePrivateShadowAuth, async (_req, res) => {
    const status = await getWhatsAppConfigurationStatus();
    res.status(status.success ? 200 : 502).json(status);
});

// POST /api/shadow/generate-ticket — Creates genuine ticket tagged as source="shadow"
async function generateShadowTicket(req, res, source, paymentMethod, generatedBy) {
    const { name, email, phone, gender, ticketType, quantity, amount, event, shadowPaymentStatus, commissionPercentage, commissionAmount: requestedCommissionAmount } = req.body || {};

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Customer Name and Email are required.' });
    }

    const evtName = event || EVENT.name;
    const pricedTicket = await resolveTicketAmount(evtName, ticketType || gender, quantity);
    if (!pricedTicket) return res.status(400).json({ success: false, message: 'Select a valid ticket type from the current event pricing.' });
    const { qty, amount: pricedAmount, ticketType: tType, event: pricedEvent } = pricedTicket;
    // Free / Chai Pani is only available on /shadowbyash; issue the normal ticket
    // while excluding it from that panel's revenue totals.
    const isFreeShadowByAshTicket = source === 'shadow' && shadowPaymentStatus === 'free_chai_pani';
    const finalAmount = isFreeShadowByAshTicket ? 0 : pricedAmount;
    let commission = applyCommission(finalAmount, 0, qty);
    if (source === 'shadow' && !isFreeShadowByAshTicket) {
        const hasCustomCommissionAmount = Object.prototype.hasOwnProperty.call(req.body || {}, 'commissionAmount');
        if (hasCustomCommissionAmount) {
            const commissionAmountPaise = normalizeCommissionAmount(requestedCommissionAmount);
            if (commissionAmountPaise === null || commissionAmountPaise * 100 > Math.round(finalAmount * 100) * 20) {
                return res.status(400).json({ success: false, message: 'Commission must be a valid amount no more than 20% of the official ticket total.' });
            }
            const normalized = finalAmount ? (commissionAmountPaise * 100) / Math.round(finalAmount * 100) : 0;
            commission = applyCommission(finalAmount, normalized, qty, commissionAmountPaise);
        } else {
            const normalized = normalizeCommissionPercentage(commissionPercentage);
            if (normalized === null || normalized === 'maximum_exceeded') {
                return res.status(400).json({ success: false, message: 'Commission must be a valid percentage no more than 20%.' });
            }
            commission = applyCommission(finalAmount, normalized, qty);
        }
    }

    try {
        const orderId = `order_shadow_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();

        // 1. Save Shadow Record immediately — this is the source of truth
        const record = {
            orderId,
            ticketId,
            companyId: 'littlane',
            event: pricedEvent,
            name,
            email,
            phone: phone || '',
            ticketType: tType,
            gender: gender || 'male',
            quantity: qty,
            amount: finalAmount,
            ...(source === 'shadow' ? commission : {}),
            ...(source === 'shadow' ? { passUnitPrice: Math.round((pricedAmount / qty) * 100) / 100 } : {}),
            currency: 'INR',
            status: 'paid',
            paymentId: `pay_shadow_${crypto.randomBytes(6).toString('hex')}`,
            paymentMethod,
            ...(source === 'shadow' ? { shadowPaymentStatus: isFreeShadowByAshTicket ? 'free_chai_pani' : 'paid' } : {}),
            emailStatus: 'pending',
            emailError: null,
            errorLog: [],
            createdAt: generatedAt,
            updatedAt: generatedAt,
            paidAt: generatedAt,
            generatedAt,
            generatedBy,
            source,
            isShadow: true,
            showInPres: false
        };

        await db.createSaleRecord(record);

        console.log('Shadow ticket issued; email delivery status recorded.');

        // Generate and queue both delivery channels before responding. This is
        // required in a serverless deployment, where work after res.json() is
        // not guaranteed to complete.
        const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;
        let pdfPath = null;
        let qrBuffer = null;

        try {
            pdfPath = await buildTicketPdf({
                ticketId,
                name,
                email,
                gender: tType,
                quantity: qty,
                amount: finalAmount,
                createdAt: generatedAt,
                event: evtName,
                timeZone: source === 'shadow' ? 'Asia/Kolkata' : undefined
            });
            qrBuffer = await buildQrBuffer(ticketId);
        } catch (pdfErr) {
            console.error('[Shadow PDF Error]', pdfErr.message);
        }

        try {
            const emailResult = await sendTicketEmail({
                to: email,
                name,
                ticketId,
                gender: tType,
                quantity: qty,
                amount: finalAmount,
                pdfPath,
                qrBuffer,
                downloadUrl,
                event: evtName
            });

            await db.updateSaleRecord(orderId, {
                status: 'ticket_generated',
                source,
                isShadow: true,
                emailStatus: emailResult.success ? 'sent' : 'failed',
                emailError: emailResult.error || null,
                updatedAt: new Date().toISOString()
            });

        } catch (emailErr) {
            console.error('[Shadow Email Error]', emailErr.message);
            await db.updateSaleRecord(orderId, {
                source,
                isShadow: true,
                emailStatus: 'failed',
                emailError: emailErr.message,
                updatedAt: new Date().toISOString()
            }).catch(() => {});
        }

        const whatsappResult = await sendAndRecordTicketWhatsApp({
            orderId, phone, name, ticketId, event: evtName, ticketType: tType, pdfPath
        });

        res.json({
            success: true,
            orderId,
            ticketId,
            whatsappSent: whatsappResult.success,
            whatsappError: publicWhatsAppError(whatsappResult),
            message: 'Shadow ticket created and delivery has been queued.'
        });
    } catch (err) {
        console.error('[Shadow Generation Error]', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server error generating shadow ticket.' });
        }
    }
}

app.post('/api/shadow/generate-ticket', requireShadowAuth, (req, res) =>
    generateShadowTicket(req, res, 'shadow', 'Shadow Private Panel', 'Shadow Sale')
);
app.post('/api/shadow/tickets/:orderId/:action', requireShadowAuth, async (req, res) => {
    const { orderId, action } = req.params;
    if (!['disable', 'enable'].includes(action)) return res.status(400).json({ success: false, message: 'Unsupported ticket action.' });
    try {
        const sale = await db.getByOrderId(orderId);
        if (!sale || sale.source !== 'shadow') return res.status(404).json({ success: false, message: 'Shadow by Ash ticket not found.' });
        if (action === 'disable') {
            if (sale.disabledAt) return res.json({ success: true, message: 'Ticket is already disabled.' });
            await db.updateSaleRecord(orderId, { status: 'cancelled', disabledAt: new Date().toISOString(), disabledBy: 'Shadow by Ash', disabledPreviousStatus: sale.status });
        } else {
            if (!sale.disabledAt) return res.json({ success: true, message: 'Ticket is already active.' });
            const restoredStatus = ['ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(sale.disabledPreviousStatus)
                ? sale.disabledPreviousStatus : 'ticket_generated';
            await db.updateSaleRecord(orderId, { status: restoredStatus, disabledAt: null, disabledBy: null, disabledPreviousStatus: null });
        }
        return res.json({ success: true, disabled: action === 'disable', message: action === 'disable' ? 'Ticket disabled.' : 'Ticket enabled.' });
    } catch (err) {
        console.error('[SHADOW TICKET STATUS ERROR]', err);
        return res.status(500).json({ success: false, message: 'Could not update ticket status.' });
    }
});
app.delete('/api/shadow/tickets/:orderId', requireShadowAuth, async (req, res) => {
    try {
        const sale = await db.getByOrderId(req.params.orderId);
        if (!sale || sale.source !== 'shadow') return res.status(404).json({ success: false, message: 'Shadow by Ash ticket not found.' });
        const removed = await db.deleteSaleRecord(sale.orderId);
        if (!removed) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        if (sale.ticketId) await fs.promises.unlink(path.join(TICKETS_DIR, `${sale.ticketId}.pdf`)).catch(err => { if (err.code !== 'ENOENT') throw err; });
        return res.json({ success: true, message: 'Ticket permanently deleted.' });
    } catch (err) {
        console.error('[SHADOW TICKET DELETE ERROR]', err);
        return res.status(500).json({ success: false, message: 'Could not delete ticket.' });
    }
});
app.post('/api/shadow-private/generate-ticket', requirePrivateShadowAuth, (req, res) =>
    generateShadowTicket(req, res, 'shadow_private', 'Private Shadow Panel', 'Private Shadow Sale')
);

async function getShadowSales(req, res) {
    try {
        const shadowSales = (await db.getAll()).filter(s => s.source === 'shadow');
        
        const activeSales = shadowSales.filter(s => !s.disabledAt && s.status !== 'cancelled');
        const shadowRevenue = activeSales.reduce((sum, s) => sum + (s.amount || 0), 0);
        const shadowRevenueAfterCommission = activeSales.reduce((sum, s) => sum + (s.rateAfterCommission ?? ((s.amount || 0) - (s.commissionAmount || 0))), 0);
        const shadowTicketsSold = activeSales.reduce((sum, s) => sum + (s.quantity || 1), 0);

        res.json({
            success: true,
            count: activeSales.length,
            shadowRevenue,
            shadowRevenueAfterCommission,
            shadowTicketsSold,
            sales: shadowSales
        });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
}

// Shadow users can view their own sales; admins can audit the same records.
app.get('/api/shadow/sales', requireShadowAuth, getShadowSales);
app.get('/api/shadow-private/sales', requirePrivateShadowAuth, async (req, res) => {
    try {
        const sales = (await db.getAll()).filter(s => s.source === 'shadow_private');
        res.json({
            success: true,
            count: sales.length,
            shadowRevenue: sales.reduce((sum, s) => sum + (s.amount || 0), 0),
            shadowTicketsSold: sales.reduce((sum, s) => sum + (s.quantity || 1), 0),
            sales
        });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// GET /api/debug/db-status — Shows DB connection mode and record count (for debugging)
app.get('/api/debug/db-status', requireMasterAdmin, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isConnected = mongoose.connection.readyState === 1;
        
        res.json({
            success: true,
            dbMode: isConnected ? 'MongoDB' : 'Mock (in-memory/file)',
            connected: isConnected,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database diagnostic is unavailable.' });
    }
});

// ==================== 6B. SECURE DATA WIPE (ADMIN ONLY) ====================
app.post('/api/admin/danger-wipe-test-data', (_req, res) => res.status(404).json({ success: false, message: 'Not found.' }));

// Permanently remove every sale and its generated ticket PDF. This requires a
// signed-in admin session plus a confirmation phrase so it cannot run by accident.
app.post('/api/admin/clear-sales', requireMasterAdmin, async (req, res) => {
    if (req.body?.confirmation !== 'DELETE ALL SALES') {
        return res.status(400).json({ success: false, message: 'Type DELETE ALL SALES to confirm this action.' });
    }

    try {
        const [deletedCount, ticketFiles] = await Promise.all([
            db.clearAllSales(),
            fs.promises.readdir(TICKETS_DIR, { withFileTypes: true }).catch(err => err.code === 'ENOENT' ? [] : Promise.reject(err))
        ]);
        const pdfFiles = ticketFiles.filter(file => file.isFile() && file.name.toLowerCase().endsWith('.pdf'));
        await Promise.all(pdfFiles.map(file => fs.promises.unlink(path.join(TICKETS_DIR, file.name))));
        res.json({ success: true, deletedCount, deletedPdfCount: pdfFiles.length, message: `Permanently deleted ${deletedCount} sales and ${pdfFiles.length} ticket PDFs.` });
    } catch (err) {
        console.error('[CLEAR SALES ERROR]', err);
        res.status(500).json({ success: false, message: 'Could not clear sales data.' });
    }
});

// ==================== 6C. CANCEL DELIVERED TICKET (ADMIN ONLY) ====================
app.post('/api/admin/cancel-ticket', requireMasterAdmin, async (req, res) => {
    const { ticketId } = req.body || {};
    if (!ticketId) {
        return res.status(400).json({ success: false, message: 'Ticket ID is required' });
    }
    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        await db.updateSaleRecord(sale.orderId, {
            status: 'cancelled',
            scannedAt: 'Cancelled by Admin',
            scannedBy: 'Admin'
        });
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: sale.companyId || 'littlane', eventId: sale.eventId || null, category: 'TICKET_CANCELLED', fieldChanged: 'status', previousValue: sale.status, newValue: 'cancelled', reason: `Cancelled ticket ${sale.ticketId}.` });
        res.json({ success: true, message: `Ticket ${ticketId} cancelled successfully.` });
    } catch (err) {
        console.error('[CANCEL ERROR]', err);
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.delete('/api/admin/delete-ticket', requireMasterAdmin, async (req, res) => {
    const ticketId = String(req.body?.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ success: false, message: 'Ticket ID is required.' });

    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });

        const removed = await db.deleteSaleRecord(sale.orderId);
        if (!removed) return res.status(404).json({ success: false, message: 'Ticket not found.' });

        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: sale.companyId || 'littlane', eventId: sale.eventId || null, category: 'TICKET_RECORD_DELETED', fieldChanged: 'orderRecord', previousValue: sale.orderId, reason: `Permanently removed ticket record ${sale.ticketId}.` });

        if (sale.ticketId) {
            const filename = `${path.basename(String(sale.ticketId))}.pdf`;
            await fs.promises.unlink(path.join(TICKETS_DIR, filename)).catch(err => {
                if (err.code !== 'ENOENT') throw err;
            });
        }
        return res.json({ success: true, message: `Ticket ${ticketId} permanently deleted.` });
    } catch (err) {
        console.error('[TICKET DELETE ERROR]', err);
        return res.status(500).json({ success: false, message: 'Could not permanently delete ticket.' });
    }
});

// ==================== 7. SCAN TICKET ====================
app.post('/api/scanner-login', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    const configuredPassword = process.env.SCANNER_PASSWORD;
    if (!configuredPassword || configuredPassword.length < 12) {
        return res.status(503).json({ success: false, message: 'Scanner login is not configured on the server.' });
    }
    const assignment = scannerAssignments();
    if (!assignment) return res.status(503).json({ success: false, message: 'Scanner event assignment is not configured.' });
    const supplied = Buffer.from(String(req.body?.password || ''));
    const expected = Buffer.from(configuredPassword);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ success: false, message: 'Invalid scanner password.' });
    }
    try {
        const loginAt = new Date();
        const expiresAt = new Date(loginAt.getTime() + SCANNER_SESSION_TTL_SECONDS * 1000);
        const token = generateToken();
        await db.setUserSession(`scanner-${crypto.randomUUID()}`, {
            token, role: 'scanner', displayName: 'Gate Staff', companyId: assignment.companyId,
            eventNames: assignment.eventNames, loginAt: loginAt.toISOString(), expiresAt, ip: clientIp(req), clientKind: 'browser',
        });
        return respondWithSession(req, res, 'scanner', token, { scannerName: 'Gate Staff', expiresAt: expiresAt.getTime() }, 'token', loginAt);
    } catch (err) {
        console.error('[scanner-login] Configuration error:', err.message);
        return res.status(503).json({ success: false, message: 'Scanner login is not configured on the server.' });
    }
});

// Passwordless session for the distributed native scanner app. This grants
// scanner-role access only; existing password-based scanner and seller/admin
// authentication routes remain unchanged.
app.post('/api/scanner-app-session', loginRateLimit, async (req, res) => {
    // The native app is a distributable client and cannot prove its identity.
    // Require the same server-held credential as the web scanner login.
    const configuredPassword = process.env.SCANNER_PASSWORD;
    if (!configuredPassword || configuredPassword.length < 12) {
        return res.status(503).json({ success: false, message: 'Scanner login is not configured on the server.' });
    }
    const assignment = scannerAssignments();
    if (!assignment) return res.status(503).json({ success: false, message: 'Scanner event assignment is not configured.' });
    const supplied = Buffer.from(String(req.body?.password || ''));
    const expected = Buffer.from(configuredPassword);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ success: false, message: 'Invalid scanner password.' });
    }
    try {
        const loginAt = new Date();
        const expiresAt = new Date(loginAt.getTime() + SCANNER_SESSION_TTL_SECONDS * 1000);
        const token = generateToken();
        await db.setUserSession(`scanner-${crypto.randomUUID()}`, {
            token, role: 'scanner', displayName: 'Gate Staff', companyId: assignment.companyId,
            eventNames: assignment.eventNames, loginAt: loginAt.toISOString(), expiresAt, ip: clientIp(req), clientKind: 'native',
        });
        res.set('Cache-Control', 'no-store, private');
        return res.json({ success: true, token, scannerName: 'Gate Staff', expiresAt: expiresAt.getTime() });
    } catch (err) {
        console.error('[scanner-app-session] Configuration error:', err.message);
        return res.status(503).json({ success: false, message: 'Scanner sessions are not configured on the server.' });
    }
});

app.get('/api/scanner-session', async (req, res) => {
    const session = await readScannerSession(req);
    if (!session) return res.status(401).json({ success: false, message: 'Scanner session expired. Log in again.' });
    return res.json({ success: true, scannerName: session.name, eventNames: session.eventNames, expiresAt: session.exp * 1000 });
});

// Scanner dashboard totals for the current India calendar day. Both approved
// and declined totals come from scan attempts so historical ticket state and
// old test scans cannot be mistaken for today's gate activity.
app.get('/api/scan-stats', async (req, res) => {
    const scannerSession = await readScannerSession(req);
    if (!scannerSession) {
        return res.status(401).json({ success: false, message: 'Scanner authentication is required.' });
    }
    try {
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const now = new Date();
        const istNow = new Date(now.getTime() + IST_OFFSET_MS);
        const todayStartIst = new Date(Date.UTC(
            istNow.getUTCFullYear(),
            istNow.getUTCMonth(),
            istNow.getUTCDate()
        ) - IST_OFFSET_MS);
        const scanStats = await db.getScanStats(scannerSession.companyId, todayStartIst);
        res.json({
            success: true,
            accepted: scanStats.accepted,
            failed: scanStats.declined,
            failedByReason: scanStats.declinedByReason,
            period: 'today',
            timezone: 'Asia/Kolkata',
            date: istNow.toISOString().slice(0, 10)
        });
    } catch (err) {
        console.error('[scan-stats] Error:', err);
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.post('/api/scan-ticket', async (req, res) => {
    const scannerSession = await readScannerSession(req);
    const sellerId = scannerSession ? null : await authenticateSeller(req.headers['x-seller-token']);
    if (!scannerSession && !sellerId) return res.status(401).json({ success: false, message: 'Scanner or seller login required.' });
    const { ticketId } = req.body || {};
    let scannedBy = scannerSession?.name;
    if (sellerId) {
        const users = await db.getAllUsers();
        const seller = users.find(user => user.role === 'seller' && (user.userId === sellerId || user.sellerSlot === sellerId));
        scannedBy = seller?.displayName || sellerId;
    }
    if (!ticketId) {
        return res.status(400).json({ success: false, message: 'Ticket ID is required' });
    }

    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale) {
            db.createScanLog({
                ticketId,
                result: 'invalid',
                scannedBy: scannedBy || 'Gate Staff',
                ip: req.ip || req.socket?.remoteAddress || 'unknown'
            }).catch(err => console.error('[ScanLog write error]', err.message));
            return res.json({ result: 'not_found' });
        }

        if (scannerSession) {
            const assignedEvent = Array.isArray(scannerSession.eventNames) && scannerSession.eventNames.some(name => String(name).trim().toLowerCase() === String(sale.event || '').trim().toLowerCase());
            const saleCompany = sale.companyId || sellerCompanyIdFromValue(sale.sellerId || sale.generatedBy) || 'littlane';
            if (!assignedEvent || saleCompany !== scannerSession.companyId) {
                return res.status(403).json({ success: false, message: 'This scanner is not assigned to the ticket event.' });
            }
        }

        if (scannerSession) {
            const allowed = Array.isArray(scannerSession.eventNames) && scannerSession.eventNames.some(name => String(name).trim().toLowerCase() === String(sale.event || '').trim().toLowerCase());
            if (!allowed) return res.status(403).json({ success: false, message: 'This scanner is not assigned to the ticket event.' });
        }
        if (sellerId) {
            const users = await db.getAllUsers();
            const seller = users.find(user => user.role === 'seller' && (user.userId === sellerId || user.sellerSlot === sellerId));
            const allowedCompany = seller?.companyId || sellerCompanyIdFromValue(sellerId);
            const saleCompany = sale.companyId || sellerCompanyIdFromValue(sale.sellerId || sale.generatedBy);
            if (!allowedCompany || !saleCompany || allowedCompany !== saleCompany) {
                return res.status(403).json({ success: false, message: 'Seller is not assigned to this ticket.' });
            }
        }

        if (sale.status === 'cancelled') {
            db.createScanLog({
                ticketId: sale.ticketId,
                result: 'cancelled',
                scannedBy: scannedBy || 'Gate Staff',
                scannerUserId: scannerSession?.userId || scannerSession?.name || sellerId,
                ip: req.ip || req.socket?.remoteAddress || 'unknown',
                companyId: sale.companyId || 'littlane',
                event: sale.event,
                orderId: sale.orderId,
                admissionCount: sale.admissionCount || sale.quantity || 1
            }).catch(err => console.error('[ScanLog write error]', err.message));
            return res.json({
                result: 'rejected',
                ticket: {
                    id: sale.ticketId,
                    event: sale.event,
                    attendee: sale.name,
                    email: sale.email,
                    phone: sale.phone,
                    ticketType: ticketTypeForSale(sale),
                    quantity: sale.quantity,
                    amount: sale.amount,
                    generatedAt: sale.generatedAt,
                    status: 'cancelled',
                    scannedBy: 'Admin',
                    scannedAt: sale.disabledAt ? 'Disabled by Solver' : 'Cancelled by Admin'
                }
            });
        }

        if (sale.status === 'scanned' || sale.scannedAt) {
            db.createScanLog({
                ticketId: sale.ticketId,
                result: 'duplicate',
                scannedBy: scannedBy || 'Gate Staff',
                scannerUserId: scannerSession?.userId || scannerSession?.name || sellerId,
                ip: req.ip || req.socket?.remoteAddress || 'unknown',
                companyId: sale.companyId || 'littlane',
                event: sale.event,
                orderId: sale.orderId,
                admissionCount: sale.scannedAdmissionCount || sale.admissionCount || sale.quantity || 1
            }).catch(err => console.error('[ScanLog write error]', err.message));
            return res.json({
                result: 'rejected',
                ticket: {
                    id: sale.ticketId,
                    event: sale.event,
                    attendee: sale.name,
                    email: sale.email,
                    phone: sale.phone,
                    ticketType: ticketTypeForSale(sale),
                    quantity: sale.quantity,
                    amount: sale.amount,
                    generatedAt: sale.generatedAt,
                    status: 'scanned',
                    scannedBy: sale.scannedBy,
                    scannedAt: sale.scannedAt
                }
            });
        }

        // IST = UTC + 5:30
        const utcNow = new Date();
        const ist = new Date(utcNow.getTime() + 5.5 * 60 * 60 * 1000);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const rawHour = ist.getUTCHours();
        const ampm = rawHour >= 12 ? 'PM' : 'AM';
        const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
        const mm = ist.getUTCMinutes().toString().padStart(2, '0');
        const scannedAtStr = `${months[ist.getUTCMonth()]} ${ist.getUTCDate()}, ${hour12}:${mm} ${ampm}`;

        const admissionCount = Number.isSafeInteger(sale.admissionCount) && sale.admissionCount > 0
            ? sale.admissionCount
            : (Number.isSafeInteger(sale.quantity) && sale.quantity > 0 ? sale.quantity : 1);
        const updatedSale = await db.atomicScanTicket(ticketId, scannedBy || 'Gate Staff', scannedAtStr, admissionCount);
        if (!updatedSale) {
            // Another scanner may have claimed it after the initial lookup.
            const currentSale = await db.getByTicketId(ticketId);
            if (!currentSale || currentSale.status === 'cancelled') {
                if (currentSale?.status === 'cancelled') {
                    db.createScanLog({ ticketId, result: 'cancelled', scannedBy: scannedBy || 'Gate Staff', scannerUserId: scannerSession?.userId || scannerSession?.name || sellerId, ip: req.ip || req.socket?.remoteAddress || 'unknown', companyId: currentSale.companyId || 'littlane', event: currentSale.event, orderId: currentSale.orderId, admissionCount: currentSale.admissionCount || currentSale.quantity || 1 }).catch(err => console.error('[ScanLog write error]', err.message));
                    return res.json({ result: 'rejected', ticket: { id: currentSale.ticketId, event: currentSale.event, attendee: currentSale.name, email: currentSale.email, phone: currentSale.phone, ticketType: ticketTypeForSale(currentSale), quantity: currentSale.quantity, amount: currentSale.amount, generatedAt: currentSale.generatedAt, status: 'cancelled', scannedBy: currentSale.disabledBy || 'Admin', scannedAt: currentSale.disabledAt ? 'Disabled by Solver' : 'Cancelled by Admin' } });
                }
                db.createScanLog({ ticketId, result: 'invalid', scannedBy: scannedBy || 'Gate Staff', ip: req.ip || req.socket?.remoteAddress || 'unknown' }).catch(err => console.error('[ScanLog write error]', err.message));
                return res.json({ result: 'not_found' });
            }
            const alreadyUsed = currentSale.status === 'scanned' || Boolean(currentSale.scannedAt);
            const requiresReview = !alreadyUsed;
            db.createScanLog({ ticketId: currentSale.ticketId, result: alreadyUsed ? 'duplicate' : 'manual_review', scannedBy: scannedBy || 'Gate Staff', scannerUserId: scannerSession?.userId || scannerSession?.name || sellerId, ip: req.ip || req.socket?.remoteAddress || 'unknown', companyId: currentSale.companyId || 'littlane', event: currentSale.event, orderId: currentSale.orderId, admissionCount: currentSale.admissionCount || currentSale.quantity || 1 }).catch(err => console.error('[ScanLog write error]', err.message));
            return res.json({ result: requiresReview ? 'manual_review' : 'rejected', reason: requiresReview ? 'ticket_not_issued' : 'already_used', message: requiresReview ? 'Ticket is not in an issued state and requires manual review.' : 'Ticket has already been used.', ticket: { id: currentSale.ticketId, event: currentSale.event, attendee: currentSale.name, email: currentSale.email, phone: currentSale.phone, ticketType: ticketTypeForSale(currentSale), quantity: currentSale.quantity, admissionCount: currentSale.admissionCount || currentSale.quantity || 1, amount: currentSale.amount, generatedAt: currentSale.generatedAt, status: currentSale.status, scannedBy: currentSale.scannedBy, scannedAt: currentSale.scannedAt } });
        }

        db.createScanLog({
            ticketId: updatedSale.ticketId,
            result: 'accepted',
            scannedBy: scannedBy || 'Gate Staff',
            scannerUserId: scannerSession?.userId || scannerSession?.name || sellerId,
            ip: req.ip || req.socket?.remoteAddress || 'unknown',
            companyId: updatedSale.companyId || 'littlane',
            event: updatedSale.event,
            orderId: updatedSale.orderId,
            admissionCount: updatedSale.scannedAdmissionCount || admissionCount
        }).catch(err => console.error('[ScanLog write error]', err.message));

        res.json({
            result: 'success',
            ticket: {
                id: updatedSale.ticketId,
                event: updatedSale.event,
                attendee: updatedSale.name,
                email: updatedSale.email,
                phone: updatedSale.phone,
                ticketType: ticketTypeForSale(updatedSale),
                quantity: updatedSale.quantity,
                admissionCount: updatedSale.scannedAdmissionCount || updatedSale.admissionCount || updatedSale.quantity || 1,
                scannedAdmissionCount: updatedSale.scannedAdmissionCount || updatedSale.admissionCount || updatedSale.quantity || 1,
                amount: updatedSale.amount,
                generatedAt: updatedSale.generatedAt,
                status: 'scanned',
                scannedBy: updatedSale.scannedBy,
                scannedAt: updatedSale.scannedAt
            }
        });
    } catch (err) {
        console.error('[scan-ticket] Error:', err);
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// ==================== DEBUG: TEST EMAIL ====================
app.get('/api/test-email', requireMasterAdmin, async (req, res) => {
    const { to } = req.query;
    if (!to) return res.status(400).json({ success: false, message: 'Pass ?to=your@email.com' });
    const { sendTicketEmail } = require('./mailer');
    try {
        const result = await sendTicketEmail({
            to,
            name: 'Test Customer',
            ticketId: 'TEST-123456',
            gender: 'male',
            quantity: 1,
            amount: 699,
            pdfPath: '', // skip attachment path for simple test
            qrBuffer: null,
            downloadUrl: 'https://littx.in'
        });
        if (result.success) {
            res.json({ success: true, message: 'Test email sent.' });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ==================== MULTI-EVENT MANAGEMENT ====================
app.get('/api/admin/events', requireEventManager, async (req, res) => {
    let events = (await db.getAllEvents()).filter(event => canManageEvent(req, event));
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const companyId = String(req.query.companyId || '').trim();
    if (search) events = events.filter(event => [event.name, event.slug, event.city, event.venue, event.companyId].some(value => String(value || '').toLowerCase().includes(search)));
    if (status) events = events.filter(event => lifecycleStatus(event) === status);
    if (companyId) events = events.filter(event => event.companyId === companyId);
    const sort = String(req.query.sort || 'updatedAt');
    const direction = String(req.query.direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const sortKeys = {
        name: event => String(event.name || '').toLowerCase(),
        status: event => lifecycleStatus(event),
        createdAt: event => new Date(event.createdAt || 0).getTime(),
        updatedAt: event => new Date(event.updatedAt || event.createdAt || 0).getTime()
    };
    if (sortKeys[sort]) events.sort((a, b) => (sortKeys[sort](a) > sortKeys[sort](b) ? 1 : sortKeys[sort](a) < sortKeys[sort](b) ? -1 : 0) * direction);
    const total = events.length;
    const hasPagination = req.query.page !== undefined || req.query.pageSize !== undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page || ''), 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(String(req.query.pageSize || ''), 10) || 25));
    if (hasPagination) events = events.slice((page - 1) * pageSize, page * pageSize);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, events: req.adminSession?.role === 'organizer' ? events.map(organizerSafeEvent) : events, total, page, pageSize });
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name || name.length > 160) return res.status(400).json({ success: false, message: 'Event title is required and must be at most 160 characters.' });
    const companyId = req.adminSession.role === 'company_admin' ? req.adminSession.companyId : String(body.companyId || '').trim();
    if (!companyId || !(await db.getCompanyById(companyId))) return res.status(400).json({ success: false, message: 'Select a valid organizer company.' });
    const normalized = normalizeTicketCategories(body.ticketCategories === undefined ? [] : body.ticketCategories);
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });
    const events = await db.getAllEvents();
    const slug = slugifyEvent(body.slug || name);
    if (!slug) return res.status(400).json({ success: false, message: 'Provide a valid public slug.' });
    if (events.some(item => String(item.slug || slugifyEvent(item.name)).toLowerCase() === slug)) return res.status(409).json({ success: false, message: 'That public event slug is already in use.' });
    const now = new Date().toISOString();
    const record = {
        id: `event_${crypto.randomUUID()}`, slug, name, companyId, organizerId: companyId,
        description: String(body.description || '').slice(0, 10000), category: String(body.category || '').trim().slice(0, 100),
        images: Array.isArray(body.images) ? body.images.map(value => String(value).slice(0, 2000)).slice(0, 20) : [],
        venue: String(body.venue || '').slice(0, 300), city: String(body.city || '').slice(0, 100), address: String(body.address || '').slice(0, 1000),
        timezone: String(body.timezone || 'Asia/Kolkata').slice(0, 80),
        startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null,
        salesStartAt: body.salesStartAt ? new Date(body.salesStartAt) : null, salesEndAt: body.salesEndAt ? new Date(body.salesEndAt) : null,
        ticketCategories: normalized.categories, status: 'draft', visibility: ['private', 'unlisted'].includes(body.visibility) ? body.visibility : 'public',
        active: false, archived: false, createdAt: now, updatedAt: now
    };
    for (const field of ['startsAt', 'endsAt', 'salesStartAt', 'salesEndAt']) {
        if (record[field] && !Number.isFinite(record[field].getTime())) return res.status(400).json({ success: false, message: `Invalid ${field} date.` });
    }
    if (record.startsAt && record.endsAt && record.endsAt < record.startsAt) return res.status(400).json({ success: false, message: 'Event end must be after its start.' });
    if (record.salesStartAt && record.salesEndAt && record.salesEndAt < record.salesStartAt) return res.status(400).json({ success: false, message: 'Ticket sales end must be after sales start.' });
    const created = await db.saveEvent(record);
    await db.createAuditLog({ adminUser: req.adminSession.userId, companyId, eventId: record.id, category: 'EVENT_CREATED', fieldChanged: 'event', newValue: name, reason: 'Event draft created.' });
    return res.status(201).json({ success: true, event: created });
});

app.patch('/api/admin/events/:eventRef', requireEventManager, async (req, res) => {
    const event = pickCanonicalEvent(await db.getAllEvents(), req.params.eventRef);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    if (!canManageEvent(req, event)) return res.status(403).json({ success: false, message: 'You cannot manage this event.' });
    const body = req.body || {};
    const allowed = ['name', 'slug', 'description', 'category', 'images', 'venue', 'city', 'address', 'timezone', 'startsAt', 'endsAt', 'salesStartAt', 'salesEndAt', 'visibility', 'ticketCategories'];
    const updates = {};
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
    if (updates.name !== undefined) {
        updates.name = String(updates.name).trim();
        if (!updates.name || updates.name.length > 160) return res.status(400).json({ success: false, message: 'Event title must be between 1 and 160 characters.' });
    }
    if (updates.slug !== undefined) {
        updates.slug = slugifyEvent(updates.slug || updates.name || event.name);
        if (!updates.slug) return res.status(400).json({ success: false, message: 'Invalid public slug.' });
        if ((await db.getAllEvents()).some(item => eventRef(item) !== eventRef(event) && String(item.slug || slugifyEvent(item.name)).toLowerCase() === updates.slug)) return res.status(409).json({ success: false, message: 'That public event slug is already in use.' });
    }
    if (updates.ticketCategories !== undefined) {
        const normalized = normalizeTicketCategories(updates.ticketCategories);
        if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });
        const sales = await db.getAll();
        const referencedSales = sales.filter(sale => sale.eventId === eventRef(event) || (!sale.eventId && String(sale.event || '').toLowerCase() === String(event.name || '').toLowerCase()));
        const oldCategories = event.ticketCategories?.length ? event.ticketCategories : [...(event.tiers || []), ...(event.ticketTypes || [])];
        const removedInUse = oldCategories.some(category => {
            const inUse = referencedSales.some(sale => sale.ticketCategoryId === category.id || (!sale.ticketCategoryId && [sale.ticketType, sale.gender].some(value => String(value || '').toLowerCase() === String(category.name || '').toLowerCase())));
            const remains = normalized.categories.some(next => next.id === category.id || next.name.toLowerCase() === String(category.name || '').toLowerCase());
            return inUse && !remains;
        });
        if (removedInUse) return res.status(409).json({ success: false, message: 'A ticket category with existing orders cannot be removed.' });
        const existingCategories = new Map(oldCategories.map(category => [category.id || slugifyPassId(category.name), category]));
        const capacityChanged = normalized.categories.some(category => {
            const previous = existingCategories.get(category.id);
            const existingOrders = previous && referencedSales.some(sale => sale.ticketCategoryId === category.id || (!sale.ticketCategoryId && String(sale.ticketType || sale.gender || '').toLowerCase() === String(previous.name || '').toLowerCase()));
            return existingOrders && (previous.totalInventory ?? null) !== category.totalInventory;
        });
        if (capacityChanged) return res.status(409).json({ success: false, message: 'Inventory capacity cannot be changed after orders exist for that category.' });
        updates.ticketCategories = normalized.categories.map(category => {
            const previous = existingCategories.get(category.id);
            if (!previous) return category;
            if ((previous.totalInventory ?? null) === category.totalInventory && category.totalInventory !== null) {
                return { ...category, remainingAvailability: previous.remainingAvailability ?? previous.totalInventory };
            }
            return category;
        });
    }
    for (const field of ['startsAt', 'endsAt', 'salesStartAt', 'salesEndAt']) {
        if (updates[field] !== undefined) {
            updates[field] = updates[field] ? new Date(updates[field]) : null;
            if (updates[field] && !Number.isFinite(updates[field].getTime())) return res.status(400).json({ success: false, message: `Invalid ${field} date.` });
        }
    }
    if (updates.visibility !== undefined && !['public', 'unlisted', 'private'].includes(updates.visibility)) return res.status(400).json({ success: false, message: 'Invalid event visibility.' });
    const merged = { ...event, ...updates };
    if (merged.startsAt && merged.endsAt && merged.endsAt < merged.startsAt) return res.status(400).json({ success: false, message: 'Event end must be after its start.' });
    if (merged.salesStartAt && merged.salesEndAt && merged.salesEndAt < merged.salesStartAt) return res.status(400).json({ success: false, message: 'Ticket sales end must be after sales start.' });
    const updated = await db.saveEvent({ ...merged, id: event.id || event._id, _id: event._id });
    const categoryAudit = updates.ticketCategories ? {
        previousValue: (event.ticketCategories || []).map(category => ({ id: category.id, name: category.name, price: category.price, totalInventory: category.totalInventory ?? null, groupSize: category.groupSize || 1, status: category.status || 'active' })),
        newValue: (updated.ticketCategories || []).map(category => ({ id: category.id, name: category.name, price: category.price, totalInventory: category.totalInventory ?? null, groupSize: category.groupSize || 1, status: category.status || 'active' }))
    } : {};
    await db.createAuditLog({ adminUser: req.adminSession.userId, companyId: event.companyId, eventId: eventRef(event), category: 'EVENT_UPDATED', fieldChanged: Object.keys(updates).join(','), ...categoryAudit, reason: 'Event configuration updated.' });
    return res.json({ success: true, event: req.adminSession?.role === 'organizer' ? organizerSafeEvent(updated) : updated });
});

app.post('/api/admin/events/:eventRef/transition', requireEventManager, async (req, res) => {
    const event = pickCanonicalEvent(await db.getAllEvents(), req.params.eventRef);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    if (!canManageEvent(req, event)) return res.status(403).json({ success: false, message: 'You cannot manage this event.' });
    const target = String(req.body?.status || '').toLowerCase();
    const current = lifecycleStatus(event);
    const transitions = { draft: ['pending_review'], pending_review: ['draft', 'published'], published: ['cancelled', 'postponed', 'completed'], postponed: ['published', 'cancelled', 'completed'] };
    if (!transitions[current]?.includes(target)) return res.status(409).json({ success: false, message: `Cannot transition event from ${current} to ${target}.` });
    if (target === 'published' && req.adminSession.role !== 'master_admin') return res.status(403).json({ success: false, message: 'Only a master administrator can publish an event.' });
    const now = new Date().toISOString();
    const updated = await db.saveEvent({ ...event, id: event.id || event._id, _id: event._id, status: target, active: target === 'published', archived: target === 'completed', publishedAt: target === 'published' ? (event.publishedAt || now) : event.publishedAt, updatedAt: now });
    await db.createAuditLog({ adminUser: req.adminSession.userId, companyId: event.companyId, eventId: eventRef(event), category: 'EVENT_STATUS_CHANGED', fieldChanged: 'status', previousValue: current, newValue: target, reason: 'Event lifecycle transition.' });
    return res.json({ success: true, event: req.adminSession?.role === 'organizer' ? organizerSafeEvent(updated) : updated });
});

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => res.json({ success: true, event: EVENT.name }));

function customerBookingSummary(sale, email) {
    const ticketAvailable = Boolean(sale.ticketId && isCountableTicketSale(sale));
    return {
        orderId: sale.orderId,
        event: sale.event || EVENT.name,
        ticketCategory: sale.ticketType || sale.gender || null,
        quantity: Math.max(1, Number.parseInt(sale.quantity, 10) || 1),
        admissionCount: Math.max(1, Number.parseInt(sale.admissionCount, 10) || Number.parseInt(sale.quantity, 10) || 1),
        amount: Number.isFinite(Number(sale.amount)) ? Number(sale.amount) : null,
        currency: sale.currency || 'INR',
        status: String(sale.paymentStatus || sale.status || 'unknown'),
        createdAt: sale.createdAt || null,
        reservationExpiresAt: sale.reservationExpiresAt || null,
        emailStatus: sale.emailStatus || 'not_sent',
        whatsappStatus: sale.whatsappStatus || 'not_sent',
        ticketId: ticketAvailable ? sale.ticketId : null,
        ticketAccessToken: ticketAvailable ? issueCustomerTicketToken({ ticketId: sale.ticketId, email, secret: process.env.BOOKING_OTP_SECRET, purpose: 'customer_ticket_pdf' }) : null,
        ticketViewToken: ticketAvailable ? issueCustomerTicketToken({ ticketId: sale.ticketId, email, secret: process.env.BOOKING_OTP_SECRET, purpose: 'customer_ticket_view' }) : null,
        ticketResendToken: ticketAvailable ? issueCustomerTicketToken({ ticketId: sale.ticketId, email, secret: process.env.BOOKING_OTP_SECRET, purpose: 'customer_ticket_resend' }) : null
    };
}

app.post('/api/customer/bookings/recovery/request', bookingRecoveryRequestRateLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    const secret = process.env.BOOKING_OTP_SECRET;
    if (process.env.NODE_ENV === 'test' || !secret || secret.length < 32 || !hasConfiguredEmailDelivery()) {
        return res.status(503).json({ success: false, message: 'Booking recovery email is temporarily unavailable. Please contact event support.' });
    }
    try {
        const challenge = await issueOtp({ subject: email, purpose: 'booking_recovery', secret, db });
        if (!challenge.ok) return res.status(429).json({ success: false, message: 'Too many recovery requests. Please try again later.' });
        const delivered = await sendBookingRecoveryOtp({ to: email, code: challenge.deliveryCode });
        if (!delivered.success) return res.status(503).json({ success: false, message: 'Booking recovery email is temporarily unavailable. Please contact event support.' });
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'If bookings match this email, a verification code has been sent.', challengeId: challenge.challengeId, expiresAt: challenge.expiresAt });
    } catch (error) {
        return res.status(503).json({ success: false, message: 'Booking recovery email is temporarily unavailable. Please contact event support.' });
    }
});

app.post('/api/customer/bookings/recovery/verify', bookingRecoveryVerifyRateLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const challengeId = String(req.body?.challengeId || '');
    const code = String(req.body?.code || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, message: 'Verification failed. Request a new code and try again.' });
    }
    try {
        const verified = await verifyOtp({ subject: email, purpose: 'booking_recovery', challengeId, code, secret: process.env.BOOKING_OTP_SECRET, db });
        if (!verified.ok) return res.status(401).json({ success: false, message: 'Verification failed. Request a new code and try again.' });
        const bookings = await db.getCustomerBookingsByEmail(email);
        res.set('Cache-Control', 'no-store');
        res.set('Pragma', 'no-cache');
        return res.json({ success: true, bookings: bookings.map(sale => customerBookingSummary(sale, email)) });
    } catch (error) {
        return res.status(503).json({ success: false, message: 'Booking history is temporarily unavailable.' });
    }
});

app.post('/api/customer/bookings/ticket-download', recoveredTicketDownloadRateLimit, async (req, res) => {
    const ticketId = String(req.body?.ticketId || '');
    const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[A-Za-z0-9-]{1,128}$/.test(ticketId)) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale || !verifyCustomerTicketToken({ token, ticketId, email: sale.email || '', secret: process.env.BOOKING_OTP_SECRET })) {
            return res.status(401).json({ success: false, message: 'Ticket access is invalid or expired. Verify your booking again.' });
        }
        if (sale.disabledAt || !isCountableTicketSale(sale)) return res.status(410).json({ success: false, message: 'This ticket is no longer active.' });
        const filePath = ticketPdfPath(sale.ticketId);
        if (!fs2.existsSync(filePath)) {
            await buildTicketPdf({
                ticketId: sale.ticketId, name: sale.name, email: sale.email,
                gender: ticketTypeForSale(sale), quantity: sale.quantity || 1,
                amount: sale.amount || 0, createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
                event: sale.event || EVENT.name, timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
            });
        }
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
        return res.download(filePath, `${EVENT.name.replace(/\s+/g, '-')}-${sale.ticketId}.pdf`, error => {
            if (error && !res.headersSent) res.status(404).send('Ticket file not found. Please contact support.');
        });
    } catch (error) {
        return res.status(503).json({ success: false, message: 'Ticket download is temporarily unavailable.' });
    }
});

app.post('/api/customer/bookings/ticket-resend', recoveredTicketResendRateLimit, async (req, res) => {
    const ticketId = String(req.body?.ticketId || '');
    const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[A-Za-z0-9-]{1,128}$/.test(ticketId)) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale || !verifyCustomerTicketToken({ token, ticketId, email: sale.email || '', secret: process.env.BOOKING_OTP_SECRET, purpose: 'customer_ticket_resend' })) {
            return res.status(401).json({ success: false, message: 'Ticket access is invalid or expired. Verify your booking again.' });
        }
        if (sale.disabledAt || !canDeliverSale(sale) || !isCountableTicketSale(sale)) return res.status(410).json({ success: false, message: 'This ticket is no longer active.' });
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
        const pdfPath = ticketPdfPath(sale.ticketId);
        if (!fs2.existsSync(pdfPath)) await buildTicketPdf({
            ticketId: sale.ticketId, name: sale.name, email: sale.email, gender: ticketTypeForSale(sale),
            quantity: sale.quantity || 1, amount: sale.amount || 0,
            createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString(),
            event: sale.event || EVENT.name, timeZone: sale.source === 'shadow' ? 'Asia/Kolkata' : undefined
        });
        const result = await sendTicketEmail({ to: sale.email, name: sale.name, ticketId: sale.ticketId,
            gender: ticketTypeForSale(sale), quantity: sale.quantity || 1, amount: sale.amount || 0,
            pdfPath, downloadUrl: `${BASE_URL}/bookings`, event: sale.event || EVENT.name });
        await db.updateSaleRecord(sale.orderId, { emailStatus: result.success ? 'sent' : 'failed', emailError: result.success ? null : result.error, status: result.success ? 'emailed' : 'email_failed' });
        return res.json({ success: Boolean(result.success), message: result.success ? 'Ticket email sent to the booking address.' : 'Ticket email could not be sent.' });
    } catch (_) {
        return res.status(503).json({ success: false, message: 'Ticket email is temporarily unavailable.' });
    }
});

// Public discovery is deliberately separate from the authenticated admin list.
app.get('/api/events', async (req, res) => {
    try {
        const allEvents = await db.getAllEvents();
        const search = String(req.query.search || '').trim().toLowerCase();
        const city = String(req.query.city || '').trim().toLowerCase();
        const category = String(req.query.category || '').trim().toLowerCase();
        const from = req.query.from ? new Date(String(req.query.from)).getTime() : null;
        const to = req.query.to ? new Date(String(req.query.to)).getTime() : null;
        const events = allEvents.filter(event => eventIsPublic(event) && event.visibility !== 'unlisted' && event.visibility !== 'private')
            .filter(event => !search || `${event.name} ${event.description || ''} ${event.venue || ''}`.toLowerCase().includes(search))
            .filter(event => !city || String(event.city || '').toLowerCase() === city)
            .filter(event => !category || String(event.category || '').toLowerCase() === category)
            .filter(event => {
                const eventTime = new Date(event.startsAt || event.date || 0).getTime();
                return (!from || (Number.isFinite(eventTime) && eventTime >= from)) && (!to || (Number.isFinite(eventTime) && eventTime <= to));
            });
        const payload = await Promise.all(events.map(async event => publicEventPayload(event, await getEventPricing(eventRef(event)))));
        res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
        res.json({ success: true, events: payload });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.get('/api/events/:eventRef', async (req, res) => {
    const event = pickCanonicalEvent(await db.getAllEvents(), req.params.eventRef);
    if (!event || !eventIsPublic(event) || event.visibility === 'unlisted' || event.visibility === 'private') return res.status(404).json({ success: false, message: 'Event not found.' });
    const pricing = await getEventPricing(eventRef(event));
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.json({ success: true, event: publicEventPayload(event, pricing) });
});

app.get('/api/pr/events', requirePR, async (req, res) => {
    const events = (await db.getAllEvents()).filter(event => eventIsPublic(event) && event.companyId === req.prSession.companyId);
    const payload = await Promise.all(events.map(async event => publicEventPayload(event, await getEventPricing(eventRef(event)))));
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, events: payload });
});

// GET /api/admin/sellers — dynamic seller list derived from sales records
app.get('/api/admin/sellers', requireAdmin, async (req, res) => {
    try {
        let all = (await db.getAll()).filter(s => !isShadowSale(s));
        if (req.adminSession?.role === 'company_admin') {
            all = all.filter(s => (s.companyId || sellerCompanyIdFromValue(s.sellerId || s.generatedBy)) === req.adminSession.companyId);
        }
        const sellerSet = new Set();
        all.forEach(s => {
            const who = s.generatedBy || s.prUserId || null;
            if (who) sellerSet.add(who);
        });
        // Also include configured seller accounts
        Object.keys(SELLER_ACCOUNTS).forEach(id => sellerSet.add(id));
        res.json({ success: true, sellers: Array.from(sellerSet) });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// ==================== MASTER ADMIN COMPANY PORTAL / GOVERNANCE API ====================
// GET /api/master/overview — verified platform totals and actionable queues.
app.get('/api/master/overview', requireMasterAdmin, async (_req, res) => {
    try {
        const [rawEvents, users, rawSales, auditLogs] = await Promise.all([
            db.getAllEvents(), db.getAllUsers(), db.getAll(), db.getAuditLogs(null)
        ]);
        const events = rawEvents.filter(event => !event.archived || lifecycleStatus(event) === 'completed');
        const sales = rawSales.filter(sale => !isShadowSale(sale));
        const verifiedSales = sales.filter(isVerifiedSalesRecord);
        const report = buildSalesReport(sales);
        const statusCounts = events.reduce((counts, event) => {
            const status = lifecycleStatus(event);
            counts[status] = (counts[status] || 0) + 1;
            return counts;
        }, {});
        const eventSummary = events.map(event => {
            const ref = eventRef(event);
            const related = sales.filter(sale => sale.eventId ? String(sale.eventId) === String(ref) : String(sale.event || '').toLowerCase() === String(event.name || '').toLowerCase());
            const verified = related.filter(isVerifiedSalesRecord);
            const eventReport = buildSalesReport(related);
            return {
                eventId: ref, name: event.name, companyId: event.companyId || event.organizerId || null,
                organizerUserIds: Array.isArray(event.organizerUserIds) ? event.organizerUserIds : [],
                status: lifecycleStatus(event), orders: eventReport.totalOrders, ticketsIssued: eventReport.qrCodes,
                admissions: eventReport.admissions, online: eventReport.online, offline: eventReport.offline,
                pendingOrders: related.filter(sale => ['pending', 'pr_cash_pending', 'pending_approval', 'ticket_approval_pending'].includes(String(sale.status || '').toLowerCase()) || sale.paymentStatus === 'pending' || sale.approvalStatus === 'PENDING').length,
                cancelledOrders: related.filter(sale => ['cancelled', 'canceled'].includes(String(sale.status || '').toLowerCase())).length,
                manualReviewOrders: related.filter(sale => sale.manualReview === true || sale.status === 'manual_review').length,
                remainingInventory: (event.ticketCategories || []).reduce((sum, category) => sum + (Number.isInteger(category.remainingAvailability) ? category.remainingAvailability : 0), 0),
                inventoryLimited: (event.ticketCategories || []).some(category => Number.isInteger(category.totalInventory)),
                verifiedRevenue: eventReport.verifiedRevenue,
                verifiedRevenueCurrency: eventReport.verifiedRevenueCurrency,
                verifiedRevenueByCurrency: eventReport.verifiedRevenueByCurrency,
                confirmedOrders: verified.length, pendingOrders: eventReport.pendingOrders,
                unverifiedOrders: eventReport.unverifiedOrders, expiredOrders: eventReport.expiredOrders,
                refundRequests: eventReport.refundRequests, refundApprovals: eventReport.refundApprovals,
                refundRejections: eventReport.refundRejections
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
        const pendingRefunds = sales.filter(sale => sale.refundStatus === 'requested');
        const pendingTicketApprovals = sales.filter(sale => sale.approvalStatus === 'PENDING' || sale.status === 'pr_cash_pending' || sale.status === 'pending_approval');
        const organizerCompanies = new Set(events.map(event => event.organizerId || event.companyId).filter(Boolean));
        const organizerAccounts = users.filter(user => user.role === 'organizer');
        const sellerAccounts = users.filter(user => user.role === 'seller');
        const prAccounts = users.filter(user => user.role === 'pr');
        const accounts = records => ({ total: records.length, active: records.filter(user => user.active !== false && !user.blocked).length, suspended: records.filter(user => user.active === false || user.blocked).length });
        const recentActivity = (auditLogs || []).slice(0, 12).map(log => ({
            actor: log.adminUser || log.actor || log.performedBy || 'Administrator',
            action: log.category || log.action || 'ADMIN_ACTION',
            entity: log.eventId || log.companyId || null,
            fieldChanged: log.fieldChanged || null,
            timestamp: log.timestamp || null
        }));
        const alerts = [];
        if (statusCounts.pending_review) alerts.push({ type: 'organizer_approval', count: statusCounts.pending_review, label: 'Events awaiting publication review' });
        if (pendingRefunds.length) alerts.push({ type: 'refund_review', count: pendingRefunds.length, label: 'Internal refund requests awaiting review' });
        if (pendingTicketApprovals.length) alerts.push({ type: 'ticket_approval', count: pendingTicketApprovals.length, label: 'Offline tickets awaiting approval' });
        const manualReviewCount = sales.filter(sale => sale.manualReview === true || sale.status === 'manual_review').length;
        if (manualReviewCount) alerts.push({ type: 'manual_review', count: manualReviewCount, label: 'Orders requiring manual review' });
        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            events: { total: events.length, active: statusCounts.published || 0, draft: statusCounts.draft || 0, completed: statusCounts.completed || 0, pendingReview: statusCounts.pending_review || 0 },
            accounts: {
                organizerCompanies: organizerCompanies.size,
                organizers: accounts(organizerAccounts),
                sellers: accounts(sellerAccounts), pr: accounts(prAccounts),
                users: [...organizerAccounts, ...sellerAccounts, ...prAccounts].map(user => ({
                    userId: user.userId, displayName: user.displayName || user.userId, role: user.role,
                    companyId: user.companyId || null, sellerSlot: user.sellerSlot || null,
                    active: user.active !== false && !user.blocked, blocked: Boolean(user.blocked)
                })).sort((a, b) => a.role.localeCompare(b.role) || a.displayName.localeCompare(b.displayName))
            },
            sales: { ...report, totalOrders: sales.length, confirmedOrders: verifiedSales.length, ticketsIssued: report.qrCodes },
            queues: { pendingOrganizerApprovals: statusCounts.pending_review || 0, pendingRefundRequests: pendingRefunds.length, pendingTicketApprovals: pendingTicketApprovals.length, manualReviewOrders: manualReviewCount },
            byEvent: eventSummary,
            recentActivity,
            alerts
        });
    } catch (error) {
        console.error('[master overview]', error.message);
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

// Read-only reconciliation. The report contains order references and state
// findings only; it never mutates a sale, ticket, reservation, or refund.
app.get('/api/admin/reconciliation', requireEventManager, async (req, res) => {
    try {
        const [allEvents, allSales] = await Promise.all([db.getAllEvents(), db.getAll()]);
        let events;
        if (req.adminSession?.role === 'master_admin') events = allEvents;
        else if (req.adminSession?.role === 'organizer') events = await db.getEventsForOrganizer(req.adminSession.userId);
        else events = allEvents.filter(event => (event.companyId || event.organizerId) === req.adminSession?.companyId);
        const eventIds = new Set(events.map(eventRef));
        const scopedSales = allSales.filter(sale => !isShadowSale(sale) && (
            (sale.eventId && eventIds.has(String(sale.eventId))) ||
            (!sale.eventId && events.some(event => String(sale.event || '').toLowerCase() === String(event.name || '').toLowerCase()
                && String(sale.companyId || event.companyId || '') === String(event.companyId || '')))
        ));
        const findings = buildReconciliationFindings(events, scopedSales);
        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            readOnly: true,
            scope: { eventCount: events.length },
            summary: { findings: findings.length, byCode: findings.reduce((counts, finding) => ({ ...counts, [finding.code]: (counts[finding.code] || 0) + 1 }), {}) },
            findings
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

app.patch('/api/master/accounts/:userId/status', requireMasterAdmin, async (req, res) => {
    const userId = String(req.params.userId || '').trim();
    const active = req.body?.active;
    if (!userId || typeof active !== 'boolean') return res.status(400).json({ success: false, message: 'Provide an account identifier and active true or false.' });
    const user = await db.getUserById(userId);
    if (!user || !['organizer', 'seller', 'pr'].includes(user.role)) return res.status(404).json({ success: false, message: 'Managed organizer, seller, or PR account not found.' });
    const updated = await db.updateUser(userId, { active, blocked: !active });
    if (!updated) return res.status(404).json({ success: false, message: 'Account could not be updated.' });
    if (!active) {
        const sessionIds = [userId, user.sellerSlot].filter(Boolean);
        await Promise.all(sessionIds.map(id => db.deleteUserSession(id)));
        if (user.role === 'seller') {
            for (const id of sessionIds) { delete sellerSessions[id]; await db.deleteSellerSession(id); }
            savePersisted(SESSIONS_FILE, sellerSessions);
        }
    }
    await db.createAuditLog({
        adminUser: req.adminSession?.userId || 'Master Admin', companyId: user.companyId || 'littlane',
        category: user.role === 'organizer'
            ? (active ? 'ORGANIZER_ACCOUNT_ACTIVATED' : 'ORGANIZER_ACCOUNT_SUSPENDED')
            : (active ? 'PARTNER_ACCOUNT_ACTIVATED' : 'PARTNER_ACCOUNT_SUSPENDED'),
        fieldChanged: 'active', previousValue: user.active !== false && !user.blocked, newValue: active,
        reason: `${user.role} account ${user.userId} ${active ? 'activated' : 'suspended'}.`
    });
    return res.json({ success: true, account: { userId, role: user.role, companyId: user.companyId || null, active, blocked: !active } });
});

app.post('/api/master/organizers', requireMasterAdmin, async (req, res) => {
    const userId = String(req.body?.userId || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const companyId = String(req.body?.companyId || '').trim();
    const password = req.body?.password;
    if (!/^[a-z0-9][a-z0-9._@+-]{2,119}$/.test(userId) || !displayName || displayName.length > 120 || typeof password !== 'string' || password.length < 12 || password.length > 200) {
        return res.status(400).json({ success: false, message: 'Provide a valid account ID, display name, and password of at least 12 characters.' });
    }
    if (!companyId || !(await db.getCompanyById(companyId))) return res.status(400).json({ success: false, message: 'Select a valid organizer company.' });
    if ((await db.getAllUsers()).some(user => user.userId.toLowerCase() === userId)) return res.status(409).json({ success: false, message: 'An account with that ID already exists.' });
    try {
        const account = await db.createUser({ userId, displayName, companyId, role: 'organizer', passwordHash: hashPassword(password), active: true, blocked: false });
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId, category: 'ORGANIZER_ACCOUNT_CREATED', fieldChanged: 'organizerAccount', newValue: userId, reason: 'Created organizer account. Event access requires explicit event assignment.' });
        return res.status(201).json({ success: true, organizer: { userId: account.userId, displayName: account.displayName, companyId: account.companyId, role: account.role, active: account.active } });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: 'An account with that ID already exists.' });
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

app.put('/api/master/events/:eventRef/organizers', requireMasterAdmin, async (req, res) => {
    const event = pickCanonicalEvent(await db.getAllEvents(), req.params.eventRef);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    const organizerUserIds = Array.isArray(req.body?.organizerUserIds)
        ? [...new Set(req.body.organizerUserIds.map(id => String(id || '').trim().toLowerCase()).filter(Boolean))]
        : null;
    if (!organizerUserIds || organizerUserIds.length > 100) return res.status(400).json({ success: false, message: 'Provide a list of at most 100 organizer accounts.' });
    const users = await Promise.all(organizerUserIds.map(id => db.getUserById(id)));
    const eventCompanyId = event.companyId || event.organizerId;
    if (users.some(user => !user || user.role !== 'organizer' || user.companyId !== eventCompanyId)) {
        return res.status(400).json({ success: false, message: 'Every assigned account must be an organizer in the event’s company.' });
    }
    const previous = Array.isArray(event.organizerUserIds) ? event.organizerUserIds : [];
    const updated = await db.saveEvent({ ...event, id: event.id || event._id, organizerUserIds, updatedAt: new Date().toISOString() });
    await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: event.companyId || 'littlane', eventId: eventRef(event), category: 'EVENT_ORGANIZER_ASSIGNMENTS_CHANGED', fieldChanged: 'organizerUserIds', previousValue: previous, newValue: organizerUserIds, reason: 'Updated explicit organizer event assignments.' });
    return res.json({ success: true, eventId: eventRef(event), organizerUserIds: updated.organizerUserIds || organizerUserIds });
});

app.get('/api/organizer/overview', requireOrganizer, async (req, res) => {
    try {
        const [events, allSales] = await Promise.all([db.getEventsForOrganizer(req.organizerAccount.userId), db.getAll()]);
        const sales = allSales.filter(sale => !isShadowSale(sale));
        const byEvent = await Promise.all(events.map(async event => {
            const ref = eventRef(event);
            const eventSales = sales.filter(sale => sale.eventId
                ? String(sale.eventId) === ref
                : String(sale.event || '').toLowerCase() === String(event.name || '').toLowerCase() && String(sale.companyId || event.companyId || '') === String(event.companyId || ''));
            const verified = eventSales.filter(isVerifiedSalesRecord);
            const report = buildSalesReport(eventSales);
            const scanSummary = await db.getScanSummaryForEvent(event.name, event.companyId || null);
            const audits = (await db.getAuditLogs(event.companyId || null)).filter(log => String(log.eventId || '') === ref).slice(0, 10);
            const orders = eventSales.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 100).map(sale => ({
                orderId: sale.orderId, ticketId: sale.ticketId || null, ticketType: ticketTypeForSale(sale),
                quantity: Number(sale.quantity) || 1, admissions: Number(sale.admissionCount) || Number(sale.quantity) || 1,
                status: sale.status || 'unknown', paymentStatus: sale.paymentStatus || null,
                approvalStatus: sale.approvalStatus || null,
                channel: ['offline_seller', 'offline_pr'].includes(String(sale.source || '').toLowerCase()) || ['cash', 'manual'].includes(String(sale.paymentMethod || '').toLowerCase()) ? 'offline' : 'online',
                sellerId: sale.sellerId || sale.prUserId || sale.generatedBy || null, sellerName: sale.prName || null,
                amount: isVerifiedSalesRecord(sale) ? Number(sale.customerTotal ?? sale.amount ?? 0) : null,
                currency: sale.currency || 'INR',
                scannedAt: sale.scannedAt || null, scannedAdmissions: Number(sale.scannedAdmissionCount) || 0,
                createdAt: sale.createdAt || null
            }));
            return {
                eventId: ref, name: event.name, slug: event.slug || null, status: lifecycleStatus(event),
                city: event.city || '', venue: event.venue || '', description: event.description || '', startsAt: event.startsAt || event.date || null,
                ticketCategories: (event.ticketCategories || []).map(category => ({ id: category.id, name: category.name, description: category.description || '', price: category.price, currency: category.currency || 'INR', totalInventory: category.totalInventory ?? null, remainingInventory: category.remainingAvailability ?? null, groupSize: category.groupSize || 1, status: category.status || 'active', maxPerCustomer: category.maxPerCustomer || 20, salesStartAt: category.salesStartAt || null, salesEndAt: category.salesEndAt || null, inclusions: category.inclusions || [] })),
                sales: {
                    orders: eventSales.length, confirmedOrders: verified.length, ticketsIssued: report.qrCodes,
                    admissions: report.admissions, online: report.online, offline: report.offline,
                    verifiedRevenue: report.verifiedRevenue,
                    verifiedRevenueCurrency: report.verifiedRevenueCurrency,
                    verifiedRevenueByCurrency: report.verifiedRevenueByCurrency,
                    revenueBasis: report.revenueBasis,
                    pending: report.pendingOrders, pendingAmount: report.pendingAmount,
                    cancelled: report.cancelledOrders, expired: report.expiredOrders,
                    unverified: report.unverifiedOrders, unverifiedAmount: report.unverifiedAmount,
                    refundRequests: report.refundRequests, refundApprovals: report.refundApprovals,
                    refundRejections: report.refundRejections
                },
                scans: {
                    accepted: scanSummary.accepted,
                    duplicate: scanSummary.duplicate,
                    admissions: scanSummary.admissions,
                    recent: scanSummary.recent.map(log => ({ ticketId: log.ticketId, result: log.result, admissionCount: log.admissionCount || 1, timestamp: log.timestamp }))
                },
                refundRequests: eventSales.filter(sale => sale.refundStatus === 'requested').map(sale => ({ orderId: sale.orderId, ticketId: sale.ticketId || null, amount: sale.amount, currency: sale.currency || 'INR', reason: sale.refundReason || '', requestedAt: sale.refundRequestedAt || null })),
                activity: audits.map(log => ({ actor: log.adminUser, action: log.category, fieldChanged: log.fieldChanged, timestamp: log.timestamp })),
                orders
            };
        }));
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, organizer: { userId: req.organizerAccount.userId, displayName: req.organizerAccount.displayName, companyId: req.organizerAccount.companyId }, events: byEvent });
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

// GET /api/master/companies — returns all companies with aggregated stats
app.get('/api/master/companies', requireMasterAdmin, async (req, res) => {
    try {
        const [users, allEvents] = await Promise.all([db.getAllUsers(), db.getAllEvents()]);
        await syncManagedPartnerCompanies(users);
        const list = await db.getAllCompanies();
        const allSales = (await db.getAll()).filter(s => !isShadowSale(s));
        const paidSales = allSales.filter(isVerifiedSalesRecord);
        const companyById = new Map(list.map(company => [company.companyId, company]));
        const slotCompanyMap = new Map(
            users
                .filter(user => user.role === 'seller' && user.sellerSlot && user.companyId)
                .map(user => [user.sellerSlot, user.companyId])
        );
        const saleCompanyIds = new Set(paidSales.map(sale => resolveSaleCompanyId(sale, slotCompanyMap)).filter(Boolean));
        const listById = new Map();
        const addCompany = (companyId, name, status = 'ACTIVE', record = {}) => {
            if (!companyId || PARTNER_LOGIN_SLOTS.includes(companyId)) return;
            const existing = listById.get(companyId);
            listById.set(companyId, {
                ...(existing || {}),
                ...record,
                companyId,
                name: displayCompanyName(companyId, existing?.name || name || companyId),
                status: record.status || existing?.status || status || 'ACTIVE'
            });
        };

        list.forEach(company => addCompany(company.companyId, company.name, company.status, company));
        Object.entries(PARTNER_NAMES).forEach(([companyId, name]) => {
            addCompany(companyId, name, companyById.get(companyId)?.status || 'ACTIVE', companyById.get(companyId) || {});
        });
        users.filter(user => user.role === 'seller' && user.companyId && !PARTNER_LOGIN_SLOTS.includes(user.companyId)).forEach(user => {
            addCompany(
                user.companyId,
                companyById.get(user.companyId)?.name || user.displayName,
                user.blocked || user.active === false ? 'SUSPENDED' : 'ACTIVE',
                companyById.get(user.companyId) || {}
            );
        });
        visibleDashboardEvents(allEvents).forEach(event => {
            if (event.companyId) addCompany(event.companyId, companyById.get(event.companyId)?.name || SELLER_COMPANY_NAMES[event.companyId] || event.companyId);
        });
        saleCompanyIds.forEach(companyId => {
            addCompany(companyId, companyById.get(companyId)?.name || SELLER_COMPANY_NAMES[companyId] || companyId);
        });

        const companiesWithStats = Array.from(listById.values()).map(c => {
            const companySales = paidSales.filter(s => resolveSaleCompanyId(s, slotCompanyMap) === c.companyId);
            const companyEvents = visibleDashboardEvents(allEvents).filter(event => event.companyId === c.companyId);
            const activePRs = users.filter(user => user.role === 'pr' && user.companyId === c.companyId && user.active !== false && !user.blocked).length;
            const totalOrders = companySales.length;
            const ticketCount = companySales.reduce((acc, s) => acc + (Number(s.admissionCount) || Number(s.quantity) || 1), 0);
            const grossRevenue = companySales.reduce((acc, s) => acc + saleGrossAmount(s), 0);
            const revenueAfterCommission = companySales.reduce((acc, s) => acc + saleRevenueAfterCommission(s), 0);
            const sellerCommission = companySales.reduce((acc, s) => acc + (Number(s.commissionAmount) || 0), 0);

            return {
                ...c,
                stats: {
                    totalOrders,
                    eventCount: companyEvents.length,
                    ticketCount,
                    grossRevenue,
                    activePRs,
                    platformFee: revenueAfterCommission,
                    revenueAfterCommission,
                    netCompanyRevenue: sellerCommission
                }
            };
        });

        res.json({ success: true, companies: redactCompanySecrets(companiesWithStats) });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// GET /api/master/companies/:id/control-center — details, overrides, and logs for one company
app.get('/api/master/companies/:id/control-center', requireMasterAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const users = await db.getAllUsers();
        const sellerSlotUser = users.find(user => user.role === 'seller' && (user.companyId === id || user.sellerSlot === id));
        const fallbackCompanyName = PARTNER_NAMES[id] || sellerSlotUser?.displayName || SELLER_COMPANY_NAMES[id];
        const company = await db.getCompanyById(id) || (fallbackCompanyName ? {
            companyId: id,
            name: displayCompanyName(id, fallbackCompanyName),
            status: 'ACTIVE',
            commercials: { feeType: 'PERCENTAGE', percentageFee: 0, fixedFeePerTicket: 0 },
            razorpayConfig: { enabled: false, keyId: '', keySecret: '', mode: 'TEST', lockedByMaster: false },
            manualPaymentConfig: { enabled: true, allowedMethods: ['cash'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
            features: {},
            prSettings: { commissionType: 'PERCENTAGE', commissionValue: 0 }
        } : null);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        company.name = displayCompanyName(company.companyId || id, company.name);

        const effectiveConfig = await db.getEffectiveConfig(id).catch(() => ({ effective: company }));
        const allEvents = await db.getAllEvents();
        const events = allEvents.filter(e => (e.organizerId || e.companyId) === id && !e.archived);
        const auditLogs = await db.getAuditLogs(id);

        res.json({
            success: true,
            company: redactCompanySecrets(company),
            effectiveConfig: redactCompanySecrets(effectiveConfig.effective),
            events,
            auditLogs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/master/companies/:id/config — updates company settings and logs governance action
app.post('/api/master/companies/:id/config', requireMasterAdmin, async (req, res) => {
    const { id } = req.params;
    const { updates, reason } = req.body || {};
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return res.status(400).json({ success: false, message: 'Valid configuration updates are required.' });
    const allowedFields = {
        name: [], status: [], statusReason: [],
        commercials: ['feeType', 'percentageFee', 'fixedFeePerTicket'],
        razorpayConfig: ['enabled', 'keyId', 'keySecret', 'webhookSecret', 'mode', 'lockedByMaster'],
        manualPaymentConfig: ['enabled', 'allowedMethods', 'approvalWorkflow', 'lockedByMaster'],
        features: ['onlinePayments', 'manualPayments', 'prPortal', 'prSales', 'ticketTransfers', 'refunds', 'couponCodes', 'qrCheckIn', 'offlineScan', 'allowReEntry'],
        prSettings: ['commissionType', 'commissionValue'],
    };
    for (const [field, value] of Object.entries(updates)) {
        if (!(field in allowedFields)) return res.status(400).json({ success: false, message: 'Unsupported configuration field.' });
        if (allowedFields[field].length && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowedFields[field].includes(key)))) {
            return res.status(400).json({ success: false, message: 'Unsupported nested configuration field.' });
        }
    }
    try {
        const old = await db.getCompanyById(id);
        if (!old) return res.status(404).json({ success: false, message: 'Company not found' });

        const safeUpdates = { ...updates };
        if (updates.razorpayConfig) {
            safeUpdates.razorpayConfig = { ...(old.razorpayConfig || {}), ...updates.razorpayConfig };
            if (!updates.razorpayConfig.keySecret) safeUpdates.razorpayConfig.keySecret = old.razorpayConfig?.keySecret || '';
            if (!updates.razorpayConfig.webhookSecret) safeUpdates.razorpayConfig.webhookSecret = old.razorpayConfig?.webhookSecret || '';
        }
        const updated = await db.updateCompanyConfig(id, safeUpdates);
        await db.createAuditLog({
            adminUser: req.adminSession?.userId || 'Master Admin', companyId: id,
            category: 'COMPANY_CONFIG_UPDATED', fieldChanged: Object.keys(updates).join(','),
            reason: String(reason || 'Governance update').slice(0, 500)
        });

        res.json({ success: true, company: redactCompanySecrets(updated) });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/master/companies/:id/emergency — locks or shuts down operations instantly
app.post('/api/master/companies/:id/emergency', requireMasterAdmin, async (req, res) => {
    const { id } = req.params;
    const { action, statusReason } = req.body || {};
    if (!['LOCK_PLATFORM', 'ACTIVATE_PLATFORM'].includes(action)) return res.status(400).json({ success: false, message: 'Unsupported governance action.' });
    try {
        const company = await db.getCompanyById(id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        let status = company.status;
        if (action === 'LOCK_PLATFORM') status = 'SUSPENDED';
        else if (action === 'ACTIVATE_PLATFORM') status = 'ACTIVE';

        const updated = await db.updateCompanyConfig(id, { status, statusReason });
        await db.createAuditLog({
            adminUser: req.adminSession?.userId || 'Master Admin', companyId: id,
            category: 'COMPANY_STATUS_CHANGED', fieldChanged: 'status', previousValue: company.status, newValue: status,
            reason: String(statusReason || action).slice(0, 500)
        });

        res.json({ success: true, company: redactCompanySecrets(updated) });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// ==================== UNIVERSAL PLATFORM LOGIN ====================
// POST /api/auth/login — unified entry point for all platform roles.
// Called by LoginPage.tsx (the portal with the credential switcher at the bottom).
const PLATFORM_USERS = [
    // Admin and dashboard access is scoped by /api/portal-auth/login.
];

const PR_USERS_AUTH = [
    { username: 'partner1', password: process.env.PR1_PASS || '', displayName: 'Partner One', id: 'pr1' },
    { username: 'partner2', password: process.env.PR2_PASS || '', displayName: 'Partner Two', id: 'pr2' },
    { username: 'partner5', password: process.env.PR5_PASS || '', displayName: 'Partner Five', id: 'pr5' },
];

app.post('/api/portal-auth/login', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    const { portal, password } = req.body || {};
    const isAdmin = portal === 'admin';
    const isDashboard = portal === 'dashboard';
    if ((!isAdmin && !isDashboard) || typeof password !== 'string' || !password) {
        return res.status(400).json({ success: false, message: 'Enter a valid portal access key.' });
    }

    // Master admins may sign in with either the dedicated portal key or the
    // existing ADMIN_KEY already accepted by requireMasterAdmin. This keeps
    // the Solver login compatible with both established admin credentials.
    const expectedKeys = isAdmin
        ? [process.env.PORTAL_ADMIN_KEY, process.env.ADMIN_KEY].filter(Boolean)
        : [process.env.PORTAL_DASHBOARD_KEY].filter(Boolean);
    if (!expectedKeys.some(expected => safeStringEqual(password, expected))) {
        return res.status(401).json({ success: false, message: 'Invalid access key.' });
    }

    const role = isAdmin ? 'master_admin' : 'company_admin';
    const userId = isAdmin ? 'portal-admin-key' : 'portal-dashboard-key';
    const displayName = isAdmin ? 'Admin' : 'Dashboard';
    const companyId = isAdmin ? 'littx' : 'littlane';
    const token = generateToken();
    const loginAt = new Date().toISOString();
    await db.setUserSession(userId, {
        token,
        ip: clientIp(req),
        loginAt,
        role,
        companyId,
        displayName,
    });
    return respondWithSession(req, res, 'user', token, {
        user: { userId, displayName, role, companyId, portalScope: portal },
    }, 'token', loginAt);
});

app.post('/api/auth/login', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    // 1. Check platform users (master_admin, company_admin)
    const platformUser = PLATFORM_USERS.find(
        u => u.userId.toLowerCase() === String(username).toLowerCase() && safeStringEqual(u.password, password)
    );
    if (platformUser) {
        const token = generateToken();
        const loginAt = new Date().toISOString();
        // Register this token so requireAdmin accepts x-auth-token from the frontend
        await db.setUserSession(platformUser.userId, {
            token,
            ip: clientIp(req),
            loginAt,
            role: platformUser.role,
            companyId: platformUser.companyId,
            displayName: platformUser.displayName,
        });
        return respondWithSession(req, res, 'user', token, {
            user: {
                userId: platformUser.userId,
                displayName: platformUser.displayName,
                role: platformUser.role,
                companyId: platformUser.companyId
            }
        }, 'token', loginAt);
    }

    const managedUser = (await db.getAllUsers()).find(user => user.userId.toLowerCase() === String(username).toLowerCase());
    if (managedUser?.role === 'organizer') {
        if (managedUser.active === false || managedUser.blocked) return res.status(403).json({ success: false, message: 'Organizer account is inactive. Contact the Master Admin.' });
        if (!verifyPassword(String(password), managedUser.passwordHash)) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        const token = generateToken();
        const loginAt = new Date().toISOString();
        const session = { token, ip: clientIp(req), loginAt, role: 'organizer', companyId: managedUser.companyId, displayName: managedUser.displayName || managedUser.userId };
        await db.setUserSession(managedUser.userId, session);
        return respondWithSession(req, res, 'user', token, { user: { userId: managedUser.userId, displayName: session.displayName, role: 'organizer', companyId: managedUser.companyId, portalScope: 'organizer' } }, 'token', loginAt);
    }

    // 2. Check PR partners
    const prUser = PR_USERS_AUTH.find(
        u => u.username.toLowerCase() === String(username).toLowerCase() && safeStringEqual(u.password, password)
    );
    if (prUser) {
        const token = generateToken();
        const loginAt = new Date().toISOString();
        await db.setUserSession(prUser.id, {
            token,
            ip: clientIp(req),
            loginAt,
            role: 'pr',
            companyId: 'littlane',
            displayName: prUser.displayName,
        });
        return respondWithSession(req, res, 'user', token, {
            user: {
                userId: prUser.id,
                displayName: prUser.displayName,
                role: 'pr',
                companyId: 'littlane'
            }
        }, 'token', loginAt);
    }

    // 3. Check sellers
    const sid = username.toUpperCase();
    if (SELLER_ACCOUNTS[sid] && safeStringEqual(SELLER_ACCOUNTS[sid], password)) {
        const token = generateToken();
        const loginAt = new Date().toISOString();
        sellerSessions[sid] = { token, loginAt, clientKind: req.get('origin') ? 'browser' : 'native' };
        await db.setSellerSession(sid, sellerSessions[sid]);
        return respondWithSession(req, res, 'seller', token, {
            user: {
                userId: sid,
                displayName: `Seller ${sid}`,
                role: 'seller',
                companyId: 'littlane'
            }
        }, 'token', loginAt);
    }

    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
});

app.post('/api/auth/logout', async (req, res) => {
    const token = req.headers['x-auth-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Authentication is required.' });
    const session = await db.getUserSessionByToken(token).catch(() => null);
    if (!isValidUserSession(session, token)) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
    await db.deleteUserSessionByToken(token);
    if (req.cookieSessionFamily === 'user') clearSessionCookies(res, 'user', secureCookieRequest(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true });
});

app.post('/api/seller/logout', async (req, res) => {
    const token = req.headers['x-seller-token'];
    const sellerId = await authenticateSeller(token);
    if (!sellerId) return res.status(401).json({ success: false, message: 'Seller session expired or invalid.' });
    delete sellerSessions[sellerId];
    await db.deleteSellerSession(sellerId);
    clearSessionCookies(res, 'seller', secureCookieRequest(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true });
});

app.post('/api/scanner-logout', async (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const session = await db.getUserSessionByToken(token).catch(() => null);
    if (!session || session.role !== 'scanner' || !isValidUserSession(session, token)) {
        return res.status(401).json({ success: false, message: 'Scanner session expired or invalid.' });
    }
    await db.deleteUserSessionByToken(token);
    clearSessionCookies(res, 'scanner', secureCookieRequest(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true });
});

// ==================== LITTX SELLER LOGIN SYSTEM ====================


// ==================== SELLER PORTAL WEBAUTHN ROUTES ====================
app.post('/api/seller/login-step1', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    try {
        const { partnerId: requestedPartnerId, password } = req.body || {};
        if (!password) return res.status(400).json({ success: false, message: 'Enter your seller password.' });
        const partner = requestedPartnerId
            ? await resolveSellerPartner(requestedPartnerId)
            : await findSellerPartnerByPassword(password);
        if (!partner) {
            return res.status(401).json({ success: false, message: 'Seller password not recognized or shared between sellers.' });
        }
        if (!partner.active) {
            return res.status(403).json({ success: false, message: 'This partner account is inactive. Contact the Master Admin.' });
        }
        if (requestedPartnerId && !(partner.passwordHash ? verifyPassword(password, partner.passwordHash) : safeStringEqual(partner.legacyPassword, password))) {
            return res.status(401).json({ success: false, message: 'Invalid partner password' });
        }

        const partnerId = partner.id;

        const { rpID, origin } = getWebAuthnRelyingParty(req);

        const partnerLock = await db.getPartnerLock(partnerId);
        // The database lock is the sole source of truth. A stale /tmp value
        // from a prior serverless instance must never turn an unbound seller
        // into an authentication flow: native Android needs a registration
        // request for the first device binding.
        // Treat partial legacy WebAuthn records as unbound. An ID without its
        // public key cannot be verified and must not crash native login.
        const authenticator = partnerLock?.webauthnCredentialId && partnerLock?.webauthnPublicKey
            ? {
                credentialID: partnerLock.webauthnCredentialId,
                credentialPublicKey: Buffer.from(partnerLock.webauthnPublicKey, 'base64url'),
                counter: partnerLock.webauthnCounter || 0,
                transports: partnerLock.webauthnTransports || [],
            }
            : null;
        if (!authenticator) {
            // First time: Registration options
            const options = await generateRegistrationOptions({
                rpName,
                rpID,
                userID: Buffer.from(partnerId, 'utf-8'),
                userName: partner.name,
                attestationType: 'none',
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                },
            });
            const loginId = await createWebAuthnLogin(partnerId, options.challenge, rpID, origin);
            return res.json({ success: true, partnerId: partner.id, isRegistration: true, loginId, options });
        } else {
            // Returning: Authentication options
            const options = await generateAuthenticationOptions({
                rpID,
                allowCredentials: [{
                    id: authenticator.credentialID,
                    type: 'public-key',
                    transports: authenticator.transports,
                }],
                userVerification: 'preferred',
            });
            const loginId = await createWebAuthnLogin(partnerId, options.challenge, rpID, origin);
            return res.json({ success: true, partnerId: partner.id, isRegistration: false, loginId, options });
        }
    } catch (err) {
        console.error('[WebAuthn Step1 Error]', err);
        return res.status(500).json({ success: false, message: safeErrorMessage(err) || 'Authentication error' });
    }
});

app.post('/api/seller/login-step2', loginRateLimit, browserSessionLoginGuard, async (req, res) => {
    try {
        const { partnerId, loginId, response } = req.body || {};
        if (!partnerId || !loginId || !response) return res.status(400).json({ success: false, message: 'Missing fields' });
        const partner = await resolveSellerPartner(partnerId);
        if (!partner || !partner.active) return res.status(403).json({ success: false, message: 'This partner account is unavailable. Contact the Master Admin.' });

        const login = await consumeWebAuthnLogin(loginId, partnerId);
        if (!login) return res.status(400).json({ success: false, message: 'Authentication challenge is invalid or expired. Please try again.' });

        const partnerLock = await db.getPartnerLock(partnerId);
        // Match step 1: only a durable database credential can select the
        // authentication verification path.
        const authenticator = partnerLock?.webauthnCredentialId && partnerLock?.webauthnPublicKey
            ? {
                credentialID: partnerLock.webauthnCredentialId,
                credentialPublicKey: Buffer.from(partnerLock.webauthnPublicKey, 'base64url'),
                counter: partnerLock.webauthnCounter || 0,
                transports: partnerLock.webauthnTransports || [],
            }
            : null;
        let verification;

        if (!authenticator) {
            // Verify Registration
            verification = await verifyRegistrationResponse({
                response,
                expectedChallenge: login.challenge,
                expectedOrigin: login.origin,
                expectedRPID: login.rpID,
            });

            if (verification.verified && verification.registrationInfo) {
                const reg = verification.registrationInfo;
                const cred = reg.credential || {};
                webauthnAuthenticators[partnerId] = {
                    credentialID: cred.id || reg.credentialID,
                    credentialPublicKey: cred.publicKey || reg.credentialPublicKey,
                    counter: (cred.counter !== undefined) ? cred.counter : ((reg.counter !== undefined) ? reg.counter : 0),
                    transports: response.response?.transports || ['internal', 'hybrid', 'usb', 'nfc', 'ble']
                };
                savePersisted(WEBAUTHN_FILE, webauthnAuthenticators);
                const stored = webauthnAuthenticators[partnerId];
                const userAgent = req.headers['user-agent'] || '';
                await db.savePartnerLock(partnerId, {
                    name: partner.name,
                    webauthnCredentialId: stored.credentialID,
                    webauthnPublicKey: Buffer.from(stored.credentialPublicKey).toString('base64url'),
                    webauthnCounter: stored.counter,
                    webauthnTransports: stored.transports,
                    deviceRegisteredAt: new Date().toISOString(),
                    registeredDeviceId: String(stored.credentialID).slice(-8),
                    deviceName: deviceNameFromUserAgent(userAgent),
                    lastUserAgent: userAgent,
                });
            }
        } else {
            // Verify Authentication
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: login.challenge,
                expectedOrigin: login.origin,
                expectedRPID: login.rpID,
                // @simplewebauthn/server v13 expects `credential`; the older
                // `authenticator` shape leaves it undefined and crashes when
                // Safari submits a valid passkey assertion.
                credential: {
                    id: authenticator.credentialID,
                    publicKey: authenticator.credentialPublicKey,
                    counter: Number(authenticator.counter) || 0,
                    transports: authenticator.transports,
                }
            });

            if (verification.verified && verification.authenticationInfo) {
                const newCounter = verification.authenticationInfo.newCounter || 0;
                if (webauthnAuthenticators[partnerId]) {
                    webauthnAuthenticators[partnerId].counter = newCounter;
                    savePersisted(WEBAUTHN_FILE, webauthnAuthenticators);
                }
                await db.savePartnerLock(partnerId, {
                    webauthnCounter: newCounter,
                    lastSeenAt: new Date().toISOString(),
                    lastUserAgent: req.headers['user-agent'] || partnerLock?.lastUserAgent || '',
                });
            }
        }

        if (verification && verification.verified) {
            const token = generateToken();
            const ip = clientIp(req);
            const loginAt = new Date().toISOString();
            sellerSessions[partnerId] = { token, loginAt, ip, clientKind: req.get('origin') ? 'browser' : 'native' };
            savePersisted(SESSIONS_FILE, sellerSessions);
            await db.setSellerSession(partnerId, sellerSessions[partnerId]);
            await db.savePartnerLock(partnerId, { boundIp: ip, boundAt: partnerLock?.boundAt || new Date().toISOString(), lastSeenAt: new Date().toISOString() });
            console.log(`[Seller Login] ${partnerId} logged in via WebAuthn from ${ip}`);

            return respondWithSession(req, res, 'seller', token, {
                partner: {
                    id: partnerId,
                    name: partner.name,
                    boundIp: ip
                }
            }, 'token', loginAt);
        }

        return res.status(400).json({ success: false, message: 'WebAuthn cryptographic verification failed' });
    } catch (err) {
        console.error('[WebAuthn Step2 Error]', err);
        return res.status(400).json({ success: false, message: safeErrorMessage(err) || 'Verification error' });
    }
});

app.get('/api/seller/verify-session', async (req, res) => {
    const token = req.headers['x-seller-token'];
    const sid = await authenticateSeller(token);
    if (sid) {
        const session = sellerSessions[sid] || await db.getSellerSession(sid);
        const lock = await db.getPartnerLock(sid);
        const partner = await resolveSellerPartner(sid);
        return res.json({
            success: true,
            partner: {
                id: sid,
                name: partner?.name || sid,
                boundIp: session?.ip || lock?.boundIp || null,
                registeredDeviceId: lock?.registeredDeviceId || null,
                webauthnCredentialId: lock?.webauthnCredentialId || null,
                sessionVersion: lock?.sessionVersion || 1,
            }
        });
    }
    return res.status(401).json({ success: false, message: 'Session invalid or expired' });
});
// GET /api/seller/verify — check if session is still valid
app.get('/api/seller/verify', async (req, res) => {
    const token = req.headers['x-seller-token'];
    const sid = await authenticateSeller(token);
    if (!sid) {
        return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
    }
    const session = sellerSessions[sid] || await db.getSellerSession(sid);
    res.json({ success: true, sellerId: sid, loginAt: session?.loginAt });
});

// GET /api/seller/sales — returns sales made by THIS seller
app.get('/api/seller/sales', requireSeller, async (req, res) => {
    try {
        const all = (await db.getAll()).filter(s => !isShadowSale(s));
        const mySales = all.filter(s =>
            s.generatedBy === req.sellerId || s.prUserId === req.sellerId
        );
        res.json({ success: true, sellerId: req.sellerId, report: buildSalesReport(mySales), sales: mySales });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// The mobile client alone consumes this route. It is deliberately authenticated:
// seller availability and commercial configuration are not public data.
app.get('/api/mobile/seller-config', requireSeller, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const staticConfig = getSellerMobileConfig();
        if (!(await sellerOwnsEvent(req.sellerId, staticConfig.event.name))) return res.status(403).json({ success: false, message: 'Seller is not assigned to this event.' });
        const pricing = await getEventPricing(staticConfig.event.name);
        if (!pricing) return res.status(404).json({ success: false, message: 'Seller pricing is unavailable.' });
        res.json({
            success: true,
            config: {
                ...staticConfig,
                event: { ...staticConfig.event, name: pricing.event.name },
                passes: pricing.passes.map(pass => ({ id: pass.id, label: pass.name, price: pass.price }))
            }
        });
    } catch (err) {
        console.error('[Seller mobile config]', err.message);
        res.status(500).json({ success: false, message: 'Seller configuration is unavailable.' });
    }
});

// Admin-facing device inventory for the /seller portal. Tokens and public keys
// are intentionally never returned to the browser.
app.get('/api/admin/seller-devices', requireMasterAdmin, async (req, res) => {
    try {
        const [locks, sessions, users, companies] = await Promise.all([
            db.getAllPartnerLocks(),
            db.getAllSellerSessions(),
            db.getAllUsers(),
            db.getAllCompanies(),
        ]);
        const sessionBySeller = new Map(sessions.map(session => [session.sellerId, session]));
        const companyNames = new Map(companies.map(company => [company.companyId, company.name]));
        const allSellerIds = [...new Set([...Object.keys(PARTNER_NAMES), ...PARTNER_LOGIN_SLOTS])];
        const devices = await Promise.all(allSellerIds.map(async partnerId => {
            const lock = locks.find(item => item.partnerId === partnerId) || {};
            const session = sessionBySeller.get(partnerId);
            const partner = await resolveSellerPartner(partnerId);
            const assignedCompanyId = partner?.user?.companyId || null;
            return {
                partnerId,
                companyId: assignedCompanyId,
                name: companyNames.get(assignedCompanyId)
                    || (PARTNER_LOGIN_SLOTS.includes(partnerId) ? SELLER_COMPANY_NAMES[partnerId] : partner?.name)
                    || SELLER_COMPANY_NAMES[partnerId]
                    || partnerId,
                blocked: Boolean(lock.blocked),
                passkeyBound: Boolean(lock.webauthnCredentialId),
                registeredDeviceId: lock.registeredDeviceId || null,
                deviceName: lock.deviceName || null,
                boundIp: session?.ip || lock.boundIp || null,
                boundAt: lock.boundAt || null,
                lastSeenAt: lock.lastSeenAt || session?.loginAt || null,
                loginAt: session?.loginAt || null,
                online: Boolean(session && isValidSellerSession(session, session.token, true)),
                sessionVersion: lock.sessionVersion || 1,
            };
        }));
        res.json({ success: true, devices });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.post('/api/admin/seller-devices/:partnerId/logout', requireMasterAdmin, async (req, res) => {
    const { partnerId } = req.params;
    if (!(await resolveSellerPartner(partnerId))) return res.status(404).json({ success: false, message: 'Unknown seller partner.' });
    delete sellerSessions[partnerId];
    savePersisted(SESSIONS_FILE, sellerSessions);
    await db.deleteSellerSession(partnerId);
    const partner = await resolveSellerPartner(partnerId);
    await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: partner?.user?.companyId || 'littlane', category: 'SELLER_SESSION_REVOKED', fieldChanged: 'session', reason: `Revoked seller session for ${partner?.name || partnerId}.` });
    res.json({ success: true, message: `${partner?.name || partnerId} has been logged out.` });
});

app.post('/api/admin/seller-devices/:partnerId/block', requireMasterAdmin, async (req, res) => {
    const { partnerId } = req.params;
    const blocked = req.body?.blocked;
    if (typeof blocked !== 'boolean') return res.status(400).json({ success: false, message: 'Provide blocked as true or false.' });

    if (PARTNER_NAMES[partnerId]) {
        await db.savePartnerLock(partnerId, { blocked, blockedAt: blocked ? new Date().toISOString() : null });
    } else if (PARTNER_LOGIN_SLOTS.includes(partnerId)) {
        const user = await db.getUserBySellerSlot(partnerId);
        if (!user || user.role !== 'seller') return res.status(404).json({ success: false, message: 'No seller account is assigned to this login slot.' });
        await db.updateUser(user.userId, { blocked, active: !blocked });
    } else {
        return res.status(404).json({ success: false, message: 'Unknown seller partner.' });
    }

    if (blocked) {
        delete sellerSessions[partnerId];
        savePersisted(SESSIONS_FILE, sellerSessions);
        await db.deleteSellerSession(partnerId);
        const account = PARTNER_LOGIN_SLOTS.includes(partnerId) ? await db.getUserBySellerSlot(partnerId) : null;
        if (account?.userId !== undefined) await db.deleteSellerSession(account.userId);
    }
    const blockedAccount = PARTNER_LOGIN_SLOTS.includes(partnerId) ? await db.getUserBySellerSlot(partnerId) : null;
    await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: blockedAccount?.companyId || PARTNER_NAMES[partnerId] && partnerId || 'littlane', category: blocked ? 'SELLER_ACCESS_SUSPENDED' : 'SELLER_ACCESS_RESTORED', fieldChanged: 'blocked', newValue: blocked, reason: `Seller access ${blocked ? 'suspended' : 'restored'} for ${partnerId}.` });
    res.json({ success: true, blocked, message: blocked ? 'Seller permanently blocked until a Master Admin unblocks them.' : 'Seller unblocked. They can sign in again.' });
});

app.post('/api/admin/seller-devices/:partnerId/reset-passkey', requireMasterAdmin, async (req, res) => {
    const { partnerId } = req.params;
    const partner = await resolveSellerPartner(partnerId);
    if (!partner) return res.status(404).json({ success: false, message: 'Unknown seller partner.' });
    delete sellerSessions[partnerId];
    delete webauthnAuthenticators[partnerId];
    await Promise.all([db.deleteSellerSession(partnerId), db.resetPartnerLock(partnerId)]);
    res.json({ success: true, message: `${partner.name}'s passkey was reset. The next login can bind a new device.` });
});

// GET /api/admin/seller-summary — admin can see all sellers' totals
app.get('/api/admin/seller-summary', requireMasterAdmin, async (req, res) => {
    try {
        const [rawSales, users, companies] = await Promise.all([
            db.getAll(),
            db.getAllUsers(),
            db.getAllCompanies()
        ]);
        const allSales = req.query.dashboardView === 'true'
            ? await filterDashboardVisibleSales(rawSales.filter(s => !isShadowSale(s)))
            : rawSales;
        const all = allSales.filter(s => !isShadowSale(s));
        const paid = all.filter(isVerifiedSalesRecord);
        const slotCompanyMap = new Map(
            users
                .filter(user => user.role === 'seller' && user.sellerSlot && user.companyId)
                .map(user => [user.sellerSlot, user.companyId])
        );
        const userCompanyMap = new Map(
            users
                .filter(user => ['seller', 'pr'].includes(user.role) && user.userId && user.companyId)
                .map(user => [normalizeSellerId(user.userId), user.companyId])
        );
        const sellerSlotByCompany = new Map(
            users
                .filter(user => user.role === 'seller' && user.sellerSlot && user.companyId)
                .map(user => [user.companyId, user.sellerSlot])
        );
        const summary = {};
        const companySummary = new Map();
        const knownEventCompanies = [
            { companyId: 'littlane', name: 'Littlane Ent' },
            { companyId: 'nitro', name: 'DGR' },
            { companyId: '7th-heaven', name: '7th Heaven' },
        ];
        const companyNames = new Map(knownEventCompanies.map(company => [company.companyId, company.name]));
        companies.forEach(company => {
            if (company.companyId && !companyNames.has(company.companyId)) companyNames.set(company.companyId, company.name || company.companyId);
        });
        users.filter(user => ['seller', 'pr'].includes(user.role) && user.companyId).forEach(user => {
            if (!companyNames.has(user.companyId)) companyNames.set(user.companyId, SELLER_COMPANY_NAMES[user.companyId] || user.companyId);
        });
        rawSales.forEach(sale => {
            const companyId = String(sale.companyId || '');
            if (companyId && !companyNames.has(companyId)) companyNames.set(companyId, SELLER_COMPANY_NAMES[companyId] || companyId);
        });
        for (const [companyId, name] of companyNames) {
            if (!knownEventCompanies.some(company => company.companyId === companyId)) knownEventCompanies.push({ companyId, name });
        }
        const knownEventCompanyIds = new Set(knownEventCompanies.map(company => company.companyId));
        const knownEventCompanyByNormalizedId = new Map(
            knownEventCompanies.map(company => [normalizeSellerId(company.companyId), company.companyId])
        );
        for (const { companyId, name } of knownEventCompanies) {
            if (!companySummary.has(companyId)) {
                companySummary.set(companyId, {
                    companyId,
                    name: displayCompanyName(companyId, name),
                    ticketCount: 0,
                    grossSales: 0,
                    commissionEarned: 0,
                    netAfterCommission: 0,
                    lastSale: null,
                    categories: {},
                });
            }
        }
        // initialise all sellers
        for (const sid of Object.keys(SELLER_ACCOUNTS)) {
            summary[sid] = { sellerId: sid, ticketCount: 0, revenue: 0, lastSale: null, sales: [] };
        }
        summary['Admin'] = { sellerId: 'Admin', ticketCount: 0, revenue: 0, lastSale: null, sales: [] };
        for (const s of paid) {
            const who = s.generatedBy || s.prUserId || 'Admin';
            if (!summary[who]) {
                summary[who] = { sellerId: who, ticketCount: 0, revenue: 0, lastSale: null, sales: [] };
            }
            summary[who].ticketCount += (s.quantity || 1);
            if (!String(s.gender || '').toLowerCase().includes('exclusive')) {
                summary[who].revenue += (s.amount || 0);
            }
            if (!summary[who].lastSale || s.generatedAt > summary[who].lastSale) {
                summary[who].lastSale = s.generatedAt;
            }
            summary[who].sales.push({
                ticketId: s.ticketId,
                orderId: s.orderId,
                name: s.name,
                email: s.email,
                ticketType: ticketTypeForSale(s),
                quantity: s.quantity || 1,
                amount: s.amount || 0,
                generatedAt: s.generatedAt,
                status: s.status,
            });

            const rawCompanyId = String(s.companyId || '');
            const sourceId = s.sellerId || s.generatedBy || s.prUserId || '';
            const normalizedSourceId = normalizeSellerId(sourceId);
            const sellerCompanyId = userCompanyMap.get(normalizedSourceId) || slotCompanyMap.get(normalizedSourceId);
            const companyId = knownEventCompanyByNormalizedId.get(normalizedSourceId)
                || knownEventCompanyByNormalizedId.get(normalizeSellerId(rawCompanyId))
                || knownEventCompanyByNormalizedId.get(normalizeSellerId(sellerCompanyId))
                || sellerSlotByCompany.get(sellerCompanyId || rawCompanyId)
                || (knownEventCompanyIds.has(rawCompanyId) ? rawCompanyId : '');
            if (!companyId) continue;
            if (!companySummary.has(companyId)) {
                const configuredCompany = knownEventCompanies.find(company => company.companyId === companyId);
                const sellerSlotUser = users.find(user => user.role === 'seller' && user.sellerSlot === companyId);
                companySummary.set(companyId, {
                    companyId,
                    name: configuredCompany?.name || sellerSlotUser?.displayName || PARTNER_NAMES[companyId] || SELLER_COMPANY_NAMES[companyId] || companyId,
                    ticketCount: 0,
                    grossSales: 0,
                    commissionEarned: 0,
                    netAfterCommission: 0,
                    lastSale: null,
                    categories: {},
                });
            }
            const companyRecord = companySummary.get(companyId);
            const quantity = Number(s.quantity) || 1;
            const grossAmount = saleGrossAmount(s);
            const commissionAmount = Number(s.commissionAmount);
            const netAmount = Number(s.rateAfterCommission);
            const percentageCommission = Number(s.commissionPercentage) > 0
                ? grossAmount * Number(s.commissionPercentage) / 100
                : 0;
            const hasStoredCommission = s.commissionAmount !== undefined && s.commissionAmount !== null;
            const commission = hasStoredCommission
                ? (Number.isFinite(commissionAmount) ? commissionAmount : 0)
                : Number.isFinite(netAmount) && grossAmount >= netAmount
                    ? grossAmount - netAmount
                    : percentageCommission;
            const net = s.rateAfterCommission !== undefined && s.rateAfterCommission !== null && Number.isFinite(netAmount)
                ? netAmount
                : grossAmount - commission;
            const category = String(s.ticketType || s.gender || 'Other').trim() || 'Other';
            companyRecord.ticketCount += quantity;
            companyRecord.grossSales += grossAmount;
            companyRecord.commissionEarned += commission;
            companyRecord.netAfterCommission += net;
            if (!companyRecord.lastSale || (s.generatedAt && s.generatedAt > companyRecord.lastSale)) {
                companyRecord.lastSale = s.generatedAt;
            }
            if (!companyRecord.categories[category]) {
                companyRecord.categories[category] = { ticketCount: 0, grossSales: 0, commissionEarned: 0, netAfterCommission: 0 };
            }
            companyRecord.categories[category].ticketCount += quantity;
            companyRecord.categories[category].grossSales += grossAmount;
            companyRecord.categories[category].commissionEarned += commission;
            companyRecord.categories[category].netAfterCommission += net;
        }
        res.json({
            success: true,
            summary: Object.values(summary),
            companySummary: Array.from(companySummary.values()).sort((a, b) => b.commissionEarned - a.commissionEarned || b.ticketCount - a.ticketCount)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

app.get('/api/admin/dashboard-sale-visibility', requireMasterAdmin, async (req, res) => {
    try {
        const sales = (await db.getAll()).filter(sale => !isShadowSale(sale));
        const { items } = await getDashboardSaleVisibility(sales);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, sales: items });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to load dashboard ticket visibility.' });
    }
});

app.patch('/api/admin/dashboard-sale-visibility/bulk', requireMasterAdmin, async (req, res) => {
    const included = req.body?.included;
    const saleKeys = Array.isArray(req.body?.saleKeys)
        ? [...new Set(req.body.saleKeys.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim()))]
        : [];
    if (typeof included !== 'boolean') return res.status(400).json({ success: false, message: 'Provide included as true or false.' });
    if (saleKeys.length === 0 || saleKeys.length > 500) {
        return res.status(400).json({ success: false, message: 'Select between 1 and 500 ticket sales.' });
    }
    try {
        const sales = (await db.getAll()).filter(sale => !isShadowSale(sale));
        const { items } = await getDashboardSaleVisibility(sales);
        const itemsByKey = new Map(items.map(item => [item.saleKey, item]));
        const selected = saleKeys.map(key => itemsByKey.get(key));
        if (selected.some(item => !item)) return res.status(404).json({ success: false, message: 'One or more selected ticket sales could not be found. Refresh and try again.' });
        const updated = await Promise.all(selected.map(sale => db.setDashboardSaleVisibility(sale.saleKey, {
            orderId: sale.orderId,
            ticketId: sale.ticketId,
            sellerId: sale.sellerId,
            companyId: sale.companyId,
            included,
            updatedAt: new Date().toISOString(),
            updatedBy: req.adminSession?.userId || req.adminSession?.displayName || 'Master Admin',
        })));
        const responseByKey = new Map(updated.map(item => [item.saleKey, item]));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, sales: selected.map(sale => ({ ...sale, included: responseByKey.get(sale.saleKey)?.included ?? included })) });
    } catch (err) {
        console.error('[dashboard sale visibility bulk update]', err.message);
        res.status(500).json({ success: false, message: 'Unable to update selected ticket sales.' });
    }
});

app.patch('/api/admin/dashboard-sale-visibility/:saleKey', requireMasterAdmin, async (req, res) => {
    const included = req.body?.included;
    if (typeof included !== 'boolean') return res.status(400).json({ success: false, message: 'Provide included as true or false.' });
    try {
        const sales = (await db.getAll()).filter(sale => !isShadowSale(sale));
        const { items } = await getDashboardSaleVisibility(sales);
        const sale = items.find(item => item.saleKey === req.params.saleKey);
        if (!sale) return res.status(404).json({ success: false, message: 'Ticket sale not found.' });
        const updated = await db.setDashboardSaleVisibility(sale.saleKey, {
            orderId: sale.orderId,
            ticketId: sale.ticketId,
            sellerId: sale.sellerId,
            companyId: sale.companyId,
            included,
            updatedAt: new Date().toISOString(),
            updatedBy: req.adminSession?.userId || req.adminSession?.displayName || 'Master Admin',
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, sale: { ...sale, included: updated.included } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to update ticket visibility.' });
    }
});


// ==================== PR PARTNER PORTAL ROUTES ====================

// PR user credentials (server-side auth)
const PR_USERS = [
    { id: 'pr1', username: 'partner1', password: process.env.PR1_PASS || '', displayName: 'Partner One' },
    { id: 'pr2', username: 'partner2', password: process.env.PR2_PASS || '', displayName: 'Partner Two' },
    { id: 'pr5', username: 'partner5', password: process.env.PR5_PASS || '', displayName: 'Partner Five' },
];

// GET /api/pr/sales?prUserId=xxx — fetch only this partner's tickets
app.get('/api/pr/sales', requirePR, async (req, res) => {
    try {
        const all = await db.getAll();
        const sales = all.filter(s => s.prUserId === req.prSession.userId);
        res.json({ success: true, sales });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/pr/create-order — PR partner initiates a Razorpay payment for a customer
app.post('/api/pr/create-order', requirePR, checkoutRateLimit, async (req, res) => {
    if (!TEST_MODE && (!PAYMENT_CREDENTIALS_CONFIGURED || !razorpay)) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    const { name, email, phone, gender, quantity, eventId, eventSlug, event, ticketCategoryId, ticketType } = req.body || {};
    const requestedEvent = eventId || eventSlug || event;
    if (!name || !email || !phone || !requestedEvent || !(ticketCategoryId || ticketType || gender))
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ success: false, message: 'A valid Idempotency-Key header is required.' });

    const requestHash = crypto.createHmac('sha256', RZP_KEY_SECRET || process.env.CHECKOUT_IDEMPOTENCY_SECRET || 'stageway-test-idempotency-key')
        .update(JSON.stringify({ partner: req.prSession.userId, name: String(name).trim(), email: String(email).trim().toLowerCase(), phone: String(phone).trim(), event: String(requestedEvent), category: String(ticketCategoryId || ticketType || gender), quantity: String(quantity ?? 1) }))
        .digest('hex');
    const idempotency = await db.claimCheckoutRequest(idempotencyKey, requestHash);
    if (!idempotency.claimed) {
        const previous = idempotency.request;
        if (previous.requestHash !== requestHash) return res.status(409).json({ success: false, message: 'This checkout key was already used for different checkout details.' });
        if (previous.status === 'processing') return res.status(202).json({ success: false, pending: true, message: 'This checkout request is already being prepared. Retry shortly using the same key.' });
        if (previous.status !== 'completed') return res.status(409).json({ success: false, message: 'This checkout attempt could not be completed. Start a new attempt.' });
        const existing = await db.getByOrderId(previous.orderId);
        if (!existing || existing.prUserId !== req.prSession.userId || normalizePaymentStatus(existing) !== 'pending') return res.status(409).json({ success: false, finalized: true, message: 'This checkout has already been finalized or expired.' });
        return res.json({ success: true, orderId: existing.orderId, amount: existing.amount, amountMinor: expectedSaleAmountMinor(existing), currency: existing.currency, reservationExpiresAt: existing.reservationExpiresAt, keyId: RZP_KEY_ID || 'test_key', idempotentReplay: true });
    }

    await expireEventReservations();

    const computed = await resolveTicketAmount(requestedEvent, ticketCategoryId || ticketType || gender, quantity);
    if (!computed) {
        await db.failCheckoutRequest(idempotencyKey);
        return res.status(400).json({ success: false, message: 'Event or ticket category is unavailable.' });
    }
    const pricingEvent = pickCanonicalEvent(await db.getAllEvents(), requestedEvent);
    if (!pricingEvent || pricingEvent.companyId !== req.prSession.companyId) {
        await db.failCheckoutRequest(idempotencyKey);
        return res.status(403).json({ success: false, message: 'PR partner is not assigned to this event.' });
    }
    const { amount, qty, admissionCount, amountMinor, inventoryLimited, event: eventName, eventId: canonicalEventId, ticketCategoryId: canonicalCategoryId, ticketType: categoryName, currency } = computed;

    try {
        const reservationExpiresAt = new Date(Date.now() + CHECKOUT_RESERVATION_MS);
        let orderId;
        if (TEST_MODE) {
            orderId = `order_pr_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            const order = await razorpay.orders.create({
                amount: amountMinor,
                currency,
                receipt: `pr_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`,
            });
            if (order.amount !== amountMinor || String(order.currency).toUpperCase() !== String(currency).toUpperCase()) {
                await db.failCheckoutRequest(idempotencyKey);
                return res.status(502).json({ success: false, message: 'Payment order could not be reconciled. Please retry.' });
            }
            orderId = order.id;
        }

        if (inventoryLimited) {
            const reservation = await db.reserveEventInventory({
                eventId: canonicalEventId, reservationId: orderId, categoryId: canonicalCategoryId,
                admissionCount, expiresAt: reservationExpiresAt
            });
            if (!reservation.ok || !reservation.reserved) {
                await db.failCheckoutRequest(idempotencyKey);
                return res.status(409).json({ success: false, message: 'The selected ticket inventory is no longer available. Refresh and try again.' });
            }
        }

        const ticketId = generateTicketId();
        await db.createSaleRecord({
            orderId,
            event: eventName,
            eventId: canonicalEventId,
            ticketCategoryId: canonicalCategoryId,
            name, email, phone, gender: gender || categoryName,
            ticketType: categoryName,
            quantity: qty,
            admissionCount,
            amount,
            amountMinor,
            currency,
            status: 'created',
            paymentStatus: 'pending',
            fulfillmentStatus: 'pending',
            reservationExpiresAt,
            reservationStatus: inventoryLimited ? 'active' : 'not_required',
            inventoryReserved: inventoryLimited,
            inventoryLimited,
            checkoutRequestId: idempotencyKey,
            checkoutRequestHash: requestHash,
            paymentId: null,
            ticketId,
            emailStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            prUserId: req.prSession.userId,
            companyId: req.prSession.companyId,
            paymentMethod: 'razorpay',
        });

        await db.completeCheckoutRequest(idempotencyKey, orderId);

        res.json({ success: true, orderId, amount, amountMinor, currency, reservationExpiresAt, keyId: RZP_KEY_ID || 'test_key' });
    } catch (err) {
        await db.failCheckoutRequest(idempotencyKey).catch(() => {});
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/pr/cash-request — PR partner submits a cash sale for admin approval
app.post('/api/pr/cash-request', requirePR, async (req, res) => {
    const { name, email, phone, gender, quantity, eventId, eventSlug, event, ticketCategoryId, ticketType } = req.body || {};
    const requestedEvent = eventId || eventSlug || event;
    if (!name || !email || !phone || !requestedEvent || !(ticketCategoryId || ticketType || gender))
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    const computed = await resolveTicketAmount(requestedEvent, ticketCategoryId || ticketType || gender, quantity);
    if (!computed) return res.status(400).json({ success: false, message: 'Event or ticket category is unavailable.' });
    const pricingEvent = pickCanonicalEvent(await db.getAllEvents(), requestedEvent);
    if (!pricingEvent || pricingEvent.companyId !== req.prSession.companyId) return res.status(403).json({ success: false, message: 'PR partner is not assigned to this event.' });
    const { amount, qty, admissionCount, inventoryLimited, event: eventName, eventId: canonicalEventId, ticketCategoryId: canonicalCategoryId, ticketType: categoryName, currency } = computed;

    try {
        const orderId = `order_cash_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();

        await db.createSaleRecord({
            orderId,
            event: eventName,
            eventId: canonicalEventId,
            ticketCategoryId: canonicalCategoryId,
            name, email, phone, gender: gender || categoryName,
            ticketType: categoryName,
            quantity: qty,
            admissionCount,
            inventoryLimited,
            inventoryReserved: false,
            reservationStatus: 'not_required',
            amount,
            currency,
            status: 'pr_cash_pending',
            paymentStatus: 'pending',
            fulfillmentStatus: 'pending',
            paymentId: 'cash_pending',
            ticketId,
            emailStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            prUserId: req.prSession.userId,
            prName: req.prSession.displayName,
            companyId: req.prSession.companyId,
            source: 'offline_pr',
            paymentMethod: 'cash',
        });

        res.json({ success: true, orderId, message: 'Cash sale submitted for approval.' });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// Full-refund requests are only approved/rejected here. This does not call the gateway,
// invalidate a ticket, or restore inventory; those are separate audited operations.
app.get('/api/admin/refund-requests', requireApprovalAdmin, async (req, res) => {
    try {
        const requests = (await db.getAll())
            .filter(sale => sale.refundStatus === 'requested' && approvalAdminOwnsSale(req, sale))
            .map(sale => ({
                orderId: sale.orderId, refundRequestId: sale.refundRequestId, event: sale.event,
                eventId: sale.eventId, ticketId: sale.ticketId, name: sale.name, email: sale.email,
                amount: sale.amount, currency: sale.currency, reason: sale.refundReason,
                requestedAt: sale.refundRequestedAt
            }));
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, requests });
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

app.post('/api/admin/refund-requests/:orderId/decision', requireApprovalAdmin, async (req, res) => {
    const decision = String(req.body?.decision || '').toLowerCase();
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ success: false, message: 'Decision must be approved or rejected.' });
    const existing = await db.getByOrderId(req.params.orderId);
    if (!existing || existing.refundStatus !== 'requested') return res.status(404).json({ success: false, message: 'Pending refund request not found.' });
    if (!approvalAdminOwnsSale(req, existing)) return res.status(403).json({ success: false, message: 'This refund request belongs to another company.' });
    try {
        const updated = await db.atomicDecideRefund(req.params.orderId, {
            decision, actor: req.adminSession?.userId || 'Master Admin', reason, now: new Date().toISOString()
        });
        if (!updated) return res.status(409).json({ success: false, message: 'Refund request has already been decided.' });
        await db.createAuditLog({ adminUser: req.adminSession?.userId || 'Master Admin', companyId: existing.companyId || 'littlane', eventId: existing.eventId || null, category: 'INTERNAL_REFUND_DECISION', fieldChanged: 'refundStatus', previousValue: 'requested', newValue: decision, reason: reason || 'Internal refund request review.' });
        return res.json({ success: true, refundStatus: updated.refundStatus, liveRefundTriggered: false, ticketInvalidated: false, inventoryRestored: false });
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
});

// GET /api/admin/pr-approvals — admin sees all pending cash and seller-ticket approvals
app.get('/api/admin/pr-approvals', requireApprovalAdmin, async (req, res) => {
    try {
        const all = await db.getAll();
        const pending = all.filter(s => approvalAdminOwnsSale(req, s) && !isDirectDeliveryCompany(s.companyId || sellerCompanyIdFromValue(s.sellerId || s.generatedBy || s.prUserId)) && (
            s.status === 'pr_cash_pending' ||
            s.approvalStatus === 'PENDING' ||
            s.status === 'pending_approval' ||
            s.deliveryStatus === 'PENDING_APPROVAL'
        ));
        res.json({ success: true, pending });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/admin/pr-approve — admin approves a cash sale → ticket generated and emailed
app.post('/api/admin/pr-approve', requireApprovalAdmin, async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });

    const existing = await db.getByOrderId(orderId);
    if (!existing) return res.status(404).json({ success: false, message: 'Sale not found' });
    if (!approvalAdminOwnsSale(req, existing)) return res.status(403).json({ success: false, message: 'This sale belongs to another company.' });
    const approvedAt = new Date().toISOString();
    let reservation;
    try {
        reservation = await reserveOfflineSaleInventory(existing);
    } catch (error) {
        return res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
    if (!reservation.ok || (existing.inventoryLimited && !reservation.reserved)) {
        await db.updateSaleRecord(existing.orderId, { manualReview: true, manualReviewReason: 'offline_inventory_unavailable', manualReviewAt: new Date().toISOString() });
        return res.status(409).json({ success: false, manualReview: true, message: 'Inventory is unavailable for this offline order. It remains pending for manual review.' });
    }
    const approvedBy = req.adminSession?.userId || 'Master Admin';
    const sale = await db.atomicApproveCashSale(orderId, approvedBy, approvedAt, reservation);
    if (!sale) {
        if (reservation.reserved && !reservation.reused) await db.releaseEventInventoryReservation({ eventId: existing.eventId, reservationId: orderId });
        return res.status(409).json({ success: false, message: 'Sale is no longer pending approval.' });
    }
    if (!await settleOfflineSaleInventory(sale, reservation)) {
        return res.status(500).json({ success: false, message: 'Cash was verified, but inventory finalization needs manual review before ticket delivery.' });
    }

    await db.createAuditLog({
        adminUser: approvedBy,
        companyId: sale.companyId || 'littlane',
        eventId: sale.eventId || null,
        category: 'OFFLINE_CASH_VERIFIED',
        fieldChanged: 'paymentStatus',
        previousValue: 'pending',
        newValue: 'paid',
        reason: `Admin approval verified cash collection for order ${orderId}`,
        timestamp: approvedAt
    }).catch(error => console.error('[cash approval audit]', error.message));

    // Generate ticket + send email (same flow as normal payment)
    try {
        const tType = ticketTypeForSale(sale);
        const pdfPath = await buildTicketPdf({
            ticketId: sale.ticketId,
            name: sale.name,
            email: sale.email,
            gender: tType,
            quantity: sale.quantity || 1,
            amount: sale.amount || 0,
            createdAt: sale.createdAt || new Date().toISOString(),
        });

        await db.updateSaleRecord(orderId, { status: 'ticket_generated', generatedAt: new Date().toISOString() });

        const downloadUrl = `${BASE_URL}/api/ticket/${sale.ticketId}/download`;
        const result = process.env.NODE_ENV === 'test' ? { success: false, error: 'Notification delivery is disabled in tests.' } : await sendTicketEmail({ to: sale.email, name: sale.name, ticketId: sale.ticketId, pdfPath, downloadUrl });

        await db.updateSaleRecord(orderId, {
            emailStatus: result.success ? 'sent' : 'failed',
            emailError: result.success ? null : result.error,
            status: result.success ? 'emailed' : 'email_failed',
        });

        if (process.env.NODE_ENV !== 'test') await sendAndRecordTicketWhatsApp({
            orderId, phone: sale.phone, name: sale.name, ticketId: sale.ticketId,
            event: sale.event || EVENT.name, ticketType: tType, pdfPath
        });

        res.json({ success: true, message: result.success ? 'Approved and ticket emailed!' : 'Approved but email failed.' });
    } catch (err) {
        await db.updateSaleRecord(orderId, { status: 'ticket_generation_failed', errorLog: [err.message] });
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// POST /api/admin/pr-reject — admin rejects a cash sale
app.post('/api/admin/pr-reject', requireApprovalAdmin, async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });
    try {
        const existing = await db.getByOrderId(orderId);
        if (!existing) return res.status(404).json({ success: false, message: 'Sale not found.' });
        if (!approvalAdminOwnsSale(req, existing)) return res.status(403).json({ success: false, message: 'This sale belongs to another company.' });
        const rejected = await db.atomicRejectCashSale(orderId, req.adminSession?.userId || 'Master Admin', new Date().toISOString());
        if (!rejected) return res.status(409).json({ success: false, message: 'Sale is no longer pending approval.' });
        res.json({ success: true, message: 'Sale rejected.' });
    } catch (err) {
        res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
});

// Central fallback for parser and uncaught route errors. Never send stack
// traces, internal configuration, or provider payloads to production clients.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err?.status === 413 ? 413 : err?.status === 400 ? 400 : 500;
    const safePath = String(req.path || '').replace(/(\/api\/(?:ticket|(?:admin|pr|seller|shadow(?:-private)?)\/tickets)\/)[^/]+/gi, '$1[redacted]');
    console.error('[Request error]', { path: safePath, status, name: err?.name || 'Error' });
    const message = status === 413 ? 'Request body is too large.' : status === 400 ? 'Invalid request.' : 'Request failed.';
    return res.status(status).json({ success: false, message });
});

// All other routes — serve the React build index.html
app.get('*splat', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/ticket-files')) {
        return res.status(404).json({ success: false, message: 'Not Found' });
    }
    if (fs2.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml);
    } else {
        res.status(503).send('Application build in progress. Please refresh in a few seconds.');
    }
});


// Vercel imports this Express application from api/index.js. Keep listen() for
// direct local development only; calling it during an import prevents Vercel
// from managing the serverless request lifecycle.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\n🎟  ${EVENT.name} ticketing server running on port ${PORT}`);
        console.log(`   Mode: ${TEST_MODE ? 'TEST MODE (no real payments)' : 'LIVE (Razorpay)'}`);
        console.log(`   Admin dashboard: ${BASE_URL}/dashboard  (key required)\n`);
    });
}

module.exports = app;

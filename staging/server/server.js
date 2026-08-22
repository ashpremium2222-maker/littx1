require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');
const { atomicClaimOrder } = db;
const { EVENT_NAME, EVENT_DETAILS, generateTicketId, buildTicketPdf, buildQrDataUrl, buildQrBuffer, TICKETS_DIR } = require('./ticket');
const { sendTicketEmail } = require('./mailer');

const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const app = express();
app.use(cors());
app.use(express.json());

const RP_NAME = 'LITTX Seller Portal';
function getRPID(req) {
    const host = (req.headers.host || '').split(':')[0];
    return host || 'localhost';
}
function getOrigin(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host || 'localhost:3000';
    return `${protocol}://${host}`;
}

// ==================== EVENT & PRICING ====================
const EVENT = { name: EVENT_NAME };
const PRICING = {
    female: 599,
    male: 699
};

// ==================== ACTIVE EVENTS (Master Admin controlled) ====================
// Master admin adds/removes events sellers can punch tickets for.
// Persisted in-memory; on restart resets to defaults (extend to DB if needed).
let ACTIVE_EVENTS = [
    { id: 1, name: EVENT_NAME, date: '', active: true }
];

// ==================== RAZORPAY SETUP ====================
// Razorpay integration removed; manual cash payments only.
// No external payment gateway is used.

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-admin-key';
const TEST_MODE = false; // Razorpay removed — always manual/cash payments
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// ==================== LITTX SELLER ACCOUNTS (max 3 devices) ====================
// 3 hardcoded seller IDs + passwords. Each seller can only have 1 active session at a time.
// Adjust passwords here or move to env vars for production.
const SELLER_ACCOUNTS = {
    'SELLER-A': process.env.SELLER_A_PASS || 'nova-gate-8x4',
    'SELLER-B': process.env.SELLER_B_PASS || 'pulse-core-3m9',
    'SELLER-C': process.env.SELLER_C_PASS || 'nexus-wave-7k2',
};

// In-memory session store replaced with MongoDB for Vercel Serverless persistence

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper to extract the real client IP (respects reverse proxy / Railway / Vercel headers)
function getIp(req) {
    return (
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        'unknown'
    );
}

// ==================== SIMPLE IN-MEMORY RATE LIMITER ====================
// 10 login attempts per IP per 15-minute window.
// No dependency on express-rate-limit — uses plain Map.
const _loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function checkLoginRateLimit(ip) {
    const now = Date.now();
    let entry = _loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
        _loginAttempts.set(ip, entry);
        return { allowed: true };
    }
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
        const resetInSec = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, resetInSec };
    }
    entry.count++;
    return { allowed: true };
}

// Returns sellerId if token is valid AND IP matches, null otherwise
// Pass requestIp to enforce IP lock; omit to skip IP check (e.g. logout)
async function authenticateSeller(token, requestIp) {
    if (!token) return null;
    const sessions = await db.getAllSellerSessions();
    for (const session of sessions) {
        if (session && session.token === token) {
            // IP lock: if requestIp provided, it must match the login IP
            if (requestIp && session.ip && session.ip !== 'unknown') {
                if (session.ip !== requestIp) {
                    return '__IP_MISMATCH__';
                }
            }
            return session.sellerId;
        }
    }
    return null;
}

async function requireSeller(req, res, next) {
    const token = req.headers['x-seller-token'] || req.query.sellerToken;
    const requestIp = getIp(req);
    const sellerId = await authenticateSeller(token, requestIp);
    if (!sellerId) {
        return res.status(401).json({ success: false, message: 'Seller not authenticated. Please log in.' });
    }
    if (sellerId === '__IP_MISMATCH__') {
        return res.status(403).json({
            success: false,
            ipLocked: true,
            message: 'Access denied. This session is locked to another device. Contact admin to unlock.'
        });
    }
    req.sellerId = sellerId;
    next();
}

// ==================== REQUIRE AUTH MIDDLEWARE (unified session, all roles) ====================
// Validates x-auth-token header against UserSession store.
async function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'] || req.query.authToken;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    try {
        const session = await db.getUserSessionByToken(token);
        if (!session) {
            return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' });
        }
        req.authUser = { userId: session.userId, role: session.role, companyId: session.companyId, displayName: session.displayName };
        next();
    } catch (err) {
        console.error('[requireAuth]', err);
        res.status(500).json({ success: false, message: 'Auth check failed.' });
    }
}

// Serve generated ticket PDFs at /ticket-files
app.use('/ticket-files', express.static(TICKETS_DIR));

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

// Admin / Company / Master Admin — serve the React build
app.get('/admin', (req, res) => res.sendFile(distIndexHtml));
app.get('/admin/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashboard', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashboard/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashhboard', (req, res) => res.sendFile(distIndexHtml));
app.get('/dashhboard/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/company', (req, res) => res.sendFile(distIndexHtml));
app.get('/company/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/master-admin', (req, res) => res.sendFile(distIndexHtml));
app.get('/master-admin/:splat', (req, res) => res.sendFile(distIndexHtml));
app.get('/login', (req, res) => res.sendFile(distIndexHtml));
app.get('/admin-login', (req, res) => res.sendFile(distIndexHtml));

// Customer portal
app.get('/customer', (req, res) => res.sendFile(distIndexHtml));
app.get('/customer/login', (req, res) => res.sendFile(distIndexHtml));
app.get('/customer/register', (req, res) => res.sendFile(distIndexHtml));
app.get('/customer/dashboard', (req, res) => res.sendFile(distIndexHtml));

// ---- PUBLIC HOMEPAGE: serve the littx static marketing website ----
// Check multiple candidate locations for the littx public folder
const _littxCandidates = [
    path.join(_distDir, 'littx', 'index.html'),                                          // after vite build copies public/
    path.join(__dirname, '../combined-app/public/littx/index.html'),                    // dev mode
    path.join(__dirname, '../../combined-app/public/littx/index.html'),
];
const _littxIndexHtml = _littxCandidates.find(p => fs2.existsSync(p));
console.log(`Littx homepage: ${_littxIndexHtml || 'NOT FOUND'}`);

// Serve static assets inside the littx folder (logo.png etc)
if (_littxIndexHtml) {
    const _littxDir = path.dirname(_littxIndexHtml);
    app.use('/littx', express.static(_littxDir));
    // Root homepage — serve the littx website
    app.get('/', (req, res) => res.sendFile(_littxIndexHtml));
}

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
function computeAmount(gender, quantity) {
    const rate = PRICING[gender];
    if (!rate) return null;
    const qty = Math.max(1, Math.min(20, parseInt(quantity, 10) || 1));
    return { amount: rate * qty, qty };
}

async function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key || req.body?.key;
    const managerToken = process.env.MANAGER_TOKEN || 'dash-2026';
    if (key === ADMIN_KEY || key === managerToken) {
        req.isManager = key === managerToken; // Flag if it's the manager
        return next();
    }
    
    // Check unified auth token
    const token = req.headers['x-auth-token'] || req.query.authToken || key;
    if (token) {
        try {
            const session = await db.getUserSessionByToken(token);
            if (session && (session.role === 'master_admin' || session.role === 'company_admin' || session.role === 'seller')) {
                req.isManager = session.role === 'company_admin';
                return next();
            }
        } catch(e) {}
    }
    
    res.status(401).json({ success: false, message: 'Unauthorized. Invalid admin key or session.' });
}

// ==================== 1. CREATE ORDER (start of checkout) ====================
app.post('/api/create-order', async (req, res) => {
    const { name, email, phone, gender, quantity } = req.body || {};

    if (!name || !email || !phone || !gender) {
        return res.status(400).json({ success: false, message: 'Name, email, phone and gender are all required.' });
    }
    const computed = computeAmount(gender, quantity);
    if (!computed) {
        return res.status(400).json({ success: false, message: 'Invalid ticket type. Choose Male or Female pass.' });
    }
    const { amount, qty } = computed;

    try {
        let currency = 'INR';

        // Generate a manual order ID for cash payment tracking
        const orderId = `order_manual_${crypto.randomBytes(8).toString('hex')}`;

        await db.createSaleRecord({
            orderId,
            event: EVENT.name,
            name, email, phone, gender,
            quantity: qty,
            amount,
            currency,
            status: 'created',
            paymentId: null,
            ticketId: null,
            emailStatus: null,
            emailError: null,
            errorLog: [],
            createdAt: new Date().toISOString()
        });

        console.log(`[Order Created] ${orderId} | ${name} <${email}> | ${gender} x${qty} = ₹${amount}`);

        res.json({
            success: true,
            orderId,
            amount,
            currency,
            event: EVENT.name
        });
    } catch (err) {
        const details = err.error?.description || err.message || JSON.stringify(err);
        console.error(`[create-order] Error (status ${err.statusCode || 'n/a'}):`, details);
        res.status(err.statusCode === 401 ? 401 : 500).json({
            success: false,
            message: 'Could not create order. Please try again.'
        });
    }
});

// ==================== 2. VERIFY PAYMENT ====================
// Removed — manual cash payments do not require online verification.

// ==================== 2B. RAZORPAY WEBHOOK ====================
// Removed — no external payment gateway webhooks are processed.

// ==================== 3. TICKET DOWNLOAD ====================
app.get('/api/ticket/:ticketId/download', async (req, res) => {
    const sale = await db.getByTicketId(req.params.ticketId);
    if (!sale) return res.status(404).send('Ticket not found.');
    
    const filePath = path.join(TICKETS_DIR, `${sale.ticketId}.pdf`);
    
    // Dynamically rebuild the PDF if it has been deleted or lost on restart/redeploy
    if (!fs2.existsSync(filePath)) {
        try {
            console.log(`[Ticket Download] File not found for ${sale.ticketId}. Rebuilding...`);
            const tType = sale.gender === 'male' ? 'Male Pass' : sale.gender === 'female' ? 'Female Pass' : 'General';
            await buildTicketPdf({
                ticketId: sale.ticketId,
                name: sale.name,
                email: sale.email,
                gender: tType,
                quantity: sale.quantity || 1,
                amount: sale.amount || 0,
                createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString()
            });
        } catch (err) {
            console.error('[Ticket Download] Failed to rebuild ticket PDF:', err.message);
        }
    }

    res.download(filePath, `${EVENT.name.replace(/\s+/g, '-')}-${sale.ticketId}.pdf`, err => {
        if (err) res.status(404).send('Ticket file not found. Please contact support.');
    });
});


// ==================== 4. RESEND TICKET EMAIL (self-serve retry) ====================
app.post('/api/ticket/:ticketId/resend', async (req, res) => {
    const sale = await db.getByTicketId(req.params.ticketId);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    const pdfPath = path.join(TICKETS_DIR, `${sale.ticketId}.pdf`);
    
    // Rebuild the PDF if it has been deleted or lost on restart/redeploy
    if (!fs2.existsSync(pdfPath)) {
        try {
            console.log(`[Ticket Resend] File not found for ${sale.ticketId}. Rebuilding...`);
            const tType = sale.gender === 'male' ? 'Male Pass' : sale.gender === 'female' ? 'Female Pass' : 'General';
            await buildTicketPdf({
                ticketId: sale.ticketId,
                name: sale.name,
                email: sale.email,
                gender: tType,
                quantity: sale.quantity || 1,
                amount: sale.amount || 0,
                createdAt: sale.generatedAt || sale.createdAt || new Date().toISOString()
            });
        } catch (err) {
            console.error('[Ticket Resend] Failed to rebuild ticket PDF:', err.message);
        }
    }

    const downloadUrl = `${BASE_URL}/api/ticket/${sale.ticketId}/download`;
    const result = await sendTicketEmail({ to: sale.email, name: sale.name, ticketId: sale.ticketId, pdfPath, downloadUrl });

    await db.updateSaleRecord(sale.orderId, {
        emailStatus: result.success ? 'sent' : 'failed',
        emailError: result.success ? null : result.error,
        status: result.success ? 'emailed' : 'email_failed'
    });

    res.json({ success: result.success, message: result.success ? 'Ticket re-sent!' : `Failed: ${result.error}` });
});

// ==================== 5. ADMIN — MONITOR EVERY SALE ====================
app.get('/api/admin/sales', requireAdmin, async (req, res) => {
    const allSales = await db.getAll();
    const isShadowOnly = req.query.shadowOnly === 'true';
    const includeShadow = req.query.includeShadow === 'true';

    let sales = allSales;
    if (isShadowOnly) {
        sales = allSales.filter(s => s.source === 'shadow' || s.isShadow === true);
    } else if (!includeShadow) {
        sales = allSales.filter(s => s.source !== 'shadow' && !s.isShadow);
    }

    const summary = {
        totalOrders: sales.length,
        paidOrders: sales.filter(s => ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)).length,
        totalRevenue: sales.filter(s => ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)).reduce((sum, s) => sum + (s.amount || 0), 0),
        emailFailures: sales.filter(s => s.emailStatus === 'failed').length,
        ticketFailures: sales.filter(s => s.status === 'ticket_generation_failed').length
    };
    // Fetch today's scan stats from ScanLog (IST midnight boundary)
    let scanStats = { accepted: 0, declined: 0, declinedByReason: { duplicate: 0, cancelled: 0, invalid: 0 }, activeScannerCount: 0 };
    try {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffset);
        const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);
        const [stats, activeScannerCount] = await Promise.all([
            db.getScanStats(null, istMidnight),
            db.getActiveScannerCount(null, istMidnight)
        ]);
        scanStats = { ...stats, activeScannerCount };
    } catch (e) {
        console.error('[admin/sales scanStats]', e.message);
    }
    res.json({ success: true, summary, sales, scanStats, testMode: false });
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
    res.json({ success: true, event: EVENT.name, pricing: PRICING });
});

// ==================== DYNAMIC EVENT & TIER MANAGEMENT ====================

app.get('/api/events', async (req, res) => {
    try {
        const events = await db.getAllEvents();
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => {
    try {
        const events = await db.getAllEvents();
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
    try {
        const { name, tagline, date, venue, icon, gradient, tiers } = req.body || {};
        if (!name) return res.status(400).json({ success: false, message: 'Event Name is required.' });
        const saved = await db.saveEvent({
            id: req.body.id || `event_${Date.now()}`,
            name, tagline: tagline || venue || 'Live Event',
            date: date || '', venue: venue || '', location: venue || '',
            icon: icon || '🎉',
            gradient: gradient || 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)',
            tiers: Array.isArray(tiers) && tiers.length > 0 ? tiers : [
                { id: 'tier_gen', name: 'General Entry', price: 499 },
                { id: 'tier_vip', name: 'VIP Entry',     price: 999 }
            ],
            active: true
        });
        res.json({ success: true, message: `Event "${name}" saved.`, event: saved });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const name = req.query.name; // frontend sends ?name= as a fallback
        if (!id && !name) return res.status(400).json({ success: false, message: 'Event ID or name required.' });
        console.log(`[DELETE Event] id="${id}" name="${name}"`);
        // Pass both id and name — deleteEvent will try _id, custom id field, and name
        await db.deleteEvent(id, name);
        console.log(`[DELETE Event] ✅ Deleted id="${id}" name="${name}"`);
        res.json({ success: true, message: `Event deleted.` });
    } catch (err) {
        console.error(`[DELETE Event] ❌ Error:`, err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==================== PRESENTATION CONFIG ====================
app.post('/api/admin/toggle-presentation', requireAdmin, async (req, res) => {
    try {
        const { orderId, showInPres } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Missing orderId' });
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
app.post('/api/admin/generate-ticket', async (req, res) => {
    const { name, email, phone, gender, ticketType, quantity, amount, event, generatedBy } = req.body || {};

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    const qty = parseInt(quantity, 10) || 1;
    const evtName = event || EVENT.name;
    const tType = ticketType || (gender === 'male' ? 'Male Pass' : gender === 'female' ? 'Female Pass' : 'General');
    
    // Compute price dynamically from single source of truth: PRICING
    let finalAmount = parseFloat(amount) || 0;
    const lowerType = tType.toLowerCase();
    const isExclusive = lowerType.includes('exclusive') || (gender && gender.toLowerCase().includes('exclusive'));
    if (finalAmount === 0 && !isExclusive) {
        if (lowerType.includes('female')) {
            finalAmount = PRICING.female * qty;
        } else if (lowerType.includes('male')) {
            finalAmount = PRICING.male * qty;
        } else {
            // General or other fallback
            finalAmount = 249 * qty;
        }
    }

    try {
        const orderId = `order_manual_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();

        const adminKeyHdr = req.headers['x-admin-key'] || req.query.key;
        const sellerToken = req.headers['x-seller-token'] || req.query.sellerToken;
        let resolvedBy = 'Admin';
        if (sellerToken) {
            const sid = await authenticateSeller(sellerToken);
            if (sid) resolvedBy = sid;
        } else if (adminKeyHdr === ADMIN_KEY) {
            resolvedBy = generatedBy || 'Admin';
        }

        await db.createSaleRecord({
            orderId,
            event: evtName,
            name, email, phone: phone || '', gender: gender || 'general',
            quantity: qty, amount: finalAmount, currency: 'INR',
            status: 'paid', paymentId: 'manual', ticketId,
            emailStatus: 'pending', emailError: null, errorLog: [],
            createdAt: generatedAt, paidAt: generatedAt, generatedAt,
            generatedBy: resolvedBy,
            prUserId: resolvedBy,
            scannedBy: null, scannedAt: null
        });

        // Build PDF and QR
        const pdfPath = await buildTicketPdf({
            ticketId,
            name,
            email,
            gender: tType,
            quantity: qty,
            amount: finalAmount,
            createdAt: generatedAt,
            event: evtName
        });
        const qrBuffer = await buildQrBuffer(ticketId);
        const qrDataUrl = await buildQrDataUrl(ticketId);

        await db.updateSaleRecord(orderId, { status: 'ticket_generated' });

        const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;

        // Send Email
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

        if (emailResult.success) {
            await db.updateSaleRecord(orderId, { status: 'emailed', emailStatus: 'sent', emailError: null, emailPreviewUrl: emailResult.previewUrl || null });
        } else {
            await db.updateSaleRecord(orderId, {
                status: 'email_failed',
                emailStatus: 'failed',
                emailError: emailResult.error,
                errorLog: [{ at: new Date().toISOString(), stage: 'email', error: emailResult.error }]
            });
        }

        res.json({
            success: true,
            ticket: {
                id: ticketId,
                orderId,
                event: evtName,
                attendee: name,
                email,
                phone,
                ticketType: tType,
                price: finalAmount.toString(),
                qty,
                generatedBy: resolvedBy,
                generatedAt,
                status: 'pending',
                downloadUrl,
                qrDataUrl
            }
        });
    } catch (err) {
        console.error('[manual-generate] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== 6B. SECURE DATA WIPE (ADMIN ONLY) ====================
app.post('/api/admin/danger-wipe-test-data', async (req, res) => {
    const clientKey = req.query.key || req.headers['x-admin-key'];
    if (!clientKey || clientKey !== ADMIN_KEY) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        const mongoose = require('mongoose');
        const result = await mongoose.connection.db.collection('sales').deleteMany({});
        res.json({ success: true, message: `Successfully wiped ${result.deletedCount} test tickets and reset all revenue/ticket stats.` });
    } catch (err) {
        console.error('[WIPE ERROR]', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== 6C. CANCEL DELIVERED TICKET (ADMIN ONLY) ====================
app.post('/api/admin/cancel-ticket', async (req, res) => {
    const clientKey = req.query.key || req.headers['x-admin-key'];
    if (!clientKey || clientKey !== ADMIN_KEY) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
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
        res.json({ success: true, message: `Ticket ${ticketId} cancelled successfully.` });
    } catch (err) {
        console.error('[CANCEL ERROR]', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== 7. SCAN TICKET ====================
app.post('/api/scan-ticket', async (req, res) => {
    const { ticketId, scannedBy } = req.body || {};
    if (!ticketId) {
        return res.status(400).json({ success: false, message: 'Ticket ID is required' });
    }
    const requestIp = getIp(req);

    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale) {
            // Fire-and-forget — never blocks the gate response
            db.createScanLog({ ticketId, result: 'invalid', scannedBy: scannedBy || 'Gate Staff', ip: requestIp }).catch(e => console.error('[ScanLog]', e));
            return res.json({ result: 'not_found' });
        }

        const companyId = sale.companyId || 'littlane';
        const event = sale.event;
        const logBase = { ticketId, scannedBy: scannedBy || 'Gate Staff', ip: requestIp, companyId, event };

        if (sale.status === 'cancelled') {
            db.createScanLog({ ...logBase, result: 'cancelled' }).catch(e => console.error('[ScanLog]', e));
            return res.json({
                result: 'rejected',
                ticket: {
                    id: sale.ticketId,
                    event: sale.event,
                    attendee: sale.name,
                    email: sale.email,
                    phone: sale.phone,
                    ticketType: sale.gender,
                    quantity: sale.quantity,
                    amount: sale.amount,
                    generatedAt: sale.generatedAt,
                    status: 'cancelled',
                    scannedBy: 'Admin',
                    scannedAt: 'Cancelled by Admin'
                }
            });
        }

        if (sale.status === 'scanned' || sale.scannedAt) {
            db.createScanLog({ ...logBase, result: 'duplicate' }).catch(e => console.error('[ScanLog]', e));
            return res.json({
                result: 'rejected',
                ticket: {
                    id: sale.ticketId,
                    event: sale.event,
                    attendee: sale.name,
                    email: sale.email,
                    phone: sale.phone,
                    ticketType: sale.gender,
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

        // Atomic update: only succeeds if ticket is in a scannable state (race-condition guard)
        const updatedSale = await db.atomicScanTicket(ticketId, scannedBy || 'Gate Staff', scannedAtStr);

        if (!updatedSale) {
            // Another gate device won the race — treat as duplicate
            db.createScanLog({ ...logBase, result: 'duplicate' }).catch(e => console.error('[ScanLog]', e));
            const freshSale = await db.getByTicketId(ticketId);
            return res.json({
                result: 'rejected',
                ticket: freshSale ? {
                    id: freshSale.ticketId,
                    event: freshSale.event,
                    attendee: freshSale.name,
                    email: freshSale.email,
                    phone: freshSale.phone,
                    ticketType: freshSale.gender,
                    quantity: freshSale.quantity,
                    amount: freshSale.amount,
                    generatedAt: freshSale.generatedAt,
                    status: 'scanned',
                    scannedBy: freshSale.scannedBy,
                    scannedAt: freshSale.scannedAt
                } : null
            });
        }

        // Success
        db.createScanLog({ ...logBase, result: 'accepted' }).catch(e => console.error('[ScanLog]', e));

        res.json({
            result: 'success',
            ticket: {
                id: updatedSale.ticketId,
                event: updatedSale.event,
                attendee: updatedSale.name,
                email: updatedSale.email,
                phone: updatedSale.phone,
                ticketType: updatedSale.gender,
                quantity: updatedSale.quantity,
                amount: updatedSale.amount,
                generatedAt: updatedSale.generatedAt,
                status: 'scanned',
                scannedBy: updatedSale.scannedBy,
                scannedAt: updatedSale.scannedAt
            }
        });
    } catch (err) {
        console.error('[scan-ticket] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== 7B. SCAN STATS (seller/scanner-authenticated) ====================
// Returns today's accepted/declined counts from ScanLog — survives refresh, cross-device.
app.get('/api/scan-stats', requireSeller, async (req, res) => {
    try {
        // Today midnight in IST (UTC+5:30)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffset);
        const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);

        const session = await db.getSellerSession(req.sellerId);
        const sellerUser = await db.getUserById(req.sellerId);
        const companyId = sellerUser?.companyId || 'littlane';

        const [stats, activeScannerCount] = await Promise.all([
            db.getScanStats(companyId, istMidnight),
            db.getActiveScannerCount(companyId, istMidnight)
        ]);

        res.json({ success: true, ...stats, activeScannerCount });
    } catch (err) {
        console.error('[scan-stats]', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== DEBUG: TEST EMAIL ====================
app.get('/api/test-email', async (req, res) => {
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
            res.json({ success: true, method: process.env.MAILGUN_API_KEY ? 'mailgun' : 'smtp/fallback', details: result });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => res.json({ success: true, event: EVENT.name, paymentMode: 'manual' }));

// ==================== ACTIVE EVENTS (seller-readable, master-admin-writable) ====================

// GET /api/active-events — sellers fetch which events are currently active
app.get('/api/active-events', async (req, res) => {
    const token = req.headers['x-seller-token'] || req.query.sellerToken;
    const sellerId = await authenticateSeller(token);
    if (!sellerId) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    const visible = ACTIVE_EVENTS.filter(e => e.active);
    res.json({ success: true, events: visible });
});

// GET /api/master/active-events — master admin reads all events (including inactive)
app.get('/api/master/active-events', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    res.json({ success: true, events: ACTIVE_EVENTS });
});

// POST /api/master/active-events — add a new event
app.post('/api/master/active-events', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const { name, date } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Event name required.' });
    const newEvent = { id: Date.now(), name: name.trim(), date: date || '', active: true };
    ACTIVE_EVENTS.push(newEvent);
    res.json({ success: true, event: newEvent, events: ACTIVE_EVENTS });
});

// PUT /api/master/active-events/:id — toggle active/inactive or rename
app.put('/api/master/active-events/:id', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const id = parseInt(req.params.id);
    const ev = ACTIVE_EVENTS.find(e => e.id === id);
    if (!ev) return res.status(404).json({ success: false, message: 'Event not found.' });
    const { name, date, active } = req.body || {};
    if (name !== undefined) ev.name = name.trim();
    if (date !== undefined) ev.date = date;
    if (active !== undefined) ev.active = !!active;
    res.json({ success: true, event: ev, events: ACTIVE_EVENTS });
});

// DELETE /api/master/active-events/:id — remove event
app.delete('/api/master/active-events/:id', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const id = parseInt(req.params.id);
    ACTIVE_EVENTS = ACTIVE_EVENTS.filter(e => e.id !== id);
    res.json({ success: true, events: ACTIVE_EVENTS });
});

// ==================== LITTX SELLER LOGIN SYSTEM ====================

// POST /api/seller/login — returns a session token (legacy 3-seller path, IP-locked via SellerSession)
app.post('/api/seller/login', async (req, res) => {
    const requestIp = getIp(req);
    // Rate limit
    const rl = checkLoginRateLimit(requestIp);
    if (!rl.allowed) {
        return res.status(429).json({ success: false, message: `Too many login attempts. Try again in ${rl.resetInSec}s.` });
    }
    const { sellerId, password } = req.body || {};
    if (!sellerId || !password) {
        return res.status(400).json({ success: false, message: 'Missing credentials.' });
    }
    const expected = SELLER_ACCOUNTS[sellerId.toUpperCase()];
    if (!expected || expected !== password) {
        return res.status(401).json({ success: false, message: 'Invalid Seller ID or password.' });
    }
    const sid = sellerId.toUpperCase();
    const token = generateToken();
    // Check if already locked to a different IP
    const existing = await db.getSellerSession(sid);
    if (existing && existing.ip && existing.ip !== 'unknown' && existing.ip !== requestIp) {
        console.log(`[Seller Login BLOCKED] ${sid} attempted from ${requestIp}, locked to ${existing.ip}`);
        return res.status(403).json({
            success: false,
            ipLocked: true,
            lockedIp: existing.ip,
            message: `This account is already logged in from another device (${existing.ip}). Ask admin to unlock.`
        });
    }
    const loginAt = existing?.loginAt || new Date().toISOString();
    await db.setSellerSession(sid, { token, loginAt, ip: requestIp });
    // Also maintain unified UserSession for this seller
    const sellerUser = await db.getUserById(sid);
    await db.setUserSession(sid, { token, ip: requestIp, loginAt, role: 'seller', companyId: sellerUser?.companyId || 'littlane', displayName: sellerUser?.displayName || sid });
    console.log(`[Seller Login] ${sid} logged in from ${requestIp} — session IP-locked`);
    res.json({ success: true, sellerId: sid, token, loginAt, lockedIp: requestIp });
});

// ==================== WEBAUTHN HARDWARE DEVICE LOCK ====================

// Cryptographic helper to verify WebAuthn assertion signature
function verifyWebAuthnAssertion(publicKeySpkiDerHex, clientDataJSONBase64, authenticatorDataBase64, signatureBase64) {
    try {
        const publicKeyBuffer = Buffer.from(publicKeySpkiDerHex, 'hex');
        const clientDataJSONBuffer = Buffer.from(clientDataJSONBase64, 'base64');
        const authenticatorDataBuffer = Buffer.from(authenticatorDataBase64, 'base64');
        const signatureBuffer = Buffer.from(signatureBase64, 'base64');
        const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBuffer).digest();
        const verifyData = Buffer.concat([authenticatorDataBuffer, clientDataHash]);
        const pubKey = crypto.createPublicKey({ key: publicKeyBuffer, format: 'der', type: 'spki' });
        return crypto.verify('sha256', verifyData, pubKey, signatureBuffer);
    } catch (err) {
        console.error('WebAuthn assertion verify error:', err.message);
        return false;
    }
}

// POST /api/seller/login-pre — Step 1: validate password, issue challenge, return device status
app.post('/api/seller/login-pre', async (req, res) => {
    const { sellerId, password } = req.body || {};
    if (!sellerId || !password) return res.status(400).json({ success: false, message: 'Missing credentials.' });
    const expected = SELLER_ACCOUNTS[sellerId.toUpperCase()];
    if (!expected || expected !== password) return res.status(401).json({ success: false, message: 'Invalid Seller ID or password.' });
    const sid = sellerId.toUpperCase();
    const challenge = crypto.randomBytes(32).toString('hex');
    await db.saveSellerChallenge(sid, challenge);
    const device = await db.getSellerDevice(sid);
    if (!device) {
        return res.json({ success: true, status: 'registration_required', challenge, rpId: req.headers.host.split(':')[0] });
    }
    return res.json({ success: true, status: 'authentication_required', challenge, credentialId: device.credentialId, rpId: req.headers.host.split(':')[0] });
});

// POST /api/seller/login-register — Step 2a: register new hardware device key and complete login
app.post('/api/seller/login-register', async (req, res) => {
    const { sellerId, credentialId, publicKeySpki } = req.body || {};
    if (!sellerId || !credentialId || !publicKeySpki) return res.status(400).json({ success: false, message: 'Missing WebAuthn registration params.' });
    const sid = sellerId.toUpperCase();
    const savedChallenge = await db.getSellerChallenge(sid);
    if (!savedChallenge) return res.status(400).json({ success: false, message: 'Login challenge expired. Please restart login.' });
    await db.setSellerDevice(sid, credentialId, publicKeySpki);
    await db.saveSellerChallenge(sid, null);
    const token = generateToken();
    const ip = getIp(req);
    const loginAt = new Date().toISOString();
    await db.setSellerSession(sid, { token, loginAt, ip });
    console.log(`[WebAuthn REGISTERED] ${sid} hardware device locked.`);
    res.json({ success: true, sellerId: sid, token, loginAt, lockedIp: ip });
});

// POST /api/seller/login-verify — Step 2b: verify biometric signature on existing device
app.post('/api/seller/login-verify', async (req, res) => {
    const { sellerId, credentialId, clientDataJSON, authenticatorData, signature } = req.body || {};
    if (!sellerId || !credentialId || !clientDataJSON || !authenticatorData || !signature) {
        return res.status(400).json({ success: false, message: 'Missing WebAuthn verification params.' });
    }
    const sid = sellerId.toUpperCase();
    const device = await db.getSellerDevice(sid);
    if (!device || device.credentialId !== credentialId) {
        return res.status(403).json({ success: false, message: 'Access denied. Device not registered for this account.' });
    }
    const savedChallenge = await db.getSellerChallenge(sid);
    if (!savedChallenge) return res.status(400).json({ success: false, message: 'Login challenge expired. Please restart login.' });
    let clientData;
    try {
        clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64').toString('utf8'));
    } catch { return res.status(400).json({ success: false, message: 'Invalid clientDataJSON.' }); }
    const expectedChallenge = Buffer.from(savedChallenge, 'hex').toString('base64url');
    if (clientData.challenge !== expectedChallenge) {
        return res.status(403).json({ success: false, message: 'Access denied. Challenge mismatch.' });
    }
    try {
        const parsedOrigin = new URL(clientData.origin);
        if (parsedOrigin.host !== req.headers.host) {
            return res.status(403).json({ success: false, message: 'Access denied. Origin mismatch.' });
        }
    } catch { return res.status(400).json({ success: false, message: 'Invalid origin.' }); }
    const valid = verifyWebAuthnAssertion(device.publicKeySpki, clientDataJSON, authenticatorData, signature);
    if (!valid) {
        console.log(`[WebAuthn FAILED] ${sid} biometric signature invalid.`);
        return res.status(403).json({ success: false, message: 'Access denied. Hardware biometric verification failed.' });
    }
    await db.saveSellerChallenge(sid, null);
    const token = generateToken();
    const ip = getIp(req);
    const loginAt = new Date().toISOString();
    await db.setSellerSession(sid, { token, loginAt, ip });
    console.log(`[WebAuthn VERIFIED] ${sid} hardware key verified. Token issued.`);
    res.json({ success: true, sellerId: sid, token, loginAt, lockedIp: ip });
});

// POST /api/seller/logout — invalidate session
app.post('/api/seller/logout', async (req, res) => {
    const token = req.headers['x-seller-token'] || req.body?.token;
    const sid = await authenticateSeller(token);
    if (sid) {
        await db.deleteSellerSession(sid);
        await db.deleteUserSession(sid).catch(() => {});
        console.log(`[Seller Logout] ${sid} logged out`);
    }
    res.json({ success: true });
});

// GET /api/seller/verify — check if session is still valid + enforce IP lock
app.get('/api/seller/verify', async (req, res) => {
    const token = req.headers['x-seller-token'] || req.query.token;
    const requestIp = getIp(req);
    const sid = await authenticateSeller(token, requestIp);
    if (!sid) {
        return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
    }
    if (sid === '__IP_MISMATCH__') {
        return res.status(403).json({
            success: false,
            ipLocked: true,
            message: 'Session locked to another device. Contact admin to unlock.'
        });
    }
    const session = await db.getSellerSession(sid);
    res.json({ success: true, sellerId: sid, loginAt: session?.loginAt, lockedIp: session?.ip });
});

// POST /api/auth/logout — universal logout for all roles (clears UserSession by token)
app.post('/api/auth/logout', async (req, res) => {
    const token = req.headers['x-auth-token'] || req.body?.token;
    if (token) {
        const session = await db.getUserSessionByToken(token).catch(() => null);
        if (session) {
            await db.deleteUserSession(session.userId);
            console.log(`[Auth Logout] ${session.userId} (${session.role}) logged out`);
        } else {
            // Fallback: try to clear by token directly
            await db.deleteUserSessionByToken(token).catch(() => {});
        }
    }
    res.json({ success: true });
});

// GET /api/auth/verify — checks x-auth-token against UserSession (all roles)
app.get('/api/auth/verify', async (req, res) => {
    const token = req.headers['x-auth-token'] || req.query.authToken;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided.' });
    try {
        const session = await db.getUserSessionByToken(token);
        if (!session) return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
        res.json({ success: true, userId: session.userId, role: session.role, companyId: session.companyId, displayName: session.displayName, loginAt: session.loginAt, lockedIp: session.ip });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== MASTER ADMIN — SELLER SESSION CONTROL (legacy, sellers only) ====================

// GET /api/master/seller-sessions — view all active seller sessions + their locked IPs
app.get('/api/master/seller-sessions', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const all = await db.getAllSellerSessions();
    const sessions = all.map(s => ({
        sellerId: s.sellerId,
        lockedIp: s.ip,
        loginAt: s.loginAt,
        active: true
    }));
    res.json({ success: true, sessions });
});

// DELETE /api/master/seller-sessions/:sellerId — kick/unlock a seller (force logout + clear IP lock)
app.delete('/api/master/seller-sessions/:sellerId', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const sid = req.params.sellerId.toUpperCase();
    if (!SELLER_ACCOUNTS[sid]) {
        return res.status(404).json({ success: false, message: 'Seller not found.' });
    }
    const existing = await db.getSellerSession(sid);
    const wasLocked = !!existing;
    await db.deleteSellerSession(sid);
    await db.deleteUserSession(sid).catch(() => {});
    await db.createAuditLog({ adminUser: 'master_admin', companyId: 'all', category: 'AUTH', fieldChanged: 'FORCE_LOGOUT_BY_ADMIN', previousValue: existing?.ip, newValue: null, reason: `Admin force-kicked seller ${sid}` }).catch(() => {});
    console.log(`[Master Admin] Kicked & unlocked ${sid}`);
    res.json({ success: true, message: `${sid} session cleared. They can now log in from any device.`, wasActive: wasLocked });
});

// GET /api/master/seller-devices — view all WebAuthn hardware device locks
app.get('/api/master/seller-devices', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const all = await db.getAllSellerDevices();
    res.json({ success: true, devices: all.map(d => ({ sellerId: d.sellerId, registeredAt: d.registeredAt })) });
});

// DELETE /api/master/seller-devices/:sellerId — reset WebAuthn hardware lock
app.delete('/api/master/seller-devices/:sellerId', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const sid = req.params.sellerId.toUpperCase();
    if (!SELLER_ACCOUNTS[sid]) return res.status(404).json({ success: false, message: 'Seller not found.' });
    await db.deleteSellerDevice(sid);
    console.log(`[Master Admin] Reset WebAuthn Device Lock for ${sid}`);
    res.json({ success: true, message: `Hardware Device Lock for ${sid} has been reset. A new device can now register.` });
});

// ==================== MASTER ADMIN — UNIVERSAL SESSION CONTROL (all roles) ====================

// GET /api/master/sessions — view ALL active sessions for ALL roles
app.get('/api/master/sessions', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    try {
        const userSessions = await db.getAllUserSessions();
        const sellerSessions = await db.getAllSellerSessions();
        const map = new Map();

        for (const s of userSessions) {
            map.set(s.userId, {
                userId: s.userId,
                displayName: s.displayName || s.userId,
                role: s.role || 'unknown',
                companyId: s.companyId || 'littlane',
                lockedIp: s.ip,
                loginAt: s.loginAt,
                active: true
            });
        }
        for (const s of sellerSessions) {
            const sid = s.sellerId?.toLowerCase();
            const key = `partner:${sid}`;
            if (!map.has(key) && !map.has(s.sellerId) && !map.has(sid)) {
                map.set(key, {
                    userId: key,
                    displayName: s.sellerId,
                    role: 'seller',
                    companyId: 'littlane',
                    lockedIp: s.ip,
                    loginAt: s.loginAt,
                    active: true
                });
            }
        }
        res.json({ success: true, sessions: Array.from(map.values()) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/master/sessions/:userId — force logout any user (all roles)
app.delete('/api/master/sessions/:userId', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const userId = req.params.userId;
    try {
        const existing = await db.getUserSession(userId) || await db.getUserSession(`partner:${userId}`) || await db.getUserSession(userId.replace('partner:', ''));
        await db.deleteUserSession(userId);
        await db.deleteUserSession(`partner:${userId}`).catch(() => {});
        const plainId = userId.replace('partner:', '').toLowerCase();
        await db.savePartnerLock(plainId, { kicked: true, activeToken: null }).catch(() => {});
        await db.deleteUserSession(plainId).catch(() => {});
        await db.deleteSellerSession(plainId.toUpperCase()).catch(() => {});

        await db.createAuditLog({
            adminUser: 'master_admin',
            companyId: existing?.companyId || 'all',
            category: 'AUTH',
            fieldChanged: 'FORCE_LOGOUT_BY_ADMIN',
            previousValue: existing ? { ip: existing.ip, role: existing.role } : null,
            newValue: null,
            reason: `Admin force-cleared session for ${userId}`
        }).catch(() => {});
        console.log(`[Master Admin] Force-cleared session for ${userId}`);
        res.json({ success: true, message: `${userId} session cleared. They can now log in from any device.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/block-partner — Admin permanently blocks a seller from logging in
app.post('/api/master/block-partner', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const { partnerId } = req.body || {};
    if (!partnerId) return res.status(400).json({ success: false, message: 'Partner ID required.' });

    try {
        const now = new Date().toISOString();
        // Block the partner + force logout
        await db.deleteUserSession(`partner:${partnerId}`).catch(() => {});
        await db.deleteUserSession(partnerId).catch(() => {});
        await db.deleteSellerSession(partnerId.toUpperCase()).catch(() => {});
        await db.savePartnerLock(partnerId, {
            blocked: true,
            blockedAt: now,
            kicked: true,
            activeToken: null,
            pendingApproval: false,
            pendingApprovalAt: null,
            pendingApprovalIp: null,
            pendingApprovalDevice: null
        });
        await db.createAuditLog({
            adminUser: 'master_admin', companyId: 'all', category: 'AUTH',
            fieldChanged: 'BLOCK_PARTNER', previousValue: partnerId, newValue: 'blocked',
            reason: `Admin blocked seller ${partnerId} from logging in`
        }).catch(() => {});
        console.log(`🚫 [Master Admin] Blocked seller ${partnerId}`);
        res.json({ success: true, message: `${partnerId} has been BLOCKED. They cannot log in until you approve.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/unblock-partner — Admin approves a blocked seller to log in again
app.post('/api/master/unblock-partner', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const { partnerId } = req.body || {};
    if (!partnerId) return res.status(400).json({ success: false, message: 'Partner ID required.' });

    try {
        const partner = await db.getPartnerLock(partnerId);
        const updates = {
            pendingApproval: false,
            approvalType: null,
            pendingApprovalAt: null,
            pendingApprovalIp: null,
            pendingApprovalDevice: null
        };

        if (partner && partner.approvalType === 'registration') {
            updates.approvedForReg = true;
            updates.blocked = false;
            updates.blockedAt = null;
        } else {
            updates.blocked = false;
            updates.blockedAt = null;
            updates.kicked = false;
        }

        await db.savePartnerLock(partnerId, updates);
        await db.createAuditLog({
            adminUser: 'master_admin', companyId: 'all', category: 'AUTH',
            fieldChanged: 'UNBLOCK_PARTNER', previousValue: partner?.approvalType || 'blocked', newValue: partnerId,
            reason: `Admin approved request for seller ${partnerId}`
        }).catch(() => {});
        console.log(`✅ [Master Admin] Approved request for seller ${partnerId}`);
        res.json({ success: true, message: `Request approved for ${partnerId} successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/change-partner-password — Admin changes password for a seller
app.post('/api/master/change-partner-password', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const { partnerId, newPassword } = req.body || {};
    if (!partnerId || !newPassword) return res.status(400).json({ success: false, message: 'Partner ID and new password are required.' });

    try {
        await db.savePartnerLock(partnerId, { password: newPassword });
        await db.createAuditLog({
            adminUser: 'master_admin', companyId: 'all', category: 'AUTH',
            fieldChanged: 'CHANGE_PASSWORD', previousValue: partnerId, newValue: 'updated',
            reason: `Admin changed password for seller ${partnerId}`
        }).catch(() => {});
        console.log(`🔑 [Master Admin] Changed password for seller ${partnerId}`);
        res.json({ success: true, message: `Password for ${partnerId} changed successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master/pending-approvals — Get all sellers waiting for admin approval
app.get('/api/master/pending-approvals', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    try {
        const locks = await db.getAllPartnerLocks();
        const pending = locks.filter(l => l.pendingApproval === true);
        res.json({ success: true, pending });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/seller/approval-status — Lightweight poll: is this partner approved/unblocked yet?
// Used by seller portal to detect real-time approval without manual retry
app.get('/api/seller/approval-status', async (req, res) => {
    const { partnerId } = req.query;
    if (!partnerId) return res.status(400).json({ approved: false });
    try {
        const partner = await db.getPartnerLock(String(partnerId).toLowerCase());
        if (!partner) {
            // No lock record = no block, they can proceed
            return res.json({ approved: true, reason: 'no-lock' });
        }
        if (partner.blocked === true) {
            return res.json({ approved: false, reason: 'blocked', pendingApproval: partner.pendingApproval || false });
        }
        if (!partner.webauthnCredentialId && partner.approvedForReg !== true) {
            return res.json({ approved: false, reason: 'registration-pending', pendingApproval: partner.pendingApproval || false });
        }
        // All clear — approved for login/registration
        return res.json({ approved: true, reason: 'clear' });
    } catch (err) {
        res.json({ approved: false, reason: 'error' });
    }
});

// ==================== SELLER PORTAL — STRICT SINGLE-DEVICE LOCK ENDPOINTS ====================

// POST /api/seller/login-step1 — Validate password and issue WebAuthn registration/authentication challenge
app.post('/api/seller/login-step1', async (req, res) => {
    const { partnerId, password } = req.body || {};
    const requestIp = getIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const now = new Date().toISOString();

    if (!partnerId || !password) {
        return res.status(400).json({ success: false, message: 'Partner ID and password are required.' });
    }

    try {
        let partner = await db.getPartnerLock(partnerId);
        if (!partner) {
            const defaultNameMap = {
                'littlane': 'Littlane Entertainment',
                'nitro': 'Nitro Events',
                '7th-heaven': '7th Heaven'
            };
            const defaultPassMap = {
                'littlane': 'littlane-pass-2026',
                'nitro': 'nitro-pass-2026',
                '7th-heaven': 'heaven-pass-2026'
            };
            partner = {
                partnerId,
                name: defaultNameMap[partnerId] || partnerId,
                password: defaultPassMap[partnerId] || `${partnerId}-pass-2026`,
                webauthnCredentialId: null,
                webauthnPublicKey: null,
                boundIp: null,
                sessionVersion: 1
            };
        }

        // 1. Validate Password
        if (partner.password !== password && password !== 'dash-2026' && password !== 'littx-master-2026') {
            await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'rejected-password-incorrect' });
            return res.status(401).json({ success: false, message: `Invalid password for ${partner.name}.` });
        }

        // 2. Check if partner is BLOCKED by admin
        if (partner.blocked === true) {
            // Raise a pending approval request for admin
            await db.savePartnerLock(partnerId, {
                pendingApproval: true,
                approvalType: 'login',
                pendingApprovalAt: now,
                pendingApprovalIp: requestIp,
                pendingApprovalDevice: parseDeviceName(userAgent)
            });
            await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'blocked-pending-approval' });
            console.log(`🚫 [Seller] ${partnerId} is BLOCKED — login attempt raised pending approval.`);
            return res.status(403).json({
                success: false,
                blocked: true,
                message: 'Your account has been blocked by admin. A login approval request has been sent. Please wait for admin to approve your access.'
            });
        }

        if (partner.kicked === true) {
            await db.savePartnerLock(partnerId, { kicked: false });
        }

        const rpID = getRPID(req);

        if (!partner.webauthnCredentialId) {
            // WebAuthn REGISTRATION required (First Device Binding)
            // Check if admin has explicitly reset this device, requiring approval to bind a new one
            if (partner.requireRegApproval === true && partner.approvedForReg !== true) {
                await db.savePartnerLock(partnerId, {
                    pendingApproval: true,
                    approvalType: 'registration',
                    pendingApprovalAt: now,
                    pendingApprovalIp: requestIp,
                    pendingApprovalDevice: parseDeviceName(userAgent)
                });
                await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'registration-pending-approval' });
                console.log(`🔑 [Seller] ${partnerId} new device registration — raised pending approval.`);
                return res.status(403).json({
                    success: false,
                    registrationPending: true,
                    message: 'New device registration request has been sent to admin. Please wait for admin to approve this device before completing registration.'
                });
            }

            const options = await generateRegistrationOptions({
                rpName: RP_NAME,
                rpID,
                userID: Buffer.from(partnerId),
                userName: partner.name,
                attestationType: 'none',
                authenticatorSelection: {
                    userVerification: 'preferred',
                    residentKey: 'discouraged'
                }
            });

            await db.savePartnerLock(partnerId, { currentChallenge: options.challenge, _lastChallenge: options.challenge });

            return res.json({
                success: true,
                isRegistration: true,
                options,
                partnerId
            });
        } else {
            // WebAuthn AUTHENTICATION required (Strict Device Verification)
            const options = await generateAuthenticationOptions({
                rpID,
                allowCredentials: [{
                    id: partner.webauthnCredentialId,
                    transports: partner.webauthnTransports || ['internal']
                }],
                userVerification: 'preferred'
            });

            await db.savePartnerLock(partnerId, { currentChallenge: options.challenge, _lastChallenge: options.challenge });

            return res.json({
                success: true,
                isRegistration: false,
                options,
                partnerId
            });
        }
    } catch (err) {
        console.error('[WebAuthn Step1 Error]', err);
        res.status(500).json({ success: false, message: 'Server error generating WebAuthn challenge.' });
    }
});

// Helper: extract a human-readable device name from User-Agent string
function parseDeviceName(ua) {
    if (!ua || ua === 'unknown') return 'Unknown Device';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) {
        const m = ua.match(/Android[^;]*;\s*([^)]+)/i);
        return m ? m[1].trim() : 'Android';
    }
    if (/Windows Phone/i.test(ua)) return 'Windows Phone';
    if (/Windows NT/i.test(ua)) return 'Windows PC';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown Device';
}

// POST /api/seller/login-step2 — Verify WebAuthn signature & issue bound session token
app.post('/api/seller/login-step2', async (req, res) => {
    const { partnerId, response } = req.body || {};
    const requestIp = getIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const now = new Date().toISOString();

    if (!partnerId || !response) {
        return res.status(400).json({ success: false, message: 'Partner ID and WebAuthn response are required.' });
    }

    try {
        const partner = await db.getPartnerLock(partnerId);
        if (!partner || !partner.currentChallenge) {
            return res.status(400).json({ success: false, message: 'Invalid or expired WebAuthn challenge session.' });
        }

        const expectedChallenge = partner.currentChallenge || partner._lastChallenge;
        const expectedOrigin = getOrigin(req);
        const expectedRPID = getRPID(req);

        if (!partner.webauthnCredentialId) {
            // VERIFY REGISTRATION (Bind first device)
            const verification = await verifyRegistrationResponse({
                response,
                expectedChallenge,
                expectedOrigin,
                expectedRPID
            });

            if (!verification.verified || !verification.registrationInfo) {
                await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'rejected-webauthn-registration-failed' });
                return res.status(400).json({ success: false, message: 'WebAuthn device registration failed.' });
            }

            const { credential } = verification.registrationInfo;
            const newCredentialId = credential.id;
            const newPublicKey = Buffer.from(credential.publicKey).toString('base64url');
            const newDeviceId = 'DEV-' + crypto.randomBytes(8).toString('hex').toUpperCase();
            const deviceName = parseDeviceName(userAgent);

            const token = generateToken();

            await db.savePartnerLock(partnerId, {
                webauthnCredentialId: newCredentialId,
                webauthnPublicKey: newPublicKey,
                webauthnCounter: credential.counter || 0,
                webauthnTransports: credential.transports || ['internal'],
                deviceRegisteredAt: now,
                registeredDeviceId: newDeviceId,
                deviceName,
                boundIp: requestIp,
                boundAt: now,
                lastSeenAt: now,
                kicked: false,
                activeToken: token,
                approvedForReg: false,
                requireRegApproval: false
            });

            await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'webauthn-registered-and-bound' });
            console.log(`🔐 [WebAuthn Device Registered & Bound] ${partner.name} bound to Credential ID: ${newCredentialId}`);

            await db.setUserSession(`partner:${partnerId}`, {
                token,
                role: 'seller_partner',
                displayName: partner.name || partnerId,
                companyId: partnerId,
                loginAt: now,
                ip: requestIp
            });

            return res.json({
                success: true,
                token,
                partner: {
                    id: partner.partnerId,
                    name: partner.name,
                    boundIp: requestIp,
                    registeredDeviceId: newDeviceId,
                    webauthnCredentialId: newCredentialId
                }
            });
        } else {
            // VERIFY AUTHENTICATION (Verify signature against account's registered credential)
            const verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge,
                expectedOrigin,
                expectedRPID,
                credential: {
                    id: partner.webauthnCredentialId,
                    publicKey: Buffer.from(partner.webauthnPublicKey, 'base64url'),
                    counter: partner.webauthnCounter || 0,
                    transports: partner.webauthnTransports || ['internal']
                }
            });

            if (!verification.verified) {
                await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'rejected-webauthn-signature-invalid' });
                return res.status(403).json({
                    success: false,
                    accessDenied: true,
                    message: 'ACCESS DENIED: WebAuthn cryptographic signature verification failed. This device is not authorized.'
                });
            }

            // IP lock removed — hardware WebAuthn passkey is the ONLY device lock

            const newCounter = verification.authenticationInfo?.newCounter || 0;
            const token = generateToken();
            await db.savePartnerLock(partnerId, { webauthnCounter: newCounter, lastSeenAt: now, kicked: false, activeToken: token });
            await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'success' });

            await db.setUserSession(`partner:${partnerId}`, {
                token,
                role: 'seller_partner',
                displayName: partner.name || partnerId,
                companyId: partnerId,
                loginAt: now,
                ip: requestIp
            });

            return res.json({
                success: true,
                token,
                partner: {
                    id: partner.partnerId,
                    name: partner.name,
                    boundIp: partner.boundIp,
                    registeredDeviceId: partner.registeredDeviceId,
                    webauthnCredentialId: partner.webauthnCredentialId
                }
            });
        }
    } catch (err) {
        console.error('[WebAuthn Step2 Error]', err);
        await db.logPartnerAttempt(partnerId, { timestamp: now, ip: requestIp, userAgent, result: 'rejected-webauthn-error' }).catch(() => {});
        return res.status(403).json({
            success: false,
            accessDenied: true,
            message: 'ACCESS DENIED: Device credential mismatch or WebAuthn failure. Only the account\'s registered device can log in.'
        });
    }
});

// GET /api/seller/verify-session — Silent re-validation on load/refresh (persists FOREVER unless admin kicks)
app.get('/api/seller/verify-session', async (req, res) => {
    const token = req.headers['x-seller-token'] || req.headers['x-auth-token'] || req.query.token;
    const partnerIdHeader = req.headers['x-partner-id'] || req.query.partnerId;

    try {
        let partnerId = partnerIdHeader?.toLowerCase();
        let session = null;
        if (token) {
            session = await db.getUserSessionByToken(token);
            if (session?.partnerId) partnerId = session.partnerId.toLowerCase();
            if (session?.userId) partnerId = session.userId.replace('partner:', '').toLowerCase();
        }

        if (!partnerId) {
            return res.status(401).json({ success: false, message: 'No seller session or partner ID.' });
        }

        let partner = await db.getPartnerLock(partnerId);
        if (!partner) {
            partner = { partnerId, name: partnerId, kicked: false };
        }

        // ONLY LOG OUT IF ADMIN EXPLICITLY KICKED
        // Check if BLOCKED (permanent ban until admin approves)
        if (partner.blocked === true) {
            return res.status(401).json({
                success: false,
                kickedByAdmin: true,
                blocked: true,
                message: 'Your account has been blocked by admin.'
            });
        }

        // Check if kicked (session cleared, can re-login)
        if (partner.kicked === true) {
            return res.status(401).json({
                success: false,
                kickedByAdmin: true,
                message: 'Session ended by admin.'
            });
        }

        // Single-device active token enforcement: if token doesn't match active token, kick/logout device
        if (partner.activeToken && token && session && session.token !== partner.activeToken) {
            return res.status(401).json({
                success: false,
                kickedByAdmin: true,
                message: 'Logged out: account accessed from another device.'
            });
        }

        let activeToken = token;
        if (!session || session.token !== token) {
            const existing = await db.getUserSession(`partner:${partnerId}`) || await db.getUserSession(partnerId);
            if (existing && existing.token && partner.activeToken && existing.token === partner.activeToken) {
                activeToken = existing.token;
            } else {
                activeToken = partner.activeToken || generateToken();
                const now = new Date().toISOString();
                await db.setUserSession(`partner:${partnerId}`, {
                    token: activeToken,
                    role: 'seller_partner',
                    displayName: partner.name || partnerId,
                    companyId: partnerId,
                    loginAt: now,
                    ip: getIp(req)
                });
                await db.savePartnerLock(partnerId, { activeToken, kicked: false, lastSeenAt: now });
            }
        } else {
            await db.savePartnerLock(partnerId, { lastSeenAt: new Date().toISOString() });
        }

        res.json({
            success: true,
            token: activeToken,
            partner: {
                id: partnerId,
                name: partner.name || partnerId,
                boundIp: partner.boundIp,
                boundAt: partner.boundAt,
                sessionVersion: partner.sessionVersion || 1
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/seller/reissue-session — Silent cold-start recovery (NEVER forces logout)
// Called automatically by client when token is lost from DB (Vercel cold start).
// Only works if the partner still has an active WebAuthn device lock.
// Admin can still force-logout by bumping sessionVersion via reset-partner-lock.
app.post('/api/seller/reissue-session', async (req, res) => {
    const { partnerId } = req.body || {};
    if (!partnerId) return res.status(400).json({ success: false, message: 'Partner ID required.' });

    try {
        const partner = await db.getPartnerLock(partnerId);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found.' });
        }

        // Refuse if admin has reset the lock (sessionVersion bump = forced logout signal)
        // We detect this by checking if the partner has no credential (lock was reset)
        if (!partner.webauthnCredentialId) {
            return res.status(403).json({ success: false, adminReset: true, message: 'Device lock was reset by admin. Please re-register.' });
        }

        // Issue a fresh token — device is still hardware-bound, no re-auth needed
        const token = generateToken();
        const now = new Date().toISOString();
        await db.setUserSession(`partner:${partnerId}`, {
            token,
            role: 'seller_partner',
            partnerId: partner.partnerId,
            sessionVersion: partner.sessionVersion || 1,
            loginAt: now,
            ip: getIp(req)
        });
        await db.savePartnerLock(partnerId, { lastSeenAt: now });

        console.log(`[Seller] Session silently reissued for ${partner.name} (cold start recovery).`);
        return res.json({
            success: true,
            token,
            partner: {
                id: partner.partnerId,
                name: partner.name,
                boundIp: partner.boundIp,
                registeredDeviceId: partner.registeredDeviceId,
                webauthnCredentialId: partner.webauthnCredentialId,
                sessionVersion: partner.sessionVersion
            }
        });
    } catch (err) {
        console.error('[Reissue Session Error]', err);
        res.status(500).json({ success: false, message: 'Server error during session reissue.' });
    }
});

// GET /api/master/partner-locks — Admin view of all partner device locks
app.get('/api/master/partner-locks', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    try {
        const locks = await db.getAllPartnerLocks();
        res.json({ success: true, locks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/reset-partner-lock — Admin unbind device lock per partner
app.post('/api/master/reset-partner-lock', async (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.headers['x-admin-key'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026') && masterToken !== 'dash-2026') {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }

    const { partnerId, sessionOnly } = req.body || {};
    if (!partnerId) return res.status(400).json({ success: false, message: 'Partner ID required.' });

    try {
        if (sessionOnly) {
            // FORCE LOGOUT ONLY — clears session token but keeps hardware device lock intact
            await db.deleteUserSession(`partner:${partnerId}`).catch(() => {});
            await db.deleteUserSession(partnerId).catch(() => {});
            await db.deleteSellerSession(partnerId.toUpperCase()).catch(() => {});
            await db.savePartnerLock(partnerId, { kicked: true, activeToken: null, lastSeenAt: null });
            await db.createAuditLog({
                adminUser: 'master_admin', companyId: 'all', category: 'AUTH',
                fieldChanged: 'FORCE_LOGOUT_SESSION_ONLY', previousValue: partnerId, newValue: null,
                reason: `Admin force-logged-out seller ${partnerId} (device lock preserved)`
            }).catch(() => {});
            console.log(`⏏ [Master Admin] Force-logged-out ${partnerId} (device lock intact).`);
            return res.json({
                success: true,
                message: `${partnerId} has been force-logged out. Their device lock is still active — the same device can log back in.`
            });
        }

        // FULL RESET — wipes WebAuthn credential + session (allows any device to re-register)
        const updated = await db.resetPartnerLock(partnerId);
        await db.savePartnerLock(partnerId, { kicked: false, activeToken: null, lastSeenAt: null });
        await db.deleteUserSession(`partner:${partnerId}`).catch(() => {});
        await db.deleteUserSession(partnerId).catch(() => {});
        await db.deleteSellerSession(partnerId.toUpperCase()).catch(() => {});
        await db.createAuditLog({
            adminUser: 'master_admin', companyId: 'all', category: 'AUTH',
            fieldChanged: 'RESET_DEVICE_LOCK', previousValue: partnerId, newValue: null,
            reason: `Admin reset device lock for partner ${partnerId}`
        }).catch(() => {});
        console.log(`🔓 [Master Admin] Reset device lock for ${partnerId}`);
        res.json({
            success: true,
            message: `Device lock fully reset for ${partnerId}. Next login from ANY device will set the new permanent bound device.`,
            partner: updated
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// GET /api/seller/all-tickets — returns ALL tickets from ALL sellers combined (excludes shadow sales)
app.get('/api/seller/all-tickets', requireSeller, async (req, res) => {
    try {
        const all = await db.getAll();
        const normalSales = all.filter(s => s.source !== 'shadow' && !s.isShadow);
        res.json({ success: true, sales: normalSales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/seller/sales — returns sales made by THIS seller only (excludes shadow sales)
app.get('/api/seller/sales', requireSeller, async (req, res) => {
    try {
        const all = await db.getAll();
        const mySales = all.filter(s =>
            (s.generatedBy === req.sellerId || s.prUserId === req.sellerId) &&
            s.source !== 'shadow' && !s.isShadow
        );
        res.json({ success: true, sellerId: req.sellerId, sales: mySales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== SHADOW SALES PANEL ENDPOINTS (/shadowbyash) ====================

const SHADOW_PASSWORD = process.env.SHADOW_PASS || 'ashtu222';
const shadowTokens = new Set();

function requireShadowAuth(req, res, next) {
    const token = req.headers['x-shadow-token'] || req.headers['x-shadow-password'];
    if (token === SHADOW_PASSWORD || shadowTokens.has(token)) {
        return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized Shadow Panel Access.' });
}

// POST /api/shadow/login — Password auth for /shadowbyash
app.post('/api/shadow/login', (req, res) => {
    const { password } = req.body || {};
    if (password !== SHADOW_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid Shadow Access Password.' });
    }

    const shadowToken = `shadow_${crypto.randomBytes(24).toString('hex')}`;
    shadowTokens.add(shadowToken);
    res.json({ success: true, shadowToken });
});

// POST /api/shadow/generate-ticket — Creates genuine ticket tagged as source="shadow"
app.post('/api/shadow/generate-ticket', requireShadowAuth, async (req, res) => {
    const { name, email, phone, gender, ticketType, quantity, amount, event } = req.body || {};

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Customer Name and Email are required.' });
    }

    const qty = parseInt(quantity, 10) || 1;
    const evtName = event || EVENT.name;
    const tType = ticketType || (gender === 'male' ? 'Male Pass' : gender === 'female' ? 'Female Pass' : 'General');
    
    let finalAmount = parseFloat(amount) || 0;
    if (finalAmount === 0) {
        finalAmount = tType.toLowerCase().includes('female') ? PRICING.female * qty : PRICING.male * qty;
    }

    try {
        const orderId = `order_shadow_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();

        // 1. Build QR Code Data URL & Buffer
        const qrDataUrl = await buildQrDataUrl(ticketId);

        // 2. Save Shadow Record in DB (Source = "shadow", isShadow = true)
        const record = {
            orderId,
            ticketId,
            companyId: 'littlane',
            event: evtName,
            name,
            email,
            phone: phone || '',
            gender: gender || 'male',
            quantity: qty,
            amount: finalAmount,
            currency: 'INR',
            status: 'paid',
            paymentId: `pay_shadow_${crypto.randomBytes(6).toString('hex')}`,
            paymentMethod: 'Shadow Private Panel',
            emailStatus: 'pending',
            emailError: null,
            errorLog: [],
            createdAt: generatedAt,
            updatedAt: generatedAt,
            paidAt: generatedAt,
            generatedAt,
            generatedBy: 'Shadow Sale',
            source: 'shadow',
            isShadow: true,
            showInPres: false
        };

        const saved = await db.saveRecord(record);

        // 3. Generate PDF & Deliver Email to Customer
        try {
            const pdfBuffer = await buildTicketPdf(record, qrDataUrl);
            const emailResult = await sendTicketEmail(record, pdfBuffer, qrDataUrl);
            await db.updateSaleRecord(orderId, {
                emailStatus: emailResult.success ? 'sent' : 'failed',
                emailError: emailResult.error || null,
                status: emailResult.success ? 'emailed' : 'paid',
                updatedAt: new Date().toISOString()
            });
        } catch (emailErr) {
            console.error('[Shadow Email Error]', emailErr.message);
            await db.updateSaleRecord(orderId, {
                emailStatus: 'failed',
                emailError: emailErr.message,
                updatedAt: new Date().toISOString()
            });
        }

        console.log(`👻 [Shadow Ticket Issued] Order ${orderId} | Ticket ${ticketId} for ${name} (${email})`);

        res.json({
            success: true,
            orderId,
            ticketId,
            message: 'Shadow Ticket generated and delivered to customer successfully!'
        });
    } catch (err) {
        console.error('[Shadow Generation Error]', err);
        res.status(500).json({ success: false, message: 'Server error generating shadow ticket.' });
    }
});

// GET /api/admin/shadow-sales — Admin view of Shadow Sales only
app.get('/api/admin/shadow-sales', requireAdmin, async (req, res) => {
    try {
        const allSales = await db.getAll();
        const shadowSales = allSales.filter(s => s.source === 'shadow' || s.isShadow === true);
        
        const shadowRevenue = shadowSales.reduce((sum, s) => sum + (s.amount || 0), 0);
        const shadowTicketsSold = shadowSales.reduce((sum, s) => sum + (s.quantity || 1), 0);

        res.json({
            success: true,
            count: shadowSales.length,
            shadowRevenue,
            shadowTicketsSold,
            sales: shadowSales
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/seller-summary — admin can see all sellers' totals
app.get('/api/admin/seller-summary', requireAdmin, async (req, res) => {
    try {
        const all = await db.getAll();
        const paid = all.filter(s =>
            ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)
        );
        const summary = {};
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
                ticketType: s.gender,
                quantity: s.quantity || 1,
                amount: s.amount || 0,
                generatedAt: s.generatedAt,
                status: s.status,
            });
        }
        res.json({ success: true, summary: Object.values(summary) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==================== UNIVERSAL PLATFORM LOGIN & RBAC ====================

// POST /api/auth/login — Unified entry point for all 7 platform roles
// Now creates a persistent UserSession in MongoDB and enforces strict one-device-per-user IP lock.
app.post('/api/auth/login', async (req, res) => {
    const requestIp = getIp(req);
    // Rate limit: 10 attempts per IP per 15 minutes
    const rl = checkLoginRateLimit(requestIp);
    if (!rl.allowed) {
        return res.status(429).json({ success: false, message: `Too many login attempts. Please wait ${rl.resetInSec} seconds before trying again.` });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username/email and password are required.' });
    }

    try {
        const user = await db.getUserById(username);
        if (!user) {
            // Check legacy SELLER_ACCOUNTS fallback
            const sid = username.toUpperCase();
            if (SELLER_ACCOUNTS[sid] && SELLER_ACCOUNTS[sid] === password) {
                const token = generateToken();
                const loginAt = new Date().toISOString();
                await db.setUserSession(sid, { token, ip: requestIp, loginAt, role: 'seller', companyId: 'littlane', displayName: `Seller ${sid}` });
                await db.setSellerSession(sid, { token, ip: requestIp, loginAt });
                return res.json({
                    success: true,
                    token,
                    user: { userId: sid, displayName: `Seller ${sid}`, role: 'seller', companyId: 'littlane' }
                });
            }
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        if (user.blocked) {
            return res.status(403).json({ success: false, message: 'User account is blocked. Contact LITTX Master Admin.' });
        }

        if (user.password !== password) {
            await db.createAuditLog({
                adminUser: username,
                companyId: user.companyId || 'littlane',
                category: 'AUTH',
                fieldChanged: 'LOGIN_ATTEMPT',
                previousValue: null,
                newValue: 'FAILED',
                reason: 'Invalid password entered'
            });
            return res.status(401).json({ success: false, message: 'Invalid password.' });
        }

        // Log successful login
        await db.createAuditLog({
            adminUser: user.userId,
            companyId: user.companyId || 'littlane',
            category: 'AUTH',
            fieldChanged: 'LOGIN_SUCCESS',
            previousValue: null,
            newValue: 'ACTIVE_SESSION',
            reason: `Role ${user.role} logged in from ${requestIp}`
        });

        const token = generateToken();
        const loginAt = new Date().toISOString();

        // Track active UserSession for status dashboard
        await db.setUserSession(user.userId, {
            token,
            ip: requestIp,
            loginAt,
            role: user.role,
            companyId: user.companyId || 'littlane',
            displayName: user.displayName || user.userId
        });
        console.log(`[Auth Login] ${user.userId} (${user.role}) logged in from ${requestIp}`);

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                displayName: user.displayName || user.userId,
                role: user.role,
                companyId: user.companyId || 'littlane',
                allowedPasses: user.allowedPasses || []
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master/global-search?q=query — Universal Search across all platform entities
app.get('/api/master/global-search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
        return res.json({ success: true, results: [] });
    }

    try {
        const query = q.trim().toLowerCase();
        const companies = await db.getAllCompanies();
        const events = await db.getAllEvents();
        const sales = await db.getAll();
        const users = await db.getAllUsers();

        const results = [];

        // Match Companies
        companies.forEach(c => {
            if (c.name.toLowerCase().includes(query) || c.companyId.toLowerCase().includes(query)) {
                results.push({
                    type: 'COMPANY',
                    title: c.name,
                    subtitle: `ID: ${c.companyId} • Status: ${c.status}`,
                    companyId: c.companyId,
                    entityId: c.companyId
                });
            }
        });

        // Match Events
        events.forEach(e => {
            if (e.name.toLowerCase().includes(query) || (e.venue && e.venue.toLowerCase().includes(query))) {
                results.push({
                    type: 'EVENT',
                    title: e.name,
                    subtitle: `Company: ${e.companyId || 'littlane'} • Date: ${e.date || 'TBD'}`,
                    companyId: e.companyId || 'littlane',
                    entityId: e._id || e.name
                });
            }
        });

        // Match Users / PRs
        users.forEach(u => {
            if (u.userId.toLowerCase().includes(query) || (u.displayName && u.displayName.toLowerCase().includes(query))) {
                results.push({
                    type: 'USER',
                    title: u.displayName || u.userId,
                    subtitle: `Role: ${u.role} • Company: ${u.companyId || 'littlane'}`,
                    companyId: u.companyId || 'littlane',
                    entityId: u.userId
                });
            }
        });

        // Match Tickets & Orders & Attendees
        sales.forEach(s => {
            if (
                (s.ticketId && s.ticketId.toLowerCase().includes(query)) ||
                (s.orderId && s.orderId.toLowerCase().includes(query)) ||
                (s.name && s.name.toLowerCase().includes(query)) ||
                (s.email && s.email.toLowerCase().includes(query)) ||
                (s.phone && s.phone.includes(query))
            ) {
                results.push({
                    type: 'TICKET/ORDER',
                    title: `${s.name} (${s.ticketId || s.orderId})`,
                    subtitle: `${s.event || 'Event'} • ₹${s.amount || 0} • Status: ${s.status}`,
                    companyId: s.companyId || 'littlane',
                    entityId: s.ticketId || s.orderId
                });
            }
        });

        res.json({ success: true, results: results.slice(0, 30) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/impersonate — View-As Impersonation API
app.post('/api/master/impersonate', async (req, res) => {
    const { targetCompanyId, targetPrUserId, adminUser = 'LITTX Master Admin' } = req.body || {};
    try {
        await db.createAuditLog({
            adminUser,
            companyId: targetCompanyId || 'all',
            category: 'IMPERSONATION',
            fieldChanged: 'VIEW_AS_SESSION',
            previousValue: null,
            newValue: { targetCompanyId, targetPrUserId },
            reason: `Master Admin impersonated tenant dashboard`
        });

        res.json({
            success: true,
            impersonation: {
                active: true,
                targetCompanyId,
                targetPrUserId,
                startedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// PR user credentials (server-side auth)
const PR_USERS = [
    { id: 'pr1', username: 'partner1', password: process.env.PR1_PASS || 'ftpr@001', displayName: 'Partner One' },
    { id: 'pr2', username: 'partner2', password: process.env.PR2_PASS || 'ftpr@002', displayName: 'Partner Two' },
    { id: 'pr3', username: 'partner3', password: process.env.PR3_PASS || 'ftpr@003', displayName: 'Partner Three' },
    { id: 'pr4', username: 'partner4', password: process.env.PR4_PASS || 'ftpr@004', displayName: 'Partner Four' },
    { id: 'pr5', username: 'partner5', password: process.env.PR5_PASS || 'ftpr@005', displayName: 'Partner Five' },
];

// GET /api/pr/sales?prUserId=xxx — fetch only this partner's tickets
app.get('/api/pr/sales', async (req, res) => {
    const { prUserId } = req.query;
    if (!prUserId) return res.status(400).json({ success: false, message: 'prUserId required' });
    try {
        const all = await db.getAll();
        const sales = all.filter(s => s.prUserId === prUserId);
        res.json({ success: true, sales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/pr/create-order — PR partner initiates a manual cash sale
app.post('/api/pr/create-order', async (req, res) => {
    const { name, email, phone, gender, quantity, prUserId } = req.body || {};
    if (!name || !email || !phone || !gender || !prUserId)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    const computed = computeAmount(gender, quantity);
    if (!computed) return res.status(400).json({ success: false, message: 'Invalid ticket type.' });
    const { amount, qty } = computed;

    try {
        const orderId = `order_pr_${crypto.randomBytes(8).toString('hex')}`;
        const currency = 'INR';
        const ticketId = generateTicketId();

        await db.createSaleRecord({
            orderId,
            event: EVENT.name,
            name, email, phone, gender,
            quantity: qty,
            amount,
            currency,
            status: 'pr_cash_pending',
            paymentId: 'cash_pending',
            ticketId,
            emailStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            prUserId,
            paymentMethod: 'manual',
        });

        res.json({ success: true, orderId, amount, currency, message: 'Cash sale submitted — pending admin approval.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/pr/cash-request — PR partner submits a cash sale for admin approval
app.post('/api/pr/cash-request', async (req, res) => {
    const { name, email, phone, gender, quantity, prUserId, prName, companyId = 'littlane', eventName } = req.body || {};
    if (!name || !email || !phone || !gender || !prUserId)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    // Check Effective Configuration Enforcement
    const config = await db.getEffectiveConfig(companyId, eventName || EVENT.name);
    if (config.companyStatus !== 'ACTIVE') {
        return res.status(403).json({ success: false, message: `Company '${config.companyName}' is currently ${config.companyStatus}. Sales are blocked.` });
    }
    if (!config.effective.prSales.value) {
        return res.status(403).json({ success: false, message: `PR Sales are disabled for ${config.companyName} (Source: ${config.effective.prSales.source}).` });
    }
    if (!config.effective.manual.value) {
        return res.status(403).json({ success: false, message: `Manual/Cash payments are disabled for ${config.companyName} (Source: ${config.effective.manual.source}).` });
    }

    const computed = computeAmount(gender, quantity);
    if (!computed) return res.status(400).json({ success: false, message: 'Invalid ticket type.' });
    const { amount, qty } = computed;

    try {
        const orderId = `order_cash_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();

        await db.createSaleRecord({
            orderId,
            companyId,
            event: eventName || EVENT.name,
            name, email, phone, gender,
            quantity: qty,
            amount,
            currency: 'INR',
            status: 'pr_cash_pending',
            paymentId: 'cash_pending',
            ticketId,
            emailStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            prUserId,
            prName: prName || prUserId,
            paymentMethod: 'cash',
        });

        res.json({ success: true, orderId, message: 'Cash sale submitted for approval.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== MASTER ADMIN COMPANY CONTROL ROUTES ====================

// GET /api/master/companies — List all companies with status & summary
app.get('/api/master/companies', async (req, res) => {
    try {
        const companies = await db.getAllCompanies();
        const sales = await db.getAll();
        
        // Calculate per-company ticket & revenue metrics
        const list = companies.map(c => {
            const companySales = sales.filter(s => (s.companyId || 'littlane') === c.companyId);
            const paid = companySales.filter(s => ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status));
            const revenue = paid.reduce((sum, s) => sum + (s.amount || 0), 0);
            
            // Calculate LITTX fee based on company commercial rules
            let fee = 0;
            if (c.commercials?.feeType === 'PERCENTAGE') {
                fee = (revenue * (c.commercials?.percentageFee || 5)) / 100;
            } else if (c.commercials?.feeType === 'FIXED') {
                fee = paid.length * (c.commercials?.fixedFeePerTicket || 10);
            } else {
                fee = (revenue * (c.commercials?.percentageFee || 5)) / 100 + (paid.length * (c.commercials?.fixedFeePerTicket || 0));
            }

            return {
                ...c,
                stats: {
                    totalOrders: companySales.length,
                    ticketCount: paid.length,
                    grossRevenue: revenue,
                    platformFee: Math.round(fee),
                    netCompanyRevenue: Math.round(revenue - fee)
                }
            };
        });

        res.json({ success: true, companies: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master/companies/:companyId/control-center — Full control state + audit log
app.get('/api/master/companies/:companyId/control-center', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { eventId } = req.query;
        
        const company = await db.getCompanyById(companyId);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        const effectiveConfig = await db.getEffectiveConfig(companyId, eventId);
        const auditLogs = await db.getAuditLogs(companyId);
        const events = (await db.getAllEvents()).filter(e => (e.companyId || 'littlane') === companyId);
        const users = (await db.getAllUsers()).filter(u => (u.companyId || 'littlane') === companyId);

        res.json({
            success: true,
            company,
            effectiveConfig,
            events,
            users,
            auditLogs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/master/companies/:companyId/config — Update company config & feature flags (Log Audit)
app.post('/api/master/companies/:companyId/config', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { updates, adminUser = 'LITTX Master Admin', reason = 'Configuration updated from Master Admin Control Center' } = req.body || {};

        const company = await db.getCompanyById(companyId);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        // Log audit entries for changed keys
        for (const [key, value] of Object.entries(updates)) {
            const prev = company[key];
            if (JSON.stringify(prev) !== JSON.stringify(value)) {
                await db.createAuditLog({
                    adminUser,
                    companyId,
                    category: 'CONFIG_CHANGE',
                    fieldChanged: key,
                    previousValue: prev,
                    newValue: value,
                    reason
                });
            }
        }

        const updatedCompany = await db.updateCompanyConfig(companyId, updates);
        res.json({ success: true, company: updatedCompany });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/companies/:companyId/emergency — Trigger Emergency Switch
app.post('/api/master/companies/:companyId/emergency', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { action, statusReason = 'Emergency control action triggered', adminUser = 'LITTX Master Admin' } = req.body || {};

        const company = await db.getCompanyById(companyId);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        let updates = {};
        if (action === 'SUSPEND_COMPANY') {
            updates = { status: 'SUSPENDED', statusReason };
        } else if (action === 'ACTIVATE_COMPANY') {
            updates = { status: 'ACTIVE', statusReason: '' };
        } else if (action === 'PAUSE_COMPANY') {
            updates = { status: 'PAUSED', statusReason };
        } else if (action === 'DISABLE_ONLINE_PAYMENTS') {
            updates = { 'razorpayConfig.enabled': false, 'razorpayConfig.lockedByMaster': true };
        } else if (action === 'ENABLE_ONLINE_PAYMENTS') {
            updates = { 'razorpayConfig.enabled': true, 'razorpayConfig.lockedByMaster': false };
        } else if (action === 'DISABLE_MANUAL_PAYMENTS') {
            updates = { 'manualPaymentConfig.enabled': false, 'manualPaymentConfig.lockedByMaster': true };
        } else if (action === 'ENABLE_MANUAL_PAYMENTS') {
            updates = { 'manualPaymentConfig.enabled': true, 'manualPaymentConfig.lockedByMaster': false };
        } else if (action === 'DISABLE_PR_SALES') {
            updates = { 'features.prSales.enabled': false, 'features.prSales.lockedByMaster': true };
        } else if (action === 'ENABLE_PR_SALES') {
            updates = { 'features.prSales.enabled': true, 'features.prSales.lockedByMaster': false };
        }

        await db.createAuditLog({
            adminUser,
            companyId,
            category: 'EMERGENCY_ACTION',
            fieldChanged: `EMERGENCY:${action}`,
            previousValue: { status: company.status },
            newValue: updates,
            reason: statusReason
        });

        const updatedCompany = await db.updateCompanyConfig(companyId, updates);
        res.json({ success: true, action, company: updatedCompany });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master/audit-logs — Platform-wide Audit Log
app.get('/api/master/audit-logs', async (req, res) => {
    try {
        const { companyId } = req.query;
        const logs = await db.getAuditLogs(companyId || null);
        res.json({ success: true, auditLogs: logs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/effective-config — Client helper to fetch active permissions
app.get('/api/effective-config', async (req, res) => {
    try {
        const { companyId = 'littlane', eventName } = req.query;
        const config = await db.getEffectiveConfig(companyId, eventName);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// GET /api/admin/pr-approvals — admin sees all pending cash approvals
app.get('/api/admin/pr-approvals', requireAdmin, async (req, res) => {
    try {
        const all = await db.getAll();
        const pending = all.filter(s => s.status === 'pr_cash_pending');
        res.json({ success: true, pending });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/pr-approve — admin approves a cash sale → ticket generated and emailed
app.post('/api/admin/pr-approve', requireAdmin, async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });

    const sale = await db.getByOrderId(orderId);
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    if (sale.status !== 'pr_cash_pending')
        return res.status(400).json({ success: false, message: 'Sale is not pending approval' });

    // Mark paid
    await db.updateSaleRecord(orderId, {
        status: 'paid',
        paymentId: `cash_approved_${Date.now()}`,
        paidAt: new Date().toISOString(),
    });

    // Generate ticket + send email (same flow as normal payment)
    try {
        const tType = sale.gender === 'male' ? 'Male Pass' : 'Female Pass';
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
        const result = await sendTicketEmail({ to: sale.email, name: sale.name, ticketId: sale.ticketId, pdfPath, downloadUrl });

        await db.updateSaleRecord(orderId, {
            emailStatus: result.success ? 'sent' : 'failed',
            emailError: result.success ? null : result.error,
            status: result.success ? 'emailed' : 'email_failed',
        });

        res.json({ success: true, message: result.success ? 'Approved and ticket emailed!' : 'Approved but email failed.' });
    } catch (err) {
        await db.updateSaleRecord(orderId, { status: 'ticket_generation_failed', errorLog: [err.message] });
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/pr-reject — admin rejects a cash sale
app.post('/api/admin/pr-reject', requireAdmin, async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });
    try {
        await db.updateSaleRecord(orderId, { status: 'pr_cash_rejected' });
        res.json({ success: true, message: 'Sale rejected.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== CUSTOMER PORTAL APIS ====================

// POST /api/customer/register — Register new customer account
app.post('/api/customer/register', async (req, res) => {
    const { email, password, name, phone } = req.body || {};
    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'Email, password and name are required.' });
    }

    try {
        const existing = await db.getCustomerByEmail(email);
        if (existing) {
            return res.status(400).json({ success: false, message: 'A customer account with this email already exists.' });
        }

        const customer = await db.createCustomer({ email, password, name, phone });
        res.json({
            success: true,
            user: {
                email: customer.email,
                name: customer.name,
                phone: customer.phone
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/customer/login — Authenticate customer credentials
app.post('/api/customer/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        const customer = await db.getCustomerByEmail(email);
        if (!customer || customer.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const token = generateToken();
        res.json({
            success: true,
            token,
            user: {
                email: customer.email,
                name: customer.name,
                phone: customer.phone,
                role: 'customer'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/customer/events — List all active events for the customer
app.get('/api/customer/events', async (req, res) => {
    try {
        const events = await db.getAllEvents();
        const activeEvents = events.filter(e => !e.archived);
        res.json({ success: true, events: activeEvents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/customer/bookings — List bookings (sales) matching customer's email
app.get('/api/customer/bookings', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    try {
        const allSales = await db.getAll();
        const bookings = allSales.filter(s => s.email && s.email.toLowerCase() === email.toLowerCase());
        res.json({ success: true, bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/customer/book — Book an event ticket (simulated manual checkout, instantly approved/generated for simplicity)
app.post('/api/customer/book', async (req, res) => {
    const { email, name, phone, eventId, ticketTypeName, quantity } = req.body || {};
    if (!email || !name || !eventId || !ticketTypeName) {
        return res.status(400).json({ success: false, message: 'Email, name, eventId, and ticketType are required.' });
    }
    const qty = parseInt(quantity, 10) || 1;

    try {
        const event = await db.getEventById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }

        const ticketType = event.ticketTypes.find(t => t.name === ticketTypeName);
        if (!ticketType) {
            return res.status(400).json({ success: false, message: 'Invalid ticket type.' });
        }

        const amount = ticketType.price * qty;
        const orderId = `order_cust_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();

        await db.createSaleRecord({
            orderId,
            companyId: event.companyId || 'littlane',
            event: event.name,
            name, email, phone: phone || '',
            gender: ticketType.gender || 'unisex',
            quantity: qty, amount, currency: 'INR',
            status: 'paid', paymentId: 'customer_checkout', ticketId,
            emailStatus: 'pending', emailError: null, errorLog: [],
            createdAt: generatedAt, paidAt: generatedAt, generatedAt,
            generatedBy: 'Customer',
            scannedBy: null, scannedAt: null
        });

        // Build PDF and QR
        const pdfPath = await buildTicketPdf({
            ticketId,
            name,
            email,
            gender: ticketTypeName,
            quantity: qty,
            amount,
            createdAt: generatedAt,
            event: event.name
        });
        const qrBuffer = await buildQrBuffer(ticketId);
        const qrDataUrl = await buildQrDataUrl(ticketId);

        await db.updateSaleRecord(orderId, { status: 'ticket_generated' });

        const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;

        // Send Email
        const emailResult = await sendTicketEmail({
            to: email,
            name,
            ticketId,
            gender: ticketTypeName,
            quantity: qty,
            amount,
            pdfPath,
            qrBuffer,
            downloadUrl,
            event: event.name
        });

        if (emailResult.success) {
            await db.updateSaleRecord(orderId, { status: 'emailed', emailStatus: 'sent', emailError: null, emailPreviewUrl: emailResult.previewUrl || null });
        } else {
            await db.updateSaleRecord(orderId, {
                status: 'email_failed',
                emailStatus: 'failed',
                emailError: emailResult.error,
                errorLog: [{ at: new Date().toISOString(), stage: 'email', error: emailResult.error }]
            });
        }

        res.json({
            success: true,
            ticket: {
                id: ticketId,
                orderId,
                event: event.name,
                attendee: name,
                email,
                phone,
                ticketType: ticketTypeName,
                price: amount.toString(),
                qty,
                generatedAt,
                downloadUrl,
                qrDataUrl
            }
        });
    } catch (err) {
        console.error('[customer-book] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
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


const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n🎟  ${EVENT.name} ticketing server running on port ${PORT}`);
        console.log(`   Payment mode: Manual / Cash only`);
        console.log(`   Admin dashboard: ${BASE_URL}/dashboard  (key required)\n`);
    });
}
module.exports = app;

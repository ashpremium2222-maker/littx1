require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');
const { atomicClaimOrder } = db;
const { EVENT_NAME, EVENT_DETAILS, generateTicketId, buildTicketPdf, buildQrDataUrl, buildQrBuffer, TICKETS_DIR } = require('./ticket');
const { sendTicketEmail } = require('./mailer');

const app = express();
app.use(cors());
app.use(express.json());

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

// In-memory session store: sellerId -> { token, loginAt, ip }
// On server restart sessions clear (force re-login).
const sellerSessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Returns sellerId if token is valid AND IP matches, null otherwise
// Pass requestIp to enforce IP lock; omit to skip IP check (e.g. logout)
function authenticateSeller(token, requestIp) {
    if (!token) return null;
    for (const [id, session] of Object.entries(sellerSessions)) {
        if (session && session.token === token) {
            // IP lock: if requestIp provided, it must match the login IP
            if (requestIp && session.ip && session.ip !== 'unknown') {
                if (session.ip !== requestIp) {
                    return '__IP_MISMATCH__';
                }
            }
            return id;
        }
    }
    return null;
}

function requireSeller(req, res, next) {
    const token = req.headers['x-seller-token'] || req.query.sellerToken;
    const requestIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const sellerId = authenticateSeller(token, requestIp);
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

function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key || req.body?.key;
    const managerToken = process.env.MANAGER_TOKEN || 'dash-2026';
    if (key === ADMIN_KEY || key === managerToken) {
        req.isManager = key === managerToken; // Flag if it's the manager
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized. Invalid admin key.' });
    }
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
    const sales = await db.getAll();
    const summary = {
        totalOrders: sales.length,
        paidOrders: sales.filter(s => ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)).length,
        totalRevenue: sales.filter(s => ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)).reduce((sum, s) => sum + (s.amount || 0), 0),
        emailFailures: sales.filter(s => s.emailStatus === 'failed').length,
        ticketFailures: sales.filter(s => s.status === 'ticket_generation_failed').length
    };
    res.json({ success: true, summary, sales });
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
    res.json({ success: true, event: EVENT.name, pricing: PRICING });
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
            const sid = authenticateSeller(sellerToken);
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

    try {
        const sale = await db.getByTicketId(ticketId);
        if (!sale) {
            return res.json({ result: 'not_found' });
        }

        if (sale.status === 'cancelled') {
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

        await db.updateSaleRecord(sale.orderId, {
            status: 'scanned',
            scannedBy: scannedBy || 'Gate Staff',
            scannedAt: scannedAtStr
        });

        const updatedSale = await db.getByOrderId(sale.orderId);

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
app.get('/api/active-events', (req, res) => {
    const token = req.headers['x-seller-token'] || req.query.sellerToken;
    const sellerId = authenticateSeller(token);
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

// POST /api/seller/login — validate credentials, issue token, enforce 1-session-per-seller
app.post('/api/seller/login', (req, res) => {
    const { sellerId, password } = req.body || {};
    if (!sellerId || !password) {
        return res.status(400).json({ success: false, message: 'Seller ID and password are required.' });
    }
    const expected = SELLER_ACCOUNTS[sellerId.toUpperCase()];
    if (!expected || expected !== password) {
        return res.status(401).json({ success: false, message: 'Invalid Seller ID or password.' });
    }
    const sid = sellerId.toUpperCase();
    const token = generateToken();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    // Check if already locked to a different IP
    const existing = sellerSessions[sid];
    if (existing && existing.ip && existing.ip !== 'unknown' && existing.ip !== ip) {
        console.log(`[Seller Login BLOCKED] ${sid} attempted from ${ip}, locked to ${existing.ip}`);
        return res.status(403).json({
            success: false,
            ipLocked: true,
            lockedIp: existing.ip,
            message: `This account is already logged in from another device (${existing.ip}). Ask admin to unlock.`
        });
    }
    sellerSessions[sid] = { token, loginAt: new Date().toISOString(), ip };
    console.log(`[Seller Login] ${sid} logged in from ${ip} — session IP-locked`);
    res.json({ success: true, sellerId: sid, token, loginAt: sellerSessions[sid].loginAt, lockedIp: ip });
});

// POST /api/seller/logout — invalidate session
app.post('/api/seller/logout', (req, res) => {
    const token = req.headers['x-seller-token'] || req.body?.token;
    const sid = authenticateSeller(token);
    if (sid) {
        delete sellerSessions[sid];
        console.log(`[Seller Logout] ${sid} logged out`);
    }
    res.json({ success: true });
});

// GET /api/seller/verify — check if session is still valid + enforce IP lock
app.get('/api/seller/verify', (req, res) => {
    const token = req.headers['x-seller-token'] || req.query.token;
    const requestIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const sid = authenticateSeller(token, requestIp);
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
    res.json({ success: true, sellerId: sid, loginAt: sellerSessions[sid]?.loginAt, lockedIp: sellerSessions[sid]?.ip });
});

// ==================== MASTER ADMIN — SELLER SESSION CONTROL ====================

// GET /api/master/seller-sessions — view all active seller sessions + their locked IPs
app.get('/api/master/seller-sessions', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const sessions = Object.entries(sellerSessions).map(([sid, s]) => ({
        sellerId: sid,
        lockedIp: s.ip,
        loginAt: s.loginAt,
        active: true
    }));
    res.json({ success: true, sessions });
});

// DELETE /api/master/seller-sessions/:sellerId — kick/unlock a seller (force logout + clear IP lock)
app.delete('/api/master/seller-sessions/:sellerId', (req, res) => {
    const masterToken = req.headers['x-master-token'] || req.query.masterToken;
    if (masterToken !== (process.env.MASTER_TOKEN || 'littx-master-2026')) {
        return res.status(401).json({ success: false, message: 'Not authorized.' });
    }
    const sid = req.params.sellerId.toUpperCase();
    if (!SELLER_ACCOUNTS[sid]) {
        return res.status(404).json({ success: false, message: 'Seller not found.' });
    }
    const wasLocked = !!sellerSessions[sid];
    delete sellerSessions[sid];
    console.log(`[Master Admin] Kicked & unlocked ${sid}`);
    res.json({ success: true, message: `${sid} session cleared. They can now log in from any device.`, wasActive: wasLocked });
});

// GET /api/seller/all-tickets — returns ALL tickets from ALL sellers combined (for shared dashboard)
app.get('/api/seller/all-tickets', requireSeller, async (req, res) => {
    try {
        const all = await db.getAll();
        res.json({ success: true, sales: all });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/seller/sales — returns sales made by THIS seller only
app.get('/api/seller/sales', requireSeller, async (req, res) => {
    try {
        const all = await db.getAll();
        const mySales = all.filter(s =>
            s.generatedBy === req.sellerId || s.prUserId === req.sellerId
        );
        res.json({ success: true, sellerId: req.sellerId, sales: mySales });
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
app.post('/api/auth/login', async (req, res) => {
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
                return res.json({
                    success: true,
                    token,
                    user: {
                        userId: sid,
                        displayName: `Seller ${sid}`,
                        role: 'seller',
                        companyId: 'littlane'
                    }
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
            reason: `Role ${user.role} logged in`
        });

        const token = generateToken();
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

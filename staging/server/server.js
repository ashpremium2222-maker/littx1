require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
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

// Vercel may invoke an API route before the module-level MongoDB connection
// has completed. Awaiting the shared connection here avoids Mongoose's
// "buffering timed out" failure on cold starts.
app.use('/api', async (req, res, next) => {
    if (!db.hasConfiguredMongo) return next();

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

// ==================== EVENT & PRICING ====================
const EVENT = { name: EVENT_NAME };
const PRICING = {
    female: 599,
    male: 699
};

// ==================== RAZORPAY SETUP ====================
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const TEST_MODE = !RZP_KEY_ID || !RZP_KEY_SECRET;

let razorpay = null;
if (!TEST_MODE) {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
} else {
    console.warn('[Payments] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — running in TEST MODE (no real money is charged). See server/.env.example.');
}

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-admin-key';
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// ==================== LITTX SELLER ACCOUNTS (max 3 devices) ====================
// 3 hardcoded seller IDs + passwords. Each seller can only have 1 active session at a time.
// Adjust passwords here or move to env vars for production.
const SELLER_ACCOUNTS = {
    'SELLER-A': process.env.SELLER_A_PASS || 'littx-a-2026',
    'SELLER-B': process.env.SELLER_B_PASS || 'littx-b-2026',
    'SELLER-C': process.env.SELLER_C_PASS || 'littx-c-2026',
};

// In-memory session store: sellerId -> { token, loginAt, ip }
// On server restart sessions clear (force re-login).
const sellerSessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Returns sellerId if token is valid, null otherwise
function authenticateSeller(token) {
    if (!token) return null;
    for (const [id, session] of Object.entries(sellerSessions)) {
        if (session && session.token === token) return id;
    }
    return null;
}

function requireSeller(req, res, next) {
    const token = req.headers['x-seller-token'] || req.query.sellerToken;
    const sellerId = authenticateSeller(token);
    if (!sellerId) {
        return res.status(401).json({ success: false, message: 'Seller not authenticated. Please log in.' });
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

// Public ticket view — /view/:ticketId — linked from emails
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
function computeAmount(gender, quantity) {
    const rate = PRICING[gender];
    if (!rate) return null;
    const qty = Math.max(1, Math.min(20, parseInt(quantity, 10) || 1));
    return { amount: rate * qty, qty };
}

// In-memory token store for unified auth sessions (populated by /api/auth/login)
const platformAuthTokens = new Set();

function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key;
    const token = req.headers['x-auth-token'];
    const isPres = req.headers['x-presentation'] === 'true' || req.query.pres === 'true';

    if (isPres) {
        if (req.method === 'GET' && key === 'ftlittx26') {
            return next();
        }
        return res.status(401).json({ success: false, message: 'Access Denied: Use the presentation password.' });
    }

    // Accept ADMIN_KEY (legacy)
    if (key && key === ADMIN_KEY) return next();

    // Accept unified auth tokens issued by /api/auth/login (master_admin or company_admin)
    if (token && platformAuthTokens.has(token)) return next();

    return res.status(401).json({ success: false, message: 'Access Denied: Invalid admin credentials.' });
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
        let orderId, currency = 'INR';

        if (TEST_MODE) {
            orderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            const order = await razorpay.orders.create({
                amount: amount * 100, // paise
                currency,
                receipt: `ft_${Date.now()}`
            });
            orderId = order.id;
        }

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
            testMode: TEST_MODE,
            orderId,
            amount,
            currency,
            keyId: RZP_KEY_ID || null,
            event: EVENT.name
        });
    } catch (err) {
        const details = err.error?.description || err.message || JSON.stringify(err);
        console.error(`[create-order] Error (status ${err.statusCode || 'n/a'}):`, details);
        res.status(err.statusCode === 401 ? 401 : 500).json({
            success: false,
            message: err.statusCode === 401
                ? 'Payment gateway rejected our credentials. Check RAZORPAY_KEY_ID/SECRET in server/.env.'
                : 'Could not start checkout. Please try again.'
        });
    }
});

// ==================== 2. VERIFY PAYMENT (after gateway completes) ====================
app.post('/api/verify-payment', async (req, res) => {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};

    const sale = await db.getByOrderId(orderId);
    if (!sale) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    try {
        let paymentId = razorpay_payment_id;

        if (TEST_MODE) {
            paymentId = paymentId || `pay_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            const expectedSignature = crypto
                .createHmac('sha256', RZP_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                await db.updateSaleRecord(orderId, {
                    status: 'failed',
                    errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'verify-payment', error: 'Signature mismatch' }]
                });
                return res.status(400).json({ success: false, message: 'Payment verification failed (signature mismatch).' });
            }
        }

        // Attempt to atomically claim the order
        let updatedSale = await atomicClaimOrder(orderId, paymentId);
        
        // If we couldn't claim it, it means the webhook (or another request) already did.
        if (!updatedSale) {
            console.log(`[verify-payment] Order ${orderId} already claimed — waiting for ticket generation if needed.`);
            
            // Wait up to 5 seconds for the ticket ID to be generated by the webhook
            let currentSale = await db.getByOrderId(orderId);
            let attempts = 0;
            while (currentSale.status === 'paid' && !currentSale.ticketId && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                currentSale = await db.getByOrderId(orderId);
                attempts++;
            }

            // Build missing fields for the frontend success modal
            const downloadUrl = `${BASE_URL}/api/ticket/${currentSale.ticketId}/download`;
            const qrDataUrl = currentSale.ticketId ? await buildQrDataUrl(currentSale.ticketId).catch(() => '') : '';

            return res.json({
                success: true,
                ticketId: currentSale.ticketId,
                downloadUrl,
                qrDataUrl,
                emailSent: currentSale.emailStatus === 'sent',
                emailError: currentSale.emailError,
                event: currentSale.event || EVENT.name,
                name: currentSale.name,
                email: currentSale.email,
                gender: currentSale.gender,
                quantity: currentSale.quantity,
                amount: currentSale.amount,
                generatedAt: currentSale.generatedAt || currentSale.paidAt,
                details: EVENT_DETAILS,
                alreadyProcessed: true
            });
        }

        // If we successfully claimed it, WE generate the ticket
        const ticketId = generateTicketId();
        const generatedAt = new Date().toISOString();
        let pdfPath, qrBuffer, qrDataUrl;
        try {
            pdfPath = await buildTicketPdf({
                ticketId,
                name: sale.name,
                email: sale.email,
                gender: sale.gender,
                quantity: sale.quantity,
                amount: sale.amount,
                createdAt: generatedAt,
                event: sale.event || 'FRESHERS TAKEOVER'
            });
            qrBuffer = await buildQrBuffer(ticketId);
            qrDataUrl = await buildQrDataUrl(ticketId);
            await db.updateSaleRecord(orderId, { status: 'ticket_generated', ticketId, generatedAt });
        } catch (genErr) {
            console.error('[verify-payment] Ticket generation failed:', genErr.message);
            await db.updateSaleRecord(orderId, {
                status: 'ticket_generation_failed',
                errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'ticket_generation', error: genErr.message }]
            });
            return res.status(500).json({
                success: false,
                message: 'Payment succeeded but ticket generation failed. Our team has been notified — contact support with your payment ID.',
                paymentId
            });
        }

        const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;

        // ---- Email the ticket ----
        const emailResult = await sendTicketEmail({
            to: sale.email,
            name: sale.name,
            ticketId,
            gender: sale.gender,
            quantity: sale.quantity,
            amount: sale.amount,
            pdfPath,
            qrBuffer,
            downloadUrl,
            event: sale.event || 'FRESHERS TAKEOVER'
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

        console.log(`[Ticket Issued] ${ticketId} for ${sale.email} | email ${emailResult.success ? 'sent ✅' : 'FAILED ❌ (' + emailResult.error + ')'}`);

        res.json({
            success: true,
            ticketId,
            downloadUrl,
            qrDataUrl,
            emailSent: emailResult.success,
            emailError: emailResult.success ? null : emailResult.error,
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
            status: 'failed',
            errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'verify-payment', error: err.message }]
        });
        res.status(500).json({ success: false, message: 'Something went wrong verifying your payment. Please contact support.' });
    }
});

// ==================== 2B. RAZORPAY WEBHOOK ====================
const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

app.post('/api/webhook/razorpay', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        if (!signature || !RZP_WEBHOOK_SECRET) {
            return res.status(400).send('Missing signature or secret');
        }

        const expectedSignature = crypto
            .createHmac('sha256', RZP_WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (expectedSignature !== signature) {
            console.error('[webhook] Invalid signature');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body.event;
        if (event === 'order.paid' || event === 'payment.captured') {
            const paymentEntity = req.body.payload.payment.entity;
            const orderId = paymentEntity.order_id;
            const paymentId = paymentEntity.id;

            if (!orderId) {
                return res.status(200).send('No order ID');
            }

            // ATOMIC CLAIM — only one concurrent webhook can ever win this race.
            // If status is no longer 'created', atomicClaimOrder returns null and we stop.
            const sale = await atomicClaimOrder(orderId, paymentId);
            if (!sale) {
                console.log(`[webhook] Order ${orderId} already claimed by another process — skipping duplicate.`);
                return res.status(200).send('Already processed');
            }
            
            const ticketId = generateTicketId();
            const generatedAt = new Date().toISOString();
            let pdfPath, qrBuffer, qrDataUrl;
            
            try {
                pdfPath = await buildTicketPdf({
                    ticketId, name: sale.name, email: sale.email, gender: sale.gender,
                    quantity: sale.quantity, amount: sale.amount, createdAt: generatedAt,
                    event: sale.event || 'FRESHERS TAKEOVER'
                });
                qrBuffer = await buildQrBuffer(ticketId);
                qrDataUrl = await buildQrDataUrl(ticketId);
                await db.updateSaleRecord(orderId, { status: 'ticket_generated', ticketId, generatedAt });
            } catch (genErr) {
                console.error('[webhook] Ticket generation failed:', genErr.message);
                await db.updateSaleRecord(orderId, {
                    status: 'ticket_generation_failed',
                    errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'ticket_generation', error: genErr.message }]
                });
                return res.status(200).send('Ticket gen failed');
            }

            const downloadUrl = `${BASE_URL}/api/ticket/${ticketId}/download`;

            const emailResult = await sendTicketEmail({
                to: sale.email, name: sale.name, ticketId, gender: sale.gender,
                quantity: sale.quantity, amount: sale.amount, pdfPath, qrBuffer,
                downloadUrl, event: sale.event || 'FRESHERS TAKEOVER'
            });

            if (emailResult.success) {
                await db.updateSaleRecord(orderId, { status: 'emailed', emailStatus: 'sent', emailError: null, emailPreviewUrl: emailResult.previewUrl || null });
            } else {
                await db.updateSaleRecord(orderId, {
                    status: 'email_failed', emailStatus: 'failed', emailError: emailResult.error,
                    errorLog: [...(sale.errorLog || []), { at: new Date().toISOString(), stage: 'email', error: emailResult.error }]
                });
            }
            console.log(`[Webhook Ticket Issued] ${ticketId} for ${sale.email}`);
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[webhook error]', err);
        res.status(500).send('Webhook Error');
    }
});

// ==================== 3. PUBLIC TICKET VIEW (JSON for /view/:ticketId page) ====================
app.get('/api/ticket/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    if (!ticketId) return res.status(400).json({ success: false, message: 'Ticket ID required' });
    const sale = await db.getByTicketId(ticketId);
    if (!sale) return res.status(404).json({ success: false, message: 'Ticket not found. Please check the link or contact support.' });

    // Build event details (mirrors ticket.js)
    const isAura = sale.event && sale.event.toUpperCase().includes('AURA');
    const dateLabel = isAura
        ? '14 AUG 2026 · 7:00 PM'
        : '05 AUG 2026 · 4:00 PM';
    const venue = 'Flo The Brewery, Hinjewadi, Pune';
    const gLabel = { female: 'Female Pass', male: 'Male Pass', aura: 'Aura Genesis', exclusive: 'Exclusive VIP Pass' };

    res.json({
        success: true,
        ticket: {
            ticketId: sale.ticketId,
            event: sale.event || 'FRESHERS TAKEOVER',
            name: sale.name,
            attendee: sale.name,
            email: sale.email,
            phone: sale.phone,
            dateLabel,
            venue,
            ticketType: sale.ticketType || gLabel[sale.gender] || (sale.gender === 'female' ? 'Female Pass' : 'Male Pass'),
            amount: sale.amount,
            quantity: sale.quantity || 1,
            status: sale.scannedAt ? 'scanned' : 'paid',
            scannedAt: sale.scannedAt,
            generatedAt: sale.generatedAt || sale.createdAt
        }
    });
});

// ==================== 3b. TICKET DOWNLOAD ====================
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
    res.json({ success: true, testMode: TEST_MODE, summary, sales });
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
    res.json({ success: true, event: EVENT.name, pricing: PRICING, testMode: TEST_MODE });
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

// ==================== SHADOW SALES PANEL ENDPOINTS (/shadowbyash) ====================

const SHADOW_PASSWORD = process.env.SHADOW_PASS || 'ashtu222';
const shadowTokens = new Set();

function requireShadowAuth(req, res, next) {
    const token = req.headers['x-shadow-token'] || req.headers['x-shadow-password'];
    if (token) {
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

        // 1. Save Shadow Record immediately — this is the source of truth
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

        await db.createSaleRecord(record);

        console.log(`👻 [Shadow Ticket Issued] Order ${orderId} | Ticket ${ticketId} for ${name} (${email})`);

        // 2. Respond immediately so the client never times out
        res.json({
            success: true,
            orderId,
            ticketId,
            message: 'Shadow Ticket created! Sending email in the background...'
        });

        // 3. Do PDF generation & email delivery in the background (non-blocking)
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
                event: evtName
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
                source: 'shadow',
                isShadow: true,
                emailStatus: emailResult.success ? 'sent' : 'failed',
                emailError: emailResult.error || null,
                updatedAt: new Date().toISOString()
            });
        } catch (emailErr) {
            console.error('[Shadow Email Error]', emailErr.message);
            await db.updateSaleRecord(orderId, {
                source: 'shadow',
                isShadow: true,
                emailStatus: 'failed',
                emailError: emailErr.message,
                updatedAt: new Date().toISOString()
            }).catch(() => {});
        }
    } catch (err) {
        console.error('[Shadow Generation Error]', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server error generating shadow ticket.' });
        }
    }
});

// GET /api/admin/shadow-sales — Admin view of Shadow Sales (returns all sales records so nothing disappears)
app.get('/api/admin/shadow-sales', async (req, res) => {
    try {
        const shadowSales = await db.getAll();
        
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

// GET /api/debug/db-status — Shows DB connection mode and record count (for debugging)
app.get('/api/debug/db-status', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isConnected = mongoose.connection.readyState === 1;
        
        // Obfuscate URI for display
        const rawUri = process.env.MONGODB_URI || 'not-set (falling back to localhost)';
        let displayUri = rawUri;
        if (rawUri.includes('@')) {
            displayUri = rawUri.replace(/\/\/.*@/, '//****:****@');
        }

        const all = await db.getAll();
        res.json({
            success: true,
            dbMode: isConnected ? 'MongoDB' : 'Mock (in-memory/file)',
            mongoState: mongoose.connection.readyState,
            uriInUse: displayUri,
            totalRecords: all.length,
            sampleRecords: all.slice(0, 5).map(s => ({
                orderId: s.orderId,
                name: s.name,
                status: s.status,
                source: s.source,
                isShadow: s.isShadow,
                createdAt: s.createdAt
            }))
        });
    } catch (err) {
        const mongoose = require('mongoose');
        const rawUri = process.env.MONGODB_URI || 'not-set (falling back to localhost)';
        let displayUri = rawUri;
        if (rawUri.includes('@')) {
            displayUri = rawUri.replace(/\/\/.*@/, '//****:****@');
        }
        res.status(500).json({ 
            success: false, 
            message: err.message,
            mongoState: mongoose.connection.readyState,
            uriInUse: displayUri
        });
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
app.get('/api/health', (req, res) => res.json({ success: true, event: EVENT.name, testMode: TEST_MODE }));

// ==================== EVENTS LIST ====================
// GET /api/events — returns the active event list for the dashboard event breakdown UI
app.get('/api/events', (req, res) => {
    res.json({
        success: true,
        events: [{ name: EVENT.name, gradient: 'linear-gradient(135deg,#7C5CFA 0%,#38D9C4 100%)' }]
    });
});

// GET /api/admin/sellers — dynamic seller list derived from sales records
app.get('/api/admin/sellers', async (req, res) => {
    try {
        const all = await db.getAll();
        const sellerSet = new Set();
        all.forEach(s => {
            const who = s.generatedBy || s.prUserId || null;
            if (who) sellerSet.add(who);
        });
        // Also include configured seller accounts
        Object.keys(SELLER_ACCOUNTS).forEach(id => sellerSet.add(id));
        res.json({ success: true, sellers: Array.from(sellerSet) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== MASTER ADMIN COMPANY PORTAL / GOVERNANCE API ====================
// GET /api/master/companies — returns all companies with aggregated stats
app.get('/api/master/companies', async (req, res) => {
    try {
        const list = await db.getAllCompanies();
        const allSales = await db.getAll();
        const paidSales = allSales.filter(s => ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status));

        const companiesWithStats = list.map(c => {
            const companySales = paidSales.filter(s => s.companyId === c.companyId);
            const totalOrders = companySales.length;
            const ticketCount = companySales.reduce((acc, s) => acc + (s.quantity || 1), 0);
            const grossRevenue = companySales.reduce((acc, s) => acc + (s.amount || 0), 0);

            return {
                ...c,
                stats: {
                    totalOrders,
                    ticketCount,
                    grossRevenue
                }
            };
        });

        res.json({ success: true, companies: companiesWithStats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master/companies/:id/control-center — details, overrides, and logs for one company
app.get('/api/master/companies/:id/control-center', async (req, res) => {
    const { id } = req.params;
    try {
        const company = await db.getCompanyById(id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        const effectiveConfig = await db.getEffectiveConfig(id);
        const allEvents = await db.getAllEvents();
        const events = allEvents.filter(e => e.companyId === id);
        const auditLogs = await db.getAuditLogs(id);

        res.json({
            success: true,
            company,
            effectiveConfig: effectiveConfig.effective,
            events,
            auditLogs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/companies/:id/config — updates company settings and logs governance action
app.post('/api/master/companies/:id/config', async (req, res) => {
    const { id } = req.params;
    const { updates, adminUser, reason } = req.body || {};
    try {
        const old = await db.getCompanyById(id);
        if (!old) return res.status(404).json({ success: false, message: 'Company not found' });

        const updated = await db.updateCompanyConfig(id, updates);
        await db.createAuditLog({
            companyId: id,
            action: 'UPDATE_CONFIG',
            performedBy: adminUser || 'Master Admin',
            details: `Updated company parameters. Reason: ${reason || 'Governance Update'}`
        });

        res.json({ success: true, company: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/master/companies/:id/emergency — locks or shuts down operations instantly
app.post('/api/master/companies/:id/emergency', async (req, res) => {
    const { id } = req.params;
    const { action, statusReason, adminUser } = req.body || {};
    try {
        const company = await db.getCompanyById(id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        let status = company.status;
        if (action === 'LOCK_PLATFORM') status = 'SUSPENDED';
        else if (action === 'ACTIVATE_PLATFORM') status = 'ACTIVE';

        const updated = await db.updateCompanyConfig(id, { status, statusReason });
        await db.createAuditLog({
            companyId: id,
            action,
            performedBy: adminUser || 'Master Admin',
            details: `Emergency Governance action triggered: ${action}. Reason: ${statusReason}`
        });

        res.json({ success: true, company: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== UNIVERSAL PLATFORM LOGIN ====================
// POST /api/auth/login — unified entry point for all platform roles.
// Called by LoginPage.tsx (the portal with the credential switcher at the bottom).
const PLATFORM_USERS = [
    {
        userId: 'superadmin@littx.in',
        password: process.env.MASTER_PASS || 'littx-master-2026',
        displayName: 'Master Admin',
        role: 'master_admin',
        companyId: 'littx'
    },
    {
        userId: 'admin@littlane.in',
        password: process.env.COMPANY_PASS || 'littlane-2026',
        displayName: 'Littlane Admin',
        role: 'company_admin',
        companyId: 'littlane'
    },
];

const PR_USERS_AUTH = [
    { username: 'partner1', password: process.env.PR1_PASS || 'ftpr@001', displayName: 'Partner One', id: 'pr1' },
    { username: 'partner2', password: process.env.PR2_PASS || 'ftpr@002', displayName: 'Partner Two', id: 'pr2' },
    { username: 'partner3', password: process.env.PR3_PASS || 'ftpr@003', displayName: 'Partner Three', id: 'pr3' },
    { username: 'partner4', password: process.env.PR4_PASS || 'ftpr@004', displayName: 'Partner Four', id: 'pr4' },
    { username: 'partner5', password: process.env.PR5_PASS || 'ftpr@005', displayName: 'Partner Five', id: 'pr5' },
];

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    // 1. Check platform users (master_admin, company_admin)
    const platformUser = PLATFORM_USERS.find(
        u => u.userId.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (platformUser) {
        const token = generateToken();
        // Register this token so requireAdmin accepts x-auth-token from the frontend
        platformAuthTokens.add(token);
        return res.json({
            success: true,
            token,
            user: {
                userId: platformUser.userId,
                displayName: platformUser.displayName,
                role: platformUser.role,
                companyId: platformUser.companyId
            }
        });
    }

    // 2. Check PR partners
    const prUser = PR_USERS_AUTH.find(
        u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (prUser) {
        const token = generateToken();
        return res.json({
            success: true,
            token,
            user: {
                userId: prUser.id,
                displayName: prUser.displayName,
                role: 'pr',
                companyId: 'littlane'
            }
        });
    }

    // 3. Check sellers
    const sid = username.toUpperCase();
    if (SELLER_ACCOUNTS[sid] && SELLER_ACCOUNTS[sid] === password) {
        const token = generateToken();
        sellerSessions[sid] = { token, loginAt: new Date().toISOString() };
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

    return res.status(401).json({ success: false, message: 'Invalid credentials. Check username and password.' });
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
    sellerSessions[sid] = { token, loginAt: new Date().toISOString(), ip };
    console.log(`[Seller Login] ${sid} logged in from ${ip}`);
    res.json({ success: true, sellerId: sid, token, loginAt: sellerSessions[sid].loginAt });
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

// GET /api/seller/verify — check if session is still valid
app.get('/api/seller/verify', (req, res) => {
    const token = req.headers['x-seller-token'] || req.query.token;
    const sid = authenticateSeller(token);
    if (!sid) {
        return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
    }
    res.json({ success: true, sellerId: sid, loginAt: sellerSessions[sid]?.loginAt });
});

// GET /api/seller/sales — returns sales made by THIS seller
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


// ==================== PR PARTNER PORTAL ROUTES ====================

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

// POST /api/pr/create-order — PR partner initiates a Razorpay payment for a customer
app.post('/api/pr/create-order', async (req, res) => {
    const { name, email, phone, gender, quantity, prUserId } = req.body || {};
    if (!name || !email || !phone || !gender || !prUserId)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    const computed = computeAmount(gender, quantity);
    if (!computed) return res.status(400).json({ success: false, message: 'Invalid ticket type.' });
    const { amount, qty } = computed;

    try {
        let orderId, currency = 'INR';
        if (TEST_MODE) {
            orderId = `order_pr_test_${crypto.randomBytes(8).toString('hex')}`;
        } else {
            const order = await razorpay.orders.create({
                amount: amount * 100,
                currency: 'INR',
                receipt: `pr_${Date.now()}`,
            });
            orderId = order.id;
        }

        const ticketId = generateTicketId();
        await db.createSaleRecord({
            orderId,
            event: EVENT.name,
            name, email, phone, gender,
            quantity: qty,
            amount,
            currency,
            status: 'created',
            paymentId: null,
            ticketId,
            emailStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            prUserId,
            paymentMethod: 'razorpay',
        });

        res.json({ success: true, orderId, amount, currency, keyId: RZP_KEY_ID || 'test_key' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/pr/cash-request — PR partner submits a cash sale for admin approval
app.post('/api/pr/cash-request', async (req, res) => {
    const { name, email, phone, gender, quantity, prUserId, prName } = req.body || {};
    if (!name || !email || !phone || !gender || !prUserId)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });

    const computed = computeAmount(gender, quantity);
    if (!computed) return res.status(400).json({ success: false, message: 'Invalid ticket type.' });
    const { amount, qty } = computed;

    try {
        const orderId = `order_cash_${crypto.randomBytes(8).toString('hex')}`;
        const ticketId = generateTicketId();

        await db.createSaleRecord({
            orderId,
            event: EVENT.name,
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
app.listen(PORT, () => {
    console.log(`\n🎟  ${EVENT.name} ticketing server running on port ${PORT}`);
    console.log(`   Mode: ${TEST_MODE ? 'TEST MODE (no real payments)' : 'LIVE (Razorpay)'}`);
    console.log(`   Admin dashboard: ${BASE_URL}/dashboard  (key required)\n`);
});

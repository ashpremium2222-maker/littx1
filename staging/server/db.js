const mongoose = require('mongoose');
const os = require('os');

// We fall back to a local mongodb URI if none is set in env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/littx';

mongoose.connect(MONGODB_URI)
  .then(async () => {
      console.log('✅ Connected to MongoDB');
      await seedDefaultUsers();
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==================== SCHEMAS ====================

const EventSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    companyId: { type: String, default: 'littlane' },
    // Custom string ID (for frontend reference)
    id: { type: String },
    date: { type: String },
    time: { type: String },
    venue: { type: String },
    stage: { type: String },
    description: { type: String },
    tagline: { type: String },
    icon: { type: String, default: '🎉' },
    gradient: { type: String },
    active: { type: Boolean, default: true },
    isVip: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    // Tiers (VIP, Normal, Male Pass, etc.) — used by admin/seller/shadow portals
    tiers: [{
        id: { type: String },
        name: { type: String },
        price: { type: Number },
        gender: { type: String },
        description: { type: String }
    }],
    ticketTypes: [{
        name: { type: String }, // e.g. "Male Pass", "Female Pass"
        price: { type: Number },
        gender: { type: String } // "male", "female", "unisex"
    }],
    overrides: {
        razorpayEnabled: { type: Boolean, default: null }, // null = inherit company default
        manualPaymentEnabled: { type: Boolean, default: null },
        prSalesEnabled: { type: Boolean, default: null },
        refundsEnabled: { type: Boolean, default: null },
        ticketTransfersEnabled: { type: Boolean, default: null },
        maxCapacity: { type: Number, default: null }
    },
    createdAt: { type: String }
});

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    companyId: { type: String, default: 'littlane' },
    password: { type: String, required: true },
    displayName: { type: String },
    role: { type: String, enum: ['master_admin', 'company_admin', 'seller', 'pr'], default: 'pr' },
    blocked: { type: Boolean, default: false },
    allowedPasses: [{
        eventId: { type: String }, // Can store Event ID or Event Name
        passName: { type: String }  // e.g. "Male Pass"
    }]
});

const SellerSessionSchema = new mongoose.Schema({
    sellerId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    loginAt: { type: String },
    ip: { type: String }
});

// ==================== SCAN LOG SCHEMA ====================
// Written on EVERY scan attempt (accepted, duplicate, cancelled, invalid).
// Fire-and-forget from the gate endpoint — never blocks the gate response.
const ScanLogSchema = new mongoose.Schema({
    ticketId: { type: String, required: true },
    result: { type: String, enum: ['accepted', 'duplicate', 'cancelled', 'invalid'], required: true },
    scannedBy: { type: String, default: 'Gate Staff' },
    ip: { type: String, default: 'unknown' },
    companyId: { type: String, default: 'littlane' },
    event: { type: String },
    timestamp: { type: Date, default: Date.now }
});
ScanLogSchema.index({ timestamp: -1 });
ScanLogSchema.index({ scannedBy: 1, timestamp: -1 });
ScanLogSchema.index({ result: 1 });
ScanLogSchema.index({ ticketId: 1 });

// ==================== UNIFIED USER SESSION SCHEMA ====================
// One active session per userId — enforces strict one-device-per-user for all roles.
// Mirrors SellerSessionSchema but covers every role: master_admin, company_admin, seller, pr.
const UserSessionSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    ip: { type: String, default: 'unknown' },
    loginAt: { type: String },
    role: { type: String },
    companyId: { type: String },
    displayName: { type: String }
});

const SaleSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    companyId: { type: String, default: 'littlane' },
    event: { type: String },
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    gender: { type: String },
    quantity: { type: Number },
    amount: { type: Number },
    currency: { type: String },
    status: { type: String },
    paymentId: { type: String },
    ticketId: { type: String },
    emailStatus: { type: String },
    emailError: { type: String },
    errorLog: { type: Array, default: [] },
    createdAt: { type: String },
    updatedAt: { type: String },
    paidAt: { type: String },
    generatedAt: { type: String },
    scannedBy: { type: String },
    scannedAt: { type: String },
    showInPres: { type: Boolean, default: false },
    prUserId: { type: String },
    prName: { type: String },
    paymentMethod: { type: String },
    source: { type: String },
    isShadow: { type: Boolean, default: false },
    slots: [{
        checkedIn: { type: Boolean, default: false },
        checkedInBy: { type: String },
        checkedInAt: { type: String }
    }],
    scannedCount: { type: Number, default: 0 }
});

const CompanySchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'PAUSED', 'TRIAL', 'EXPIRED'], default: 'ACTIVE' },
    statusReason: { type: String, default: '' },

    commercials: {
        feeType: { type: String, enum: ['PERCENTAGE', 'FIXED', 'HYBRID'], default: 'PERCENTAGE' },
        percentageFee: { type: Number, default: 5 },
        fixedFeePerTicket: { type: Number, default: 0 }
    },

    razorpayConfig: {
        enabled: { type: Boolean, default: true },
        keyId: { type: String, default: 'rzp_live_demoKey12345' },
        keySecret: { type: String, default: 'demo_secret_key_12345' },
        webhookSecret: { type: String, default: 'whsec_demo_12345' },
        mode: { type: String, enum: ['TEST', 'LIVE'], default: 'LIVE' },
        lockedByMaster: { type: Boolean, default: false }
    },

    manualPaymentConfig: {
        enabled: { type: Boolean, default: true },
        allowedMethods: { type: [String], default: ['cash', 'bank_transfer', 'upi_manual'] },
        approvalWorkflow: { type: String, enum: ['AUTO', 'COMPANY_APPROVAL', 'MASTER_APPROVAL'], default: 'COMPANY_APPROVAL' },
        lockedByMaster: { type: Boolean, default: false }
    },

    features: {
        onlinePayments: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        manualPayments: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        prPortal: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        prSales: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        ticketTransfers: { enabled: { type: Boolean, default: false }, lockedByMaster: { type: Boolean, default: false } },
        refunds: { enabled: { type: Boolean, default: false }, lockedByMaster: { type: Boolean, default: false } },
        couponCodes: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        qrCheckIn: { enabled: { type: Boolean, default: true }, lockedByMaster: { type: Boolean, default: false } },
        offlineScan: { enabled: { type: Boolean, default: false }, lockedByMaster: { type: Boolean, default: false } },
        allowReEntry: { enabled: { type: Boolean, default: false }, lockedByMaster: { type: Boolean, default: false } }
    },

    prSettings: {
        commissionType: { type: String, enum: ['PERCENTAGE', 'FIXED'], default: 'PERCENTAGE' },
        commissionValue: { type: Number, default: 10 }
    },

    createdAt: { type: String },
    updatedAt: { type: String }
});

const AuditLogSchema = new mongoose.Schema({
    logId: { type: String, required: true, unique: true },
    adminUser: { type: String, required: true },
    companyId: { type: String, required: true },
    eventId: { type: String, default: null },
    category: { type: String, default: 'CONFIG_CHANGE' },
    fieldChanged: { type: String, required: true },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, default: '' },
    timestamp: { type: String, required: true }
});

const CustomerSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String },
    createdAt: { type: String }
});

const PartnerLockSchema = new mongoose.Schema({
    partnerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    
    // WebAuthn / Passkey Cryptographic Credential
    webauthnCredentialId: { type: String, default: null },
    webauthnPublicKey: { type: String, default: null },
    webauthnCounter: { type: Number, default: 0 },
    webauthnTransports: { type: [String], default: [] },
    deviceRegisteredAt: { type: String, default: null },
    registeredDeviceId: { type: String, default: null },

    // Device IP & Session Versioning
    boundIp: { type: String, default: null },
    boundAt: { type: String, default: null },
    sessionVersion: { type: Number, default: 1 },
    lastSeenAt: { type: String, default: null },

    // Temporary Challenge
    currentChallenge: { type: String, default: null },

    loginAttemptLog: [{
        timestamp: { type: String },
        ip: { type: String },
        userAgent: { type: String },
        result: { type: String }
    }]
});

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const Company = mongoose.model('Company', CompanySchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const SellerSession = mongoose.model('SellerSession', SellerSessionSchema);
const ScanLog = mongoose.model('ScanLog', ScanLogSchema);
const UserSession = mongoose.model('UserSession', UserSessionSchema);
const PartnerLock = mongoose.model('PartnerLock', PartnerLockSchema);

const SellerDeviceSchema = new mongoose.Schema({
    sellerId: { type: String, required: true, unique: true },
    credentialId: { type: String, required: true },
    publicKeySpki: { type: String, required: true },
    challenge: { type: String },
    registeredAt: { type: String, default: () => new Date().toISOString() }
});

const SellerDevice = mongoose.model('SellerDevice', SellerDeviceSchema);

// ==================== SEED DATA ====================

async function seedDefaultUsers() {
    try {
        const count = await User.countDocuments();
        if (count > 0) return; // DB already has users

        console.log('🌱 Seeding multi-tenant LITTX platform users across roles...');
        
        const defaultUsers = [
            // Master Admin / Super Admin
            { userId: 'superadmin@littx.in', password: process.env.MASTER_PASS || 'littx-master-2026', displayName: 'LITTX Super Admin', role: 'master_admin', companyId: 'all' },
            // Company Admins
            { userId: 'admin@littlane.in', password: 'littlane-2026', displayName: 'Littlane Admin', role: 'company_admin', companyId: 'littlane' },
            { userId: 'admin@nexora.in', password: 'nexora-2026', displayName: 'Nexora Admin', role: 'company_admin', companyId: 'nexora' },
            { userId: 'admin@urbannights.in', password: 'urban-2026', displayName: 'Urban Nights Admin', role: 'company_admin', companyId: 'urban-nights' },
            // Sellers & PR Partners
            { userId: 'SELLER-A', companyId: 'littlane', password: process.env.SELLER_A_PASS || 'littx-a-2026', displayName: 'Seller Alpha', role: 'seller' },
            { userId: 'SELLER-B', companyId: 'littlane', password: process.env.SELLER_B_PASS || 'littx-b-2026', displayName: 'Seller Beta', role: 'seller' },
            { userId: 'SELLER-C', companyId: 'nexora', password: process.env.SELLER_C_PASS || 'littx-c-2026', displayName: 'Seller Gamma', role: 'seller' },
            { userId: 'partner1', companyId: 'littlane', password: process.env.PR1_PASS || 'ftpr@001', displayName: 'Partner One', role: 'pr' },
            { userId: 'partner2', companyId: 'littlane', password: process.env.PR2_PASS || 'ftpr@002', displayName: 'Partner Two', role: 'pr' },
            { userId: 'partner3', companyId: 'nexora', password: process.env.PR3_PASS || 'ftpr@003', displayName: 'Partner Three', role: 'pr' },
            { userId: 'partner4', companyId: 'urban-nights', password: process.env.PR4_PASS || 'ftpr@004', displayName: 'Partner Four', role: 'pr' },
            { userId: 'partner5', companyId: 'littlane', password: process.env.PR5_PASS || 'ftpr@005', displayName: 'Partner Five', role: 'pr' },
        ];

        await User.insertMany(defaultUsers);
        console.log('✅ Multi-tenant platform users seeded successfully.');
        await seedDefaultPartnerLocks();
    } catch (err) {
        console.error('❌ Failed to seed platform users:', err.message);
    }
}

async function seedDefaultPartnerLocks() {
    const defaultPartners = [
        { partnerId: 'littlane', name: 'Littlane Entertainment', password: 'littlane2026' },
        { partnerId: 'nitro', name: 'Nitro Events', password: 'nitro2026' },
        { partnerId: '7th-heaven', name: '7th Heaven', password: '7thheaven2026' }
    ];

    for (const p of defaultPartners) {
        if (useMock()) {
            if (!_mockPartnerLocks.has(p.partnerId)) {
                _mockPartnerLocks.set(p.partnerId, {
                    ...p,
                    boundIp: null,
                    boundAt: null,
                    sessionVersion: 1,
                    lastSeenAt: null,
                    loginAttemptLog: []
                });
            }
        } else {
            try {
                const existing = await PartnerLock.findOne({ partnerId: p.partnerId });
                if (!existing) {
                    await PartnerLock.create({
                        ...p,
                        boundIp: null,
                        boundAt: null,
                        sessionVersion: 1,
                        lastSeenAt: null,
                        loginAttemptLog: []
                    });
                }
            } catch (err) {
                console.error('Error seeding partner lock:', err.message);
            }
        }
    }
}

async function seedDefaultEvents() {
    try {
        const count = await Event.countDocuments();
        if (count > 0) return;

        console.log('🌱 Seeding multi-tenant events across companies...');
        const now = new Date().toISOString();
        const defaultEvents = [
            {
                name: 'Dholida Garba Royale 2026',
                companyId: 'littlane',
                date: '2026-09-15',
                time: '07:00 PM',
                venue: 'The Orchid, Pune',
                stage: 'Main Arena',
                description: 'The biggest freshers party of the year!',
                archived: false,
                ticketTypes: [
                    { name: 'Male Pass', price: 699, gender: 'male' },
                    { name: 'Female Pass', price: 599, gender: 'female' }
                ],
                overrides: { razorpayEnabled: null, manualPaymentEnabled: null, prSalesEnabled: null },
                createdAt: now
            },
            {
                name: 'Aura Genesis Fest',
                companyId: 'littlane',
                date: '2026-10-20',
                time: '06:30 PM',
                venue: 'JW Marriott Ground',
                stage: 'EDM Stage',
                description: 'Annual cultural extravaganza',
                archived: false,
                ticketTypes: [
                    { name: 'General Entry', price: 499, gender: 'unisex' },
                    { name: 'VIP Pass', price: 999, gender: 'unisex' }
                ],
                overrides: { razorpayEnabled: null, manualPaymentEnabled: null, prSalesEnabled: null },
                createdAt: now
            },
            {
                name: 'Nexora Summer Rave',
                companyId: 'nexora',
                date: '2026-08-30',
                time: '08:00 PM',
                venue: 'Sunburn Arena',
                stage: 'Open Air',
                description: 'Electronic music festival by Nexora Events',
                archived: false,
                ticketTypes: [
                    { name: 'Early Bird', price: 899, gender: 'unisex' },
                    { name: 'VIP Access', price: 1500, gender: 'unisex' }
                ],
                overrides: { razorpayEnabled: true, manualPaymentEnabled: false, prSalesEnabled: true },
                createdAt: now
            },
            {
                name: 'Urban Night Bash',
                companyId: 'urban-nights',
                date: '2026-09-05',
                time: '09:00 PM',
                venue: 'High Spirits Club',
                stage: 'Club Indoor',
                description: 'Exclusive club night by Urban Nights',
                archived: false,
                ticketTypes: [
                    { name: 'Couple Pass', price: 1200, gender: 'unisex' },
                    { name: 'Stag Male', price: 800, gender: 'male' }
                ],
                overrides: { razorpayEnabled: false, manualPaymentEnabled: true, prSalesEnabled: false },
                createdAt: now
            }
        ];

        await Event.insertMany(defaultEvents);
        console.log('✅ Multi-tenant events seeded successfully.');
    } catch (err) {
        console.error('❌ Failed to seed default events:', err.message);
    }
}

// ==================== SALE HELPERS ====================

async function createSaleRecord(record) {
    const sale = new Sale({
        ...record,
        errorLog: record.errorLog || []
    });
    await sale.save();
    return record;
}

async function updateSaleRecord(orderId, updates) {
    const updated = await Sale.findOneAndUpdate(
        { orderId },
        { 
            $set: { 
                ...updates,
                updatedAt: new Date().toISOString()
            } 
        },
        { returnDocument: 'after', lean: true }
    );
    return updated;
}

async function getByOrderId(orderId) {
    return await Sale.findOne({ orderId }).lean();
}

async function getByTicketId(ticketId) {
    return await Sale.findOne({ ticketId }).lean();
}

async function getAll() {
    return await Sale.find({}).sort({ createdAt: -1 }).lean();
}

async function atomicClaimOrder(orderId, paymentId) {
    const updated = await Sale.findOneAndUpdate(
        { orderId, status: 'created' },
        {
            $set: {
                status: 'paid',
                paymentId,
                paidAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        },
        { returnDocument: 'after', lean: true }
    );
    return updated;
}

// ==================== USER HELPERS ====================

async function getAllUsers() {
    return await User.find({}).lean();
}

async function getUserById(userId) {
    return await User.findOne({ userId }).lean();
}

async function updateUser(userId, updates) {
    return await User.findOneAndUpdate(
        { userId },
        { $set: updates },
        { returnDocument: 'after', lean: true }
    );
}

// ==================== CUSTOMER HELPERS ====================

async function createCustomer(customerData) {
    const customer = new Customer({
        email: customerData.email.toLowerCase(),
        password: customerData.password,
        name: customerData.name,
        phone: customerData.phone,
        createdAt: new Date().toISOString()
    });
    return await customer.save();
}

async function getCustomerByEmail(email) {
    if (!email) return null;
    return await Customer.findOne({ email: email.toLowerCase() }).lean();
}

// ==================== EVENT HELPERS ====================

async function getAllEvents() {
    return await Event.find({}).lean();
}

async function getEventById(id) {
    return await Event.findById(id).lean();
}

async function getEventByName(name) {
    return await Event.findOne({ name }).lean();
}

async function createEvent(eventData) {
    const newEvent = new Event({
        ...eventData,
        createdAt: new Date().toISOString()
    });
    return await newEvent.save();
}

async function updateEvent(id, updates) {
    return await Event.findByIdAndUpdate(
        id,
        { $set: updates },
        { returnDocument: 'after', lean: true }
    );
}

async function deleteEvent(id) {
    return await Event.findByIdAndDelete(id);
}

// ==================== COMPANY & AUDIT HELPERS ====================

async function seedDefaultCompanies() {
    try {
        const count = await Company.countDocuments();
        if (count > 0) return;

        console.log('🌱 Seeding default LITTX Event Companies...');
        const now = new Date().toISOString();
        const defaultCompanies = [
            {
                companyId: 'littlane',
                name: 'Littlane Events',
                status: 'ACTIVE',
                commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
                razorpayConfig: { enabled: true, keyId: 'rzp_live_littlane123', keySecret: 'littlane_secret', mode: 'LIVE', lockedByMaster: false },
                manualPaymentConfig: { enabled: true, allowedMethods: ['cash', 'bank_transfer', 'upi_manual'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
                features: {
                    onlinePayments: { enabled: true, lockedByMaster: false },
                    manualPayments: { enabled: true, lockedByMaster: false },
                    prPortal: { enabled: true, lockedByMaster: false },
                    prSales: { enabled: true, lockedByMaster: false },
                    ticketTransfers: { enabled: false, lockedByMaster: false },
                    refunds: { enabled: false, lockedByMaster: false },
                    couponCodes: { enabled: true, lockedByMaster: false },
                    qrCheckIn: { enabled: true, lockedByMaster: false },
                    offlineScan: { enabled: false, lockedByMaster: false },
                    allowReEntry: { enabled: false, lockedByMaster: false }
                },
                prSettings: { commissionType: 'PERCENTAGE', commissionValue: 10 },
                createdAt: now,
                updatedAt: now
            },
            {
                companyId: 'nexora',
                name: 'Nexora Events',
                status: 'ACTIVE',
                commercials: { feeType: 'PERCENTAGE', percentageFee: 6, fixedFeePerTicket: 10 },
                razorpayConfig: { enabled: true, keyId: 'rzp_live_nexora456', keySecret: 'nexora_secret', mode: 'LIVE', lockedByMaster: false },
                manualPaymentConfig: { enabled: false, allowedMethods: ['cash'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
                features: {
                    onlinePayments: { enabled: true, lockedByMaster: false },
                    manualPayments: { enabled: false, lockedByMaster: false },
                    prPortal: { enabled: true, lockedByMaster: false },
                    prSales: { enabled: true, lockedByMaster: false },
                    ticketTransfers: { enabled: true, lockedByMaster: false },
                    refunds: { enabled: true, lockedByMaster: false },
                    couponCodes: { enabled: true, lockedByMaster: false },
                    qrCheckIn: { enabled: true, lockedByMaster: false },
                    offlineScan: { enabled: true, lockedByMaster: false },
                    allowReEntry: { enabled: true, lockedByMaster: false }
                },
                prSettings: { commissionType: 'FIXED', commissionValue: 50 },
                createdAt: now,
                updatedAt: now
            },
            {
                companyId: 'urban-nights',
                name: 'Urban Nights',
                status: 'ACTIVE',
                commercials: { feeType: 'FIXED', percentageFee: 0, fixedFeePerTicket: 25 },
                razorpayConfig: { enabled: false, keyId: '', keySecret: '', mode: 'TEST', lockedByMaster: false },
                manualPaymentConfig: { enabled: true, allowedMethods: ['cash'], approvalWorkflow: 'AUTO', lockedByMaster: false },
                features: {
                    onlinePayments: { enabled: false, lockedByMaster: false },
                    manualPayments: { enabled: true, lockedByMaster: false },
                    prPortal: { enabled: true, lockedByMaster: false },
                    prSales: { enabled: true, lockedByMaster: false },
                    ticketTransfers: { enabled: false, lockedByMaster: false },
                    refunds: { enabled: false, lockedByMaster: false },
                    couponCodes: { enabled: false, lockedByMaster: false },
                    qrCheckIn: { enabled: true, lockedByMaster: false },
                    offlineScan: { enabled: false, lockedByMaster: false },
                    allowReEntry: { enabled: false, lockedByMaster: false }
                },
                prSettings: { commissionType: 'PERCENTAGE', commissionValue: 8 },
                createdAt: now,
                updatedAt: now
            }
        ];

        await Company.insertMany(defaultCompanies);
        console.log('✅ Default Event Companies seeded successfully.');
    } catch (err) {
        console.error('❌ Failed to seed default companies:', err.message);
    }
}

// Call seeding during initialization
mongoose.connection.once('open', async () => {
    await seedDefaultCompanies();
    await seedDefaultEvents();
    await seedDefaultUsers();
});

async function getAllCompanies() {
    return await Company.find({}).sort({ name: 1 }).lean();
}

async function getCompanyById(companyId) {
    let company = await Company.findOne({ companyId }).lean();
    if (!company) {
        // Fallback to first or default company
        company = await Company.findOne({ companyId: 'littlane' }).lean();
    }
    return company;
}

async function updateCompanyConfig(companyId, updates) {
    return await Company.findOneAndUpdate(
        { companyId },
        { 
            $set: { 
                ...updates,
                updatedAt: new Date().toISOString()
            } 
        },
        { returnDocument: 'after', lean: true }
    );
}

async function createAuditLog(logData) {
    const log = new AuditLog({
        logId: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        ...logData
    });
    await log.save();
    return log;
}

async function getAuditLogs(companyId = null) {
    const query = companyId ? { companyId } : {};
    return await AuditLog.find(query).sort({ timestamp: -1 }).limit(100).lean();
}

async function getEffectiveConfig(companyId = 'littlane', eventNameOrId = null) {
    const company = await getCompanyById(companyId) || {
        status: 'ACTIVE',
        razorpayConfig: { enabled: true, lockedByMaster: false },
        manualPaymentConfig: { enabled: true, lockedByMaster: false },
        features: {
            prPortal: { enabled: true, lockedByMaster: false },
            prSales: { enabled: true, lockedByMaster: false },
            refunds: { enabled: false, lockedByMaster: false },
            ticketTransfers: { enabled: false, lockedByMaster: false }
        }
    };

    let event = null;
    if (eventNameOrId) {
        event = await Event.findOne({
            $or: [{ _id: mongoose.Types.ObjectId.isValid(eventNameOrId) ? eventNameOrId : null }, { name: eventNameOrId }]
        }).lean();
    }

    // Base Resolution Matrix
    const effective = {
        companyStatus: { value: company.status, source: 'Company Default', lockedByMaster: false },
        razorpay: { value: company.razorpayConfig?.enabled ?? true, source: 'Company Default', lockedByMaster: company.razorpayConfig?.lockedByMaster ?? false },
        manual: { value: company.manualPaymentConfig?.enabled ?? true, source: 'Company Default', lockedByMaster: company.manualPaymentConfig?.lockedByMaster ?? false },
        prPortal: { value: company.features?.prPortal?.enabled ?? true, source: 'Company Default', lockedByMaster: company.features?.prPortal?.lockedByMaster ?? false },
        prSales: { value: company.features?.prSales?.enabled ?? true, source: 'Company Default', lockedByMaster: company.features?.prSales?.lockedByMaster ?? false },
        refunds: { value: company.features?.refunds?.enabled ?? false, source: 'Company Default', lockedByMaster: company.features?.refunds?.lockedByMaster ?? false },
        ticketTransfers: { value: company.features?.ticketTransfers?.enabled ?? false, source: 'Company Default', lockedByMaster: company.features?.ticketTransfers?.lockedByMaster ?? false }
    };

    // Apply Event Overrides if present and NOT locked by Master Admin
    if (event && event.overrides) {
        if (event.overrides.razorpayEnabled !== null && event.overrides.razorpayEnabled !== undefined && !effective.razorpay.lockedByMaster) {
            effective.razorpay = { value: event.overrides.razorpayEnabled, source: 'Event Override', lockedByMaster: false };
        }
        if (event.overrides.manualPaymentEnabled !== null && event.overrides.manualPaymentEnabled !== undefined && !effective.manual.lockedByMaster) {
            effective.manual = { value: event.overrides.manualPaymentEnabled, source: 'Event Override', lockedByMaster: false };
        }
        if (event.overrides.prSalesEnabled !== null && event.overrides.prSalesEnabled !== undefined && !effective.prSales.lockedByMaster) {
            effective.prSales = { value: event.overrides.prSalesEnabled, source: 'Event Override', lockedByMaster: false };
        }
        if (event.overrides.refundsEnabled !== null && event.overrides.refundsEnabled !== undefined && !effective.refunds.lockedByMaster) {
            effective.refunds = { value: event.overrides.refundsEnabled, source: 'Event Override', lockedByMaster: false };
        }
    }

    return {
        companyId: company.companyId || companyId,
        companyName: company.name || 'Littlane Events',
        companyStatus: company.status,
        effective
    };
}

// ==================== IN-MEMORY MOCK DATABASE FALLBACK (For Vercel/Disconnected DB) ====================

const mockDb = {
    users: [
        { userId: 'superadmin@littx.in', password: 'littx-master-2026', displayName: 'LITTX Super Admin', role: 'master_admin', companyId: 'all' },
        { userId: 'admin@littlane.in', password: 'littlane-2026', displayName: 'Littlane Admin', role: 'company_admin', companyId: 'littlane' },
        { userId: 'admin@nexora.in', password: 'nexora-2026', displayName: 'Nexora Admin', role: 'company_admin', companyId: 'nexora' },
        { userId: 'admin@urbannights.in', password: 'urban-2026', displayName: 'Urban Nights Admin', role: 'company_admin', companyId: 'urban-nights' },
        { userId: 'SELLER-A', companyId: 'littlane', password: 'littx-a-2026', displayName: 'Seller Alpha', role: 'seller' },
        { userId: 'SELLER-B', companyId: 'littlane', password: 'littx-b-2026', displayName: 'Seller Beta', role: 'seller' },
        { userId: 'partner1', companyId: 'littlane', password: 'ftpr@001', displayName: 'Partner One', role: 'pr' },
    ],
    customers: [
        { email: 'customer@test.com', password: 'password', name: 'Test Customer', phone: '1234567890', createdAt: new Date().toISOString() }
    ],
    events: [
        {
            _id: '64ef8bb11b6d912345678901',
            name: 'DHOLIDA GARBA ROYALE',
            companyId: 'littlane',
            date: '2026-08-25',
            time: '18:00',
            venue: 'Club Aura',
            description: 'The biggest freshers party of the year',
            ticketTypes: [
                { name: 'Male Pass', price: 1000, gender: 'male' },
                { name: 'Female Pass', price: 800, gender: 'female' }
            ],
            overrides: { manualPaymentEnabled: true, prSalesEnabled: true }
        }
    ],
    sales: [],
    companies: [
        {
            companyId: 'littlane',
            name: 'Littlane Events',
            status: 'ACTIVE',
            commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
            razorpayConfig: { enabled: true, keyId: 'rzp_live_littlane123', keySecret: 'littlane_secret', mode: 'LIVE', lockedByMaster: false },
            manualPaymentConfig: { enabled: true, allowedMethods: ['cash', 'bank_transfer', 'upi_manual'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
            features: {
                onlinePayments: { enabled: true, lockedByMaster: false },
                manualPayments: { enabled: true, lockedByMaster: false },
                prPortal: { enabled: true, lockedByMaster: false },
                prSales: { enabled: true, lockedByMaster: false },
                ticketTransfers: { enabled: false, lockedByMaster: false },
                refunds: { enabled: false, lockedByMaster: false },
                couponCodes: { enabled: true, lockedByMaster: false },
                qrCheckIn: { enabled: true, lockedByMaster: false },
                offlineScan: { enabled: false, lockedByMaster: false },
                allowReEntry: { enabled: false, lockedByMaster: false }
            },
            prSettings: { commissionType: 'PERCENTAGE', commissionValue: 10 }
        }
    ],
    auditLogs: [],
    sellerSessions: [],
    scanLogs: [],
    userSessions: []
};

function useMock() {
    return mongoose.connection.readyState !== 1;
}

// In-memory fallback for local dev (when MongoDB is not available)
// Use /tmp on Vercel/serverless — it's the only writable directory
const MOCK_SALES_FILE = (() => {
    const tmpPath = path.join(os.tmpdir(), 'littx_mock_sales.json');
    const localPath = path.join(__dirname, 'mock_sales.json');
    // Prefer local path for dev, tmp for serverless
    try {
        fs.writeFileSync(localPath, fs.existsSync(localPath) ? fs.readFileSync(localPath) : '[]');
        return localPath;
    } catch (_) {
        return tmpPath;
    }
})();

function _loadMockSales() {
    try {
        if (fs.existsSync(MOCK_SALES_FILE)) {
            const raw = fs.readFileSync(MOCK_SALES_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.error('[mock sales load error]', e.message);
    }
    // Also try the alternate path
    try {
        const altPath = MOCK_SALES_FILE.includes(os.tmpdir())
            ? path.join(__dirname, 'mock_sales.json')
            : path.join(os.tmpdir(), 'littx_mock_sales.json');
        if (fs.existsSync(altPath)) {
            const raw = fs.readFileSync(altPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (_) {}
    return [];
}

function _saveMockSales(salesArray) {
    try {
        fs.writeFileSync(MOCK_SALES_FILE, JSON.stringify(salesArray, null, 2), 'utf8');
    } catch (e) {
        // Try alternate path
        try {
            const altPath = MOCK_SALES_FILE.includes(os.tmpdir())
                ? path.join(__dirname, 'mock_sales.json')
                : path.join(os.tmpdir(), 'littx_mock_sales.json');
            fs.writeFileSync(altPath, JSON.stringify(salesArray, null, 2), 'utf8');
        } catch (e2) {
            console.error('[mock sales save error]', e2.message);
        }
    }
}

mockDb.sales = _loadMockSales();
console.log(`[MockDB] Loaded ${mockDb.sales.length} mock sales from ${MOCK_SALES_FILE}`);
const _mockSessions = new Map();
const _mockUserSessions = new Map();
const _mockScanLogs = [];
const _mockPartnerLocks = new Map([
    ['littlane', { partnerId: 'littlane', name: 'Littlane Entertainment', password: 'littlane2026', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['nitro', { partnerId: 'nitro', name: 'Nitro Events', password: 'nitro2026', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['7th-heaven', { partnerId: '7th-heaven', name: '7th Heaven', password: '7thheaven2026', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }]
]);

const _mockDevices = new Map();
const _mockChallenges = new Map();

module.exports = {
    // Session handlers
    getSellerSession: async (sellerId) => {
        if (useMock()) return _mockSessions.get(sellerId) || null;
        return SellerSession.findOne({ sellerId });
    },
    getAllSellerSessions: async () => {
        if (useMock()) return Array.from(_mockSessions.values());
        return SellerSession.find({});
    },
    setSellerSession: async (sellerId, data) => {
        if (useMock()) { _mockSessions.set(sellerId, { ...data, sellerId }); return data; }
        return SellerSession.findOneAndUpdate(
            { sellerId }, 
            { ...data, sellerId }, 
            { upsert: true, new: true }
        );
    },
    deleteSellerSession: async (sellerId) => {
        if (useMock()) { _mockSessions.delete(sellerId); return true; }
        return SellerSession.deleteOne({ sellerId });
    },
    // Models
    Event,
    User,
    Sale,
    Company,
    AuditLog,
    Customer,
    SellerSession,
    ScanLog,
    UserSession,
    SellerDevice,

    // WebAuthn Device Lock handlers
    getSellerDevice: async (sellerId) => {
        if (useMock()) return _mockDevices.get(sellerId) || null;
        return SellerDevice.findOne({ sellerId });
    },
    getAllSellerDevices: async () => {
        if (useMock()) return Array.from(_mockDevices.values());
        return SellerDevice.find({});
    },
    setSellerDevice: async (sellerId, credentialId, publicKeySpki) => {
        if (useMock()) {
            const dev = { sellerId, credentialId, publicKeySpki, registeredAt: new Date().toISOString() };
            _mockDevices.set(sellerId, dev);
            return dev;
        }
        return SellerDevice.findOneAndUpdate(
            { sellerId },
            { credentialId, publicKeySpki, registeredAt: new Date().toISOString() },
            { upsert: true, new: true }
        );
    },
    deleteSellerDevice: async (sellerId) => {
        if (useMock()) { _mockDevices.delete(sellerId); return true; }
        return SellerDevice.deleteOne({ sellerId });
    },
    saveSellerChallenge: async (sellerId, challenge) => {
        if (useMock()) {
            if (challenge === null) { _mockChallenges.delete(sellerId); } 
            else { _mockChallenges.set(sellerId, challenge); }
            return challenge;
        }
        return SellerDevice.findOneAndUpdate(
            { sellerId },
            { challenge },
            { upsert: true, new: true }
        );
    },
    getSellerChallenge: async (sellerId) => {
        if (useMock()) return _mockChallenges.get(sellerId) || null;
        const dev = await SellerDevice.findOne({ sellerId });
        return dev ? dev.challenge : null;
    },

    // Sale Helpers
    createSaleRecord: async (saleData) => {
        if (useMock()) {
            const sale = { ...saleData, createdAt: saleData.createdAt || new Date().toISOString() };
            mockDb.sales.push(sale);
            _saveMockSales(mockDb.sales);
            return sale;
        }
        return await createSaleRecord(saleData);
    },
    updateSaleRecord: async (orderId, updates) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId);
            if (idx !== -1) {
                mockDb.sales[idx] = { ...mockDb.sales[idx], ...updates, updatedAt: new Date().toISOString() };
                _saveMockSales(mockDb.sales);
                return mockDb.sales[idx];
            }
            return null;
        }
        return await updateSaleRecord(orderId, updates);
    },
    getByOrderId: async (orderId) => {
        if (useMock()) {
            return mockDb.sales.find(s => s.orderId === orderId) || null;
        }
        return await getByOrderId(orderId);
    },
    getByTicketId: async (ticketId) => {
        if (useMock()) {
            return mockDb.sales.find(s => s.ticketId === ticketId) || null;
        }
        return await getByTicketId(ticketId);
    },
    getAll: async () => {
        if (useMock()) {
            return [...mockDb.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return await getAll();
    },
    atomicClaimOrder: async (orderId, paymentId) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId && s.status === 'created');
            if (idx !== -1) {
                mockDb.sales[idx].status = 'paid';
                mockDb.sales[idx].paymentId = paymentId;
                mockDb.sales[idx].paidAt = new Date().toISOString();
                mockDb.sales[idx].updatedAt = new Date().toISOString();
                _saveMockSales(mockDb.sales);
                return mockDb.sales[idx];
            }
            return null;
        }
        return await atomicClaimOrder(orderId, paymentId);
    },

    // User Helpers
    getAllUsers: async () => {
        if (useMock()) return mockDb.users;
        return await getAllUsers();
    },
    getUserById: async (userId) => {
        if (useMock()) {
            return mockDb.users.find(u => u.userId === userId) || null;
        }
        return await getUserById(userId);
    },
    updateUser: async (userId, updates) => {
        if (useMock()) {
            const idx = mockDb.users.findIndex(u => u.userId === userId);
            if (idx !== -1) {
                mockDb.users[idx] = { ...mockDb.users[idx], ...updates };
                return mockDb.users[idx];
            }
            return null;
        }
        return await updateUser(userId, updates);
    },

    // Customer Helpers
    createCustomer: async (customerData) => {
        if (useMock()) {
            const email = customerData.email.toLowerCase();
            if (mockDb.customers.some(c => c.email === email)) {
                throw new Error("Customer already exists");
            }
            const customer = {
                email,
                password: customerData.password,
                name: customerData.name,
                phone: customerData.phone,
                createdAt: new Date().toISOString()
            };
            mockDb.customers.push(customer);
            return customer;
        }
        return await createCustomer(customerData);
    },
    getCustomerByEmail: async (email) => {
        if (useMock()) {
            if (!email) return null;
            return mockDb.customers.find(c => c.email === email.toLowerCase()) || null;
        }
        return await getCustomerByEmail(email);
    },

    // Event Helpers
    getAllEvents: async () => {
        if (useMock()) return mockDb.events;
        return await getAllEvents();
    },
    getEventById: async (id) => {
        if (useMock()) {
            return mockDb.events.find(e => e._id === id) || null;
        }
        return await getEventById(id);
    },
    getEventByName: async (name) => {
        if (useMock()) {
            return mockDb.events.find(e => e.name === name) || null;
        }
        return await getEventByName(name);
    },
    createEvent: async (eventData) => {
        if (useMock()) {
            const event = { ...eventData, _id: new mongoose.Types.ObjectId().toString(), createdAt: new Date().toISOString() };
            mockDb.events.push(event);
            return event;
        }
        return await createEvent(eventData);
    },
    updateEvent: async (id, updates) => {
        if (useMock()) {
            const idx = mockDb.events.findIndex(e => e._id === id);
            if (idx !== -1) {
                mockDb.events[idx] = { ...mockDb.events[idx], ...updates };
                return mockDb.events[idx];
            }
            return null;
        }
        return await updateEvent(id, updates);
    },
    deleteEvent: async (id) => {
        if (useMock()) {
            const idx = mockDb.events.findIndex(e => e._id === id);
            if (idx !== -1) {
                return mockDb.events.splice(idx, 1)[0];
            }
            return null;
        }
        return await deleteEvent(id);
    },

    // Company & Audit Helpers
    getAllCompanies: async () => {
        if (useMock()) return mockDb.companies;
        return await getAllCompanies();
    },
    getCompanyById: async (companyId) => {
        if (useMock()) {
            return mockDb.companies.find(c => c.companyId === companyId) || null;
        }
        return await getCompanyById(companyId);
    },
    updateCompanyConfig: async (companyId, updates) => {
        if (useMock()) {
            const idx = mockDb.companies.findIndex(c => c.companyId === companyId);
            if (idx !== -1) {
                mockDb.companies[idx] = { ...mockDb.companies[idx], ...updates };
                return mockDb.companies[idx];
            }
            return null;
        }
        return await updateCompanyConfig(companyId, updates);
    },
    createAuditLog: async (logData) => {
        if (useMock()) {
            const log = { ...logData, logId: new mongoose.Types.ObjectId().toString(), timestamp: new Date().toISOString() };
            mockDb.auditLogs.push(log);
            return log;
        }
        return await createAuditLog(logData);
    },
    getAuditLogs: async (companyId) => {
        if (useMock()) {
            return mockDb.auditLogs.filter(l => l.companyId === companyId);
        }
        return await getAuditLogs(companyId);
    },
    getEffectiveConfig: async (companyId, eventName) => {
        if (useMock()) {
            const company = mockDb.companies.find(c => c.companyId === companyId) || {};
            const event = mockDb.events.find(e => e.name === eventName) || {};
            const effective = {};
            if (company.features) {
                for (const k in company.features) {
                    effective[k] = company.features[k];
                }
            }
            if (event.overrides) {
                for (const k in event.overrides) {
                    if (event.overrides[k] !== null) {
                        effective[k] = { enabled: event.overrides[k] };
                    }
                }
            }
            return {
                companyId,
                companyName: company.name || 'Mock Company',
                companyStatus: company.status || 'ACTIVE',
                effective
            };
        }
        return await getEffectiveConfig(companyId, eventName);
    },

    // ==================== SCAN LOG HELPERS ====================

    // Fire-and-forget safe: callers should .catch(e => console.error('[ScanLog]', e)) — never await this.
    createScanLog: async (logData) => {
        const now = new Date();
        if (useMock()) {
            _mockScanLogs.push({ ...logData, timestamp: now });
            return logData;
        }
        try {
            const log = new ScanLog({ ...logData, timestamp: now });
            return await log.save();
        } catch (err) {
            console.error('[ScanLog write error]', err.message);
        }
    },

    // Returns accepted/declined counts for today (or since sinceDate).
    getScanStats: async (companyId, sinceDate) => {
        if (useMock()) {
            const since = sinceDate || new Date(0);
            const logs = _mockScanLogs.filter(l =>
                (!companyId || l.companyId === companyId) &&
                new Date(l.timestamp) >= since
            );
            const c = { accepted: 0, duplicate: 0, cancelled: 0, invalid: 0 };
            logs.forEach(l => { if (c[l.result] !== undefined) c[l.result]++; });
            return { accepted: c.accepted, declined: c.duplicate + c.cancelled + c.invalid, declinedByReason: { duplicate: c.duplicate, cancelled: c.cancelled, invalid: c.invalid } };
        }
        const query = { timestamp: { $gte: sinceDate || new Date(0) } };
        if (companyId) query.companyId = companyId;
        const agg = await ScanLog.aggregate([
            { $match: query },
            { $group: { _id: '$result', count: { $sum: 1 } } }
        ]);
        const c = { accepted: 0, duplicate: 0, cancelled: 0, invalid: 0 };
        agg.forEach(a => { if (c[a._id] !== undefined) c[a._id] = a.count; });
        return {
            accepted: c.accepted,
            declined: c.duplicate + c.cancelled + c.invalid,
            declinedByReason: { duplicate: c.duplicate, cancelled: c.cancelled, invalid: c.invalid }
        };
    },

    // Count unique scanner userIds who have scanned since sinceDate.
    getActiveScannerCount: async (companyId, sinceDate) => {
        if (useMock()) {
            const since = sinceDate || new Date(0);
            const recent = _mockScanLogs.filter(l =>
                (!companyId || l.companyId === companyId) &&
                new Date(l.timestamp) >= since
            );
            return new Set(recent.map(l => l.scannedBy)).size;
        }
        const query = { timestamp: { $gte: sinceDate || new Date(0) }, result: 'accepted' };
        if (companyId) query.companyId = companyId;
        const distinct = await ScanLog.distinct('scannedBy', query);
        return distinct.length;
    },

    // Atomic scan: only transitions ticket from paid/generated/emailed state to scanned.
    // Returns updated sale or null if precondition failed (already scanned — race condition guard).
    atomicScanTicket: async (ticketId, scannedBy, scannedAtStr) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s =>
                s.ticketId === ticketId &&
                ['paid', 'ticket_generated', 'emailed', 'email_failed'].includes(s.status)
            );
            if (idx === -1) return null;
            mockDb.sales[idx].status = 'scanned';
            mockDb.sales[idx].scannedBy = scannedBy;
            mockDb.sales[idx].scannedAt = scannedAtStr;
            mockDb.sales[idx].updatedAt = new Date().toISOString();
            return mockDb.sales[idx];
        }
        return Sale.findOneAndUpdate(
            {
                ticketId,
                status: { $in: ['paid', 'ticket_generated', 'emailed', 'email_failed'] }
            },
            {
                $set: {
                    status: 'scanned',
                    scannedBy,
                    scannedAt: scannedAtStr,
                    updatedAt: new Date().toISOString()
                }
            },
            { returnDocument: 'after', lean: true }
        );
    },

    // ==================== UNIFIED USER SESSION HELPERS ====================

    getUserSession: async (userId) => {
        if (useMock()) return _mockUserSessions.get(userId) || null;
        return UserSession.findOne({ userId }).lean();
    },
    getUserSessionByToken: async (token) => {
        if (!token) return null;
        if (useMock()) {
            for (const s of _mockUserSessions.values()) {
                if (s.token === token) return s;
            }
            return null;
        }
        return UserSession.findOne({ token }).lean();
    },
    setUserSession: async (userId, data) => {
        if (useMock()) {
            _mockUserSessions.set(userId, { ...data, userId });
            return data;
        }
        return UserSession.findOneAndUpdate(
            { userId },
            { ...data, userId },
            { upsert: true, new: true, lean: true }
        );
    },
    deleteUserSession: async (userId) => {
        if (useMock()) { _mockUserSessions.delete(userId); return true; }
        return UserSession.deleteOne({ userId });
    },
    deleteUserSessionByToken: async (token) => {
        if (!token) return false;
        if (useMock()) {
            for (const [id, s] of _mockUserSessions.entries()) {
                if (s.token === token) { _mockUserSessions.delete(id); return true; }
            }
            return false;
        }
        return UserSession.deleteOne({ token });
    },
    getAllUserSessions: async () => {
        if (useMock()) return Array.from(_mockUserSessions.values());
        return UserSession.find({}).lean();
    },

    // ==================== PARTNER LOCK HELPERS ====================
    getPartnerLock: async (partnerId) => {
        if (useMock()) return _mockPartnerLocks.get(partnerId) || null;
        return PartnerLock.findOne({ partnerId }).lean();
    },
    getAllPartnerLocks: async () => {
        if (useMock()) return Array.from(_mockPartnerLocks.values());
        return PartnerLock.find({}).lean();
    },
    savePartnerLock: async (partnerId, updates) => {
        if (useMock()) {
            const current = _mockPartnerLocks.get(partnerId) || { partnerId, loginAttemptLog: [] };
            const updated = { ...current, ...updates };
            _mockPartnerLocks.set(partnerId, updated);
            return updated;
        }
        return PartnerLock.findOneAndUpdate(
            { partnerId },
            { $set: updates },
            { upsert: true, new: true, lean: true }
        );
    },
    resetPartnerLock: async (partnerId) => {
        if (useMock()) {
            const current = _mockPartnerLocks.get(partnerId);
            if (!current) return null;
            const updated = {
                ...current,
                boundIp: null,
                boundAt: null,
                webauthnCredentialId: null,
                webauthnPublicKey: null,
                webauthnCounter: 0,
                webauthnTransports: [],
                deviceRegisteredAt: null,
                registeredDeviceId: null,
                currentChallenge: null,
                sessionVersion: (current.sessionVersion || 1) + 1
            };
            _mockPartnerLocks.set(partnerId, updated);
            return updated;
        }
        const current = await PartnerLock.findOne({ partnerId });
        const newVersion = ((current?.sessionVersion) || 1) + 1;
        return PartnerLock.findOneAndUpdate(
            { partnerId },
            {
                $set: {
                    boundIp: null,
                    boundAt: null,
                    webauthnCredentialId: null,
                    webauthnPublicKey: null,
                    webauthnCounter: 0,
                    webauthnTransports: [],
                    deviceRegisteredAt: null,
                    registeredDeviceId: null,
                    currentChallenge: null,
                    sessionVersion: newVersion
                }
            },
            { new: true, lean: true }
        );
    },
    logPartnerAttempt: async (partnerId, attempt) => {
        if (useMock()) {
            const current = _mockPartnerLocks.get(partnerId);
            if (current) {
                current.loginAttemptLog = current.loginAttemptLog || [];
                current.loginAttemptLog.push(attempt);
                _mockPartnerLocks.set(partnerId, current);
            }
            return;
        }
        try {
            await PartnerLock.updateOne(
                { partnerId },
                { $push: { loginAttemptLog: attempt } }
            );
        } catch (e) {
            console.error('Failed to log partner attempt:', e.message);
        }
    },

    // ==================== DYNAMIC EVENT & TIER HELPERS ====================
    getAllEvents: async () => {
        let events = [];
        if (!useMock()) {
            try {
                const raw = await Event.find({}).lean();
                // Normalize: always expose a string 'id' field (fallback to _id)
                events = raw.map(e => ({
                    ...e,
                    id: e.id || (e._id ? e._id.toString() : undefined)
                }));
            } catch (e) { console.error('[getAllEvents DB error]', e.message); }
        }
        if (events && events.length > 0) return events;

        const mockList = Array.from(_mockEvents.values());
        const unique = [];
        const seen = new Set();
        for (const item of mockList) {
            if (item && item.name && !seen.has(item.name.toLowerCase()) && !seen.has(item.id)) {
                seen.add(item.name.toLowerCase());
                seen.add(item.id);
                unique.push(item);
            }
        }
        return unique;
    },
    saveEvent: async (eventData) => {
        const id = eventData.id || `event_${Date.now()}`;
        const name = (eventData.name || 'Untitled Event').trim();
        const doc = {
            ...eventData, id, name,
            companyId: eventData.companyId || 'littlane',
            active: eventData.active !== undefined ? eventData.active : true,
            tiers: eventData.tiers || [],
            gradient: eventData.gradient || 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)',
            icon: eventData.icon || '🎉',
            tagline: eventData.tagline || eventData.venue || 'Live Event',
            updatedAt: new Date().toISOString()
        };
        _mockEvents.set(name, doc);
        _mockEvents.set(id, doc);
        if (!useMock()) {
            try {
                await Event.findOneAndUpdate(
                    { $or: [{ id }, { name }] },
                    { $set: doc },
                    { upsert: true, new: true, lean: true }
                );
            } catch (e) { console.error('[saveEvent DB error]', e.message); }
        }
        return doc;
    },
    deleteEvent: async (idOrName, nameHint) => {
        if (!idOrName && !nameHint) return false;

        // Clear from in-memory mock (try both id and name)
        const searchKeys = [String(idOrName || '').toLowerCase(), String(nameHint || '').toLowerCase()].filter(Boolean);
        for (const [k, v] of Array.from(_mockEvents.entries())) {
            for (const searchKey of searchKeys) {
                if (
                    String(k).toLowerCase() === searchKey ||
                    (v && v.id && String(v.id).toLowerCase() === searchKey) ||
                    (v && v.name && String(v.name).toLowerCase() === searchKey)
                ) {
                    _mockEvents.delete(k);
                    break;
                }
            }
        }

        if (!useMock()) {
            try {
                const orClauses = [];
                // Try by MongoDB _id if valid ObjectId
                if (idOrName && mongoose.Types.ObjectId.isValid(String(idOrName))) {
                    orClauses.push({ _id: new mongoose.Types.ObjectId(String(idOrName)) });
                }
                // Try by custom id field and name field
                for (const key of [idOrName, nameHint].filter(Boolean)) {
                    const k = String(key);
                    if (k && k !== 'undefined' && k !== 'null') {
                        orClauses.push(
                            { id: k },
                            { name: k },
                            { name: new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                        );
                    }
                }
                if (orClauses.length > 0) {
                    await Event.deleteMany({ $or: orClauses });
                }
            } catch (e) { console.error('[deleteEvent DB error]', e.message); }
        }
        return true;
    }
};

// ==================== IN-MEMORY MOCK EVENTS (fallback) ====================
const _mockEvents = new Map([
    ['DHOLIDA GARBA ROYALE', {
        id: 'event_freshers', name: 'DHOLIDA GARBA ROYALE', companyId: 'littlane',
        date: '2026-09-15', time: '07:00 PM', venue: 'The Orchid, Pune',
        tagline: 'Pune College Fest · Main Event',
        gradient: 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)',
        icon: '🎉', active: true,
        tiers: [
            { id: 't_female', name: 'Female Pass', price: 599, gender: 'female' },
            { id: 't_male',   name: 'Male Pass',   price: 699, gender: 'male'   },
            { id: 't_vip',    name: 'VIP Entry',   price: 1299, gender: 'unisex' }
        ]
    }],
    ['AURA GENESIS', {
        id: 'event_aura', name: 'AURA GENESIS', companyId: 'littlane',
        date: '2026-10-20', time: '06:30 PM', venue: 'JW Marriott Ground',
        tagline: 'Skyline Electronic Showcase',
        gradient: 'linear-gradient(135deg, #38D9C4 0%, #3B82F6 100%)',
        icon: '✨', active: true,
        tiers: [
            { id: 't_general',  name: 'General Entry', price: 350, gender: 'unisex' },
            { id: 't_vip_aura', name: 'VIP Entry',      price: 799, gender: 'unisex' }
        ]
    }],
    ['FT LINEUP INVITE', {
        id: 'event_vip', name: 'FT LINEUP INVITE', companyId: 'littlane',
        date: '2026-09-15', time: '08:00 PM', venue: 'Main Arena VIP Lounge',
        tagline: 'Exclusive VIP Access · Invite Only',
        gradient: 'linear-gradient(135deg, #F5C542 0%, #F5854D 100%)',
        icon: '⭐', active: true, isVip: true,
        tiers: [
            { id: 't_vip_invite', name: 'VIP Access Pass', price: 0, gender: 'unisex' }
        ]
    }]
]);


const mongoose = require('mongoose');

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
    date: { type: String },
    time: { type: String },
    venue: { type: String },
    stage: { type: String },
    description: { type: String },
    archived: { type: Boolean, default: false },
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

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const Company = mongoose.model('Company', CompanySchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

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
    } catch (err) {
        console.error('❌ Failed to seed platform users:', err.message);
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
                name: 'Freshers Takeover 2026',
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

module.exports = {
    // Models
    Event,
    User,
    Sale,
    Company,
    AuditLog,
    // Sale Helpers
    createSaleRecord,
    updateSaleRecord,
    getByOrderId,
    getByTicketId,
    getAll,
    atomicClaimOrder,
    // User Helpers
    getAllUsers,
    getUserById,
    updateUser,
    // Event Helpers
    getAllEvents,
    getEventById,
    getEventByName,
    createEvent,
    updateEvent,
    deleteEvent,
    // Company & Audit Helpers
    getAllCompanies,
    getCompanyById,
    updateCompanyConfig,
    createAuditLog,
    getAuditLogs,
    getEffectiveConfig
};


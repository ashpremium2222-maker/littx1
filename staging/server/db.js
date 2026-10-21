const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// A Vercel function can be cold-started for any request. Keep one connection
// promise on the Node global so every request waits for the same MongoDB
// connection instead of issuing a buffered query while Mongoose is connecting.
const HAS_CONFIGURED_MONGODB = Boolean(process.env.MONGODB_URI);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/littx';
const MONGO_PROMISE_KEY = '__littxMongoConnectionPromise';

async function connectDb() {
    if (mongoose.connection.readyState === 1) return mongoose.connection;

    if (!global[MONGO_PROMISE_KEY]) {
        global[MONGO_PROMISE_KEY] = mongoose.connect(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000,
        }).then(async connection => {
            console.log('✅ Connected to MongoDB');
            await seedDefaultUsers();
            return connection;
        }).catch(err => {
            // Do not retain a rejected promise: a later serverless request can
            // retry after a transient Atlas/DNS/network failure.
            global[MONGO_PROMISE_KEY] = null;
            throw err;
        });
    }

    return global[MONGO_PROMISE_KEY];
}

// Retain the convenient local-development behaviour, but do not let a failed
// local MongoDB instance prevent the JSON mock fallback from being used.
if (process.env.NODE_ENV !== 'test') {
    connectDb().catch(err => console.error('❌ MongoDB Connection Error:', err.message));
}

// ==================== SCHEMAS ====================

const EventSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    legacyNames: [{ type: String }],
    companyId: { type: String, default: 'littlane' },
    organizerId: { type: String, index: true },
    organizerUserIds: { type: [String], default: [] },
    // Custom string ID (for frontend reference)
    id: { type: String },
    date: { type: String },
    time: { type: String },
    venue: { type: String },
    stage: { type: String },
    description: { type: String },
    category: { type: String, trim: true },
    images: [{ type: String }],
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    startsAt: { type: Date },
    endsAt: { type: Date },
    salesStartAt: { type: Date },
    salesEndAt: { type: Date },
    status: { type: String, enum: ['draft', 'pending_review', 'published', 'cancelled', 'postponed', 'completed'], default: 'draft', index: true },
    visibility: { type: String, enum: ['public', 'unlisted', 'private'], default: 'public' },
    publishedAt: { type: Date },
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
        id: { type: String },
        name: { type: String }, // e.g. "Male Pass", "Female Pass"
        price: { type: Number },
        gender: { type: String }, // "male", "female", "unisex"
        description: { type: String },
        currency: { type: String, default: 'INR' },
        totalInventory: { type: Number, default: null },
        remainingAvailability: { type: Number, default: null },
        salesStartAt: { type: Date },
        salesEndAt: { type: Date },
        maxPerCustomer: { type: Number, default: 20 },
        status: { type: String, enum: ['active', 'paused', 'sold_out'], default: 'active' },
        groupSize: { type: Number, default: 1 },
        inclusions: [{ type: String }]
    }],
    ticketCategories: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        price: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' },
        totalInventory: { type: Number, default: null, min: 0 },
        remainingAvailability: { type: Number, default: null, min: 0 },
        salesStartAt: { type: Date },
        salesEndAt: { type: Date },
        maxPerCustomer: { type: Number, default: 20, min: 1, max: 20 },
        status: { type: String, enum: ['active', 'paused', 'sold_out'], default: 'active' },
        groupSize: { type: Number, default: 1, min: 1 },
        inclusions: [{ type: String }]
    }],
    // Short-lived reservations live with the event inventory document so
    // category counter changes and reservation state transitions are atomic.
    // Only active/consuming entries are retained; settled reservations are
    // removed after the corresponding Sale transition is durable.
    inventoryReservations: [{
        reservationId: { type: String, required: true },
        categoryId: { type: String, required: true },
        admissionCount: { type: Number, required: true, min: 1 },
        expiresAt: { type: Date, required: true },
        status: { type: String, enum: ['active', 'consuming'], default: 'active' },
        createdAt: { type: Date, default: Date.now }
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
EventSchema.index({ slug: 1 }, { unique: true, sparse: true });
EventSchema.index({ companyId: 1, status: 1, active: 1 });
EventSchema.index({ organizerId: 1, createdAt: -1 });
EventSchema.index({ organizerUserIds: 1, updatedAt: -1 });

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    companyId: { type: String, default: 'littlane' },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    emailVerifiedAt: { type: Date, default: null },
    accountStatus: { type: String, enum: ['pending_activation', 'active', 'suspended'], default: null },
    // null/absent means the account still uses its documented legacy
    // company-wide scope; [] means an explicit event-scoped account with no access.
    assignedEventIds: { type: [String], default: undefined },
    password: { type: String, required: false },
    displayName: { type: String },
    role: { type: String, enum: ['master_admin', 'company_admin', 'organizer', 'seller', 'pr'], default: 'pr' },
    // New accounts use passwordHash. `password` remains for legacy seeded users
    // while they are migrated through the existing admin flow.
    passwordHash: { type: String, default: null },
    active: { type: Boolean, default: true },
    sellerSlot: { type: String, default: null, sparse: true, unique: true },
    blocked: { type: Boolean, default: false },
    allowedPasses: [{
        eventId: { type: String }, // Can store Event ID or Event Name
        passName: { type: String }  // e.g. "Male Pass"
    }]
});
UserSchema.index({ email: 1 }, { sparse: true });

const SellerSessionSchema = new mongoose.Schema({
    sellerId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    loginAt: { type: String },
    ip: { type: String },
    clientKind: { type: String, enum: ['browser', 'native'] }
});

// ==================== SCAN LOG SCHEMA ====================
// Written on EVERY scan attempt (accepted, duplicate, cancelled, invalid).
// Fire-and-forget from the gate endpoint — never blocks the gate response.
const ScanLogSchema = new mongoose.Schema({
    ticketId: { type: String, required: true },
    result: { type: String, enum: ['accepted', 'duplicate', 'cancelled', 'invalid', 'manual_review'], required: true },
    scannedBy: { type: String, default: 'Gate Staff' },
    scannerUserId: { type: String },
    ip: { type: String, default: 'unknown' },
    companyId: { type: String, default: 'littlane' },
    event: { type: String },
    orderId: { type: String },
    admissionCount: { type: Number, min: 1 },
    gate: { type: String },
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
    displayName: { type: String },
    eventNames: [{ type: String }],
    expiresAt: { type: Date },
    clientKind: { type: String, enum: ['browser', 'native'] }
});

const SaleSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    companyId: { type: String, default: 'littlane' },
    event: { type: String },
    // Additive canonical references. Keep `event` as the immutable legacy label
    // so historical ticket links and reports remain readable during migration.
    eventId: { type: String, index: true },
    ticketCategoryId: { type: String },
    inventoryReserved: { type: Boolean, default: false },
    inventoryLimited: { type: Boolean, default: false },
    reservationExpiresAt: { type: Date },
    reservationStatus: { type: String, enum: ['not_required', 'active', 'consuming', 'consumed', 'released', 'expired'] },
    admissionCount: { type: Number, min: 0 },
    scannedAdmissionCount: { type: Number, min: 1 },
    amountMinor: { type: Number, min: 0 },
    paymentStatus: { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'exception', 'refund_pending', 'refunded'] },
    paymentProcessingLeaseUntil: { type: Date },
    paymentException: { type: String },
    paymentVerificationSource: { type: String },
    paymentVerifiedBy: { type: String },
    paymentVerifiedAt: { type: String },
    lastPaymentAttemptId: { type: String },
    lastPaymentAttemptStatus: { type: String },
    lastPaymentAttemptAt: { type: Date },
    fulfillmentStatus: { type: String, enum: ['pending', 'generating', 'ticketed', 'delivery_pending', 'delivered', 'failed', 'inventory_conflict'] },
    ticketGenerationLeaseUntil: { type: Date },
    ticketGenerationError: { type: String },
    refundStatus: { type: String, enum: ['none', 'requested', 'approved', 'rejected', 'processing', 'failed', 'refunded'], default: 'none' },
    refundRequestId: { type: String },
    refundRequesterHash: { type: String },
    refundRequestedAt: { type: Date },
    refundDecidedAt: { type: Date },
    refundDecidedBy: { type: String },
    refundDecisionReason: { type: String },
    refundReason: { type: String },
    refundProviderReference: { type: String },
    refundError: { type: String },
    refundHistory: [{ from: { type: String }, to: { type: String }, actor: { type: String }, reason: { type: String }, at: { type: Date } }],
    razorpayEventIds: [{ type: String }],
    checkoutRequestId: { type: String },
    checkoutRequestHash: { type: String },
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    nickname: { type: String, trim: true, maxlength: 60 },
    gender: { type: String },
    ticketType: { type: String },
    quantity: { type: Number },
    // Immutable transaction snapshot: customer-facing totals retain the
    // official event rate; commission is seller-internal settlement data.
    officialRate: { type: Number },
    customerTotal: { type: Number },
    // Exact price of the selected pass at issuance time. This allows public
    // ticket views to remain correct even when older records had a stale
    // generic `amount` value.
    passUnitPrice: { type: Number },
    commissionPercentage: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    rateAfterCommission: { type: Number },
    amount: { type: Number },
    currency: { type: String },
    status: { type: String },
    paymentId: { type: String },
    providerPaymentId: { type: String },
    ticketId: { type: String },
    emailStatus: { type: String },
    emailError: { type: String },
    whatsappStatus: { type: String },
    whatsappError: { type: String },
    whatsappMessageId: { type: String },
    approvalStatus: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NOT_REQUIRED' },
    approvalRequired: { type: Boolean, default: false },
    approvalRequestedAt: { type: String },
    approvalDecidedAt: { type: String },
    approvedBy: { type: String },
    rejectedBy: { type: String },
    deliveryStatus: { type: String, enum: ['NOT_STARTED', 'PENDING_APPROVAL', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'BLOCKED'], default: 'NOT_STARTED' },
    deliveredAt: { type: String },
    deliveryStartedAt: { type: String },
    deliveryAttemptCount: { type: Number, default: 0 },
    errorLog: { type: Array, default: [] },
    createdAt: { type: String },
    updatedAt: { type: String },
    paidAt: { type: String },
    generatedAt: { type: String },
    scannedBy: { type: String },
    scannedAt: { type: String },
    showInPres: { type: Boolean, default: false },
    sellerId: { type: String },
    generatedBy: { type: String },
    issuedByAdmin: { type: Boolean, default: false },
    prUserId: { type: String },
    prName: { type: String },
    paymentMethod: { type: String },
    shadowPaymentStatus: { type: String, enum: ['paid', 'free_chai_pani'] },
    disabledAt: { type: String },
    disabledBy: { type: String },
    disabledPreviousStatus: { type: String },
    reactivatedAt: { type: String },
    solverOriginalTier: { type: String },
    solverUpgradedAt: { type: String },
    solverUpgradedBy: { type: String },
    solverUpgradeDifference: { type: Number },
    source: { type: String },
    isShadow: { type: Boolean, default: false },
    slots: [{
        checkedIn: { type: Boolean, default: false },
        checkedInBy: { type: String },
        checkedInAt: { type: String }
    }],
    scannedCount: { type: Number, default: 0 }
});
// Gate lookups and the atomic claim both filter by ticketId. Keep this index
// non-unique so existing legacy records are not rejected during index builds.
SaleSchema.index({ ticketId: 1 });
SaleSchema.index({ checkoutRequestId: 1 }, { unique: true, sparse: true });
SaleSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } });
SaleSchema.index({ status: 1, isShadow: 1, source: 1 });

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
        keyId: { type: String, default: '' },
        keySecret: { type: String, default: '' },
        webhookSecret: { type: String, default: '' },
        mode: { type: String, enum: ['TEST', 'LIVE'], default: 'TEST' },
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

const OrganizerApplicationSchema = new mongoose.Schema({
    applicationId: { type: String, required: true, unique: true },
    organizationName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['verification_pending', 'pending_review', 'provisioning', 'approved', 'rejected', 'suspended'], default: 'verification_pending' },
    emailVerifiedAt: { type: Date, default: null },
    companyId: { type: String, default: null },
    userId: { type: String, default: null },
    decisionReason: { type: String, default: '' },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
OrganizerApplicationSchema.index({ status: 1, createdAt: -1 });
OrganizerApplicationSchema.index({ email: 1, status: 1 });

const EventInvitationSchema = new mongoose.Schema({
    invitationId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['seller', 'pr'], required: true },
    companyId: { type: String, required: true },
    eventId: { type: String, required: true },
    invitedBy: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepting', 'accepted', 'revoked', 'expired'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedUserId: { type: String, default: null },
    revokedAt: { type: Date, default: null }
});
EventInvitationSchema.index({ companyId: 1, eventId: 1, status: 1, createdAt: -1 });
EventInvitationSchema.index({ recipientEmail: 1, status: 1 });

const PartnerAccessPolicySchema = new mongoose.Schema({
    role: { type: String, enum: ['seller', 'pr'], required: true },
    principalId: { type: String, required: true },
    companyId: { type: String, required: true },
    eventIds: { type: [String], required: true, default: [] },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});
PartnerAccessPolicySchema.index({ role: 1, principalId: 1 }, { unique: true });

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
    deviceName: { type: String, default: null },
    lastUserAgent: { type: String, default: null },

    // Device IP & Session Versioning
    boundIp: { type: String, default: null },
    boundAt: { type: String, default: null },
    sessionVersion: { type: Number, default: 1 },
    lastSeenAt: { type: String, default: null },
    blocked: { type: Boolean, default: false },
    blockedAt: { type: String, default: null },

    // Temporary Challenge
    currentChallenge: { type: String, default: null },

    loginAttemptLog: [{
        timestamp: { type: String },
        ip: { type: String },
        userAgent: { type: String },
        result: { type: String }
    }]
});

const DashboardSaleVisibilitySchema = new mongoose.Schema({
    saleKey: { type: String, required: true, unique: true },
    orderId: { type: String, default: '' },
    ticketId: { type: String, default: '' },
    sellerId: { type: String, default: '' },
    companyId: { type: String, default: '' },
    included: { type: Boolean, required: true },
    updatedAt: { type: String, required: true },
    updatedBy: { type: String, default: '' },
});

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const CheckoutRequestSchema = new mongoose.Schema({
    idempotencyKey: { type: String, required: true, unique: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    orderId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const CheckoutRequest = mongoose.model('CheckoutRequest', CheckoutRequestSchema);
const OtpChallengeSchema = new mongoose.Schema({
    challengeId: { type: String, required: true, unique: true },
    subjectHash: { type: String, required: true },
    purpose: { type: String, enum: ['booking_recovery', 'refund_request', 'organizer_application', 'organizer_activation'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
});
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpChallengeSchema.index({ subjectHash: 1, purpose: 1, createdAt: -1 });
const OtpChallenge = mongoose.model('OtpChallenge', OtpChallengeSchema);
const OtpRateLimitSchema = new mongoose.Schema({
    bucketKey: { type: String, required: true, unique: true },
    count: { type: Number, required: true },
    windowExpiresAt: { type: Date, required: true }
});
OtpRateLimitSchema.index({ windowExpiresAt: 1 }, { expireAfterSeconds: 0 });
const OtpRateLimit = mongoose.model('OtpRateLimit', OtpRateLimitSchema);
const Company = mongoose.model('Company', CompanySchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const OrganizerApplication = mongoose.model('OrganizerApplication', OrganizerApplicationSchema);
const EventInvitation = mongoose.model('EventInvitation', EventInvitationSchema);
const PartnerAccessPolicy = mongoose.model('PartnerAccessPolicy', PartnerAccessPolicySchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const SellerSession = mongoose.model('SellerSession', SellerSessionSchema);
const ScanLog = mongoose.model('ScanLog', ScanLogSchema);
const UserSession = mongoose.model('UserSession', UserSessionSchema);
const PartnerLock = mongoose.model('PartnerLock', PartnerLockSchema);
const DashboardSaleVisibility = mongoose.model('DashboardSaleVisibility', DashboardSaleVisibilitySchema);

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

        console.log('🌱 Seeding configured multi-tenant platform users...');

        const configuredUsers = [
            { userId: 'superadmin@littx.in', secret: process.env.MASTER_PASS, displayName: 'Stageway Super Admin', role: 'master_admin', companyId: 'all' },
            { userId: 'admin@littlane.in', secret: process.env.COMPANY_ADMIN_PASS, displayName: 'Littlane Admin', role: 'company_admin', companyId: 'littlane' },
            { userId: 'SELLER-A', secret: process.env.SELLER_A_PASS, displayName: 'Seller Alpha', role: 'seller', companyId: 'littlane' },
            { userId: 'SELLER-B', secret: process.env.SELLER_B_PASS, displayName: 'Seller Beta', role: 'seller', companyId: 'littlane' },
            { userId: 'SELLER-C', secret: process.env.SELLER_C_PASS, displayName: 'Seller Gamma', role: 'seller', companyId: '7th-heaven' },
            { userId: 'partner1', secret: process.env.PR1_PASS, displayName: 'Partner One', role: 'pr', companyId: 'littlane' },
            { userId: 'partner2', secret: process.env.PR2_PASS, displayName: 'Partner Two', role: 'pr', companyId: 'littlane' },
            { userId: 'partner5', secret: process.env.PR5_PASS, displayName: 'Partner Five', role: 'pr', companyId: 'littlane' },
        ];
        const defaultUsers = configuredUsers.filter(user => user.secret).map(({ secret, ...user }) => {
            const salt = crypto.randomBytes(16).toString('hex');
            const digest = crypto.scryptSync(secret, salt, 64).toString('hex');
            return { ...user, passwordHash: `scrypt:${salt}:${digest}` };
        });
        if (defaultUsers.length === 0) {
            console.warn('No seed account secrets are configured; no default users were created.');
        } else {
            await User.insertMany(defaultUsers);
            console.log('✅ Configured platform users seeded successfully.');
        }
        await seedDefaultPartnerLocks();
    } catch (err) {
        console.error('❌ Failed to seed platform users:', err.message);
    }
}

async function seedDefaultPartnerLocks() {
    const defaultPartners = [
        { partnerId: 'littlane', name: 'Littlane Ent' },
        { partnerId: 'nitro', name: 'DGR' },
        { partnerId: '7th-heaven', name: '7th Heaven' },
        { partnerId: 'partner-slot-1', name: 'ASTEX Testing' },
        { partnerId: 'partner-slot-2', name: 'Wolfera' }
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

async function deleteSaleRecord(orderId) {
    const result = await Sale.deleteOne({ orderId });
    return result.deletedCount === 1;
}

async function getByOrderId(orderId) {
    return await Sale.findOne({ orderId }).lean();
}

async function getByTicketId(ticketId) {
    return await Sale.findOne({ ticketId }).lean();
}

async function getCustomerBookingsByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return [];
    if (useMock()) return mockDb.sales
        .filter(sale => String(sale.email || '').trim().toLowerCase() === normalized)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Sale.find({ email: { $regex: `^${escaped}$`, $options: 'i' } }).sort({ createdAt: -1 }).lean();
}

async function getAll() {
    return await Sale.find({}).sort({ createdAt: -1 }).lean();
}

async function countScannedSales() {
    return await Sale.countDocuments({
        status: 'scanned',
        isShadow: { $ne: true },
        source: { $nin: ['shadow', 'shadow_private'] }
    });
}

async function atomicApprovePendingSale(orderId, approvedBy, approvedAt, inventory = {}) {
    return await Sale.findOneAndUpdate(
        { orderId, approvalStatus: 'PENDING' },
        {
            $set: {
                approvalStatus: 'APPROVED',
                approvedBy,
                approvalDecidedAt: approvedAt,
                deliveryStatus: 'IN_PROGRESS',
                deliveryStartedAt: approvedAt,
                inventoryReserved: Boolean(inventory.reserved),
                reservationStatus: inventory.limited ? 'active' : 'not_required',
                reservationExpiresAt: inventory.expiresAt || null,
                updatedAt: approvedAt
            },
            $inc: { deliveryAttemptCount: 1 }
        },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicRejectPendingSale(orderId, rejectedBy, rejectedAt) {
    return await Sale.findOneAndUpdate(
        { orderId, approvalStatus: 'PENDING' },
        {
            $set: {
                approvalStatus: 'REJECTED',
                rejectedBy,
                approvalDecidedAt: rejectedAt,
                deliveryStatus: 'BLOCKED',
                updatedAt: rejectedAt
            }
        },
        { returnDocument: 'after', lean: true }
    );
}

async function clearAllSales() {
    const result = await Sale.deleteMany({});
    return result.deletedCount;
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

async function atomicClaimPaymentProcessing(orderId, now, leaseUntil) {
    return Sale.findOneAndUpdate(
        {
            orderId,
            $or: [
                { paymentStatus: 'pending', reservationExpiresAt: { $gt: now } },
                { paymentStatus: 'processing', paymentProcessingLeaseUntil: { $lte: now } },
                { paymentStatus: { $exists: false }, status: 'created' }
            ]
        },
        { $set: { paymentStatus: 'processing', paymentProcessingLeaseUntil: leaseUntil, status: 'payment_processing', updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicMarkPaymentPaid(orderId, paymentId, now, reservationStatus = 'not_required') {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'processing' },
        { $set: { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'pending', reservationStatus, inventoryReserved: false, status: 'paid', updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicRecordCapturedPaymentException(orderId, paymentId, now, message) {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'processing' },
        { $set: { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'inventory_conflict', paymentException: message, status: 'payment_exception', updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicClaimTicketGeneration(orderId, now, leaseUntil) {
    return Sale.findOneAndUpdate(
        {
            orderId, paymentStatus: 'paid', ticketId: { $in: [null, ''] },
            $or: [
                { fulfillmentStatus: { $in: ['pending', 'failed'] } },
                { fulfillmentStatus: 'generating', ticketGenerationLeaseUntil: { $lte: now } },
                { fulfillmentStatus: { $exists: false } }
            ]
        },
        { $set: { fulfillmentStatus: 'generating', ticketGenerationLeaseUntil: leaseUntil, updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicAssignGeneratedTicket(orderId, ticketId, generatedAt) {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'paid', fulfillmentStatus: 'generating', ticketId: { $in: [null, ''] } },
        { $set: { ticketId, generatedAt, fulfillmentStatus: 'ticketed', status: 'ticket_generated', updatedAt: generatedAt } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicFailTicketGeneration(orderId, error, now) {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'paid', fulfillmentStatus: 'generating', ticketId: { $in: [null, ''] } },
        { $set: { fulfillmentStatus: 'failed', status: 'ticket_generation_failed', ticketGenerationError: String(error).slice(0, 500), updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicExpireOrder(orderId, now) {
    return Sale.findOneAndUpdate(
        {
            orderId,
            reservationExpiresAt: { $lte: now },
            $or: [{ paymentStatus: 'pending' }, { paymentStatus: { $exists: false }, status: 'created' }]
        },
        { $set: { paymentStatus: 'expired', reservationStatus: 'expired', status: 'expired', updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicRecordLateCapturedPayment(orderId, paymentId, now) {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'expired' },
        { $set: { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'inventory_conflict', status: 'payment_exception', paymentException: 'Payment captured after inventory reservation expired; manual reconciliation required.', updatedAt: now } },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicRequestRefund(orderId, { requestId, requesterHash, reason, now }) {
    return Sale.findOneAndUpdate(
        { orderId, paymentStatus: 'paid', ticketId: { $exists: true, $nin: [null, ''] }, refundStatus: { $in: ['none', null] }, status: { $nin: ['cancelled', 'refunded'] } },
        {
            $set: { refundStatus: 'requested', refundRequestId: requestId, refundRequesterHash: requesterHash, refundReason: reason, refundRequestedAt: now, updatedAt: now },
            $push: { refundHistory: { from: 'none', to: 'requested', actor: 'customer_verified_otp', reason, at: now } }
        },
        { returnDocument: 'after', lean: true }
    );
}

async function atomicDecideRefund(orderId, { decision, actor, reason, now }) {
    if (!['approved', 'rejected'].includes(decision)) return null;
    return Sale.findOneAndUpdate(
        { orderId, refundStatus: 'requested' },
        {
            $set: { refundStatus: decision, refundDecidedAt: now, refundDecidedBy: actor, refundDecisionReason: reason || '', updatedAt: now },
            $push: { refundHistory: { from: 'requested', to: decision, actor, reason: reason || '', at: now } }
        },
        { returnDocument: 'after', lean: true }
    );
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

async function releaseSellerSlot(userId) {
    return await User.findOneAndUpdate(
        { userId },
        { $unset: { sellerSlot: 1 } },
        { returnDocument: 'after', lean: true }
    );
}

async function createUser(userData) {
    return await new User(userData).save();
}

async function deleteUser(userId) {
    return await User.findOneAndDelete({ userId }).lean();
}

async function getUserBySellerSlot(sellerSlot) {
    return await User.findOne({ sellerSlot }).lean();
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

async function getEventBySlug(slug) {
    return await Event.findOne({ slug: String(slug || '').toLowerCase() }).lean();
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

function matchesEventRef(event, eventRef) {
    const ref = String(eventRef || '');
    return [event?.id, event?._id, event?.slug].some(value => String(value || '') === ref);
}

async function reserveEventInventory({ eventId, reservationId, categoryId, admissionCount, expiresAt }) {
    if (!Number.isInteger(admissionCount) || admissionCount < 1) return { ok: false, reason: 'invalid_quantity' };
    if (useMock()) {
        const event = [...new Set(_mockEvents.values())].find(item => matchesEventRef(item, eventId));
        if (!event) return { ok: false, reason: 'event_not_found' };
        const existing = (event.inventoryReservations || []).find(item => item.reservationId === reservationId);
        if (existing) return { ok: existing.categoryId === categoryId && existing.admissionCount === admissionCount, reserved: true, reused: true, reason: 'reservation_exists' };
        const category = (event.ticketCategories || []).find(item => item.id === categoryId);
        if (!category) return { ok: false, reason: 'category_not_found' };
        if (category.totalInventory === null || category.totalInventory === undefined) return { ok: true, reserved: false, unlimited: true };
        if (!Number.isInteger(category.remainingAvailability) || category.remainingAvailability < 0) return { ok: false, reason: 'inventory_unreconciled' };
        if (category.status !== 'active' || category.remainingAvailability < admissionCount) return { ok: false, reason: 'sold_out' };
        category.remainingAvailability -= admissionCount;
        event.inventoryReservations = event.inventoryReservations || [];
        event.inventoryReservations.push({ reservationId, categoryId, admissionCount, expiresAt: new Date(expiresAt), status: 'active', createdAt: new Date() });
        return { ok: true, reserved: true, admissionCount };
    }

    const ref = String(eventId || '');
    const selector = mongoose.Types.ObjectId.isValid(ref)
        ? { $or: [{ id: ref }, { _id: new mongoose.Types.ObjectId(ref) }] }
        : { $or: [{ id: ref }, { slug: ref }] };
    const existing = await Event.findOne({ ...selector, 'inventoryReservations.reservationId': reservationId }).lean();
    const existingReservation = existing?.inventoryReservations?.find(item => item.reservationId === reservationId);
    if (existingReservation) return {
        ok: existingReservation.categoryId === categoryId && existingReservation.admissionCount === admissionCount,
        reserved: true, reused: true, reason: 'reservation_exists'
    };
    const event = await Event.findOne(selector, { ticketCategories: 1 }).lean();
    const category = event?.ticketCategories?.find(item => item.id === categoryId);
    if (!category) return { ok: false, reason: 'category_not_found' };
    if (category.totalInventory === null || category.totalInventory === undefined) return { ok: true, reserved: false, unlimited: true };
    if (!Number.isInteger(category.remainingAvailability) || category.remainingAvailability < 0) return { ok: false, reason: 'inventory_unreconciled' };
    const updated = await Event.findOneAndUpdate(
        {
            ...selector,
            'inventoryReservations.reservationId': { $ne: reservationId },
            ticketCategories: { $elemMatch: { id: categoryId, status: 'active', remainingAvailability: { $gte: admissionCount }, totalInventory: { $ne: null } } }
        },
        {
            $inc: { 'ticketCategories.$[category].remainingAvailability': -admissionCount },
            $push: { inventoryReservations: { reservationId, categoryId, admissionCount, expiresAt: new Date(expiresAt), status: 'active', createdAt: new Date() } }
        },
        { arrayFilters: [{ 'category.id': categoryId }], returnDocument: 'after', lean: true }
    );
    return updated ? { ok: true, reserved: true, admissionCount } : { ok: false, reason: 'sold_out' };
}

async function releaseEventInventoryReservation({ eventId, reservationId, now = new Date(), expiredOnly = false }) {
    if (useMock()) {
        const event = [...new Set(_mockEvents.values())].find(item => matchesEventRef(item, eventId));
        const reservation = event?.inventoryReservations?.find(item => item.reservationId === reservationId && item.status === 'active');
        if (!reservation || (expiredOnly && new Date(reservation.expiresAt).getTime() > new Date(now).getTime())) return false;
        const category = (event.ticketCategories || []).find(item => item.id === reservation.categoryId);
        if (!category) return false;
        if (Number.isInteger(category.remainingAvailability)) category.remainingAvailability += reservation.admissionCount;
        event.inventoryReservations = event.inventoryReservations.filter(item => item.reservationId !== reservationId);
        return true;
    }
    const ref = String(eventId || '');
    const selector = mongoose.Types.ObjectId.isValid(ref)
        ? { $or: [{ id: ref }, { _id: new mongoose.Types.ObjectId(ref) }] }
        : { $or: [{ id: ref }, { slug: ref }] };
    const event = await Event.findOne({ ...selector, 'inventoryReservations.reservationId': reservationId }, { inventoryReservations: 1 }).lean();
    const reservation = event?.inventoryReservations?.find(item => item.reservationId === reservationId && item.status === 'active');
    if (!reservation || (expiredOnly && new Date(reservation.expiresAt).getTime() > new Date(now).getTime())) return false;
    const reservationSelector = { reservationId, status: 'active' };
    if (expiredOnly) reservationSelector.expiresAt = { $lte: new Date(now) };
    const released = await Event.findOneAndUpdate(
        { ...selector, inventoryReservations: { $elemMatch: reservationSelector } },
        {
            $inc: { 'ticketCategories.$[category].remainingAvailability': reservation.admissionCount },
            $pull: { inventoryReservations: { reservationId, status: 'active' } }
        },
        { arrayFilters: [{ 'category.id': reservation.categoryId }], returnDocument: 'after', lean: true }
    );
    return Boolean(released);
}

async function consumeEventInventoryReservation({ eventId, reservationId }) {
    if (useMock()) {
        const event = [...new Set(_mockEvents.values())].find(item => matchesEventRef(item, eventId));
        const reservation = event?.inventoryReservations?.find(item => item.reservationId === reservationId);
        if (!reservation) return false;
        if (reservation.status === 'active') reservation.status = 'consuming';
        return ['active', 'consuming'].includes(reservation.status);
    }
    const ref = String(eventId || '');
    const selector = mongoose.Types.ObjectId.isValid(ref)
        ? { $or: [{ id: ref }, { _id: new mongoose.Types.ObjectId(ref) }] }
        : { $or: [{ id: ref }, { slug: ref }] };
    const consumed = await Event.findOneAndUpdate(
        { ...selector, inventoryReservations: { $elemMatch: { reservationId, status: { $in: ['active', 'consuming'] }, expiresAt: { $gt: new Date() } } } },
        { $set: { 'inventoryReservations.$.status': 'consuming' } },
        { returnDocument: 'after', lean: true }
    );
    if (consumed) return true;
    const alreadyConsuming = await Event.exists({ ...selector, inventoryReservations: { $elemMatch: { reservationId, status: 'consuming' } } });
    return Boolean(alreadyConsuming);
}

async function finalizeConsumedInventoryReservation({ eventId, reservationId }) {
    if (useMock()) {
        const event = [...new Set(_mockEvents.values())].find(item => matchesEventRef(item, eventId));
        if (!event?.inventoryReservations?.some(item => item.reservationId === reservationId && item.status === 'consuming')) return false;
        event.inventoryReservations = event.inventoryReservations.filter(item => item.reservationId !== reservationId);
        return true;
    }
    const ref = String(eventId || '');
    const selector = mongoose.Types.ObjectId.isValid(ref)
        ? { $or: [{ id: ref }, { _id: new mongoose.Types.ObjectId(ref) }] }
        : { $or: [{ id: ref }, { slug: ref }] };
    const result = await Event.updateOne(
        { ...selector, 'inventoryReservations.reservationId': reservationId, 'inventoryReservations.status': 'consuming' },
        { $pull: { inventoryReservations: { reservationId, status: 'consuming' } } }
    );
    return result.modifiedCount > 0;
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
                name: 'Littlane Ent',
                status: 'ACTIVE',
                commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
                razorpayConfig: { enabled: false, keyId: '', keySecret: '', webhookSecret: '', mode: 'TEST', lockedByMaster: false },
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

async function ensureCompany(companyId, name) {
    const now = new Date().toISOString();
    const defaults = {
        companyId,
        status: 'ACTIVE',
        commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
        razorpayConfig: { enabled: false, keyId: '', keySecret: '', webhookSecret: '', mode: 'TEST', lockedByMaster: false },
        manualPaymentConfig: { enabled: true, allowedMethods: ['cash', 'bank_transfer', 'upi_manual'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
        features: {
            onlinePayments: { enabled: false, lockedByMaster: false },
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
        createdAt: now
    };
    return await Company.findOneAndUpdate(
        { companyId },
        { $set: { name, updatedAt: now }, $setOnInsert: defaults },
        { upsert: true, returnDocument: 'after', lean: true }
    );
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
        companyName: company.name || 'Littlane Ent',
        companyStatus: company.status,
        effective
    };
}

// ==================== IN-MEMORY MOCK DATABASE FALLBACK (For Vercel/Disconnected DB) ====================

const mockDb = {
    users: [],
    customers: [],
    events: [],
    sales: [],
    checkoutRequests: [],
    otpChallenges: [],
    otpRateLimits: new Map(),
    companies: [
        {
            companyId: 'littlane',
            name: 'Littlane Ent',
            status: 'ACTIVE',
            commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
            razorpayConfig: { enabled: false, keyId: '', keySecret: '', webhookSecret: '', mode: 'TEST', lockedByMaster: false },
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
mockDb.organizerApplications = [];
mockDb.eventInvitations = [];
mockDb.partnerAccessPolicies = [];

function useMock() {
    // If an explicit MONGODB_URI is provided (like on Vercel), NEVER use mock.
    // Mongoose will automatically buffer queries while readyState is 2 (connecting).
    if (process.env.MONGODB_URI) return false;
    
    // Otherwise (local dev fallback), use mock if disconnected.
    return mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2;
}

// In-memory fallback for local dev (when MongoDB is not available)
// /tmp is writable on Vercel; fallback to __dirname for local dev
const _tmpSalesFile = path.join(os.tmpdir(), 'littx_mock_sales.json');
const _localSalesFile = path.join(__dirname, 'mock_sales.json');

function _pickSalesFile() {
    if (process.env.LITTX_MOCK_SALES_FILE) return process.env.LITTX_MOCK_SALES_FILE;
    // If local path is writable, use it (local dev). Otherwise use /tmp (Vercel).
    try {
        fs.accessSync(path.dirname(_localSalesFile), fs.constants.W_OK);
        return _localSalesFile;
    } catch (_) {
        return _tmpSalesFile;
    }
}
const MOCK_SALES_FILE = _pickSalesFile();

function _loadMockSales() {
    // Try both paths
    const paths = [MOCK_SALES_FILE, MOCK_SALES_FILE === _localSalesFile ? _tmpSalesFile : _localSalesFile];
    for (const p of paths) {
        try {
            if (fs.existsSync(p)) {
                const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (_) {}
    }
    return [];
}

function _saveMockSales(salesArray) {
    const paths = [MOCK_SALES_FILE, MOCK_SALES_FILE === _localSalesFile ? _tmpSalesFile : _localSalesFile];
    for (const p of paths) {
        try {
            fs.writeFileSync(p, JSON.stringify(salesArray, null, 2), 'utf8');
            return; // success
        } catch (_) {}
    }
    console.error('[mock sales save error] Could not write to any path');
}

mockDb.sales = _loadMockSales();
console.log(`[MockDB] Loaded ${mockDb.sales.length} mock sales from ${MOCK_SALES_FILE}`);

const _mockSessions = new Map();
const _mockUserSessions = new Map();
const _mockScanLogs = [];
const _mockPartnerLocks = new Map([
    ['littlane', { partnerId: 'littlane', name: 'Littlane Ent', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['nitro', { partnerId: 'nitro', name: 'DGR', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['7th-heaven', { partnerId: '7th-heaven', name: '7th Heaven', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['partner-slot-1', { partnerId: 'partner-slot-1', name: 'ASTEX Testing', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }],
    ['partner-slot-2', { partnerId: 'partner-slot-2', name: 'Wolfera', boundIp: null, boundAt: null, sessionVersion: 1, lastSeenAt: null, loginAttemptLog: [] }]
]);
const _mockDashboardSaleVisibility = new Map();

const _mockDevices = new Map();
const _mockChallenges = new Map();

module.exports = {
    // Connection helpers used by the Express API middleware. In production a
    // request must wait for Atlas before it runs a database query.
    connectDb,
    hasConfiguredMongo: HAS_CONFIGURED_MONGODB,
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
    OrganizerApplication,
    EventInvitation,
    PartnerAccessPolicy,

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
    getSaleByCheckoutRequestId: async idempotencyKey => {
        if (useMock()) return mockDb.sales.find(item => item.checkoutRequestId === idempotencyKey) || null;
        return Sale.findOne({ checkoutRequestId: idempotencyKey }).lean();
    },
    claimCheckoutRequest: async (idempotencyKey, requestHash) => {
        if (useMock()) {
            const existing = mockDb.checkoutRequests.find(item => item.idempotencyKey === idempotencyKey);
            if (existing && (existing.status !== 'processing' || Date.now() - new Date(existing.updatedAt).getTime() < 2 * 60 * 1000)) return { claimed: false, request: existing };
            if (existing) {
                existing.updatedAt = new Date();
                return { claimed: true, request: existing, reclaimed: true };
            }
            const request = { idempotencyKey, requestHash, status: 'processing', createdAt: new Date(), updatedAt: new Date() };
            mockDb.checkoutRequests.push(request);
            return { claimed: true, request };
        }
        try {
            const request = await CheckoutRequest.create({ idempotencyKey, requestHash, status: 'processing' });
            return { claimed: true, request: request.toObject() };
        } catch (error) {
            if (error.code !== 11000) throw error;
            const existing = await CheckoutRequest.findOne({ idempotencyKey }).lean();
            if (existing?.status === 'processing' && existing.requestHash === requestHash && Date.now() - new Date(existing.updatedAt).getTime() >= 2 * 60 * 1000) {
                const reclaimed = await CheckoutRequest.findOneAndUpdate(
                    { idempotencyKey, requestHash, status: 'processing', updatedAt: { $lte: new Date(Date.now() - 2 * 60 * 1000) } },
                    { $set: { updatedAt: new Date() } }, { returnDocument: 'after', lean: true }
                );
                if (reclaimed) return { claimed: true, request: reclaimed, reclaimed: true };
            }
            return { claimed: false, request: existing };
        }
    },
    completeCheckoutRequest: async (idempotencyKey, orderId) => {
        if (useMock()) {
            const request = mockDb.checkoutRequests.find(item => item.idempotencyKey === idempotencyKey);
            if (!request || request.status !== 'processing') return null;
            Object.assign(request, { status: 'completed', orderId, updatedAt: new Date() });
            return request;
        }
        return CheckoutRequest.findOneAndUpdate({ idempotencyKey, status: 'processing' }, { $set: { status: 'completed', orderId, updatedAt: new Date() } }, { returnDocument: 'after', lean: true });
    },
    failCheckoutRequest: async (idempotencyKey) => {
        if (useMock()) {
            const request = mockDb.checkoutRequests.find(item => item.idempotencyKey === idempotencyKey);
            if (!request || request.status !== 'processing') return false;
            request.status = 'failed';
            request.updatedAt = new Date();
            return true;
        }
        const result = await CheckoutRequest.updateOne({ idempotencyKey, status: 'processing' }, { $set: { status: 'failed', updatedAt: new Date() } });
        return result.modifiedCount > 0;
    },
    consumeOtpIssueRateLimit: async ({ bucketKey, windowStart, windowExpiresAt, limit }) => {
        const now = new Date(windowStart);
        const expires = new Date(windowExpiresAt);
        if (useMock()) {
            const bucket = mockDb.otpRateLimits.get(bucketKey);
            if (!bucket || new Date(bucket.windowExpiresAt) <= now) {
                mockDb.otpRateLimits.set(bucketKey, { count: 1, windowExpiresAt: expires });
                return true;
            }
            if (bucket.count >= limit) return false;
            bucket.count += 1;
            return true;
        }
        const current = await OtpRateLimit.updateOne(
            { bucketKey, windowExpiresAt: { $gt: now }, count: { $lt: limit } }, { $inc: { count: 1 } }
        );
        if (current.modifiedCount) return true;
        const reset = await OtpRateLimit.updateOne(
            { bucketKey, windowExpiresAt: { $lte: now } }, { $set: { count: 1, windowExpiresAt: expires } }
        );
        if (reset.modifiedCount) return true;
        try {
            await OtpRateLimit.create({ bucketKey, count: 1, windowExpiresAt: expires });
            return true;
        } catch (error) {
            if (error.code !== 11000) throw error;
            const retried = await OtpRateLimit.updateOne(
                { bucketKey, windowExpiresAt: { $gt: now }, count: { $lt: limit } }, { $inc: { count: 1 } }
            );
            return retried.modifiedCount > 0;
        }
    },
    createOtpChallenge: async challenge => {
        if (useMock()) {
            mockDb.otpChallenges.push({ ...challenge });
            return challenge;
        }
        return OtpChallenge.create(challenge);
    },
    consumeOtpChallenge: async ({ challengeId, subjectHash, purpose, codeHash, now, maxAttempts }) => {
        const at = new Date(now);
        if (useMock()) {
            const challenge = mockDb.otpChallenges.find(item => item.challengeId === challengeId && item.subjectHash === subjectHash && item.purpose === purpose);
            if (!challenge) return { ok: false, reason: 'invalid' };
            if (challenge.usedAt) return { ok: false, reason: 'used' };
            if (new Date(challenge.expiresAt) <= at) return { ok: false, reason: 'expired' };
            if (challenge.attempts >= maxAttempts) return { ok: false, reason: 'locked' };
            if (challenge.codeHash !== codeHash) { challenge.attempts += 1; return { ok: false, reason: challenge.attempts >= maxAttempts ? 'locked' : 'invalid' }; }
            challenge.usedAt = at;
            return { ok: true };
        }
        const consumed = await OtpChallenge.findOneAndUpdate(
            { challengeId, subjectHash, purpose, codeHash, expiresAt: { $gt: at }, usedAt: null, attempts: { $lt: maxAttempts } },
            { $set: { usedAt: at } }, { returnDocument: 'after', lean: true }
        );
        if (consumed) return { ok: true };
        const failed = await OtpChallenge.findOneAndUpdate(
            { challengeId, subjectHash, purpose, codeHash: { $ne: codeHash }, expiresAt: { $gt: at }, usedAt: null, attempts: { $lt: maxAttempts } },
            { $inc: { attempts: 1 } }, { returnDocument: 'after', lean: true }
        );
        if (failed) return { ok: false, reason: failed.attempts >= maxAttempts ? 'locked' : 'invalid' };
        const current = await OtpChallenge.findOne({ challengeId, subjectHash, purpose }, { expiresAt: 1, usedAt: 1, attempts: 1 }).lean();
        if (!current) return { ok: false, reason: 'invalid' };
        if (current.usedAt) return { ok: false, reason: 'used' };
        if (current.expiresAt <= at) return { ok: false, reason: 'expired' };
        if (current.attempts >= maxAttempts) return { ok: false, reason: 'locked' };
        return { ok: false, reason: 'invalid' };
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
    deleteSaleRecord: async (orderId) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId);
            if (idx === -1) return false;
            mockDb.sales.splice(idx, 1);
            _saveMockSales(mockDb.sales);
            return true;
        }
        return await deleteSaleRecord(orderId);
    },
    atomicApprovePendingSale: async (orderId, approvedBy, approvedAt, inventory = {}) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId && s.approvalStatus === 'PENDING');
            if (idx === -1) return null;
            mockDb.sales[idx] = {
                ...mockDb.sales[idx],
                approvalStatus: 'APPROVED',
                approvedBy,
                approvalDecidedAt: approvedAt,
                deliveryStatus: 'IN_PROGRESS',
                deliveryStartedAt: approvedAt,
                inventoryReserved: Boolean(inventory.reserved),
                reservationStatus: inventory.limited ? 'active' : 'not_required',
                reservationExpiresAt: inventory.expiresAt || null,
                deliveryAttemptCount: (mockDb.sales[idx].deliveryAttemptCount || 0) + 1,
                updatedAt: approvedAt
            };
            _saveMockSales(mockDb.sales);
            return mockDb.sales[idx];
        }
        return await atomicApprovePendingSale(orderId, approvedBy, approvedAt, inventory);
    },
    atomicRejectPendingSale: async (orderId, rejectedBy, rejectedAt) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId && s.approvalStatus === 'PENDING');
            if (idx === -1) return null;
            mockDb.sales[idx] = {
                ...mockDb.sales[idx],
                approvalStatus: 'REJECTED',
                rejectedBy,
                approvalDecidedAt: rejectedAt,
                deliveryStatus: 'BLOCKED',
                updatedAt: rejectedAt
            };
            _saveMockSales(mockDb.sales);
            return mockDb.sales[idx];
        }
        return await atomicRejectPendingSale(orderId, rejectedBy, rejectedAt);
    },
    atomicApproveCashSale: async (orderId, approvedBy, approvedAt, inventory = {}) => {
        const update = {
            status: 'paid',
            paymentId: null,
            paymentStatus: 'paid',
            paymentVerificationSource: 'admin_cash_approval',
            paymentVerifiedBy: approvedBy,
            paymentVerifiedAt: approvedAt,
            paidAt: approvedAt,
            fulfillmentStatus: 'pending',
            inventoryReserved: Boolean(inventory.reserved),
            reservationStatus: inventory.limited ? 'active' : 'not_required',
            reservationExpiresAt: inventory.expiresAt || null,
            inventoryReserved: Boolean(inventory.reserved),
            reservationStatus: inventory.limited ? 'active' : 'not_required',
            reservationExpiresAt: inventory.expiresAt || null,
            approvalStatus: 'APPROVED',
            approvedBy,
            approvalDecidedAt: approvedAt,
            deliveryStatus: 'IN_PROGRESS',
            deliveryStartedAt: approvedAt,
        };
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId && s.status === 'pr_cash_pending');
            if (idx === -1) return null;
            mockDb.sales[idx] = { ...mockDb.sales[idx], ...update, updatedAt: approvedAt };
            _saveMockSales(mockDb.sales);
            return mockDb.sales[idx];
        }
        return Sale.findOneAndUpdate({ orderId, status: 'pr_cash_pending' }, { $set: { ...update, updatedAt: approvedAt } }, { returnDocument: 'after', lean: true });
    },
    atomicRejectCashSale: async (orderId, rejectedBy, rejectedAt) => {
        const update = { status: 'pr_cash_rejected', approvalStatus: 'REJECTED', rejectedBy, approvalDecidedAt: rejectedAt, deliveryStatus: 'BLOCKED' };
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s => s.orderId === orderId && s.status === 'pr_cash_pending');
            if (idx === -1) return null;
            mockDb.sales[idx] = { ...mockDb.sales[idx], ...update, updatedAt: rejectedAt };
            _saveMockSales(mockDb.sales);
            return mockDb.sales[idx];
        }
        return Sale.findOneAndUpdate({ orderId, status: 'pr_cash_pending' }, { $set: { ...update, updatedAt: rejectedAt } }, { returnDocument: 'after', lean: true });
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
    getCustomerBookingsByEmail: async (email) => getCustomerBookingsByEmail(email),
    getAll: async () => {
        if (useMock()) {
            return [...mockDb.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return await getAll();
    },
    solverListSales: async ({ filter = {}, search = '', skip = 0, limit = 50 }) => {
        const solverSource = sale => {
            const source = String(sale.source || '').toLowerCase();
            if (sale.isShadow || source.includes('shadow')) return 'Shadow';
            if (source.includes('pr') || sale.prUserId || sale.prName) return 'PR';
            if (source.includes('offline')) return 'Offline';
            if (source.includes('manual') || String(sale.paymentMethod || '').toLowerCase().includes('manual')) return 'Manual';
            if (sale.sellerId || source.includes('seller')) return 'Seller';
            return 'Admin';
        };
        if (useMock()) {
            const rows = mockDb.sales.filter(sale => {
                if (!sale.ticketId) return false;
                const disabled = Boolean(sale.disabledAt);
                const used = sale.status === 'scanned' || (sale.scannedAt && !sale.reactivatedAt);
                if (filter.disabledOnly && !disabled) return false;
                if (filter.cancelledOnly && (sale.status !== 'cancelled' || disabled)) return false;
                if (filter.status?.length && !filter.status.includes(sale.status)) return false;
                if (filter.statusState === 'active' && (disabled || sale.status === 'cancelled' || used)) return false;
                if (filter.statusState === 'used' && !used) return false;
                if (filter.event && sale.event !== filter.event) return false;
                if (filter.ticketType && (sale.ticketType || sale.gender) !== filter.ticketType) return false;
                if (filter.source && solverSource(sale).toLowerCase() !== String(filter.source).toLowerCase()) return false;
                const createdAt = String(sale.createdAt || sale.generatedAt || '');
                if (filter.from && createdAt < filter.from) return false;
                if (filter.to && createdAt > `${filter.to}T23:59:59.999Z`) return false;
                if (search && ![sale.ticketId, sale.name, sale.phone, sale.email, sale.generatedBy, sale.sellerId, sale.prName].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))) return false;
                return true;
            }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            return { rows: rows.slice(skip, skip + limit), total: rows.length };
        }
        const query = { ticketId: { $exists: true, $nin: ['', null] } };
        if (filter.disabledOnly) query.disabledAt = { $nin: [null, ''] };
        if (filter.cancelledOnly) { query.status = 'cancelled'; query.disabledAt = { $in: [null, ''] }; }
        else if (filter.status?.length) query.status = { $in: filter.status };
        if (filter.statusState === 'active') {
            query.disabledAt = { $in: [null, ''] };
            query.status = { $nin: ['cancelled', 'scanned'] };
            query.$and = [...(query.$and || []), { $or: [{ scannedAt: { $in: [null, ''] } }, { reactivatedAt: { $nin: [null, ''] } }] }];
        }
        if (filter.statusState === 'used') query.$and = [...(query.$and || []), { $or: [{ status: 'scanned' }, { scannedAt: { $nin: [null, ''] }, reactivatedAt: { $in: [null, ''] } }] }];
        if (filter.event) query.event = filter.event;
        if (filter.ticketType) query.$and = [...(query.$and || []), { $or: [{ ticketType: filter.ticketType }, { ticketType: { $exists: false }, gender: filter.ticketType }] }];
        if (filter.source) {
            const expected = filter.source;
            const has = field => ({ [field]: { $exists: true, $nin: ['', null] } });
            const absent = field => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] });
            const sourceRegex = value => ({ source: { $regex: value, $options: 'i' } });
            let sourceCondition;
            if (expected === 'Shadow') sourceCondition = { $or: [{ isShadow: true }, sourceRegex('shadow')] };
            else if (expected === 'PR') sourceCondition = { $or: [sourceRegex('pr'), has('prUserId'), has('prName')] };
            else if (expected === 'Offline') sourceCondition = sourceRegex('offline');
            else if (expected === 'Manual') sourceCondition = { $or: [sourceRegex('manual'), { paymentMethod: { $regex: 'manual', $options: 'i' } }] };
            else if (expected === 'Seller') sourceCondition = { $and: [{ $or: [sourceRegex('seller'), has('sellerId')] }, { isShadow: { $ne: true } }, absent('prUserId'), absent('prName') ] };
            else sourceCondition = { $and: [{ isShadow: { $ne: true } }, absent('sellerId'), absent('prUserId'), absent('prName'), { source: { $nin: ['shadow', 'shadow_private'] } }, { paymentMethod: { $not: /manual/i } }] };
            query.$and = [...(query.$and || []), sourceCondition];
        }
        if (filter.from || filter.to) query.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: `${filter.to}T23:59:59.999Z` } : {}) };
        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$and = [...(query.$and || []), { $or: ['ticketId', 'name', 'phone', 'email', 'generatedBy', 'sellerId', 'prName'].map(field => ({ [field]: { $regex: safe, $options: 'i' } })) }];
        }
        const [rows, total] = await Promise.all([Sale.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Sale.countDocuments(query)]);
        return { rows, total };
    },
    solverCountSales: async () => {
        if (useMock()) {
            const rows = mockDb.sales.filter(sale => sale.ticketId);
            return { total: rows.length, active: rows.filter(s => !s.disabledAt && s.status !== 'cancelled' && s.status !== 'scanned' && (!s.scannedAt || s.reactivatedAt)).length, used: rows.filter(s => s.status === 'scanned' || (s.scannedAt && !s.reactivatedAt)).length, disabled: rows.filter(s => Boolean(s.disabledAt)).length, cancelled: rows.filter(s => s.status === 'cancelled' && !s.disabledAt).length, upgraded: rows.filter(s => Boolean(s.solverUpgradedAt)).length };
        }
        const base = { ticketId: { $exists: true, $nin: ['', null] } };
        const count = extra => Sale.countDocuments({ ...base, ...extra });
        const [total, active, used, disabled, cancelled, upgraded] = await Promise.all([
            count({}), count({ disabledAt: { $in: [null, ''] }, status: { $nin: ['cancelled', 'scanned'] }, $or: [{ scannedAt: { $in: [null, ''] } }, { reactivatedAt: { $nin: [null, ''] } }] }),
            count({ $or: [{ status: 'scanned' }, { scannedAt: { $nin: [null, ''] }, reactivatedAt: { $in: [null, ''] } }] }),
            count({ disabledAt: { $nin: [null, ''] } }), count({ status: 'cancelled', disabledAt: { $in: [null, ''] } }), count({ solverUpgradedAt: { $nin: [null, ''] } })
        ]);
        return { total, active, used, disabled, cancelled, upgraded };
    },
    solverUpdateSale: async (orderId, expectedStatus, updates) => {
        if (useMock()) {
            const sale = mockDb.sales.find(s => s.orderId === orderId && s.status === expectedStatus);
            if (!sale) return null;
            Object.assign(sale, updates, { updatedAt: new Date().toISOString() }); _saveMockSales(mockDb.sales); return sale;
        }
        const current = await Sale.findOne({ orderId }).lean();
        if (!current || current.status !== expectedStatus) return null;
        return Sale.findOneAndUpdate({ orderId, status: expectedStatus, updatedAt: current.updatedAt }, { $set: { ...updates, updatedAt: new Date().toISOString() } }, { returnDocument: 'after', lean: true });
    },
    getTicketHistory: async (ticketId) => {
        if (useMock()) {
            const scans = _mockScanLogs.filter(item => item.ticketId === ticketId).map(item => ({ kind: 'scan', ...item }));
            const audits = mockDb.auditLogs.filter(item => String(item.fieldChanged || '').includes(ticketId)).map(item => ({ kind: 'audit', ...item }));
            return [...scans, ...audits].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        const escaped = ticketId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const [scans, audits] = await Promise.all([ScanLog.find({ ticketId }).sort({ timestamp: 1 }).lean(), AuditLog.find({ fieldChanged: { $regex: escaped, $options: 'i' } }).sort({ timestamp: 1 }).lean()]);
        return [...scans.map(item => ({ kind: 'scan', ...item })), ...audits.map(item => ({ kind: 'audit', ...item }))].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    },
    countScannedSales: async () => {
        if (useMock()) return mockDb.sales.filter(s => s.status === 'scanned' && !s.isShadow && s.source !== 'shadow' && s.source !== 'shadow_private').length;
        return await countScannedSales();
    },
    clearAllSales: async () => {
        if (useMock()) {
            const deletedCount = mockDb.sales.length;
            mockDb.sales = [];
            _saveMockSales(mockDb.sales);
            return deletedCount;
        }
        return await clearAllSales();
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
    atomicClaimPaymentProcessing: async (orderId, now, leaseUntil) => {
        if (!useMock()) return atomicClaimPaymentProcessing(orderId, new Date(now), new Date(leaseUntil));
        const sale = mockDb.sales.find(item => item.orderId === orderId);
        if (!sale) return null;
        const state = sale.paymentStatus || (sale.status === 'created' ? 'pending' : sale.status === 'paid' ? 'paid' : sale.status);
        const hasUnexpiredHold = !sale.reservationExpiresAt || new Date(sale.reservationExpiresAt) > new Date(now);
        const available = (state === 'pending' && hasUnexpiredHold) || (state === 'processing' && new Date(sale.paymentProcessingLeaseUntil || 0) <= new Date(now));
        if (!available) return null;
        Object.assign(sale, { paymentStatus: 'processing', paymentProcessingLeaseUntil: leaseUntil, status: 'payment_processing', updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicMarkPaymentPaid: async (orderId, paymentId, now, reservationStatus = 'not_required') => {
        if (!useMock()) return atomicMarkPaymentPaid(orderId, paymentId, now, reservationStatus);
        const sale = mockDb.sales.find(item => item.orderId === orderId);
        if (!sale || sale.paymentStatus !== 'processing') return null;
        if (paymentId && mockDb.sales.some(item => item.orderId !== orderId && item.providerPaymentId === paymentId)) {
            const duplicate = new Error('Provider payment is already associated with another order.'); duplicate.code = 11000; throw duplicate;
        }
        Object.assign(sale, { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'pending', reservationStatus, inventoryReserved: false, status: 'paid', updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicRecordCapturedPaymentException: async (orderId, paymentId, now, message) => {
        if (!useMock()) return atomicRecordCapturedPaymentException(orderId, paymentId, now, message);
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'processing');
        if (!sale) return null;
        if (paymentId && mockDb.sales.some(item => item.orderId !== orderId && item.providerPaymentId === paymentId)) {
            const duplicate = new Error('Provider payment is already associated with another order.'); duplicate.code = 11000; throw duplicate;
        }
        Object.assign(sale, { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'inventory_conflict', paymentException: message, status: 'payment_exception', updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicClaimTicketGeneration: async (orderId, now, leaseUntil) => {
        if (!useMock()) return atomicClaimTicketGeneration(orderId, new Date(now), new Date(leaseUntil));
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'paid' && !item.ticketId);
        const state = sale?.fulfillmentStatus || 'pending';
        const canClaim = ['pending', 'failed'].includes(state) || (state === 'generating' && new Date(sale.ticketGenerationLeaseUntil || 0) <= new Date(now));
        if (!canClaim) return null;
        Object.assign(sale, { fulfillmentStatus: 'generating', ticketGenerationLeaseUntil: leaseUntil, updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicAssignGeneratedTicket: async (orderId, ticketId, generatedAt) => {
        if (!useMock()) return atomicAssignGeneratedTicket(orderId, ticketId, generatedAt);
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'paid' && item.fulfillmentStatus === 'generating' && !item.ticketId);
        if (!sale) return null;
        Object.assign(sale, { ticketId, generatedAt, fulfillmentStatus: 'ticketed', status: 'ticket_generated', updatedAt: generatedAt });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicFailTicketGeneration: async (orderId, error, now) => {
        if (!useMock()) return atomicFailTicketGeneration(orderId, error, now);
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'paid' && item.fulfillmentStatus === 'generating' && !item.ticketId);
        if (!sale) return null;
        Object.assign(sale, { fulfillmentStatus: 'failed', status: 'ticket_generation_failed', ticketGenerationError: String(error).slice(0, 500), updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    recordRazorpayEvent: async (orderId, eventId) => {
        if (!eventId) return false;
        if (!useMock()) {
            const result = await Sale.updateOne({ orderId, razorpayEventIds: { $ne: eventId } }, { $addToSet: { razorpayEventIds: eventId } });
            return result.modifiedCount > 0;
        }
        const sale = mockDb.sales.find(item => item.orderId === orderId);
        if (!sale) return false;
        sale.razorpayEventIds = sale.razorpayEventIds || [];
        if (sale.razorpayEventIds.includes(eventId)) return false;
        sale.razorpayEventIds.push(eventId);
        _saveMockSales(mockDb.sales);
        return true;
    },
    atomicExpireOrder: async (orderId, now) => {
        if (!useMock()) return atomicExpireOrder(orderId, new Date(now));
        const sale = mockDb.sales.find(item => item.orderId === orderId);
        const state = sale?.paymentStatus || (sale?.status === 'created' ? 'pending' : sale?.status);
        if (!sale || !['pending'].includes(state) || !sale.reservationExpiresAt || new Date(sale.reservationExpiresAt) > new Date(now)) return null;
        Object.assign(sale, { paymentStatus: 'expired', reservationStatus: 'expired', status: 'expired', updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicRecordLateCapturedPayment: async (orderId, paymentId, now) => {
        if (!useMock()) return atomicRecordLateCapturedPayment(orderId, paymentId, now);
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'expired');
        if (!sale) return null;
        if (paymentId && mockDb.sales.some(item => item.orderId !== orderId && item.providerPaymentId === paymentId)) {
            const duplicate = new Error('Provider payment is already associated with another order.'); duplicate.code = 11000; throw duplicate;
        }
        Object.assign(sale, { paymentStatus: 'paid', paymentId, providerPaymentId: paymentId, paidAt: now, fulfillmentStatus: 'inventory_conflict', status: 'payment_exception', paymentException: 'Payment captured after inventory reservation expired; manual reconciliation required.', updatedAt: now });
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicRequestRefund: async (orderId, { requestId, requesterHash, reason, now }) => {
        if (!useMock()) return atomicRequestRefund(orderId, { requestId, requesterHash, reason, now: new Date(now) });
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.paymentStatus === 'paid' && item.ticketId && (item.refundStatus || 'none') === 'none' && !['cancelled', 'refunded'].includes(item.status));
        if (!sale) return null;
        Object.assign(sale, { refundStatus: 'requested', refundRequestId: requestId, refundRequesterHash: requesterHash, refundReason: reason, refundRequestedAt: now, updatedAt: now });
        sale.refundHistory = [...(sale.refundHistory || []), { from: 'none', to: 'requested', actor: 'customer_verified_otp', reason, at: now }];
        _saveMockSales(mockDb.sales);
        return sale;
    },
    atomicDecideRefund: async (orderId, { decision, actor, reason, now }) => {
        if (!useMock()) return atomicDecideRefund(orderId, { decision, actor, reason, now: new Date(now) });
        const sale = mockDb.sales.find(item => item.orderId === orderId && item.refundStatus === 'requested');
        if (!sale || !['approved', 'rejected'].includes(decision)) return null;
        Object.assign(sale, { refundStatus: decision, refundDecidedAt: now, refundDecidedBy: actor, refundDecisionReason: reason || '', updatedAt: now });
        sale.refundHistory = [...(sale.refundHistory || []), { from: 'requested', to: decision, actor, reason: reason || '', at: now }];
        _saveMockSales(mockDb.sales);
        return sale;
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
    releaseSellerSlot: async (userId) => {
        if (useMock()) {
            const user = mockDb.users.find(item => item.userId === userId);
            if (!user) return null;
            delete user.sellerSlot;
            return user;
        }
        return await releaseSellerSlot(userId);
    },
    createUser: async (userData) => {
        if (useMock()) {
            if (mockDb.users.some(u => u.userId.toLowerCase() === String(userData.userId).toLowerCase() || (userData.sellerSlot && u.sellerSlot === userData.sellerSlot) || (userData.email && u.email === String(userData.email).toLowerCase()))) {
                const error = new Error('A user with this identifier already exists.');
                error.code = 11000;
                throw error;
            }
            const user = { ...userData };
            mockDb.users.push(user);
            return user;
        }
        return await createUser(userData);
    },
    deleteUser: async (userId) => {
        if (useMock()) {
            const index = mockDb.users.findIndex(user => user.userId === userId);
            if (index === -1) return null;
            return mockDb.users.splice(index, 1)[0];
        }
        return await deleteUser(userId);
    },
    getUserBySellerSlot: async (sellerSlot) => {
        if (useMock()) return mockDb.users.find(u => u.sellerSlot === sellerSlot) || null;
        return await getUserBySellerSlot(sellerSlot);
    },
    createOrganizerApplication: async (application) => {
        if (useMock()) { mockDb.organizerApplications.push({ ...application }); return application; }
        return await OrganizerApplication.create(application).then(item => item.toObject());
    },
    getOrganizerApplication: async (applicationId) => {
        if (useMock()) return mockDb.organizerApplications.find(item => item.applicationId === applicationId) || null;
        return OrganizerApplication.findOne({ applicationId }).lean();
    },
    getOrganizerApplications: async (status) => {
        if (useMock()) return mockDb.organizerApplications.filter(item => !status || item.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return OrganizerApplication.find(status ? { status } : {}).sort({ createdAt: -1 }).lean();
    },
    updateOrganizerApplication: async (applicationId, updates, expectedStatus) => {
        if (useMock()) {
            const item = mockDb.organizerApplications.find(record => record.applicationId === applicationId && (!expectedStatus || record.status === expectedStatus));
            if (!item) return null;
            Object.assign(item, updates, { updatedAt: new Date().toISOString() }); return item;
        }
        return OrganizerApplication.findOneAndUpdate({ applicationId, ...(expectedStatus ? { status: expectedStatus } : {}) }, { $set: { ...updates, updatedAt: new Date() } }, { returnDocument: 'after', lean: true });
    },
    createEventInvitation: async (invitation) => {
        if (useMock()) { mockDb.eventInvitations.push({ ...invitation }); return invitation; }
        return await EventInvitation.create(invitation).then(item => item.toObject());
    },
    getEventInvitationByTokenHash: async (tokenHash) => {
        if (useMock()) return mockDb.eventInvitations.find(item => item.tokenHash === tokenHash) || null;
        return EventInvitation.findOne({ tokenHash }).lean();
    },
    getEventInvitations: async (filter = {}) => {
        if (useMock()) return mockDb.eventInvitations.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
        return EventInvitation.find(filter).sort({ createdAt: -1 }).lean();
    },
    updateEventInvitation: async (invitationId, updates, expectedStatus) => {
        if (useMock()) {
            const item = mockDb.eventInvitations.find(record => record.invitationId === invitationId && (!expectedStatus || record.status === expectedStatus));
            if (!item) return null;
            Object.assign(item, updates); return item;
        }
        return EventInvitation.findOneAndUpdate({ invitationId, ...(expectedStatus ? { status: expectedStatus } : {}) }, { $set: updates }, { returnDocument: 'after', lean: true });
    },
    claimEventInvitation: async (invitationId, now = new Date()) => {
        if (useMock()) {
            const item = mockDb.eventInvitations.find(record => record.invitationId === invitationId && record.status === 'pending' && new Date(record.expiresAt).getTime() > new Date(now).getTime());
            if (!item) return null;
            item.status = 'accepting'; return item;
        }
        return EventInvitation.findOneAndUpdate({ invitationId, status: 'pending', expiresAt: { $gt: new Date(now) } }, { $set: { status: 'accepting' } }, { returnDocument: 'after', lean: true });
    },
    getPartnerAccessPolicy: async (role, principalId) => {
        if (useMock()) return mockDb.partnerAccessPolicies.find(item => item.role === role && item.principalId === principalId) || null;
        return PartnerAccessPolicy.findOne({ role, principalId }).lean();
    },
    getPartnerAccessPolicies: async (filter = {}) => {
        if (useMock()) return mockDb.partnerAccessPolicies.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
        return PartnerAccessPolicy.find(filter).lean();
    },
    setPartnerAccessPolicy: async (policy) => {
        if (useMock()) {
            const idx = mockDb.partnerAccessPolicies.findIndex(item => item.role === policy.role && item.principalId === policy.principalId);
            const value = { ...policy, updatedAt: new Date().toISOString() };
            if (idx < 0) mockDb.partnerAccessPolicies.push(value); else mockDb.partnerAccessPolicies[idx] = value;
            return value;
        }
        return PartnerAccessPolicy.findOneAndUpdate({ role: policy.role, principalId: policy.principalId }, { $set: { ...policy, updatedAt: new Date() } }, { upsert: true, returnDocument: 'after', lean: true });
    },
    addPartnerEventAssignment: async ({ role, principalId, companyId, eventId, updatedBy }) => {
        if (useMock()) {
            let policy = mockDb.partnerAccessPolicies.find(item => item.role === role && item.principalId === principalId);
            if (policy && policy.companyId !== companyId) return null;
            if (!policy) { policy = { role, principalId, companyId, eventIds: [], updatedBy }; mockDb.partnerAccessPolicies.push(policy); }
            policy.eventIds = [...new Set([...(policy.eventIds || []), eventId])];
            policy.updatedBy = updatedBy; policy.updatedAt = new Date().toISOString(); return policy;
        }
        return PartnerAccessPolicy.findOneAndUpdate(
            { role, principalId, companyId },
            { $addToSet: { eventIds: eventId }, $set: { updatedBy, updatedAt: new Date() }, $setOnInsert: { role, principalId, companyId } },
            { upsert: true, returnDocument: 'after', lean: true }
        );
    },
    removePartnerEventAssignment: async ({ role, principalId, eventId }) => {
        if (useMock()) {
            const policy = mockDb.partnerAccessPolicies.find(item => item.role === role && item.principalId === principalId);
            if (!policy) return null;
            policy.eventIds = (policy.eventIds || []).filter(id => id !== eventId); policy.updatedAt = new Date().toISOString(); return policy;
        }
        return PartnerAccessPolicy.findOneAndUpdate({ role, principalId }, { $pull: { eventIds: eventId }, $set: { updatedAt: new Date() } }, { returnDocument: 'after', lean: true });
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
    getEventBySlug: async (slug) => {
        const normalized = String(slug || '').toLowerCase();
        if (useMock()) return Array.from(new Set(_mockEvents.values())).find(event => event.slug === normalized) || null;
        return await getEventBySlug(normalized);
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
            const deleted = Array.from(new Set(_mockEvents.values())).find(event => matchesEventRef(event, id));
            if (!deleted) return null;
            for (const [key, value] of _mockEvents.entries()) if (value === deleted) _mockEvents.delete(key);
            return deleted;
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
    ensureCompany: async (companyId, name) => {
        if (useMock()) {
            let company = mockDb.companies.find(item => item.companyId === companyId);
            if (!company) {
                const now = new Date().toISOString();
                company = {
                    companyId, name, status: 'ACTIVE',
                    commercials: { feeType: 'PERCENTAGE', percentageFee: 5, fixedFeePerTicket: 0 },
                    razorpayConfig: { enabled: false, keyId: '', keySecret: '', webhookSecret: '', mode: 'TEST', lockedByMaster: false },
                    manualPaymentConfig: { enabled: true, allowedMethods: ['cash', 'bank_transfer', 'upi_manual'], approvalWorkflow: 'COMPANY_APPROVAL', lockedByMaster: false },
                    features: { onlinePayments: { enabled: false, lockedByMaster: false }, manualPayments: { enabled: true, lockedByMaster: false }, prPortal: { enabled: true, lockedByMaster: false }, prSales: { enabled: true, lockedByMaster: false }, ticketTransfers: { enabled: false, lockedByMaster: false }, refunds: { enabled: false, lockedByMaster: false }, couponCodes: { enabled: true, lockedByMaster: false }, qrCheckIn: { enabled: true, lockedByMaster: false }, offlineScan: { enabled: false, lockedByMaster: false }, allowReEntry: { enabled: false, lockedByMaster: false } },
                    prSettings: { commissionType: 'PERCENTAGE', commissionValue: 10 }, createdAt: now, updatedAt: now
                };
                mockDb.companies.push(company);
            } else {
                company.name = name;
                company.updatedAt = new Date().toISOString();
            }
            return company;
        }
        return await ensureCompany(companyId, name);
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
            return companyId ? mockDb.auditLogs.filter(l => l.companyId === companyId) : [...mockDb.auditLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
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
            const c = { accepted: 0, duplicate: 0, cancelled: 0, invalid: 0, manual_review: 0 };
            logs.forEach(l => { if (c[l.result] !== undefined) c[l.result]++; });
            return { accepted: c.accepted, declined: c.duplicate + c.cancelled + c.invalid + c.manual_review, declinedByReason: { duplicate: c.duplicate, cancelled: c.cancelled, invalid: c.invalid, manualReview: c.manual_review } };
        }
        const query = { timestamp: { $gte: sinceDate || new Date(0) } };
        if (companyId) query.companyId = companyId;
        const agg = await ScanLog.aggregate([
            { $match: query },
            { $group: { _id: '$result', count: { $sum: 1 } } }
        ]);
        const c = { accepted: 0, duplicate: 0, cancelled: 0, invalid: 0, manual_review: 0 };
        agg.forEach(a => { if (c[a._id] !== undefined) c[a._id] = a.count; });
        return {
            accepted: c.accepted,
            declined: c.duplicate + c.cancelled + c.invalid + c.manual_review,
            declinedByReason: { duplicate: c.duplicate, cancelled: c.cancelled, invalid: c.invalid, manualReview: c.manual_review }
        };
    },

    getScanSummaryForEvent: async (eventName, companyId) => {
        const normalizedName = String(eventName || '').trim().toLowerCase();
        if (useMock()) {
            const logs = _mockScanLogs.filter(log =>
            String(log.event || '').trim().toLowerCase() === normalizedName &&
            (!companyId || log.companyId === companyId)
            );
            return {
                accepted: logs.filter(log => log.result === 'accepted').length,
                duplicate: logs.filter(log => log.result === 'duplicate').length,
                admissions: logs.filter(log => log.result === 'accepted').reduce((sum, log) => sum + (Number(log.admissionCount) || 1), 0),
                recent: logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 30)
            };
        }
        const query = { event: eventName, ...(companyId ? { companyId } : {}) };
        const [groups, recent] = await Promise.all([
            ScanLog.aggregate([{ $match: query }, { $group: { _id: '$result', count: { $sum: 1 }, admissions: { $sum: { $cond: [{ $eq: ['$result', 'accepted'] }, { $ifNull: ['$admissionCount', 1] }, 0] } } } }]),
            ScanLog.find(query).sort({ timestamp: -1 }).limit(30).lean()
        ]);
        const accepted = groups.find(group => group._id === 'accepted');
        return { accepted: accepted?.count || 0, duplicate: groups.find(group => group._id === 'duplicate')?.count || 0, admissions: accepted?.admissions || 0, recent };
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
    atomicScanTicket: async (ticketId, scannedBy, scannedAtStr, admissionCount = 1) => {
        if (useMock()) {
            const idx = mockDb.sales.findIndex(s =>
                s.ticketId === ticketId &&
                ['paid', 'ticket_generated', 'emailed', 'email_failed'].includes(s.status)
            );
            if (idx === -1) return null;
            mockDb.sales[idx].status = 'scanned';
            mockDb.sales[idx].scannedBy = scannedBy;
            mockDb.sales[idx].scannedAt = scannedAtStr;
            mockDb.sales[idx].scannedAdmissionCount = admissionCount;
            delete mockDb.sales[idx].reactivatedAt;
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
                    scannedAdmissionCount: admissionCount,
                    updatedAt: new Date().toISOString()
                },
                $unset: { reactivatedAt: 1 }
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
    getAllDashboardSaleVisibility: async () => {
        if (useMock()) return Array.from(_mockDashboardSaleVisibility.values());
        return DashboardSaleVisibility.find({}).lean();
    },
    setDashboardSaleVisibility: async (saleKey, data) => {
        if (useMock()) {
            const updated = { ...data, saleKey };
            _mockDashboardSaleVisibility.set(saleKey, updated);
            return updated;
        }
        return DashboardSaleVisibility.findOneAndUpdate(
            { saleKey },
            { $set: { ...data, saleKey } },
            { upsert: true, new: true, lean: true }
        );
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
            const current = _mockPartnerLocks.get(partnerId) || { partnerId, loginAttemptLog: [] };
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
    getEventsForOrganizer: async (userId) => {
        if (useMock()) return [...new Set(_mockEvents.values())].filter(event => Array.isArray(event.organizerUserIds) && event.organizerUserIds.includes(userId));
        return Event.find({ organizerUserIds: userId }).sort({ updatedAt: -1 }).lean();
    },
    saveEvent: async (eventData) => {
        const { _id: mongoId, ...eventFields } = eventData;
        const id = eventData.id || `event_${Date.now()}`;
        const name = (eventData.name || 'Untitled Event').trim();
        const doc = {
            ...eventFields, id, name,
            companyId: eventData.companyId || 'littlane',
            organizerId: eventData.organizerId || eventData.companyId || 'littlane',
            active: eventData.active !== undefined ? eventData.active : true,
            tiers: eventData.tiers || [],
            ticketCategories: eventData.ticketCategories || eventData.tiers || eventData.ticketTypes || [],
            gradient: eventData.gradient || 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)',
            icon: eventData.icon || '🎉',
            tagline: eventData.tagline || eventData.venue || 'Live Event',
            createdAt: eventData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        _mockEvents.set(name, doc);
        _mockEvents.set(id, doc);
        if (!useMock()) {
            try {
                const selector = mongoId && mongoose.Types.ObjectId.isValid(String(mongoId))
                    ? { _id: new mongoose.Types.ObjectId(String(mongoId)) }
                    : { id };
                await Event.findOneAndUpdate(
                    selector,
                    { $set: doc },
                    { upsert: true, new: true, lean: true }
                );
            } catch (e) { console.error('[saveEvent DB error]', e.message); }
        }
        return doc;
    },
    reserveEventInventory: async input => reserveEventInventory(input),
    releaseEventInventoryReservation: async input => releaseEventInventoryReservation(input),
    consumeEventInventoryReservation: async input => consumeEventInventoryReservation(input),
    finalizeConsumedInventoryReservation: async input => finalizeConsumedInventoryReservation(input),
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
const _mockEvents = new Map();

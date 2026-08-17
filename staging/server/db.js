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
    createdAt: { type: String }
});

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String },
    role: { type: String, enum: ['seller', 'pr'], default: 'pr' },
    blocked: { type: Boolean, default: false },
    allowedPasses: [{
        eventId: { type: String }, // Can store Event ID or Event Name
        passName: { type: String }  // e.g. "Male Pass"
    }]
});

const SaleSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
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

const Event = mongoose.model('Event', EventSchema);
const User = mongoose.model('User', UserSchema);
const Sale = mongoose.model('Sale', SaleSchema);

// ==================== SEED DATA ====================

async function seedDefaultUsers() {
    try {
        const count = await User.countDocuments();
        if (count > 0) return; // DB already has users

        console.log('🌱 Seeding default LITTX sellers and partners...');
        
        const defaultUsers = [
            { userId: 'SELLER-A', password: process.env.SELLER_A_PASS || 'littx-a-2026', displayName: 'Seller Alpha', role: 'seller' },
            { userId: 'SELLER-B', password: process.env.SELLER_B_PASS || 'littx-b-2026', displayName: 'Seller Beta', role: 'seller' },
            { userId: 'SELLER-C', password: process.env.SELLER_C_PASS || 'littx-c-2026', displayName: 'Seller Gamma', role: 'seller' },
            { userId: 'partner1', password: process.env.PR1_PASS || 'ftpr@001', displayName: 'Partner One', role: 'pr' },
            { userId: 'partner2', password: process.env.PR2_PASS || 'ftpr@002', displayName: 'Partner Two', role: 'pr' },
            { userId: 'partner3', password: process.env.PR3_PASS || 'ftpr@003', displayName: 'Partner Three', role: 'pr' },
            { userId: 'partner4', password: process.env.PR4_PASS || 'ftpr@004', displayName: 'Partner Four', role: 'pr' },
            { userId: 'partner5', password: process.env.PR5_PASS || 'ftpr@005', displayName: 'Partner Five', role: 'pr' },
        ];

        await User.insertMany(defaultUsers);
        console.log('✅ Default users seeded successfully.');
    } catch (err) {
        console.error('❌ Failed to seed default users:', err.message);
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

module.exports = {
    // Models
    Event,
    User,
    Sale,
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
    deleteEvent
};

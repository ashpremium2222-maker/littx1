const mongoose = require('mongoose');

// We fall back to a local mongodb URI if none is set in env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/littx';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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

const Sale = mongoose.model('Sale', SaleSchema);

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
    if (!updated) return null;
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

/**
 * Atomically transitions an order from 'created' → 'paid'.
 * Returns the updated sale if THIS caller won the race, or null if another
 * concurrent webhook/request already claimed it (status was no longer 'created').
 * This completely prevents the double-ticket race condition.
 */
async function atomicClaimOrder(orderId, paymentId) {
    const updated = await Sale.findOneAndUpdate(
        { orderId, status: 'created' },  // ← only matches if still unclaimed
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
    return updated; // null = already claimed by someone else
}

module.exports = {
    createSaleRecord,
    updateSaleRecord,
    getByOrderId,
    getByTicketId,
    getAll,
    atomicClaimOrder
};

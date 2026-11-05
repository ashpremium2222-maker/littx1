// One-shot script to clear all login rate limit buckets from MongoDB Atlas
// Run: node staging/server/clear_rate_limits.js
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('No MONGO_URI found in environment. Set MONGO_URI env var.');
  process.exit(1);
}

const OtpRateLimitSchema = new mongoose.Schema({
  bucketKey: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  windowExpiresAt: { type: Date, required: true },
});
const OtpRateLimit = mongoose.model('OtpRateLimit', OtpRateLimitSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('[MongoDB] Connected');
  // Delete all login rate limit buckets (keys prefixed with hashes of 'login')
  // We delete ALL OtpRateLimit records to clear everything cleanly
  const result = await OtpRateLimit.deleteMany({});
  console.log(`[Cleared] Deleted ${result.deletedCount} rate limit buckets`);
  await mongoose.disconnect();
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });

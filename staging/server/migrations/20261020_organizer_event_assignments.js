// Additive organizer assignment index. Dry-run by default; pass --apply to
// create the index after reviewing the current assignment counts.
require('dotenv').config();
const mongoose = require('mongoose');

const Event = mongoose.model('OrganizerAssignmentEvent', new mongoose.Schema({}, { strict: false, collection: 'events' }));
const User = mongoose.model('OrganizerAssignmentUser', new mongoose.Schema({}, { strict: false, collection: 'users' }));
const INDEX = 'organizerUserIds_1_updatedAt_-1';

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const [organizerCount, eventsWithAssignments, eventIndexes] = await Promise.all([
        User.countDocuments({ role: 'organizer' }),
        Event.countDocuments({ 'organizerUserIds.0': { $exists: true } }),
        Event.collection.indexes()
    ]);
    const summary = {
        mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
        organizerAccounts: organizerCount,
        eventsWithExplicitAssignments: eventsWithAssignments,
        eventsWithoutExplicitAssignments: await Event.countDocuments({ 'organizerUserIds.0': { $exists: false } }),
        assignmentIndexPresent: eventIndexes.some(index => index.name === INDEX),
        dataBackfillRequired: false
    };
    console.log(JSON.stringify(summary, null, 2));
    if (process.argv.includes('--apply') && !summary.assignmentIndexPresent) {
        await Event.collection.createIndex({ organizerUserIds: 1, updatedAt: -1 }, { name: INDEX });
    }
}

main().then(() => mongoose.disconnect()).catch(async error => {
    console.error(`Migration stopped: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
});

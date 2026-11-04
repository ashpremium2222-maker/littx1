// Idempotent, additive event-link migration. Dry-run by default; pass --apply
// only after backing up the database and reviewing the reported orphan counts.
require('dotenv').config();
const mongoose = require('mongoose');

const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const normalize = value => String(value || '').trim().toLowerCase();
const Event = mongoose.model('Event', new mongoose.Schema({}, { strict: false, collection: 'events' }));
const Sale = mongoose.model('Sale', new mongoose.Schema({}, { strict: false, collection: 'sales' }));

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const [events, sales, indexes] = await Promise.all([Event.find({}).lean(), Sale.find({}).lean(), Event.collection.indexes()]);
    const slugCounts = new Map();
    const plannedEvents = events.map(event => {
        const slug = event.slug || slugify(event.name);
        slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
        return { event, slug };
    });
    const slugConflicts = [...slugCounts].filter(([, count]) => count > 1).map(([slug]) => slug);
    const names = new Map();
    for (const event of events) {
        for (const candidate of [event.name, ...(Array.isArray(event.legacyNames) ? event.legacyNames : [])].filter(Boolean)) {
            const key = normalize(candidate);
            names.set(key, [...(names.get(key) || []), event]);
        }
    }

    const salesToMap = [];
    let alreadyLinked = 0, unmappedEvent = 0, ambiguousEvent = 0, unmappedCategory = 0, ambiguousCategory = 0;
    for (const sale of sales) {
        if (sale.eventId) { alreadyLinked++; continue; }
        const matches = [...new Set(names.get(normalize(sale.event)) || [])];
        if (matches.length === 0) { unmappedEvent++; continue; }
        if (matches.length !== 1) { ambiguousEvent++; continue; }
        const event = matches[0];
        const candidates = [...(event.ticketCategories || []), ...(event.tiers || []), ...(event.ticketTypes || [])];
        const ticketName = normalize(sale.ticketType || sale.gender);
        const categoryMatches = [...new Map(candidates.filter(category =>
            normalize(category.id) === ticketName || normalize(category.name) === ticketName
        ).map(category => [category.id || normalize(category.name), category])).values()];
        if (ticketName && categoryMatches.length === 0) unmappedCategory++;
        if (categoryMatches.length > 1) ambiguousCategory++;
        salesToMap.push({ sale, event, category: categoryMatches.length === 1 ? categoryMatches[0] : null });
    }

    const summary = {
        mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
        eventCount: events.length,
        eventsNeedingSlug: plannedEvents.filter(item => !item.event.slug).length,
        slugConflicts,
        salesCount: sales.length,
        alreadyLinked,
        salesWithUnambiguousEventMatch: salesToMap.length,
        unmappedEvent,
        ambiguousEvent,
        unmappedCategory,
        ambiguousCategory,
        uniqueNameIndexPresent: indexes.some(index => index.unique && index.key?.name === 1),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (slugConflicts.length) throw new Error('Slug collisions found. Resolve them manually before applying any migration.');
    if (!process.argv.includes('--apply')) return;

    for (const { event, slug } of plannedEvents) {
        const set = {};
        if (!event.slug) set.slug = slug;
        if (!event.id) set.id = String(event._id);
        if (!event.organizerId && event.companyId) set.organizerId = event.companyId;
        if (Object.keys(set).length) await Event.updateOne({ _id: event._id }, { $set: set });
    }
    for (const { sale, event, category } of salesToMap) {
        const set = { eventId: String(event.id || event._id) };
        if (!sale.ticketCategoryId && category) set.ticketCategoryId = String(category.id || category.name);
        await Sale.updateOne({ _id: sale._id, $or: [{ eventId: { $exists: false } }, { eventId: null }] }, { $set: set });
    }

    const nameIndex = indexes.find(index => index.unique && index.key?.name === 1);
    if (nameIndex) await Event.collection.dropIndex(nameIndex.name);
    await Event.collection.createIndex({ slug: 1 }, { unique: true, sparse: true, name: 'slug_1' });
    await Event.collection.createIndex({ companyId: 1, status: 1, active: 1 }, { name: 'companyId_1_status_1_active_1' });
    await Event.collection.createIndex({ organizerId: 1, createdAt: -1 }, { name: 'organizerId_1_createdAt_-1' });
}

main().then(() => mongoose.disconnect()).catch(async error => {
    console.error(`Migration stopped: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
});

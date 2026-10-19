const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { sendTicketWhatsApp } = require('../whatsapp-service');

const envKeys = [
    'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TEMPLATE_NAME',
    'WHATSAPP_TEMPLATE_LANG', 'WHATSAPP_ATTACH_PDF', 'RICHAUTOMATE_API_KEY',
    'RICHAUTOMATE_TEMPLATE_NAME', 'RICHAUTOMATE_TEMPLATE_LANG', 'RICHAUTOMATE_ATTACH_PDF'
];

async function withFixture(callback) {
    const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stageway-whatsapp-'));
    const pdfPath = path.join(dir, 'test-ticket.pdf');
    await fs.writeFile(pdfPath, Buffer.from('%PDF-1.4 test fixture'));
    try { await callback(pdfPath); }
    finally {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
        await fs.rm(dir, { recursive: true, force: true });
    }
}

function ok(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function ticketArgs(pdfPath, fetchImpl) {
    return { phone: '9876543210', name: 'Test Attendee', ticketId: 'ticket-test-1', event: 'Test Event', ticketType: 'General', pdfPath, fetchImpl };
}

test('Meta PDF attachment uploads the PDF with authentication and sends only its media ID', async () => withFixture(async pdfPath => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-test';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_TEMPLATE_NAME = 'ticket_template';
    process.env.WHATSAPP_ATTACH_PDF = 'true';
    const requests = [];
    const fetchImpl = async (url, options) => {
        requests.push({ url, options });
        return requests.length === 1 ? ok({ id: 'meta-media-123' }) : ok({ messages: [{ id: 'wamid.test' }] });
    };

    const result = await sendTicketWhatsApp(ticketArgs(pdfPath, fetchImpl));
    assert.equal(result.success, true);
    assert.equal(result.messageId, 'wamid.test');
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /\/phone-number-test\/media$/);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
    const upload = requests[0].options.body;
    assert.equal(upload.get('messaging_product'), 'whatsapp');
    assert.equal(upload.get('type'), 'application/pdf');
    assert.equal(upload.get('file').type, 'application/pdf');
    const message = JSON.parse(requests[1].options.body);
    assert.equal(message.to, '919876543210');
    const document = message.template.components[0].parameters[0].document;
    assert.equal(document.id, 'meta-media-123');
    assert.equal(document.filename, 'Ticket-ticket-test-1.pdf');
    assert.equal('link' in document, false);
    assert.equal(requests[1].options.headers.Authorization, 'Bearer test-token');
}));

test('RichAutomate PDF attachment uses its authenticated media upload and header_media_id', async () => withFixture(async pdfPath => {
    process.env.RICHAUTOMATE_API_KEY = 'rich-test-key';
    process.env.RICHAUTOMATE_TEMPLATE_NAME = 'ticket_template';
    process.env.RICHAUTOMATE_ATTACH_PDF = 'true';
    const requests = [];
    const fetchImpl = async (url, options) => {
        requests.push({ url, options });
        return requests.length === 1 ? ok({ media_id: 'rich-media-456' }) : ok({ message_id: 'rich-msg' });
    };

    const result = await sendTicketWhatsApp(ticketArgs(pdfPath, fetchImpl));
    assert.equal(result.success, true);
    assert.equal(result.provider, 'richautomate');
    assert.equal(requests[0].url, 'https://richautomate.in/api/v1/public/media');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer rich-test-key');
    assert.equal(requests[0].options.body.get('file').type, 'application/pdf');
    assert.equal(requests[1].url, 'https://richautomate.in/api/v1/send-template');
    const message = JSON.parse(requests[1].options.body);
    assert.equal(message.phone, '919876543210');
    assert.equal(message.header_media_type, 'document');
    assert.equal(message.header_media_id, 'rich-media-456');
    assert.equal('header_media_url' in message, false);
}));

test('media upload failure stops before sending a template and never falls back to a legacy ticket URL', async () => withFixture(async pdfPath => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-test';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_TEMPLATE_NAME = 'ticket_template';
    process.env.WHATSAPP_ATTACH_PDF = 'true';
    const requests = [];
    const result = await sendTicketWhatsApp(ticketArgs(pdfPath, async (url, options) => {
        requests.push({ url, options });
        return ok({ error: 'upload rejected' }, 400);
    }));
    assert.equal(result.success, false);
    assert.equal(result.reason, 'secure_document_delivery_failed');
    assert.equal(requests.length, 1);
}));

test('missing or oversized PDF fails closed before provider calls', async () => withFixture(async pdfPath => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-test';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_TEMPLATE_NAME = 'ticket_template';
    process.env.WHATSAPP_ATTACH_PDF = 'true';
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return ok({ id: 'unused' }); };
    const missing = await sendTicketWhatsApp(ticketArgs(null, fetchImpl));
    assert.equal(missing.success, false);
    assert.equal(missing.reason, 'secure_document_delivery_failed');
    const oversizedPath = path.join(path.dirname(pdfPath), 'oversized.pdf');
    await fs.writeFile(oversizedPath, Buffer.alloc(100_000_001));
    const oversized = await sendTicketWhatsApp(ticketArgs(oversizedPath, fetchImpl));
    assert.equal(oversized.success, false);
    assert.equal(oversized.reason, 'secure_document_delivery_failed');
    assert.equal(calls, 0);
}));

test('disabled PDF attachment sends the existing template without uploading or using a ticket URL', async () => withFixture(async pdfPath => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-test';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_TEMPLATE_NAME = 'ticket_template';
    process.env.WHATSAPP_ATTACH_PDF = 'false';
    const requests = [];
    const result = await sendTicketWhatsApp(ticketArgs(pdfPath, async (url, options) => {
        requests.push({ url, options });
        return ok({ messages: [{ id: 'wamid.no-pdf' }] });
    }));
    assert.equal(result.success, true);
    assert.equal(requests.length, 1);
    const message = JSON.parse(requests[0].options.body);
    assert.equal(message.template.components.some(component => component.type === 'header'), false);
    assert.equal(JSON.stringify(message).includes('/api/ticket/'), false);
}));

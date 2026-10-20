// Generates a stable ticket ID, QR identity, and event-derived PDF pass.

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { randomUUID } = require('crypto');

const os = require('os');
const TICKETS_DIR = (() => {
    if (process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || __dirname.includes('/var/task') || __dirname.includes('/var/tmp')) {
        const tmpPath = path.join(os.tmpdir(), 'tickets');
        try { if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true }); } catch (_) {}
        return tmpPath;
    }
    const localPath = path.join(__dirname, 'tickets');
    try {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }
        const testFile = path.join(localPath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return localPath;
    } catch (e) {
        const tmpPath = path.join(os.tmpdir(), 'tickets');
        try { if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true }); } catch (_) {}
        return tmpPath;
    }
})();

function generateTicketId() {
    // The ticket URL is a bearer credential, so use the full 122-bit UUID
    // entropy rather than the old eight-hex-character (~32-bit) suffix.
    return `DGR-${randomUUID().toUpperCase()}`;
}

/** QR data URL for inline display in the browser / email (encodes the ticket ID). */
async function buildQrDataUrl(ticketId) {
    return QRCode.toDataURL(ticketId, { margin: 1, width: 400 });
}

/** QR PNG buffer, reused by the PDF and the emailed inline image. */
async function buildQrBuffer(ticketId) {
    return QRCode.toBuffer(ticketId, { margin: 1, width: 400 });
}

function pill(doc, { x, y, w, h, bg, textColor, label, fontSize = 8 }) {
    doc.roundedRect(x, y, w, h, h / 2).fill(bg);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(textColor)
        .text(label, x, y + (h - fontSize) / 2 - 1, { width: w, align: 'center' });
}



/**
 * Renders a ticket using the selected event's stored details. Missing legacy
 * event fields stay blank instead of being replaced with another event.
 */
async function buildTicketPdf({ ticketId, name, email, gender, ticketType, quantity, amount, createdAt, event, date, time, venue, timeZone }) {
    const filePath = path.join(TICKETS_DIR, `${ticketId}.pdf`);
    const qrPngBuffer = await buildQrBuffer(ticketId);
    const selectedType = String(ticketType || gender || 'Ticket');
    const eventRecord = event && typeof event === 'object' ? event : null;
    const eventName = String(eventRecord?.name || event || '').trim() || 'Event details unavailable';
    const eventDate = date || eventRecord?.date || eventRecord?.startsAt || '';
    const eventTime = time || eventRecord?.time || '';
    const eventVenue = venue || eventRecord?.venue || eventRecord?.address || '';

    const W = 380;
    const PAGE_H = 760;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: [W, PAGE_H], margin: 0 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.rect(0, 0, W, PAGE_H).fill('#ffffff');
        doc.rect(0, 0, W, 112).fill('#111827');
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff').text(eventName, 24, 24, { width: W - 48 });
        doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1').text('Admission ticket', 24, 78);
        let y = 136;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#7c3aed').text(selectedType.toUpperCase(), 24, y);
        y += 26;
        
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(`Attendee: ${name}`, 24, y);
        y += 22;

        const eventLines = [eventDate, eventTime, eventVenue].filter(Boolean).map(String);
        for (const line of eventLines) {
            doc.font('Helvetica').fontSize(9).fillColor('#475569').text(line, 24, y, { width: W - 48 });
            y += 16;
        }
        y += 12;

        doc.moveTo(24, y).lineTo(W - 24, y).strokeColor('#e5e5e8').lineWidth(1).stroke();
        y += 20;

        // Ticket type / qty / price row
        const colW = (W - 48) / 3;
        const cols = [
            { label: 'TICKET TYPE', value: selectedType, align: 'left' },
            { label: 'ADMISSIONS', value: String(quantity), align: 'center' },
            { label: 'AMOUNT', value: `${amount ?? ''}`, align: 'right' }
        ];
        cols.forEach((c, i) => {
            const x = 24 + i * colW;
            doc.font('Helvetica').fontSize(8).fillColor('#9a9a9a').text(c.label, x, y, { width: colW, align: c.align });
            doc.font('Helvetica-Bold').fontSize(13).fillColor('#0d0d0f').text(c.value, x, y + 13, { width: colW, align: c.align });
        });
        y += 52;

        doc.moveTo(24, y).lineTo(W - 24, y).strokeColor('#e5e5e8').lineWidth(1).stroke();
        y += 18;

        doc.font('Helvetica').fontSize(8).fillColor('#9a9a9a').text('TICKET ID', 24, y);
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d0d0f').text(ticketId, 24, y + 13);
        y += 36;
        doc.font('Helvetica').fontSize(8).fillColor('#9a9a9a')
            .text(`Generated by Stageway on ${new Date(createdAt).toLocaleString('en-IN', timeZone ? { timeZone } : undefined)}`, 24, y);
        y += 30;

        // QR code, centered
        const qrSize = 180;
        doc.image(qrPngBuffer, (W - qrSize) / 2, y, { width: qrSize, height: qrSize });
        y += qrSize + 25;

        // Brand signature — Stageway centered
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b')
            .text('Keep this ticket available for entry.', 24, y, { width: W - 48, align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
}

module.exports = {
    generateTicketId,
    buildQrDataUrl,
    buildQrBuffer,
    buildTicketPdf,
    TICKETS_DIR
};

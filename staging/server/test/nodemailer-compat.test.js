const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nodemailer = require('nodemailer');

test('Nodemailer CommonJS stream transport preserves ticket and inline QR attachments', async () => {
  const pdfPath = path.join(os.tmpdir(), `stageway-ticket-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4 synthetic ticket fixture'));

  try {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const result = await transport.sendMail({
      from: 'Stageway <tickets@example.test>',
      to: 'customer@example.test',
      subject: 'Your Stageway ticket',
      html: '<p>Your ticket is attached.</p><img src="cid:ticketqr">',
      attachments: [
        { filename: 'ticket.pdf', path: pdfPath },
        { filename: 'qr.png', content: Buffer.from('synthetic-qr-image'), cid: 'ticketqr' }
      ]
    });

    assert.equal(result.envelope.to[0], 'customer@example.test');
    assert.match(result.message.toString(), /filename=ticket\.pdf/i);
    assert.match(result.message.toString(), /filename=qr\.png/i);
    assert.match(result.message.toString(), /Content-ID: <ticketqr>/i);
  } finally {
    fs.rmSync(pdfPath, { force: true });
  }
});

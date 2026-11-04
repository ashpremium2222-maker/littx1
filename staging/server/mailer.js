// Handles sending the ticket to the buyer's email once payment succeeds.
// Configure real SMTP or Mailgun credentials in server/.env — see .env.example.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');


let transporter = null;
let usingTestAccount = false;

// Initialize Mailgun client if configuration is present
let mgClient = null;
const testMessageOutbox = [];
if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
    try {
        const FormData = require('form-data');
        const Mailgun = require('mailgun.js');
        const mailgun = new Mailgun(FormData);
        mgClient = mailgun.client({
            username: 'api',
            key: process.env.MAILGUN_API_KEY,
            url: process.env.MAILGUN_URL || 'https://api.mailgun.net' // e.g. https://api.eu.mailgun.net for EU
        });
        console.log('[Mailer] Mailgun client initialized successfully.');
    } catch (e) {
        console.error('[Mailer] Failed to initialize Mailgun client:', e.message);
    }
}

async function getTransporter() {
    if (transporter) return transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const dns = require('dns').promises;
        let smtpIp = process.env.SMTP_HOST;
        try {
            const addresses = await dns.resolve4(process.env.SMTP_HOST);
            if (addresses && addresses.length > 0) {
                smtpIp = addresses[0]; // Use resolved IPv4 address directly
                console.log(`[Mailer] Resolved SMTP host ${process.env.SMTP_HOST} to IPv4: ${smtpIp}`);
            }
        } catch (dnsErr) {
            console.warn(`[Mailer] DNS resolution for ${process.env.SMTP_HOST} failed, using default fallback:`, dnsErr.message);
        }

        transporter = nodemailer.createTransport({
            host: smtpIp,
            port: 587,
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2',
                servername: process.env.SMTP_HOST // keeps SSL validation working with IP address
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
        return transporter;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Real SMTP delivery is not configured.');
    }

    // No SMTP configured — fall back to a free Ethereal test inbox so the
    // whole flow (including "email sent") still works out of the box while
    // you're testing. Nothing will land in a real inbox until you set
    // SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env.
    console.warn('[Mailer] No SMTP_HOST or Mailgun configured — using a temporary Ethereal test inbox. Set SMTP_HOST/SMTP_USER/SMTP_PASS in server/.env to send real emails.');
    const testAccount = await nodemailer.createTestAccount();
    usingTestAccount = true;
    transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass }
    });
    return transporter;
}

function renderTicketEmailContent({ name, ticketId, event, publicOrigin = process.env.BASE_URL || '' }) {
    const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const eventRecord = event && typeof event === 'object' ? event : {};
    const eventTitle = eventRecord.name || (typeof event === 'string' ? event : '') || 'Event details unavailable';
    const safeName = htmlEscape(name);
    const safeEventTitle = htmlEscape(eventTitle);
    const safeTicketId = htmlEscape(ticketId);
    const eventDate = eventRecord.date || eventRecord.startsAt || '';
    const eventTime = eventRecord.time || '';
    const eventVenue = eventRecord.venue || eventRecord.address || '';
    const eventLines = [eventDate, eventTime, eventVenue].filter(Boolean);
    const detailRows = eventLines.map(value => '<li>' + htmlEscape(value) + '</li>').join('');
    const origin = String(publicOrigin || '').trim().replace(/\/$/, '');
    const ticketViewUrl = origin ? origin + '/bookings' : '';
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111;line-height:1.6">' +
      '<h1>Your ticket is ready</h1><p>Hello ' + safeName + ',</p>' +
      '<p>Your ticket for <strong>' + safeEventTitle + '</strong> is attached.</p>' +
      '<p>Ticket ID: <strong>' + safeTicketId + '</strong></p>' +
      (detailRows ? '<h2>Event details</h2><ul>' + detailRows + '</ul>' : '') +
      '<p>Use the QR code on your ticket for entry. Keep it available and do not share it.</p>' +
      (ticketViewUrl ? '<p><a href="' + htmlEscape(ticketViewUrl) + '">View booking history and recover your ticket</a></p>' : '') + '</div>';
    const subject = 'Your ' + eventTitle + ' ticket — ' + ticketId;
    const text = 'Hello ' + (name || '') + ',\n\nYour ticket for ' + eventTitle + ' is attached.\nTicket ID: ' + ticketId + '\n' + eventLines.join('\n') + (ticketViewUrl ? '\n\nView booking history and recover your ticket: ' + ticketViewUrl : '') + '\n\nKeep your QR ticket available and do not share it.';
    return { subject, html, text, eventTitle };
}

/** Emails a ticket PDF and QR identity, with details from the selected event. */
async function sendTicketEmail({ to, name, ticketId, gender, quantity, amount, pdfPath, qrBuffer, downloadUrl, event }) {
    try {
        const { subject, html, text, eventTitle } = renderTicketEmailContent({ name, ticketId, event });
        let envEmail = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'events@littx.com';
        let envName = process.env.EMAIL_FROM_NAME || 'Stageway Events';

        if (envEmail.includes('<') && envEmail.includes('>')) {
            const match = envEmail.match(/^(?:"?([^"]*)"?\s)?<([^>]+)>$/);
            if (match) {
                envName = match[1] || envName;
                envEmail = match[2];
            }
        }
        const fromEmail = `"${envName}" <${envEmail}>`;

        const attachments = [
            { filename: `${ticketId}.pdf`, path: pdfPath }
        ];
        if (qrBuffer) attachments.push({ filename: 'qr.png', content: qrBuffer, cid: 'ticketqr' });

        // 1. If Brevo API is configured, use Brevo HTTP API (Port 443 — Never Blocked)
        if (process.env.BREVO_API_KEY) {
            console.log('[Mailer] Sending ticket through configured Brevo delivery.');
            
            // Format attachments for Brevo (Base64)
            const brevoAttachments = [];
            if (pdfPath && fs.existsSync(pdfPath)) {
                brevoAttachments.push({
                    content: fs.readFileSync(pdfPath).toString('base64'),
                    name: `${ticketId}.pdf`
                });
            }

            const payloadObj = {
                sender: {
                    name: envName,
                    email: envEmail
                },
                to: [{ email: to, name: name || to }],
                subject: subject,
                htmlContent: html,
                textContent: text
            };

            if (brevoAttachments.length > 0) {
                payloadObj.attachment = brevoAttachments;
            }

            const payload = JSON.stringify(payloadObj);

            return await new Promise((resolve, reject) => {
                const https = require('https');
                const req = https.request('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': process.env.BREVO_API_KEY,
                        'content-type': 'application/json',
                        'content-length': Buffer.byteLength(payload)
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            const resData = JSON.parse(data);
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                console.log('[Mailer] Brevo accepted ticket email.');
                                resolve({ success: true, messageId: resData.messageId });
                            } else {
                                reject(new Error(resData.message || 'Brevo API request failed'));
                            }
                        } catch (e) {
                            reject(new Error('Failed to parse Brevo API response'));
                        }
                    });
                });

                req.on('error', (err) => reject(err));
                req.write(payload);
                req.end();
            });
        }

        // 2. If Mailgun is configured, use Mailgun API
        if (mgClient) {
            console.log('[Mailer] Sending ticket through configured Mailgun delivery.');
            
            // Format attachments for Mailgun API
            const mgAttachments = [];
            
            // PDF file
            if (fs.existsSync(pdfPath)) {
                mgAttachments.push({
                    filename: `${ticketId}.pdf`,
                    data: fs.readFileSync(pdfPath)
                });
            }
            
            // QR inline image
            if (qrBuffer) {
                mgAttachments.push({
                    filename: 'qr.png',
                    data: qrBuffer,
                    cid: 'ticketqr'
                });
            }
            
            const response = await mgClient.messages.create(process.env.MAILGUN_DOMAIN, {
                from: fromEmail,
                to: [to],
                subject: subject,
                text: text,
                html: html,
                inline: mgAttachments.filter(att => att.cid),
                attachment: mgAttachments.filter(att => !att.cid)
            });

            console.log('[Mailer] Mailgun accepted ticket email.');
            return { success: true, id: response.id };
        } else {
            // 3. SMTP fallback
            console.log('[Mailer] Sending ticket through configured SMTP delivery.');
            const t = await getTransporter();
            const info = await t.sendMail({
                from: fromEmail,
                to,
                subject,
                text,
                html,
                attachments
            });

            const previewUrl = usingTestAccount ? nodemailer.getTestMessageUrl(info) : null;
            return { success: true, messageId: info.messageId, previewUrl };
        }
    } catch (error) {
        console.error('[Mailer] Ticket email delivery failed.', { name: error.name || 'Error' });
        return { success: false, error: 'Email delivery failed.' };
    }
}

function hasConfiguredEmailDelivery() {
    return Boolean(process.env.BREVO_API_KEY || mgClient || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

async function sendBookingRecoveryOtp({ to, code, expiresMinutes = 10 }) {
    if (!hasConfiguredEmailDelivery()) return { success: false, error: 'A real email delivery provider is not configured.' };
    try {
            const from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'events@littx.com';
        const subject = 'Your Stageway booking recovery code';
        const text = `Your booking recovery code is ${code}. It expires in ${expiresMinutes} minutes and can be used once. If you did not request this code, you can ignore this email.`;
        if (process.env.BREVO_API_KEY) {
            const from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'events@littx.com';
            const [name, address] = from.includes('<') ? [from.replace(/<.*$/, '').replace(/"/g, '').trim() || 'Stageway', from.match(/<([^>]+)>/)?.[1]] : ['Stageway', from];
            if (!address) return { success: false, error: 'Email sender is not configured.' };
            const payload = JSON.stringify({ sender: { name, email: address }, to: [{ email: to }], subject, textContent: text });
            const response = await new Promise((resolve, reject) => {
                const request = require('https').request('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST', headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
                }, result => {
                    let body = '';
                    result.on('data', chunk => { body += chunk; });
                    result.on('end', () => result.statusCode >= 200 && result.statusCode < 300 ? resolve(true) : reject(new Error(`Email provider returned HTTP ${result.statusCode}.`)));
                });
                request.on('error', reject);
                request.write(payload); request.end();
            });
            return { success: Boolean(response) };
        }
        if (mgClient) {
            const response = await mgClient.messages.create(process.env.MAILGUN_DOMAIN, { from, to: [to], subject, text });
            return { success: true, id: response.id };
        }
        const info = await (await getTransporter()).sendMail({ from, to, subject, text });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        return { success: false, error: 'Email delivery failed.' };
    }
}

async function sendAccountSecurityOtp({ to, code, challengeId, purpose, expiresMinutes = 10 }) {
    if (process.env.NODE_ENV === 'test') { testMessageOutbox.push({ to, purpose, text: `TEST ONLY ${purpose} challenge ${challengeId} code ${code}; expires in ${expiresMinutes} minutes.` }); return { success: true, testOnly: true }; }
    if (!hasConfiguredEmailDelivery()) return { success: false, error: 'A real email delivery provider is not configured.' };
    try {
        const from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'events@littx.com';
        const action = purpose === 'organizer_activation' ? 'organizer account activation' : 'organizer application verification';
        const subject = purpose === 'organizer_activation' ? 'Activate your Stageway organizer account' : 'Verify your Stageway organizer application';
        let activationLink = '';
        if (purpose === 'organizer_activation' && process.env.BASE_URL) {
            try {
                const base = new URL(process.env.BASE_URL);
                const localHttp = process.env.NODE_ENV !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
                if ((base.protocol === 'https:' || localHttp) && !base.username && !base.password && !base.search && !base.hash) activationLink = `${base.origin}/organizer/activate`;
            } catch (_) {}
        }
        const text = `Challenge reference: ${challengeId}. Your ${action} code is ${code}. It expires in ${expiresMinutes} minutes and can be used once.${activationLink ? ` Activate your account at ${activationLink}.` : ' Open the organizer portal and choose Activate an approved account.'} If you did not request this, ignore this email.`;
        if (process.env.BREVO_API_KEY) {
            const [name, address] = from.includes('<') ? [from.replace(/<.*$/, '').replace(/"/g, '').trim() || 'Stageway', from.match(/<([^>]+)>/)?.[1]] : ['Stageway', from];
            if (!address) return { success: false, error: 'Email sender is not configured.' };
            const payload = JSON.stringify({ sender: { name, email: address }, to: [{ email: to }], subject, textContent: text });
            await new Promise((resolve, reject) => {
                const request = require('https').request('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST', headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
                }, result => { result.resume(); result.on('end', () => result.statusCode >= 200 && result.statusCode < 300 ? resolve() : reject(new Error('Email provider rejected message.'))); });
                request.on('error', reject); request.write(payload); request.end();
            });
        } else if (mgClient) {
            await mgClient.messages.create(process.env.MAILGUN_DOMAIN, { from, to: [to], subject, text });
        } else {
            await (await getTransporter()).sendMail({ from, to, subject, text });
        }
        return { success: true };
    } catch (_) {
        return { success: false, error: 'Email delivery failed.' };
    }
}

async function sendEventInvitation({ to, role, eventName, token, expiresAt }) {
    if (process.env.NODE_ENV === 'test') { testMessageOutbox.push({ to, purpose: 'event_invitation', text: `TEST ONLY invitation token ${token} for ${eventName} (${role}), expires ${expiresAt}.` }); return { success: true, testOnly: true }; }
    if (!hasConfiguredEmailDelivery()) return { success: false, error: 'A real email delivery provider is not configured.' };
    try {
        const base = new URL(process.env.BASE_URL || '');
        if (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(base.hostname) && base.protocol === 'http:')) return { success: false, error: 'A secure application URL is not configured.' };
        if (base.username || base.password || base.search || base.hash) return { success: false, error: 'A secure application URL is not configured.' };
        const origin = base.origin;
        const link = `${origin}/accept-invitation#token=${encodeURIComponent(token)}`;
        const from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'events@littx.com';
        const subject = `Stageway ${role.toUpperCase()} event invitation`;
        const text = `You have been invited as a ${role.toUpperCase()} for ${eventName}. Accept your invitation at ${link}. This one-time invitation expires ${new Date(expiresAt).toISOString()}.`;
        if (process.env.BREVO_API_KEY) {
            const [name, address] = from.includes('<') ? [from.replace(/<.*$/, '').replace(/"/g, '').trim() || 'Stageway', from.match(/<([^>]+)>/)?.[1]] : ['Stageway', from];
            if (!address) return { success: false, error: 'Email sender is not configured.' };
            const payload = JSON.stringify({ sender: { name, email: address }, to: [{ email: to }], subject, textContent: text });
            await new Promise((resolve, reject) => {
                const request = require('https').request('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, result => { result.resume(); result.on('end', () => result.statusCode >= 200 && result.statusCode < 300 ? resolve() : reject(new Error('Email provider rejected message.'))); });
                request.on('error', reject); request.write(payload); request.end();
            });
        } else if (mgClient) {
            await mgClient.messages.create(process.env.MAILGUN_DOMAIN, { from, to: [to], subject, text });
        } else {
            await (await getTransporter()).sendMail({ from, to, subject, text });
        }
        return { success: true };
    } catch (_) { return { success: false, error: 'Invitation email delivery failed.' }; }
}

module.exports = { sendTicketEmail, sendBookingRecoveryOtp, sendAccountSecurityOtp, sendEventInvitation, hasConfiguredEmailDelivery, renderTicketEmailContent, getTestMessageOutbox: () => process.env.NODE_ENV === 'test' ? testMessageOutbox : [] };

// Handles sending the ticket to the buyer's email once payment succeeds.
// Configure real SMTP or Mailgun credentials in server/.env — see .env.example.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { EVENT_NAME, EVENT_DETAILS, GENDER_LABEL, BANNER_PATH, AURA_BANNER_PATH } = require('./ticket');

let transporter = null;
let usingTestAccount = false;

// Initialize Mailgun client if configuration is present
let mgClient = null;
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

/**
 * Emails the "Littix"-style ticket to the buyer: banner + QR shown inline,
 * PDF pass attached. Returns { success, error, previewUrl }.
 * previewUrl is only present when using the Ethereal test fallback.
 */
async function sendTicketEmail({ to, name, ticketId, gender, quantity, amount, pdfPath, qrBuffer, downloadUrl, event }) {
    try {
        const eventTitle = event || EVENT_NAME;
        const genderLabel = GENDER_LABEL[gender] || gender;
        let envEmail = process.env.EMAIL_FROM || 'events@littx.com';
        let envName = process.env.EMAIL_FROM_NAME || 'LITTX Events';

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
        const bannerForEmail = (event && event.toUpperCase().includes('AURA') && fs.existsSync(AURA_BANNER_PATH))
            ? AURA_BANNER_PATH : BANNER_PATH;
        if (fs.existsSync(bannerForEmail)) attachments.push({ filename: 'banner.png', path: bannerForEmail, cid: 'ticketbanner' });

        let html, subject, text;

        if (gender && gender.toUpperCase().includes('EXCLUSIVE')) {
            html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111111; font-size: 15px; line-height: 1.6;">
              <p>Hi ${name},</p>
              <p>Congratulations! 🎉</p>
              <p>We’re excited to officially welcome you to the Dholida Garba Royale Influencer Lineup, presented by LITTX.</p>
              <p>Thank you for being a part of this journey. We’re looking forward to having you with us and creating an unforgettable experience together.</p>
              
              <div style="margin: 25px 0; padding: 20px; border: 2px solid #000000; border-radius: 8px; background-color: #ffffff;">
                <p style="font-size: 16px; font-weight: bold; margin-top: 0; margin-bottom: 12px; color: #000000; text-transform: uppercase; letter-spacing: 0.05em;">Event Details</p>
                <ul style="margin: 0; padding-left: 20px; color: #333333; list-style: disc;">
                  <li style="margin-bottom: 8px;"><strong>Event:</strong> Dholida Garba Royale</li>
                  <li style="margin-bottom: 8px;"><strong>Date:</strong> 17 October 2026</li>
                  <li style="margin-bottom: 8px;"><strong>Time:</strong> 4:00 PM onwards</li>
                  <li style="margin-bottom: 8px;"><strong>Venue:</strong> Pethkar Ground, Kothrud, Pune</li>
                </ul>
              </div>

              <p>Your official Invitation Pass is attached to this email as a PDF. It contains a unique QR code that will be scanned at the venue for entry. Please keep it safe and avoid sharing it, as each QR code is valid for one time entry only.</p>
              
              <p style="margin-top: 30px;">
                We can’t wait to see you at Dholida Garba Royale!<br><br>
                Best Regards,<br>
                <strong>Team LITTX</strong>
              </p>
            </div>`;
            
            subject = `Your Invitation: Dholida Garba Royale Influencer Lineup`;
            text = `Hi ${name},\n\nCongratulations! 🎉\n\nWe’re excited to officially welcome you to the Dholida Garba Royale Influencer Lineup, presented by LITTX.\n\nThank you for being a part of this journey. We’re looking forward to having you with us and creating an unforgettable experience together.\n\nEvent Details\n• Event: Dholida Garba Royale\n• Date: 17 October 2026\n• Time: 4:00 PM onwards \n• Venue: Pethkar Ground, Kothrud, Pune\n\nYour official Invitation Pass is attached to this email as a PDF. It contains a unique QR code that will be scanned at the venue for entry. Please keep it safe and avoid sharing it, as each QR code is valid for one time entry only.\n\nWe can’t wait to see you at Dholida Garba Royale!\n\nBest Regards,\nTeam LITTX`;
        } else {
            const viewUrl = downloadUrl ? downloadUrl.replace('/download', '').replace('/api/ticket/', `${process.env.BASE_URL || ''}/view/`) : null;
            // Build a clean view URL: BASE_URL/view/:ticketId
            const ticketViewUrl = `${process.env.BASE_URL || 'https://littx1.vercel.app'}/view/${ticketId}`;

            html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; border-radius: 24px; overflow: hidden;">
              
              <!-- Header Banner -->
              <div style="background: linear-gradient(135deg, #1a0a2e 0%, #0d0d0d 100%); padding: 40px 32px 32px; text-align: center; border-bottom: 1px solid #1e1e1e;">
                <img src="https://littx1.vercel.app/logo.png" alt="LITTX" style="height: 36px; width: auto; display: block; margin: 0 auto 16px;" />
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">🎉 You're In!</h1>
                <p style="margin: 8px 0 0; font-size: 14px; color: #a0a0a0;">Your ticket to <strong style="color: #c084fc;">${eventTitle}</strong> is confirmed</p>
              </div>

              <!-- Ticket Card -->
              <div style="padding: 28px 24px;">
                <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 20px; padding: 24px; margin-bottom: 24px;">
                  <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 1px;">Attendee</p>
                  <p style="margin: 0 0 20px; font-size: 20px; font-weight: 800; color: #ffffff;">${name}</p>
                  
                  <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 1px;">Ticket ID</p>
                  <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #a855f7; font-family: monospace;">${ticketId}</p>

                  <div style="border-top: 1px solid #2a2a2a; padding-top: 16px; display: flex; gap: 24px;">
                    <div>
                      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 1px;">Date</p>
                      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #e0e0e0;">17 OCT 2026 · 4:00 PM</p>
                    </div>
                    <div>
                      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 1px;">Venue</p>
                      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #e0e0e0;">Pethkar Ground, Kothrud, Pune</p>
                    </div>
                  </div>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${ticketViewUrl}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 16px 40px; border-radius: 100px; letter-spacing: 0.3px; box-shadow: 0 8px 24px rgba(168,85,247,0.35);">
                    🎟️ View Your Ticket Online
                  </a>
                  <p style="margin: 10px 0 0; font-size: 11px; color: #555555;">Or paste this link: <span style="color: #a855f7;">${ticketViewUrl}</span></p>
                </div>

                <!-- Guidelines Box -->
                <div style="background: #111; border: 1px solid #222; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                  <p style="font-size: 13px; font-weight: 700; margin: 0 0 12px; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em;">🎟️ Ticket Guidelines</p>
                  <ul style="margin: 0; padding-left: 18px; color: #a0a0a0; font-size: 13px; line-height: 1.7;">
                    <li>Your QR code is unique — valid for <strong style="color: #fff;">one-time entry only</strong>.</li>
                    <li>Do not share or forward this ticket. If someone else uses it first, your entry will be denied.</li>
                    <li>Carry a valid Photo ID and your payment receipt for verification.</li>
                    <li>Keep your ticket ready on your phone or as a printed copy.</li>
                    <li>Duplicate, tampered, or already-scanned tickets will not be accepted.</li>
                  </ul>
                  <p style="margin: 14px 0 0; font-size: 12px; font-weight: 700; color: #ef4444; line-height: 1.4;">
                    NO EXCUSES. All purchases are final — non-refundable and non-transferable.
                  </p>
                </div>

                <p style="font-size: 14px; color: #555; text-align: center; margin: 0;">
                  Your PDF ticket is also attached to this email.<br/>
                  <span style="color: #333;">See you on the dancefloor! 🎶 — <strong style="color: #a855f7;">LITTX</strong></span>
                </p>
              </div>

              <!-- Footer -->
              <div style="background: #0d0d0d; border-top: 1px solid #1e1e1e; padding: 20px 24px; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #444;">LITTX Events · Pune, India</p>
              </div>
            </div>`;

            subject = `Your ${eventTitle} Pass — ${ticketId}`;
            text = `Hi ${name},\n\nThanks for booking your ${eventTitle} pass! Your ticket (${ticketId}) is confirmed.\n\nView your ticket online: ${ticketViewUrl}\n\n🎟️ Ticket Guidelines\n\n• Your QR code is unique and valid for one-time entry only.\n• Do not share or forward this ticket. If someone else uses it first, your entry will be denied.\n• Carry a valid Photo ID and your payment screenshot/receipt for verification at the venue.\n• Keep your ticket ready on your phone or as a printed copy.\n• Duplicate, tampered, or already-scanned tickets will not be accepted.\n\nNO EXCUSES. All ticket purchases are final. Once booked, tickets are non-refundable and non-transferable under any circumstances.\n\nYour PDF ticket is attached to this email.\n\nSee you on the dancefloor!\n— LITTX`;
        }

        // 1. If Brevo API is configured, use Brevo HTTP API (Port 443 — Never Blocked)
        if (process.env.BREVO_API_KEY) {
            console.log(`[Mailer] Sending ticket to ${to} via Brevo HTTP API...`);
            
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

            return new Promise((resolve, reject) => {
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
                                console.log('[Mailer] Brevo send response:', resData);
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
            console.log(`[Mailer] Sending ticket to ${to} via Mailgun...`);
            
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
            
            // Banner inline image
            if (fs.existsSync(BANNER_PATH)) {
                mgAttachments.push({
                    filename: 'banner.png',
                    data: fs.readFileSync(BANNER_PATH),
                    cid: 'ticketbanner'
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

            console.log('[Mailer] Mailgun send response:', response);
            return { success: true, id: response.id };
        } else {
            // 3. SMTP fallback
            console.log(`[Mailer] Sending ticket to ${to} via SMTP...`);
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
            if (previewUrl) console.log(`[Mailer] Test email preview: ${previewUrl}`);
            return { success: true, messageId: info.messageId, previewUrl };
        }
    } catch (error) {
        console.error(`[Mailer] Failed to send ticket to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { sendTicketEmail };

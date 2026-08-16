const nodemailer = require('nodemailer');
const path = require('path');
const readline = require('readline');

// Setup command line interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create reusable transporter object using default SMTP transport
// You will need to replace these with your actual SMTP credentials
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email', // Replace with your SMTP host (e.g. smtp.gmail.com)
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'test_user@ethereal.email', // Replace with your email
        pass: 'test_password' // Replace with your email password
    }
});

async function sendTicket(email, ticketFilePath) {
    try {
        console.log(`Sending ticket to ${email}...`);
        
        const info = await transporter.sendMail({
            from: '"LITTX Events" <events@littx.com>',
            to: email,
            subject: 'Your LITTX Event Ticket',
            text: 'Thank you for booking with LITTX! Please find your ticket attached.',
            html: '<b>Thank you for booking with LITTX!</b><br>Please find your ticket attached.',
            attachments: [
                {
                    filename: path.basename(ticketFilePath),
                    path: ticketFilePath
                }
            ]
        });

        console.log('Ticket sent successfully!');
        console.log('Message ID: %s', info.messageId);
        // If using ethereal email for testing, you can see the message here:
        if (info.messageId && transporter.options.host === 'smtp.ethereal.email') {
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error('Error sending ticket:', error);
    }
}

function promptUser() {
    rl.question('Enter the customer email address (or type "exit" to quit): ', (email) => {
        if (email.toLowerCase() === 'exit') {
            rl.close();
            return;
        }
        
        rl.question('Enter the path to the ticket file (e.g. ./ticket.pdf): ', (ticketPath) => {
            const absolutePath = path.resolve(ticketPath);
            sendTicket(email, absolutePath).then(() => {
                console.log('\n---');
                promptUser(); // Ask again
            });
        });
    });
}

console.log('LITTX Manual Ticket Sender');
console.log('-----------------------------');
promptUser();

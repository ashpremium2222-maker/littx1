# LITTX

A full-stack event ticketing application with role-based access for Sellers, Partners, and Admins.

## Features
- **Admin Dashboard**: Analytics, ticket tracking, and sales monitoring.
- **Seller Portal**: Dedicated login for 3 device-locked sellers (SELLER-A, SELLER-B, SELLER-C) to issue manual tickets.
- **PR Partner Portal**: Track sales via unique partner links.
- **Automated Ticket Generation**: Generates PDF tickets with QR codes and emails them to customers (when Mailgun is configured).
- **Payment Integration**: Razorpay integration (can run in TEST MODE without credentials).

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (Local instance or MongoDB Atlas)

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <your-repo-url>
   cd LITTX
   ```

2. Setup the Server:
   ```bash
   cd staging/server
   npm install
   ```

3. Setup Environment Variables:
   - Copy `staging/server/.env.example` to `staging/server/.env`
   - Fill in your `MONGODB_URI` and any other required keys.

4. Start the Server:
   ```bash
   npm start
   ```
   The backend API and the static React frontend will run on port `3000`.

### Development (Frontend)
If you need to make changes to the React application (`combined-app`):
```bash
cd staging/combined-app
npm install
npm run dev # for local development
npm run build # to build for production (served by the node server)
```

## Security Note
This repository does not contain any sensitive keys or passwords. Make sure to **never commit your `.env` file**. The `.gitignore` is already configured to prevent this.

## WhatsApp ticket delivery

Every generated ticket is also queued as a WhatsApp template through
RichAutomate when a buyer phone number is present. Email delivery remains
enabled independently, so a WhatsApp failure does not prevent the ticket email.
The sale record stores the WhatsApp send result for diagnostics.

Add these variables in Vercel for each environment where messages should send:

| Variable | Purpose |
| --- | --- |
| `RICHAUTOMATE_API_KEY` | API key generated in RichAutomate Settings → API Keys. |
| `RICHAUTOMATE_TEMPLATE_NAME` | Exact name of the approved ticket template. |
| `RICHAUTOMATE_TEMPLATE_LANG` | Template language code, such as `en`. |
| `RICHAUTOMATE_ATTACH_PDF` | Set to `true` only when that template has a document header; it attaches the ticket PDF. |
| `RICHAUTOMATE_API_HOST` | Optional override for the API host. Defaults to `whatsappbe.richdaddy.in`. |

The template body receives these variables in order: attendee name, event name,
event date, venue, pass type, ticket ID, and the ticket-view link. Its variables
must match that order. RichAutomate requires an approved WhatsApp template for
outbound messages.

The Meta webhook endpoint remains `https://<your-domain>/api/whatsapp/webhook`.
If you use the direct Meta fallback instead of RichAutomate, configure
`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.

No WhatsApp values belong in source control or frontend variables. In the Meta
developer dashboard, use the endpoint above as the callback URL and subscribe
to the WhatsApp Business Account fields needed by your integration (typically
`messages`).

To test the verification locally, start the server with a temporary environment
variable and call the endpoint:

```powershell
$env:WHATSAPP_VERIFY_TOKEN = 'local-test-token'
node staging/server/server.js
curl.exe -i "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=local-test-token&hub.challenge=12345"
curl.exe -i "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"
curl.exe -i -X POST "http://localhost:3000/api/whatsapp/webhook" -H "Content-Type: application/json" -d "{\"object\":\"whatsapp_business_account\",\"entry\":[]}"
```

The first request returns `200` and `12345`; the second returns `403`; the POST
returns `200` promptly. Test an existing route such as `/api/health` as well.

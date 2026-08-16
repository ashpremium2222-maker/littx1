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

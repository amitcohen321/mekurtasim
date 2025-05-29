# Shavuot Party Gate System 🎉

A real-time party entrance validation system with duplicate prevention for managing guest entries.

## Features

- **Phone Validation**: Validates guests against a pre-registered list
- **Duplicate Prevention**: Each phone number can only validate once
- **Real-time Tracking**: Monitor entries as they happen
- **Admin Dashboard**: View statistics and entry logs
- **Hebrew UI**: Fully localized in Hebrew
- **Mobile Optimized**: Works perfectly on phones and tablets

## Project Structure

```
shavuot/
├── server/               # Backend Node.js server
│   ├── server.js        # Express server with API endpoints
│   ├── guests.js        # Guest list data
│   └── package.json     # Server dependencies
├── client/              # Frontend web application
│   ├── index.html       # Main entrance validation page
│   ├── admin.html       # Admin dashboard
│   ├── script.js        # Frontend validation logic
│   ├── styles.css       # Styling
│   └── guests.js        # Guest list (for fallback)
└── README.md            # This file
```

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Run the Server

For production:
```bash
npm start
```

For development (with auto-restart):
```bash
npm run dev
```

### 3. Access the Application

- **Main App**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html

## API Endpoints

- `POST /api/validate` - Validate a phone number
- `GET /api/status` - Get validation statistics
- `GET /api/validated` - Get list of validated entries
- `GET /api/health` - Health check

## How It Works

1. Guest enters their phone number
2. System checks if number is in the pre-registered list
3. If valid and not previously used, shows door code
4. Phone number is marked as validated (can't be used again)
5. Admin can monitor entries in real-time

## Security Features

- Rate limiting (100 requests per 15 minutes per IP)
- Input validation
- Partial phone number display for privacy
- CORS enabled
- Security headers via Helmet.js

## Updating Guest List

Edit `server/guests.js` with data from PayBox export:

```javascript
const guestsByPhone = {
    '0501234567': { name: 'Guest Name', tickets: 2 },
    // ... more guests
};
```

## Deployment

For production deployment:

1. Set `PORT` environment variable if not using 3000
2. Consider using PM2 or similar for process management
3. Set up reverse proxy (nginx/Apache) for HTTPS
4. Add environment-based configuration

## Notes

- Data is stored in memory and will reset when server restarts
- For persistent storage, consider adding a database
- The system prevents duplicate entries per phone number 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
app.set('trust proxy', 1); // trust first proxy for correct IP detection behind Render/Heroku/etc.
const PORT = process.env.PORT || 3000;

// Import guest data
const { guestsByPhone } = require('./guests.js');

// In-memory cache for validated entries
const validatedEntries = new Map();

// Function to generate unique URL-safe token
function generateUniqueToken() {
    let token;
    let attempts = 0;
    
    do {
        // Generate 32-character hex token
        token = crypto.randomBytes(16).toString('hex');
        attempts++;
        // Prevent infinite loop
        if (attempts > 1000) {
            // Fallback: use timestamp-based token
            token = crypto.createHash('sha256').update(Date.now().toString()).digest('hex').substring(0, 32);
            break;
        }
    } while (Array.from(validatedEntries.values()).some(entry => entry.uniqueToken === token));
    
    return token;
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"], // Allow CDN scripts
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers like onclick
            connectSrc: ["'self'"], // Allow fetch/XHR to same origin
            imgSrc: ["'self'", "data:", "https://api.qrserver.com"],
            fontSrc: ["'self'", "https:", "data:"]
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'יותר מדי ניסיונות, נסה שוב מאוחר יותר'
});

app.use('/api/', limiter);

// Middleware to check for admin cookie
function requireAdminCookie(req, res, next) {
  if (req.cookies && req.cookies.isAdmin === 'true') {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
}

// Hidden login route
app.get('/login', (req, res) => {
  res.cookie('isAdmin', 'true', { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.send('Admin cookie set. You can now access /admin.');
});

// API endpoint for phone validation
app.post('/api/validate', (req, res) => {
    const { phone, newsletter } = req.body;
    
    if (!phone) {
        return res.status(400).json({ 
            success: false, 
            message: 'מספר טלפון חסר' 
        });
    }
    
    // Clean phone number
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Validate phone format
    if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('05')) {
        return res.status(400).json({ 
            success: false, 
            message: 'מספר טלפון לא תקין' 
        });
    }
    
    // Check if already validated
    if (validatedEntries.has(cleanedPhone)) {
        const entry = validatedEntries.get(cleanedPhone);
        return res.status(403).json({ 
            success: false, 
            message: 'מספר זה כבר אומת בעבר',
            validatedAt: entry.phoneValidationTimestamp,
            validatedBy: entry.name,
            uniqueToken: entry.uniqueToken
        });
    }
    
    // Check guest list
    const guest = guestsByPhone[cleanedPhone];
    
    if (guest && guest.tickets > 0) {
        // Mark as validated (phone validation)
        validatedEntries.set(cleanedPhone, {
            name: guest.name,
            tickets: guest.tickets,
            phoneValidationTimestamp: new Date().toISOString(), // Renamed for clarity
            ip: req.ip,
            uniqueToken: generateUniqueToken(),
            entered: false,                 // Tracks if guest has actually entered
            entryTimestamp: null,           // Timestamp for actual entry
            enteredBy: null,                // Method/admin who confirmed entry
            newsletter: newsletter || false // Newsletter preference
        });
        
        return res.json({
            success: true,
            guest: {
                name: guest.name,
                tickets: guest.tickets,
                uniqueToken: validatedEntries.get(cleanedPhone).uniqueToken,
                validationUrl: `${req.protocol}://${req.get('host')}/admin/validate/${validatedEntries.get(cleanedPhone).uniqueToken}`
            }
        });
    }
    
    // Not in guest list
    return res.status(404).json({ 
        success: false, 
        message: 'לא נמצא ברשימת האורחים' 
    });
});

// API endpoint to check validation status (for admin)
app.get('/api/status', requireAdminCookie, (req, res) => {
    const stats = {
        totalGuests: Object.keys(guestsByPhone).length,
        validatedCount: validatedEntries.size,
        totalTickets: Object.values(guestsByPhone).reduce((sum, guest) => sum + guest.tickets, 0),
        validatedTickets: Array.from(validatedEntries.values()).reduce((sum, entry) => sum + entry.tickets, 0)
    };
    
    res.json(stats);
});

// API endpoint to get validated entries (for admin)
app.get('/api/validated', requireAdminCookie, (req, res) => {
    const entries = Array.from(validatedEntries.entries()).map(([phone, data]) => ({
        phone: phone.substring(0, 3) + '****' + phone.substring(7), // Partial phone for privacy
        ...data
    }));
    
    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(entries);
});

// API endpoint to get all guests with validation status (for admin)
app.get('/api/guests', requireAdminCookie, (req, res) => {
    const guests = Object.entries(guestsByPhone).map(([phone, guest]) => {
        const validated = validatedEntries.has(phone);
        const validationData = validated ? validatedEntries.get(phone) : null;
        return {
            phone: phone.substring(0, 3) + '****' + phone.substring(7), // Masked phone
            realPhone: phone, 
            name: guest.name,
            tickets: guest.tickets,
            validated: validated, // True if phone was validated
            phoneValidationTimestamp: validationData ? validationData.phoneValidationTimestamp : null,
            uniqueToken: validationData ? validationData.uniqueToken : null,
            entered: validationData ? validationData.entered : false,
            entryTimestamp: validationData ? validationData.entryTimestamp : null,
            enteredBy: validationData ? validationData.enteredBy : null,
            newsletter: validationData ? validationData.newsletter : false
        };
    });
    // Sort by name
    guests.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    res.json(guests);
});

// API endpoint to add a new guest (for admin)
app.post('/api/guests', requireAdminCookie, (req, res) => {
    const { name, phone, tickets, newsletter } = req.body;
    if (!name || !phone || typeof tickets !== 'number') {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('05')) {
        return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    if (guestsByPhone[cleanedPhone]) {
        return res.status(409).json({ success: false, message: 'Guest with this phone already exists' });
    }
    guestsByPhone[cleanedPhone] = { name, tickets };
    
    // If newsletter is true, add to validated entries with newsletter preference
    if (newsletter) {
        validatedEntries.set(cleanedPhone, {
            name: name,
            tickets: tickets,
            phoneValidationTimestamp: new Date().toISOString(),
            ip: 'admin-added',
            uniqueToken: generateUniqueToken(),
            entered: false,
            entryTimestamp: null,
            enteredBy: null,
            newsletter: true
        });
    }
    
    res.json({ success: true, guest: { name, phone: cleanedPhone, tickets, newsletter: newsletter || false } });
});

// API endpoint to get newsletter subscribers (for admin)
app.get('/api/newsletter-subscribers', requireAdminCookie, (req, res) => {
    const subscribers = Array.from(validatedEntries.entries())
        .filter(([phone, data]) => data.newsletter === true)
        .map(([phone, data]) => ({
            phone: phone,
            name: data.name,
            subscribedAt: data.phoneValidationTimestamp
        }));
    
    res.json({
        count: subscribers.length,
        subscribers: subscribers
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Admin page route
app.get('/admin', requireAdminCookie, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/admin.html'));
});

// API endpoint for validating by unique code (admin)
app.post('/api/validate-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: 'Code is required.' });
    }

    let foundEntry = null;
    let guestPhoneKey = null;

    for (const [phone, entryData] of validatedEntries.entries()) {
        if (entryData.uniqueToken === code) {
            foundEntry = entryData;
            guestPhoneKey = phone;
            break;
        }
    }

    if (foundEntry) {
        if (foundEntry.entered) {
            return res.status(400).json({
                success: false,
                message: `Code already used. Guest ${foundEntry.name} entered at ${new Date(foundEntry.entryTimestamp).toLocaleString('he-IL')}.`
            });
        } else {
            foundEntry.entered = true;
            foundEntry.entryTimestamp = new Date().toISOString();
            foundEntry.enteredBy = 'AdminCodeValidation';
            
            validatedEntries.set(guestPhoneKey, foundEntry); // Update the map entry

            return res.json({
                success: true,
                guestName: foundEntry.name,
                ticketsValidated: foundEntry.tickets,
                message: `Guest ${foundEntry.name} successfully validated for entry.`
            });
        }
    } else {
        return res.status(404).json({ success: false, message: 'קוד שגוי או לא קיים.' });
    }
});

// New QR code validation endpoint - redirects to admin with guest popup
app.get('/admin/validate/:token', requireAdminCookie, (req, res) => {
    const { token } = req.params;
    
    if (!token) {
        return res.status(400).send('Token is required');
    }

    let foundEntry = null;
    let guestPhoneKey = null;

    // Find the guest by token
    for (const [phone, entryData] of validatedEntries.entries()) {
        if (entryData.uniqueToken === token) {
            foundEntry = entryData;
            guestPhoneKey = phone;
            break;
        }
    }

    if (!foundEntry) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html dir="rtl" lang="he">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>קוד לא תקין</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1a1a1a; color: white; }
                    .error { background: #ff5252; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 400px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>❌ קוד לא תקין</h2>
                    <p>הקוד שסרקת אינו תקין או פג תוקפו</p>
                </div>
            </body>
            </html>
        `);
    }

    // Redirect to admin page with guest info in URL fragment
    const guestData = {
        name: foundEntry.name,
        phone: guestPhoneKey,
        realPhone: guestPhoneKey,
        tickets: foundEntry.tickets,
        validated: true,
        phoneValidationTimestamp: foundEntry.phoneValidationTimestamp,
        uniqueToken: foundEntry.uniqueToken,
        entered: foundEntry.entered,
        entryTimestamp: foundEntry.entryTimestamp,
        enteredBy: foundEntry.enteredBy
    };

    const encodedGuestData = encodeURIComponent(JSON.stringify(guestData));
    res.redirect(`/admin#validate-guest=${encodedGuestData}`);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Loaded ${Object.keys(guestsByPhone).length} guests`);
}); 
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

// Import guest data — guests.js is a raw JSON array, not a CommonJS module
const fs = require('fs');
const guestsArray = JSON.parse(fs.readFileSync(path.join(__dirname, 'guests.js'), 'utf8'));
const guestsByPhone = Object.assign({}, ...guestsArray);

// In-memory cache for validated entries
const validatedEntries = new Map();

// In-memory storage for guest messages
const guestMessages = [];

// Each validated phone can hold up to `tickets` entry codes — one per person.
// A code lives in entry.codes as { code, issuedAt, entered, entryTimestamp, enteredBy }.

// True if this 4-digit code is already issued to ANY guest
function codeExists(code) {
    for (const entry of validatedEntries.values()) {
        if ((entry.codes || []).some(c => c.code === code)) return true;
    }
    return false;
}

// Locate a single code across all entries → { phone, entry, codeObj } or null
function findByCode(code) {
    for (const [phone, entry] of validatedEntries.entries()) {
        const codeObj = (entry.codes || []).find(c => c.code === code);
        if (codeObj) return { phone, entry, codeObj };
    }
    return null;
}

// How many of an entry's issued codes have actually entered
function enteredCountOf(entry) {
    return (entry.codes || []).filter(c => c.entered).length;
}

// Function to generate unique 4-digit code
function generateUniqueCode() {
    let code;
    let attempts = 0;

    do {
        // Generate 4-digit code
        code = Math.floor(1000 + Math.random() * 9000).toString();
        attempts++;
        // Prevent infinite loop
        if (attempts > 1000) {
            // Fallback: use timestamp-based code
            code = (Date.now() % 9000 + 1000).toString();
            break;
        }
    } while (codeExists(code));

    return code;
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

// API endpoint for phone validation.
// Two modes:
//  - ISSUE (no `code` in body): hand out the next available entry code for this
//    phone. A phone with N tickets can be submitted up to N times, each returning
//    a fresh code, until all N are issued.
//  - LOOKUP (`code` in body): re-display an already-issued code (e.g. on page
//    reload) WITHOUT consuming a new one.
app.post('/api/validate', (req, res) => {
    const { phone, newsletter, code } = req.body;

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

    // Check guest list
    const guest = guestsByPhone[cleanedPhone];
    if (!guest || guest.tickets <= 0) {
        return res.status(404).json({
            success: false,
            message: 'לא נמצא ברשימת האורחים'
        });
    }

    let entry = validatedEntries.get(cleanedPhone);

    // LOOKUP mode — re-display a specific already-issued code, never issues a new one
    if (code) {
        const normalizedCode = String(code).trim();
        const codeObj = entry ? (entry.codes || []).find(c => c.code === normalizedCode) : null;
        if (codeObj) {
            const ticketNumber = entry.codes.indexOf(codeObj) + 1;
            return res.json({
                success: true,
                guest: {
                    name: guest.name,
                    phone: cleanedPhone,
                    tickets: guest.tickets,
                    entryCode: codeObj.code,
                    ticketNumber: ticketNumber,
                    totalTickets: guest.tickets,
                    remaining: guest.tickets - entry.codes.length
                }
            });
        }
        // Code not found (server restarted, or stale cache) — tell client to reset
        return res.status(404).json({
            success: false,
            message: 'הקוד אינו קיים יותר',
            reset: true
        });
    }

    // ISSUE mode — create the entry lazily, then hand out the next code
    if (!entry) {
        entry = {
            name: guest.name,
            tickets: guest.tickets,
            phoneValidationTimestamp: new Date().toISOString(),
            ip: req.ip,
            newsletter: newsletter || false,
            codes: [] // Each element: { code, issuedAt, entered, entryTimestamp, enteredBy }
        };
        validatedEntries.set(cleanedPhone, entry);
    }
    // Remember an opt-in even on a later submission
    if (newsletter) entry.newsletter = true;

    // All codes already handed out for this number
    if (entry.codes.length >= entry.tickets) {
        return res.status(403).json({
            success: false,
            message: `כל ${entry.tickets} הקודים עבור מספר זה כבר הונפקו`,
            validatedAt: entry.phoneValidationTimestamp,
            validatedBy: entry.name,
            phone: cleanedPhone,
            tickets: entry.tickets,
            issuedCount: entry.codes.length,
            allIssued: true
        });
    }

    // Issue the next code
    const newCode = generateUniqueCode();
    entry.codes.push({
        code: newCode,
        issuedAt: new Date().toISOString(),
        entered: false,
        entryTimestamp: null,
        enteredBy: null
    });
    const ticketNumber = entry.codes.length;

    return res.json({
        success: true,
        guest: {
            name: guest.name,
            phone: cleanedPhone,
            tickets: guest.tickets,
            entryCode: newCode,
            ticketNumber: ticketNumber,
            totalTickets: guest.tickets,
            remaining: guest.tickets - ticketNumber
        }
    });
});

// API endpoint to check validation status (for admin)
app.get('/api/status', requireAdminCookie, (req, res) => {
    const stats = {
        totalGuests: Object.keys(guestsByPhone).length,
        validatedCount: Array.from(validatedEntries.values()).filter(e => e.phoneValidationTimestamp).length,
        totalTickets: Object.values(guestsByPhone).reduce((sum, guest) => sum + guest.tickets, 0),
        validatedTickets: Array.from(validatedEntries.values())
            .reduce((sum, entry) => sum + enteredCountOf(entry), 0)
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
    try {
        const guests = Object.entries(guestsByPhone).map(([phone, guest]) => {
            const validationData = validatedEntries.get(phone) || null;
            // "Validated" = the phone actually completed validation (has a timestamp),
            // not merely that an entry object exists (e.g. after un-validating).
            const validated = !!(validationData && validationData.phoneValidationTimestamp);
            const codes = validationData ? (validationData.codes || []) : [];
            const enteredCount = validationData ? enteredCountOf(validationData) : 0;
            const issuedCount = codes.length;
            // "Fully entered" = every ticket has both a code issued and that person entered
            const fullyEntered = issuedCount > 0 && enteredCount >= guest.tickets;
            // Most recent entry time across this guest's codes
            const lastEntryTimestamp = codes
                .filter(c => c.entered && c.entryTimestamp)
                .map(c => c.entryTimestamp)
                .sort()
                .pop() || null;

            // Find if this guest has sent any messages (with null check)
            const guestMsgs = guestMessages ? guestMessages.filter(msg => msg.guestPhone === phone) : [];
            const hasMessages = guestMsgs.length > 0;
            const messageText = hasMessages ? guestMsgs.map(msg => msg.message).join(' | ') : '';

            return {
                phone: phone.substring(0, 3) + '****' + phone.substring(7), // Masked phone
                realPhone: phone,
                name: guest.name,
                tickets: guest.tickets,
                validated: validated, // True if phone was validated
                phoneValidationTimestamp: validationData ? validationData.phoneValidationTimestamp : null,
                entryCodes: codes.map(c => c.code),          // All issued codes for this number
                entryCode: codes.length ? codes.map(c => c.code).join(', ') : null,
                issuedCount: issuedCount,                    // How many codes handed out (of tickets)
                entered: fullyEntered,
                enteredCount: enteredCount,                  // How many people actually entered
                entryTimestamp: lastEntryTimestamp,
                enteredBy: validationData ? (codes.find(c => c.enteredBy)?.enteredBy || null) : null,
                newsletter: validationData ? validationData.newsletter : false,
                messages: messageText,
                hasMessages: hasMessages
            };
        });
        // Sort by name
        guests.sort((a, b) => a.name.localeCompare(b.name, 'he'));
        res.json(guests);
    } catch (error) {
        console.error('Error in /api/guests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch guests' });
    }
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
    
    // If newsletter is true, add to validated entries with newsletter preference.
    // No entry code is issued here — codes are handed out when the guest validates.
    if (newsletter) {
        validatedEntries.set(cleanedPhone, {
            name: name,
            tickets: tickets,
            phoneValidationTimestamp: new Date().toISOString(),
            ip: 'admin-added',
            newsletter: true,
            codes: []
        });
    }
    
    res.json({ success: true, guest: { name, phone: cleanedPhone, tickets, newsletter: newsletter || false } });
});

// API endpoint to update guest validation status (for admin)
app.patch('/api/guests/:phone/validation', requireAdminCookie, (req, res) => {
    const { phone } = req.params;
    const { validated } = req.body;
    
    if (typeof validated !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Validated status must be boolean' });
    }
    
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Check if guest exists
    if (!guestsByPhone[cleanedPhone]) {
        return res.status(404).json({ success: false, message: 'Guest not found' });
    }
    
    // Get or create validation entry
    let validationEntry = validatedEntries.get(cleanedPhone);
    if (!validationEntry) {
        validationEntry = {
            name: guestsByPhone[cleanedPhone].name,
            tickets: guestsByPhone[cleanedPhone].tickets,
            phoneValidationTimestamp: validated ? new Date().toISOString() : null,
            ip: 'admin-update',
            newsletter: false,
            codes: []
        };
        validatedEntries.set(cleanedPhone, validationEntry);
    }

    if (validated) {
        if (!validationEntry.phoneValidationTimestamp) {
            validationEntry.phoneValidationTimestamp = new Date().toISOString();
        }
        // Issue a first code if none exist yet
        if (!validationEntry.codes || validationEntry.codes.length === 0) {
            validationEntry.codes = [{
                code: generateUniqueCode(),
                issuedAt: new Date().toISOString(),
                entered: false,
                entryTimestamp: null,
                enteredBy: null
            }];
        }
    } else {
        // Removing validation clears all issued codes and entry state
        validationEntry.phoneValidationTimestamp = null;
        validationEntry.codes = [];
    }

    res.json({
        success: true,
        message: `Guest ${validated ? 'validated' : 'unvalidated'} successfully`,
        guest: {
            phone: cleanedPhone,
            name: guestsByPhone[cleanedPhone].name,
            validated: validated,
            entryCode: (validationEntry.codes[0] && validationEntry.codes[0].code) || null
        }
    });
});

// API endpoint to update guest entry status (for admin)
app.patch('/api/guests/:phone/entry', requireAdminCookie, (req, res) => {
    const { phone } = req.params;
    const { entered } = req.body;
    
    if (typeof entered !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Entry status must be boolean' });
    }
    
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Check if guest exists
    if (!guestsByPhone[cleanedPhone]) {
        return res.status(404).json({ success: false, message: 'Guest not found' });
    }
    
    // Check if guest is validated (required for entry)
    const validationEntry = validatedEntries.get(cleanedPhone);
    if (!validationEntry || !validationEntry.phoneValidationTimestamp) {
        return res.status(400).json({ success: false, message: 'Guest must be validated before marking as entered' });
    }
    
    // This toggle is all-or-nothing: it either admits every issued code or
    // resets them all back to "not entered".
    const now = new Date().toISOString();
    if (!validationEntry.codes) validationEntry.codes = [];
    if (entered && validationEntry.codes.length === 0) {
        // No codes issued yet — issue the full set so the guest can be fully admitted
        const totalTickets = validationEntry.tickets || guestsByPhone[cleanedPhone].tickets || 1;
        for (let i = 0; i < totalTickets; i++) {
            validationEntry.codes.push({
                code: generateUniqueCode(),
                issuedAt: now,
                entered: false,
                entryTimestamp: null,
                enteredBy: null
            });
        }
    }
    validationEntry.codes.forEach(c => {
        c.entered = entered;
        c.entryTimestamp = entered ? now : null;
        c.enteredBy = entered ? 'AdminDirectUpdate' : null;
    });

    res.json({
        success: true,
        message: `Guest ${entered ? 'marked as entered' : 'entry status removed'} successfully`,
        guest: {
            phone: cleanedPhone,
            name: guestsByPhone[cleanedPhone].name,
            entered: entered,
            enteredCount: enteredCountOf(validationEntry),
            entryTimestamp: entered ? now : null
        }
    });
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

    // Validate 4-digit code format and normalize to string
    const normalizedCode = String(code).trim();
    if (!/^\d{4}$/.test(normalizedCode)) {
        return res.status(400).json({ success: false, message: 'Code must be exactly 4 digits.' });
    }

    console.log('🔍 Searching for code:', normalizedCode);
    console.log('📋 Total validated entries:', validatedEntries.size);

    const found = findByCode(normalizedCode);

    if (!found) {
        return res.status(404).json({ success: false, message: 'קוד שגוי או לא קיים.' });
    }

    const { phone: guestPhoneKey, entry: foundEntry, codeObj } = found;
    console.log('✅ Code found! Guest:', foundEntry.name, 'Phone:', guestPhoneKey);

    // This specific code was already used
    if (codeObj.entered) {
        return res.status(400).json({
            success: false,
            message: `הקוד כבר שומש. האורח ${foundEntry.name} נכנס בשעה ${new Date(codeObj.entryTimestamp).toLocaleString('he-IL')}.`
        });
    }

    // Admit this one person
    codeObj.entered = true;
    codeObj.entryTimestamp = new Date().toISOString();
    codeObj.enteredBy = 'AdminCodeValidation';

    const totalTickets = foundEntry.tickets || 1;
    const enteredCount = enteredCountOf(foundEntry);
    const remaining = totalTickets - enteredCount;
    const isBirthdayGuest = guestsByPhone[guestPhoneKey]?.isBirthday || false;

    return res.json({
        success: true,
        guestName: foundEntry.name,
        phone: guestPhoneKey,
        ticketsValidated: totalTickets,
        enteredCount: enteredCount,
        remainingTickets: remaining,
        fullyEntered: enteredCount >= totalTickets,
        isBirthdayGuest: isBirthdayGuest,
        message: `Guest ${foundEntry.name} successfully validated for entry.`
    });
});

// 4-digit code validation endpoint - redirects to admin with guest popup
app.get('/admin/validate/:code', requireAdminCookie, (req, res) => {
    const { code } = req.params;
    
    // Normalize code to string and validate format
    const normalizedCode = String(code).trim();
    if (!normalizedCode || !/^\d{4}$/.test(normalizedCode)) {
        return res.status(400).send('Invalid code format - must be 4 digits');
    }

    const found = findByCode(normalizedCode);
    const foundEntry = found ? found.entry : null;
    const guestPhoneKey = found ? found.phone : null;
    const foundCodeObj = found ? found.codeObj : null;

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
                    <p>הקוד שהזנת אינו תקין או פג תוקפו</p>
                </div>
            </body>
            </html>
        `);
    }

    // Redirect to admin page with guest info in URL fragment. Focus on the
    // specific code that was scanned.
    const enteredCount = enteredCountOf(foundEntry);
    const guestData = {
        name: foundEntry.name,
        phone: guestPhoneKey,
        realPhone: guestPhoneKey,
        tickets: foundEntry.tickets,
        validated: true,
        phoneValidationTimestamp: foundEntry.phoneValidationTimestamp,
        entryCode: foundCodeObj.code,
        entryCodes: (foundEntry.codes || []).map(c => c.code),
        entered: enteredCount >= foundEntry.tickets,
        enteredCount: enteredCount,
        issuedCount: (foundEntry.codes || []).length,
        entryTimestamp: foundCodeObj.entryTimestamp,
        enteredBy: foundCodeObj.enteredBy
    };

    const encodedGuestData = encodeURIComponent(JSON.stringify(guestData));
    res.redirect(`/admin#validate-guest=${encodedGuestData}`);
});

// API endpoint for sharing messages
app.post('/api/share-message', (req, res) => {
    const { message, guestName, guestPhone } = req.body;
    
    if (!message || !message.trim()) {
        return res.status(400).json({ 
            success: false, 
            message: 'הודעה חסרה' 
        });
    }
    
    if (message.length > 500) {
        return res.status(400).json({ 
            success: false, 
            message: 'ההודעה ארוכה מדי (מקסימום 500 תווים)' 
        });
    }
    
    // Add message to storage
    const messageEntry = {
        id: Date.now().toString(),
        message: message.trim(),
        guestName: guestName || 'אורח',
        guestPhone: guestPhone || '',
        timestamp: new Date().toISOString(),
        ip: req.ip
    };
    
    guestMessages.push(messageEntry);
    
    // Keep only last 100 messages to prevent memory issues
    if (guestMessages.length > 100) {
        guestMessages.shift();
    }
    
    console.log(`📝 New message from ${guestName} (${guestPhone}): ${message}`);
    
    res.json({
        success: true,
        message: 'ההודעה נשלחה בהצלחה',
        messageId: messageEntry.id
    });
});

// API endpoint to get all messages (for admin)
app.get('/api/messages', requireAdminCookie, (req, res) => {
    res.json({
        count: guestMessages.length,
        messages: guestMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Loaded ${Object.keys(guestsByPhone).length} guests`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
}); 
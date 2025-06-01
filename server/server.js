const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // trust first proxy for correct IP detection behind Render/Heroku/etc.
const PORT = process.env.PORT || 3000;

// Import guest data
const { guestsByPhone } = require('./guests.js');

// In-memory cache for validated entries
const validatedEntries = new Map();

// Function to generate unique 4-digit code
function generateUniqueCode() {
    let code;
    let attempts = 0;
    
    do {
        // Generate 4-digit code (1000-9999)
        code = Math.floor(Math.random() * 9000 + 1000).toString();
        attempts++;
        // Prevent infinite loop
        if (attempts > 1000) {
            // Fallback: use last 4 digits of timestamp
            code = Date.now().toString().slice(-4);
            break;
        }
    } while (Array.from(validatedEntries.values()).some(entry => entry.uniqueCode === code));
    
    return code;
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers like onclick
            connectSrc: ["'self'"], // Allow fetch/XHR to same origin
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'", "https:", "data:"]
        }
    }
}));
app.use(cors());
app.use(express.json());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'יותר מדי ניסיונות, נסה שוב מאוחר יותר'
});

app.use('/api/', limiter);

// API endpoint for phone validation
app.post('/api/validate', (req, res) => {
    const { phone } = req.body;
    
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
            validatedAt: entry.timestamp,
            validatedBy: entry.name,
            uniqueCode: entry.uniqueCode
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
            uniqueCode: generateUniqueCode(),
            entered: false,                 // Tracks if guest has actually entered
            entryTimestamp: null,           // Timestamp for actual entry
            enteredBy: null                 // Method/admin who confirmed entry
        });
        
        return res.json({
            success: true,
            guest: {
                name: guest.name,
                tickets: guest.tickets,
                uniqueCode: validatedEntries.get(cleanedPhone).uniqueCode
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
app.get('/api/status', (req, res) => {
    const stats = {
        totalGuests: Object.keys(guestsByPhone).length,
        validatedCount: validatedEntries.size,
        totalTickets: Object.values(guestsByPhone).reduce((sum, guest) => sum + guest.tickets, 0),
        validatedTickets: Array.from(validatedEntries.values()).reduce((sum, entry) => sum + entry.tickets, 0)
    };
    
    res.json(stats);
});

// API endpoint to get validated entries (for admin)
app.get('/api/validated', (req, res) => {
    const entries = Array.from(validatedEntries.entries()).map(([phone, data]) => ({
        phone: phone.substring(0, 3) + '****' + phone.substring(7), // Partial phone for privacy
        ...data
    }));
    
    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(entries);
});

// API endpoint to get all guests with validation status (for admin)
app.get('/api/guests', (req, res) => {
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
            uniqueCode: validationData ? validationData.uniqueCode : null,
            entered: validationData ? validationData.entered : false,
            entryTimestamp: validationData ? validationData.entryTimestamp : null,
            enteredBy: validationData ? validationData.enteredBy : null
        };
    });
    // Sort by name
    guests.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    res.json(guests);
});

// API endpoint to add a new guest (for admin)
app.post('/api/guests', (req, res) => {
    const { name, phone, tickets } = req.body;
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
    res.json({ success: true, guest: { name, phone: cleanedPhone, tickets } });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Admin page route
app.get('/admin', (req, res) => {
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
        if (entryData.uniqueCode === code) {
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Loaded ${Object.keys(guestsByPhone).length} guests`);
}); 
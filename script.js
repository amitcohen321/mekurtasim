// הגדרות
const DOOR_CODE = '2580#';
const PAYBOX_LINK = 'https://link.payboxapp.com/JbPjTnSSEqPCZfKG6';

// DOM Elements
const form = document.getElementById('gate-form');
const phoneInput = document.getElementById('phone-input');
const submitBtn = document.getElementById('submit-btn');
const resultDiv = document.getElementById('result');
const againBtn = document.getElementById('again-btn');
const ticketSelector = document.getElementById('ticket-selector');
const ticketNumber = document.getElementById('ticket-number');
const phoneLabel = document.querySelector('.subtitle');

// Disable submit button initially
submitBtn.disabled = true;

// Track current guest
let currentGuest = null;

// Helper function to clean phone number
function cleanPhoneNumber(phone) {
    return phone.replace(/\D/g, '');
}

// Validate phone number format
function isValidPhoneNumber(phone) {
    const cleaned = cleanPhoneNumber(phone);
    return cleaned.length === 10 && cleaned.startsWith('05');
}

// Check if phone number is in guest list
function checkGuest(phoneNumber) {
    const cleaned = cleanPhoneNumber(phoneNumber);
    const guestData = guestsByPhone[cleaned];
    
    if (guestData && guestData.tickets > 0) {
        return {
            name: guestData.name,
            phone: cleaned,
            tickets: guestData.tickets
        };
    }
    return null;
}

// הצג תוצאת הצלחה
function showSuccess(guest) {
    resultDiv.className = 'result success';
    resultDiv.innerHTML = `
        <div class="welcome-name">✨ ברוכים הבאים ${guest.name}! ✨</div>
        <div class="tickets-info">
            🎟️ רשומים על שמך ${guest.tickets} כרטיסים
        </div>
        <div class="welcome-text">
            <p>
                ברוכים הבאים למסיבה! השקענו המון כדי שתהיה לכם חוויה מדהימה. 
                הקוד לכניסה הוא <span class="door-code">${DOOR_CODE}</span>
            </p>
            <p class="engagement-options">
                רוצים להישאר מעודכנים? הצטרפו לניוזלטר שלנו! 📫<br>
                או צלמו סלפי מגניב ושמרו אותו לבדיחה שתגיע בהמשך... 🤳
            </p>
        </div>
        <div class="entry-instructions">
            אנחנו כבר מחכים לכם בפנים! 🎉
        </div>
    `;
    
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
    
    logSuccessfulEntry(guest);
}

// הצג תוצאת כישלון
function showFailure() {
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ❌ מצטערים, אינך ברשימת האורחים
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
            לא הוזמנת? עדיין אפשר להצטרף למסיבה!
        </div>
        <a href="${PAYBOX_LINK}" target="_blank" class="paybox-btn">
            💳 רכישת כרטיס דרך PayBox
        </a>
    `;
    
    // רטט למכשירים ניידים
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
}

// הצג מצב מספר טלפון לא תקין
function showInvalidPhoneError() {
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ❌ מספר טלפון לא תקין
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
            נא להזין מספר בפורמט: 052xxxxxxx
        </div>
    `;
    
    // רטט למכשירים ניידים
    if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
    }
}

// Update button state based on input validity
function updateSubmitButtonState() {
    const phoneValid = isValidPhoneNumber(phoneInput.value);
    submitBtn.disabled = !phoneValid;
    
    if (phoneValid) {
        submitBtn.classList.add('enabled');
        submitBtn.classList.remove('disabled');
    } else {
        submitBtn.classList.add('disabled');
        submitBtn.classList.remove('enabled');
    }
}

// Populate ticket options
function populateTicketOptions(guest) {
    // Clear existing options
    ticketNumber.innerHTML = '<option value="">בחרו כמות רשומים</option>';
    
    // Add options from 1 to 10
    for (let i = 1; i <= 10; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}`;
        ticketNumber.appendChild(option);
    }
    
    // Show ticket selector
    ticketSelector.classList.remove('hidden');
}

// איפוס הטופס
function resetForm() {
    form.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    againBtn.classList.add('hidden');
    phoneInput.value = '';
    currentGuest = null;
    phoneInput.focus();
    submitBtn.disabled = true;
    submitBtn.classList.add('disabled');
    submitBtn.classList.remove('enabled');
    
    // Show phone label again
    if (phoneLabel) {
        phoneLabel.classList.remove('hidden');
    }
}

// Show loader animation
function showLoader() {
    resultDiv.className = 'result loading';
    resultDiv.innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>בודקים את הרשימה...</p>
        </div>
    `;
    resultDiv.classList.remove('hidden');
}

// Handle form submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const phoneNumber = phoneInput.value.trim();
    
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return;
    }
    
    // Hide phone label
    if (phoneLabel) {
        phoneLabel.classList.add('hidden');
    }
    
    // Hide form and show loader
    form.classList.add('hidden');
    showLoader();
    againBtn.classList.add('hidden');
    
    // Simulate network delay
    setTimeout(() => {
        const guest = checkGuest(phoneNumber);
        
        if (guest) {
            // Guest found - show success directly
            showSuccess(guest);
            againBtn.classList.remove('hidden');
        } else {
            // Guest not found - show failure message
            showFailure();
            againBtn.classList.remove('hidden');
        }
    }, 1500);
});

// טיפול בכפתור "בדיקת מספר נוסף"
againBtn.addEventListener('click', resetForm);

// Auto-format phone number as user types
phoneInput.addEventListener('input', (e) => {
    let value = e.target.value;
    
    // Remove any non-digit characters
    value = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    if (value.length > 10) {
        value = value.slice(0, 10);
    }
    
    // Update input value with cleaned number
    e.target.value = value;
    
    // Always update button state
    updateSubmitButtonState();
});

// התמקדות בשדה הטלפון בטעינת העמוד
window.addEventListener('load', () => {
    phoneInput.focus();
});

// טיפול במקש Enter בשדה הטלפון
phoneInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
    }
});

// הוספת משוב חזותי בעת הזנה
phoneInput.addEventListener('focus', () => {
    phoneInput.parentElement.style.transform = 'scale(1.02)';
});

phoneInput.addEventListener('blur', () => {
    phoneInput.parentElement.style.transform = 'scale(1)';
});

// אופציונלי: שמירת כניסות מוצלחות ב-sessionStorage לצורך אנליטיקה
function logSuccessfulEntry(guest) {
    const entries = JSON.parse(sessionStorage.getItem('partyEntries') || '[]');
    entries.push({
        name: guest.name,
        phone: guest.phone,
        totalTickets: guest.tickets,
        timestamp: new Date().toISOString()
    });
    sessionStorage.setItem('partyEntries', JSON.stringify(entries));
} 
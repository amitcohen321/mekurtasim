// הגדרות
const DOOR_CODE = '2580#';
const PAYBOX_LINK = 'https://link.payboxapp.com/JbPjTnSSEqPCZfKG6';
const API_URL = window.location.origin + '/api';

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
                <label class="newsletter-checkbox">
                    <input type="checkbox" id="newsletter-check"> 
                    אני רוצה להירשם לניוזלטר
                </label>
                <form id="newsletter-form" class="newsletter-form" style="display:none;">
                    <input type="email" id="newsletter-email" placeholder="האימייל שלך" class="newsletter-input">
                    <button type="submit" class="newsletter-submit-btn">הרשמה</button>
                    <div id="newsletter-status" class="newsletter-status"></div>
                </form>
                <div style="margin-top: 16px; font-size: 0.9rem; opacity: 0.9;">
                    או צלמו סלפי מגניב ושמרו אותו לבדיחה שתגיע בהמשך... 🤳
                </div>
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

    // Newsletter logic
    const newsletterCheck = document.getElementById('newsletter-check');
    const newsletterForm = document.getElementById('newsletter-form');
    const newsletterEmail = document.getElementById('newsletter-email');
    const newsletterStatus = document.getElementById('newsletter-status');
    if (newsletterCheck && newsletterForm) {
        newsletterCheck.addEventListener('change', () => {
            newsletterForm.style.display = newsletterCheck.checked ? 'block' : 'none';
            newsletterStatus.textContent = '';
            newsletterStatus.className = 'newsletter-status';
        });
        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = newsletterEmail.value.trim();
            if (!/^\S+@\S+\.\S+$/.test(email)) {
                newsletterStatus.textContent = 'אימייל לא תקין';
                newsletterStatus.className = 'newsletter-status error';
                return;
            }
            newsletterStatus.textContent = 'שולח...';
            newsletterStatus.className = 'newsletter-status loading';
            try {
                const res = await fetch('/api/newsletter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, phone: guest.phone })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    newsletterStatus.textContent = 'נרשמת בהצלחה!';
                    newsletterStatus.className = 'newsletter-status success';
                    newsletterEmail.disabled = true;
                } else {
                    newsletterStatus.textContent = data.message || 'שגיאה בהרשמה';
                    newsletterStatus.className = 'newsletter-status error';
                }
            } catch (err) {
                newsletterStatus.textContent = 'שגיאה בחיבור לשרת';
                newsletterStatus.className = 'newsletter-status error';
            }
        });
    }
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
form.addEventListener('submit', async (e) => {
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
    
    try {
        // Call API
        const response = await fetch(`${API_URL}/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone: phoneNumber })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Guest found and validated
            showSuccess(data.guest);
        } else if (response.status === 403) {
            // Already validated
            showAlreadyValidated(data);
        } else if (response.status === 404) {
            // Not in guest list
            showFailure();
        } else {
            // Other error
            showError(data.message || 'שגיאה בבדיקה');
        }
    } catch (error) {
        console.error('Validation error:', error);
        showError('שגיאה בחיבור לשרת');
    }
    
    againBtn.classList.remove('hidden');
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

// Show already validated message
function showAlreadyValidated(data) {
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ⚠️ ${data.message}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
            ${data.validatedBy} כבר אומת ב-${new Date(data.validatedAt).toLocaleString('he-IL')}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 16px;">
            אם זו טעות, פנו לצוות בכניסה
        </div>
    `;
    
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
}

// Show error message
function showError(message) {
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ❌ ${message}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
            נסה שוב או פנה לצוות
        </div>
    `;
} 
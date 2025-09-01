// הגדרות
const DOOR_CODE = '1909#';
const API_URL = window.location.origin + '/api';

// Back button functionality
function goBack() {
    // Get the base domain (protocol + hostname + port if any)
    const baseUrl = window.location.protocol + '//' + window.location.host;
    window.location.href = baseUrl;
}

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
    // Set current guest for message sharing
    currentGuest = guest;
    
    resultDiv.className = 'result success';
    resultDiv.innerHTML = `
        <div style="margin-bottom: 20px;">
            <button id="backButton" style="background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.4); color: white; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 1rem; transition: all 0.3s ease; width: 100%;">
                ← חזור לחיפוש
            </button>
        </div>
        <div class="welcome-name" style="text-align: center;">✨ ברוכים הבאים ${guest.name}! ✨</div>
        <div class="tickets-info">
            🎟️ רשומים על שמך ${guest.tickets} כרטיס/ים
        </div>
        <div class="entrance-code-section" style="background: rgba(255,255,255,0.2); padding: 16px; margin: 16px 0; border-radius: 12px; border: 2px solid rgba(255,255,255,0.4); text-align: center;">
            <div style="font-size: 1.1rem; margin-bottom: 8px; font-weight: bold;">🚪 קוד כניסה לדלת:</div>
            <div class="door-code" style="font-size: 2rem; font-weight: bold; letter-spacing: 4px; font-family: 'Courier New', monospace; color: #FFD700; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${DOOR_CODE}</div>
        </div>
        ${guest.entryCode ? `
        <div class="entry-code-section" style="background: rgba(255,255,255,0.15); padding: 20px; margin: 20px 0; border-radius: 12px; border: 2px solid rgba(255,255,255,0.3); text-align: center;">
            <div style="font-size: 1.1rem; margin-bottom: 12px; font-weight: bold;">🔢 קוד כניסה למסיבה:</div>
            <div style="background: white; padding: 20px; border-radius: 8px; display: inline-block; margin: 12px 0; border: 3px solid #FFD700;">
                <div style="font-size: 3rem; font-weight: bold; color: #000; font-family: 'Courier New', monospace; letter-spacing: 8px;">${guest.entryCode}</div>
            </div>
            <div style="font-size: 0.9rem; color: rgba(255,255,255,0.8); margin-top: 8px; line-height: 1.4;">
                <strong>הראו קוד זה למארחת בכניסה</strong><br>
            </div>
        </div>
        ` : ''}

        <div class="welcome-text">
        </div>
        
        <!-- Text Input Section -->
        <div class="text-input-section" style="background: rgba(255,255,255,0.15); padding: 20px; margin: 20px 0; border-radius: 12px; border: 2px solid rgba(255,255,255,0.3);">
            <div style="font-size: 1rem; margin-bottom: 12px; font-weight: bold; color: white;">
            מה בא לנו לכתוב בלי קשר לכלום?
            </div>
            <textarea id="guest-message" placeholder="..." 
                      style="width: 100%; min-height: 80px; padding: 12px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.9); color: #333; font-size: 1rem; font-family: inherit; resize: vertical; margin-bottom: 12px;"
                      maxlength="500"></textarea>
            <button id="share-message-btn" 
                    style="background: linear-gradient(135deg, #FF9C42, #FFD700); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.3s ease; width: 100%;">
                שתפו אותנו
            </button>
            <div id="message-status" style="margin-top: 8px; font-size: 0.9rem; min-height: 1.2em;"></div>
        </div>
    `;

    // Add event listener for back button
    document.getElementById('backButton').addEventListener('click', resetForm);
    
    // Add event listener for share message button
    document.getElementById('share-message-btn').addEventListener('click', shareMessage);

    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }

    // Store successful validation in localStorage
    localStorage.setItem('partyValidated', JSON.stringify({
        guest: guest,
        timestamp: new Date().toISOString(),
        validated: true
    }));

    logSuccessfulEntry(guest);
}

// הצג תוצאת כישלון
function showFailure() {
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ❌ מצטערים, אינך ברשימת האורחים
        </div>
        <div style="font-size: 1.1rem; margin-bottom: 8px; text-align: center;">
אנא פנה למארחת        </div>
        <button onclick="goBack()" class="back-btn" style="background: #FF9C42; margin-top: 12px; display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; color: white; font-size: 1rem; cursor: pointer; font-family: inherit;">
            ← חזור לדף הבית
        </button>
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
    phoneInput.value = '';
    currentGuest = null;
    phoneInput.focus();
    submitBtn.disabled = true;
    submitBtn.classList.add('disabled');
    submitBtn.classList.remove('enabled');

    // Reset newsletter checkbox
    const newsletterCheckbox = document.getElementById('newsletter-checkbox');
    if (newsletterCheckbox) newsletterCheckbox.checked = false;

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

    try {
        // Get newsletter preference
        const newsletterCheckbox = document.getElementById('newsletter-checkbox');
        const wantsNewsletter = newsletterCheckbox ? newsletterCheckbox.checked : false;

        // Call API
        const response = await fetch(`${API_URL}/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: phoneNumber,
                newsletter: wantsNewsletter
            })
        });

        const data = await response.json();
        console.log('Server response:', data);

        if (response.ok && data.success) {
            // Guest found and validated
            console.log('Guest data received:', data.guest);
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
});

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
    // Check if user was already validated
    const previousValidation = localStorage.getItem('partyValidated');
    if (previousValidation) {
        try {
            const validationData = JSON.parse(previousValidation);
            if (validationData.validated && validationData.guest) {
                // Hide form and show success screen
                form.classList.add('hidden');

                // Hide phone label
                if (phoneLabel) {
                    phoneLabel.classList.add('hidden');
                }

                // Show previous success
                showSuccess(validationData.guest);

                // Show a different message indicating they're already validated
                const alreadyValidatedMsg = document.createElement('div');
                alreadyValidatedMsg.style.cssText = 'text-align: center; margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.9rem; opacity: 0.8;';
                alreadyValidatedMsg.innerHTML = 'כבר אומתת בעבר - אין צורך לחפש שוב 👍';
                resultDiv.appendChild(alreadyValidatedMsg);

                return;
            }
        } catch (e) {
            // If there's an error parsing, clear the localStorage and continue normally
            localStorage.removeItem('partyValidated');
        }
    }

    // Normal flow - focus on input
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
    // Set current guest for message sharing
    currentGuest = {
        name: data.validatedBy || 'אורח',
        phone: data.phone || '',
        tickets: data.tickets || 1
    };
    
    resultDiv.className = 'result fail';
    resultDiv.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">
            ⚠️ ${data.message}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
            ${data.validatedBy} כבר אומת ב-${new Date(data.validatedAt).toLocaleString('he-IL')}
        </div>
        ${data.entryCode ? `
        <div class="entry-code-section" style="background: rgba(255,255,255,0.1); padding: 16px; margin: 16px 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); text-align: center;">
            <div style="font-size: 1rem; margin-bottom: 6px; font-weight: bold;">🎫 קוד כניסה למסיבה:</div>
            <div style="background: white; padding: 10px; border-radius: 6px; display: inline-block; margin: 8px 0; border: 3px solid #FFD700;">
                <div style="font-size: 2.5rem; font-weight: bold; color: #000; font-family: 'Courier New', monospace; letter-spacing: 4px;">${data.entryCode}</div>
            </div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 6px;">
                הראו קוד זה לצוות בכניסה
            </div>
        </div>
        ` : ''}
        <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 16px;">
            אם זו טעות, פנו לצוות בכניסה
        </div>
        <a href="https://wa.me/972544491343?text=שלום, המספר שלי כבר אומת אבל אני צריך עזרה" target="_blank" class="paybox-btn" style="background: #81C784; margin-top: 12px; display: block; text-align: center;">
            📲 פנייה למנהל בוואטסאפ
        </a>
        <button onclick="resetForm()" class="back-btn" style="background: #FF9C42; margin-top: 12px; display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; color: white; font-size: 1rem; cursor: pointer; font-family: inherit;">
            ← חזור לחיפוש
        </button>
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
        <a href="https://wa.me/972544491343?text=שלום, יש לי בעיה טכנית באתר מסיבת הגג" target="_blank" class="paybox-btn" style="background: #81C784; margin-top: 12px; display: block; text-align: center;">
            📲 פנייה למנהל בוואטסאפ
        </a>
    `;
}

// Share message function
async function shareMessage() {
    const messageInput = document.getElementById('guest-message');
    const shareBtn = document.getElementById('share-message-btn');
    const statusDiv = document.getElementById('message-status');
    
    const message = messageInput.value.trim();
    
    if (!message) {
        statusDiv.textContent = 'נא להזין הודעה';
        statusDiv.style.color = '#FF5252';
        return;
    }
    
    if (message.length > 500) {
        statusDiv.textContent = 'ההודעה ארוכה מדי (מקסימום 500 תווים)';
        statusDiv.style.color = '#FF5252';
        return;
    }
    
    // Show loading state
    shareBtn.disabled = true;
    shareBtn.textContent = 'שולח...';
    statusDiv.textContent = '';
    
    try {
        const response = await fetch(`${API_URL}/share-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                guestName: currentGuest ? currentGuest.name : 'אורח',
                guestPhone: currentGuest ? currentGuest.phone : ''
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            statusDiv.textContent = '✅ ההודעה נשלחה בהצלחה!';
            statusDiv.style.color = '#10C26D';
            messageInput.value = '';
            messageInput.disabled = true;
            shareBtn.disabled = true;
            shareBtn.textContent = 'נשלח ✓';
            
            // Vibrate on success
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
        } else {
            statusDiv.textContent = data.message || 'שגיאה בשליחת ההודעה';
            statusDiv.style.color = '#FF5252';
            shareBtn.disabled = false;
            shareBtn.textContent = 'שתף אותנו';
        }
    } catch (error) {
        console.error('Error sharing message:', error);
        statusDiv.textContent = 'שגיאה בחיבור לשרת';
        statusDiv.style.color = '#FF5252';
        shareBtn.disabled = false;
        shareBtn.textContent = 'שתף אותנו';
    }
} 
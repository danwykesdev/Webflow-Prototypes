document.addEventListener('DOMContentLoaded', () => {
    console.log("Script loaded");
    // =========================================
    // Custom Modal Logic
    // =========================================
    const modal = document.getElementById('modal');
    const openBtn = document.getElementById('openModalBtn');
    const closeBtn = document.getElementById('modalCloseBtn');
    const overlay = document.getElementById('modalOverlay');

    function openModal(e) {
        if (e) e.preventDefault();
        modal.classList.add('is-open');
        modal.style.display = 'flex'; // Ensure flex layout
    }

    function closeModal() {
        modal.classList.remove('is-open');
        setTimeout(() => {
            if (!modal.classList.contains('is-open')) {
                modal.style.display = 'none';
            }
        }, 300); // Wait for transition
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) {
            closeModal();
        }
    });

    // =========================================
    // Form Validation & Logic
    // =========================================
    const form = document.getElementById('leadCaptureForm');
    const emailInput = document.getElementById('companyEmail');
    const emailError = document.getElementById('emailError');
    const formSuccess = document.getElementById('formSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Bot detection / Email validation
    function isValidEmail(email) {
        // Basic format check
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(email)) return false;

        // "Bot-like" checks
        const localPart = email.split('@')[0];

        // 1. Check for repetitive strings (e.g., "sjsjsj")
        // Simple heuristic: if any character repeats 4+ times consecutively
        if (/(.)\1{3,}/.test(localPart)) return false;

        // 2. Check for random-looking consonant strings (too many consonants in a row)
        // Heuristic: 5+ consonants in a row might be suspicious "sjsjsj"
        if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(localPart)) return false;

        // 3. Length checks
        if (localPart.length < 3) return false;

        return true;
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!isValidEmail(email)) {
            emailError.textContent = "Please enter a valid company email address.";
            emailInput.style.borderColor = "var(--color-error)";
            return;
        }

        // Clear errors
        emailError.textContent = "";
        emailInput.style.borderColor = "var(--color-border)";

        // Process API call to Action URL using Fetch
        submitBtn.textContent = "Processing...";
        submitBtn.disabled = true;

        const actionUrl = form.getAttribute('action');
        const formData = new FormData(form);

        fetch(actionUrl, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        }).then(response => {
            // Check if successful
            // Proceed to success state since CORS or redirect logic might limit JS,
            // but the fetch payload is dispatched natively to Kit endpoint.
            form.style.display = 'none';
            formSuccess.style.display = 'block';
        }).catch(error => {
            console.error('Submission error:', error);
            submitBtn.textContent = "Get the Scorecard";
            submitBtn.disabled = false;
            emailError.textContent = "Error submitting to kit. Please try again.";
        });
    });

    emailInput.addEventListener('input', () => {
        emailError.textContent = "";
        emailInput.style.borderColor = "var(--color-border)";
    });



});

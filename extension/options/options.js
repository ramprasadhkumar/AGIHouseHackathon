// options.js

const limitInput = document.getElementById('limit');
const saveLimitButton = document.getElementById('saveLimit');
const currentLimitSpan = document.getElementById('currentLimit');
const currentSpendingSpan = document.getElementById('currentSpending');
const resetSpendingButton = document.getElementById('resetSpending');
const statusP = document.getElementById('status');

const BASE_URL = 'http://localhost:8000'; // Your FastAPI server URL

// Function to update status message
function updateStatus(message, isError = false) {
    statusP.textContent = message;
    statusP.style.color = isError ? 'red' : 'green';
    // Optional: clear status after a few seconds
    // setTimeout(() => statusP.textContent = '', 5000);
}

// Load current settings from the backend
async function loadSettings() {
    updateStatus('Loading settings...', false);
    try {
        const response = await fetch(`${BASE_URL}/spending/monthly`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
            throw new Error(errorData.detail || errorData.message || `HTTP error ${response.status}`);
        }
        const data = await response.json();

        limitInput.value = data.limit !== undefined ? data.limit : 500; // Keep default logic
        currentLimitSpan.textContent = data.limit !== undefined ? data.limit.toFixed(2) : 'N/A';
        currentSpendingSpan.textContent = data.currentSpending !== undefined ? data.currentSpending.toFixed(2) : 'N/A';
        updateStatus('Settings loaded.', false);

    } catch (error) {
        console.error('Error loading settings:', error);
        updateStatus(`Error loading settings: ${error.message}`, true);
        // Set defaults or N/A on error
        limitInput.value = 500; // Default
        currentLimitSpan.textContent = 'N/A';
        currentSpendingSpan.textContent = 'N/A';
    }
}

// Save the limit via backend API
saveLimitButton.addEventListener('click', async () => {
    const newLimit = parseFloat(limitInput.value);
    if (isNaN(newLimit) || newLimit < 0) {
        updateStatus('Please enter a valid non-negative number for the limit.', true);
        return;
    }

    updateStatus('Saving limit...', false);
    try {
        const response = await fetch(`${BASE_URL}/spending/limit`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: newLimit }),
        });

        const data = await response.json(); // Try to parse JSON regardless of status for error details

        if (!response.ok) {
            throw new Error(data.detail || data.message || `HTTP error ${response.status}`);
        }

        updateStatus(data.message || 'Limit updated successfully!', false);
        // Refresh the displayed settings after saving
        loadSettings();

    } catch (error) {
        console.error('Error saving limit:', error);
        updateStatus(`Error saving limit: ${error.message}`, true);
    }
});

// Reset spending via backend API
resetSpendingButton.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset the current month\'s spending to $0.00?')) {
        return;
    }

    updateStatus('Resetting spending...', false);
    try {
        const response = await fetch(`${BASE_URL}/spending/reset`, {
            method: 'POST',
            headers: {
                 'Content-Type': 'application/json', // Good practice, even if no body
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.message || `HTTP error ${response.status}`);
        }

        updateStatus(data.message || 'Spending reset successfully!', false);
        // Refresh settings to show the new zero spending
        loadSettings(); 

    } catch (error) {
        console.error('Error resetting spending:', error);
        updateStatus(`Error resetting spending: ${error.message}`, true);
    }
});

// Initial load when the options page is opened
document.addEventListener('DOMContentLoaded', loadSettings);

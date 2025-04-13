// options.js

const limitInput = document.getElementById('limit');
const saveLimitButton = document.getElementById('saveLimit');
const currentLimitSpan = document.getElementById('currentLimit');
const currentSpendingSpan = document.getElementById('currentSpending');
const resetSpendingButton = document.getElementById('resetSpending');
const statusP = document.getElementById('status');

const BASE_URL = 'http://localhost:8000'; // Your FastAPI server URL

// Function to update status message
function updateStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    setTimeout(() => {
        status.textContent = '';
    }, 2000);
}

// Load current settings from the backend
async function loadSettings() {
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

    } catch (error) {
        console.error('Error loading settings:', error);
        // Silently fall back to defaults without showing error
        limitInput.value = 500;
        currentLimitSpan.textContent = (500).toFixed(2);
        currentSpendingSpan.textContent = (0).toFixed(2);
    }
}

// Save the limit via backend API
saveLimitButton.addEventListener('click', async () => {
    const newLimit = parseFloat(limitInput.value);
    if (isNaN(newLimit) || newLimit < 0) {
        updateStatus('Please enter a valid non-negative number for the limit.');
        return;
    }

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

        updateStatus(data.message || 'Limit updated successfully!');
        // Refresh the displayed settings after saving
        loadSettings();

    } catch (error) {
        console.error('Error saving limit:', error);
        updateStatus(`Error saving limit: ${error.message}`);
    }
});

// Reset spending via backend API
resetSpendingButton.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset the current month\'s spending to $0.00?')) {
        return;
    }

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

        updateStatus(data.message || 'Spending reset successfully!');
        // Refresh settings to show the new zero spending
        loadSettings(); 

    } catch (error) {
        console.error('Error resetting spending:', error);
        updateStatus(`Error resetting spending: ${error.message}`);
    }
});

// Initial load when the options page is opened
document.addEventListener('DOMContentLoaded', loadSettings);

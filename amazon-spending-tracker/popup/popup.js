// popup.js

const loadingDiv = document.getElementById('loading');
const contentDiv = document.getElementById('content');
const errorDiv = document.getElementById('error');

const orderTotalSpan = document.getElementById('orderTotal');
const currentSpendingSpan = document.getElementById('currentSpending');
const monthlyLimitSpan = document.getElementById('monthlyLimit');
const remainingBudgetSpan = document.getElementById('remainingBudget');
const warningP = document.getElementById('warning');

const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');

let currentOrderData = null; // To store { orderTotal, limit, currentSpending, tabId }

function displayError(message) {
    console.error('Popup Error:', message);
    errorDiv.textContent = `Error: ${message}`; // Ensure message is a string
    errorDiv.style.display = 'block';
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup DOM loaded. Requesting data from background...');
    chrome.runtime.sendMessage({ action: 'getPopupData' }, (response) => {
        if (chrome.runtime.lastError) {
            displayError(`Could not communicate with background script: ${chrome.runtime.lastError.message}`);
            return;
        }

        if (response && response.success && response.data) {
            console.log('Received data from background:', response.data);
            currentOrderData = response.data;
            populatePopup(response.data);
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
        } else {
            displayError(response?.error || 'Failed to get order data from background script.');
        }
    });
});

function populatePopup(data) {
    const orderTotal = data.orderTotal || 0;
    const currentSpending = data.currentSpending || 0;
    const limit = data.limit || 0;
    const remaining = limit - currentSpending;

    orderTotalSpan.textContent = `$${orderTotal.toFixed(2)}`;
    currentSpendingSpan.textContent = `$${currentSpending.toFixed(2)}`;
    monthlyLimitSpan.textContent = `$${limit.toFixed(2)}`;
    remainingBudgetSpan.textContent = `$${remaining.toFixed(2)}`;

    if (currentSpending + orderTotal > limit) {
        warningP.style.display = 'block';
    } else {
        warningP.style.display = 'none';
    }
}

confirmButton.addEventListener('click', () => {
    console.log('Confirm button clicked.');
    if (!currentOrderData || currentOrderData.tabId === undefined) {
        displayError('Missing necessary data to confirm order.');
        return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = 'Processing...';

    console.log(`Sending confirmOrder message for tabId: ${currentOrderData.tabId}`);
    chrome.runtime.sendMessage({
        action: 'confirmOrder',
        tabId: currentOrderData.tabId
    }, (response) => {
        // We don't expect a direct response here that confirms success,
        // as the action happens in the content script.
        // The background script will handle the storage update *after*
        // the content script confirms the trigger.
         if (chrome.runtime.lastError) {
             console.error("Error sending confirmOrder message:", chrome.runtime.lastError.message);
             // Re-enable button on error maybe?
             displayError(`Failed to send confirmation: ${chrome.runtime.lastError.message}`);
             confirmButton.disabled = false;
             confirmButton.textContent = 'Confirm and Place Order';
         } else {
             console.log('Confirmation message sent to background.');
             // Close the popup after sending the message
             window.close();
         }
    });
});

cancelButton.addEventListener('click', () => {
    console.log('Cancel button clicked.');
     // Inform background to clean up temporary data
    if (currentOrderData && currentOrderData.tabId !== undefined) {
        chrome.runtime.sendMessage({ action: 'cancelOrder', tabId: currentOrderData.tabId });
    }
    window.close();
});

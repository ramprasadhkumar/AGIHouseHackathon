// popup.js

const loadingDiv = document.getElementById('loading');
const budgetSection = document.getElementById('budgetSection');
const errorDiv = document.getElementById('error');

const orderTotalSpan = document.getElementById('orderTotal');
const currentOrderItemsList = document.getElementById('currentOrderItemsList');
const currentSpendingSpan = document.getElementById('currentSpending');
const monthlyLimitSpan = document.getElementById('monthlyLimit');
const remainingBudgetSpan = document.getElementById('remainingBudget');
const warningP = document.getElementById('warning');
const viewPurchasesLink = document.getElementById('viewPurchasesLink');
const purchasesSection = document.getElementById('purchasesSection');
const purchasesList = document.getElementById('purchasesList');
const hidePurchasesButton = document.getElementById('hidePurchasesButton');

const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');
const reviewButton = document.getElementById('reviewButton');
const reviewResultDiv = document.getElementById('reviewResult');

let currentOrderData = null; // To store { orderTotal, limit, currentSpending, items, tabId }
let monthlyItems = []; // To store the fetched items

function displayError(message) {
    console.error('Popup Error:', message);
    errorDiv.textContent = `Error: ${message}`; // Ensure message is a string
    errorDiv.style.display = 'block';
    loadingDiv.style.display = 'none';
    budgetSection.style.display = 'none'; // Hide budget section on error
    purchasesSection.style.display = 'none'; // Hide purchases section on error
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
            monthlyItems = response.data.items || []; // Store the historical items
            console.log("Bernett: ", response.data);
            populatePopup(response.data);
            loadingDiv.style.display = 'none';
            budgetSection.style.display = 'block'; // Show budget section

            // Play the alert sound
            try {
                const audioUrl = chrome.runtime.getURL('data/alert.wav');
                const alertSound = new Audio(audioUrl);
                alertSound.play().catch(e => console.error("Error playing sound:", e)); // Play and catch potential errors
                console.log("Attempting to play alert sound.");
            } catch (e) {
                console.error("Error creating or playing audio:", e);
            }

        } else {
            displayError(response?.error || 'Failed to get order data from background script.');
        }
    });
});

function populatePopup(data) {
    console.log("Orlando: ", data);
    const orderTotal = data.orderTotal || 0;
    const currentSpending = data.currentSpending || 0;
    const limit = data.limit || 0;
    const remaining = limit - currentSpending;
    monthlyItems = data.items || []; // Update historical items here just in case
    const currentItems = data.currentOrderItems || []; // Get current items for this order

    orderTotalSpan.textContent = `$${orderTotal.toFixed(2)}`;
    currentSpendingSpan.textContent = `$${currentSpending.toFixed(2)}`;
    monthlyLimitSpan.textContent = `$${limit.toFixed(2)}`;
    remainingBudgetSpan.textContent = `$${remaining.toFixed(2)}`;

    // Populate the current items list
    currentOrderItemsList.innerHTML = ''; // Clear previous items
    if (currentItems.length === 0) {
        currentOrderItemsList.innerHTML = '<li>No specific items detected.</li>';
    } else {
        currentItems.forEach(item => {
            console.log("Bernett: ", item);
            const li = document.createElement('li');
            // Display name and price (if available)
            // Make price formatting more robust
            let priceString = '(Price not found)';
            if (item && typeof item.price === 'number') { // Check if item exists and price is a number
                priceString = `$${item.price.toFixed(2)}`;
            } else if (item && item.price === null) {
                // Price was explicitly null (extraction failed), keep default message or customize
                // priceString = '(Price could not be extracted)';
            } else {
                // Log if item or item.price is unexpected (like undefined)
                console.warn('Unexpected item structure in current order items:', item);
                priceString = '(Invalid item data)';
            }
            const quantityString = item.quantity > 1 ? `(Qty: ${item.quantity})` : ''; // Show quantity if > 1
            li.textContent = `${item.name || '(Name not found)'} ${quantityString} - ${priceString}`;
            currentOrderItemsList.appendChild(li);
        });
    }

    if (currentSpending + orderTotal > limit) {
        warningP.style.display = 'block';
    } else {
        warningP.style.display = 'none';
    }
}

function displayPurchases() {
    purchasesList.innerHTML = ''; // Clear previous items
    if (monthlyItems.length === 0) {
        purchasesList.innerHTML = '<li>No items purchased this month.</li>';
        return;
    }

    monthlyItems.forEach(item => {
        const li = document.createElement('li');
        // Update display to show name and price (if available)
        // Add similar robustness check for historical items
        let priceString = '(Price not recorded)';
        if (item && typeof item.price === 'number') {
            priceString = `$${item.price.toFixed(2)}`;
        } else if (item && item.price === null) {
            // Historical price might legitimately be null if saved that way
        } else {
            console.warn('Unexpected item structure in historical monthly items:', item);
            priceString = '(Invalid historical data)';
        }
        const quantityString = item.quantity > 1 ? `(Qty: ${item.quantity})` : ''; // Show quantity if > 1
        li.textContent = `${item.name || '(Name not found)'} ${quantityString} - ${priceString}`;
        purchasesList.appendChild(li);
    });
}

// Event Listener for View Purchases Link
viewPurchasesLink.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent default link behavior
    displayPurchases(); // Populate the list
    budgetSection.style.display = 'none';
    purchasesSection.style.display = 'block';
});

// Event Listener for Hide Purchases Button
hidePurchasesButton.addEventListener('click', () => {
    purchasesSection.style.display = 'none';
    budgetSection.style.display = 'block';
});

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

// Event Listener for Review Button
reviewButton.addEventListener('click', () => {
    console.log('Review button clicked.');
    if (!currentOrderData || typeof currentOrderData.orderTotal !== 'number') {
        displayError('Missing order data to perform review.');
        return;
    }

    reviewButton.disabled = true;
    reviewButton.textContent = 'Reviewing...';
    reviewResultDiv.style.display = 'none'; // Hide previous result
    reviewResultDiv.textContent = '';
    reviewResultDiv.className = 'review-result'; // Reset classes

    const apiUrl = 'http://localhost:8000/spending/check-order';
    const requestBody = {
        orderAmount: currentOrderData.orderTotal,
        currentSpending: currentOrderData.currentSpending,
        monthlyLimit: currentOrderData.limit,
        itemsInOrder: currentOrderData.currentOrderItems || []
    };

    console.log('Sending review request to:', apiUrl, 'with body:', requestBody);

    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => {
        if (!response.ok) {
            // Try to get error message from response body if possible
            return response.json().catch(() => null).then(errBody => {
                throw new Error(`API request failed with status ${response.status}. ${errBody?.detail || ''}`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Received review response:', data);
        reviewResultDiv.textContent = data.message || 'No message received.';
        if (data.status === 'no') {
            reviewResultDiv.classList.add('warning');
        } else if (data.status === 'yes') {
            reviewResultDiv.classList.add('success');
        }
        reviewResultDiv.style.display = 'block';
    })
    .catch(error => {
        console.error('Error calling review API:', error);
        reviewResultDiv.textContent = `Error: ${error.message}`;
        reviewResultDiv.classList.add('warning'); // Show error as warning
        reviewResultDiv.style.display = 'block';
    })
    .finally(() => {
        reviewButton.disabled = false;
        reviewButton.textContent = 'Review with AI';
    });
});

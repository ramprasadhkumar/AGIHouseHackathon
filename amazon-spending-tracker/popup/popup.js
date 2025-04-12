// popup.js

const loadingDiv = document.getElementById('loading');
const contentDiv = document.getElementById('content');
const errorDiv = document.getElementById('error');
const summaryDiv = document.getElementById('summary');

const orderTotalSpan = document.getElementById('orderTotal');
const currentEssentialSpan = document.getElementById('current-essential');
const currentNonEssentialSpan = document.getElementById('current-non-essential');
const limitSpan = document.getElementById('monthlyLimit');
const remainingSpan = document.getElementById('remaining');
const warningMessageDiv = document.getElementById('warning-message');
const errorMessageDiv = document.getElementById('error-message');
const essentialMarkerP = document.getElementById('essential-marker');
const confirmButton = document.getElementById('confirm-button');
const cancelButton = document.getElementById('cancel-button');

let currentTabId = null; // Store the tab ID associated with this popup

// Request data from the background script when the popup loads
document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup requesting data...");
  chrome.runtime.sendMessage({ action: 'getPopupData' }, (response) => {
    loadingDiv.style.display = 'none'; // Hide loading message

    if (chrome.runtime.lastError) {
      console.error('Could not communicate with background script:', chrome.runtime.lastError.message);
      errorMessageDiv.textContent = `Error loading data: ${chrome.runtime.lastError.message}`;
      errorMessageDiv.style.display = 'block';
      return;
    }

    if (response && response.success) {
      const data = response.data;
      console.log("Popup received data:", data);
      currentTabId = data.tabId; // Store the tabId

      const orderTotal = parseFloat(data.orderTotal || 0);
      const limit = parseFloat(data.limit || 0);
      const currentEssential = parseFloat(data.currentEssentialSpending || 0);
      const currentNonEssential = parseFloat(data.currentNonEssentialSpending || 0);
      const isEssential = data.isEssential;

      // Update UI elements
      orderTotalSpan.textContent = `$${orderTotal.toFixed(2)}`;
      limitSpan.textContent = `$${limit.toFixed(2)}`;
      currentEssentialSpan.textContent = `$${currentEssential.toFixed(2)}`;
      currentNonEssentialSpan.textContent = `$${currentNonEssential.toFixed(2)}`;

      if (isEssential) {
        essentialMarkerP.style.display = 'block';
        remainingSpan.textContent = `$${(limit - currentNonEssential).toFixed(2)}`; // Essential orders don't affect remaining non-essential budget
        warningMessageDiv.style.display = 'none'; // No warning for essential items
      } else {
        // Calculate remaining budget and potential new spending
        const remaining = limit - currentNonEssential;
        const remainingAfterOrder = remaining - orderTotal;

        remainingSpan.textContent = `$${remaining.toFixed(2)}`;

        // Show warning only if it's a non-essential item AND it exceeds the limit
        if (remainingAfterOrder < 0) {
            warningMessageDiv.style.display = 'block';
            remainingSpan.style.color = 'red'; // Highlight negative remaining amount
        } else {
            warningMessageDiv.style.display = 'none';
            remainingSpan.style.color = ''; // Reset color
        }
        essentialMarkerP.style.display = 'none';
      }

      summaryDiv.style.display = 'block'; // Show the summary section
      confirmButton.disabled = false; // Enable the confirm button
    } else {
      console.error('Failed to get data from background:', response?.error);
      errorMessageDiv.textContent = `Error loading data: ${response?.error || 'Unknown error'}`;
      errorMessageDiv.style.display = 'block';
    }
  });
});

confirmButton.addEventListener('click', () => {
  console.log('Confirm button clicked.');
  if (!currentTabId) {
    console.error('Missing necessary data to confirm order.');
    errorMessageDiv.textContent = 'Missing necessary data to confirm order.';
    errorMessageDiv.style.display = 'block';
    return;
  }

  confirmButton.disabled = true;
  confirmButton.textContent = 'Processing...';

  console.log(`Sending confirmOrder message for tabId: ${currentTabId}`);
  chrome.runtime.sendMessage({
    action: 'confirmOrder',
    tabId: currentTabId
  }, (response) => {
    // We don't expect a direct response here that confirms success,
    // as the action happens in the content script.
    // The background script will handle the storage update *after*
    // the content script confirms the trigger.
    if (chrome.runtime.lastError) {
      console.error("Error sending confirmOrder message:", chrome.runtime.lastError.message);
      // Re-enable button on error maybe?
      errorMessageDiv.textContent = `Failed to send confirmation: ${chrome.runtime.lastError.message}`;
      errorMessageDiv.style.display = 'block';
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
  console.log("Cancel button clicked");
  if (currentTabId) {
    // Inform background to clean up temporary data
    chrome.runtime.sendMessage({ action: 'cancelOrder', tabId: currentTabId });
    // Also tell content script to re-enable its button
    chrome.tabs.sendMessage(parseInt(currentTabId), { action: 'enableCustomButton' });
  }
  window.close(); // Close the popup
});

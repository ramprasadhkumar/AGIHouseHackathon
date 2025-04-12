// options.js

const limitInput = document.getElementById('limit');
const saveLimitButton = document.getElementById('saveLimit');
const currentLimitSpan = document.getElementById('currentLimit');
const currentSpendingSpan = document.getElementById('currentSpending');
const resetSpendingButton = document.getElementById('resetSpending');
const statusP = document.getElementById('status');

// Load current settings when the page loads
function loadSettings() {
  chrome.storage.sync.get(['monthlyNonEssentialLimit', 'currentMonthSpending'], (data) => {
    if (chrome.runtime.lastError) {
      statusP.textContent = 'Error loading settings.';
      console.error(chrome.runtime.lastError);
      return;
    }
    limitInput.value = data.monthlyNonEssentialLimit !== undefined ? data.monthlyNonEssentialLimit : 500;
    currentLimitSpan.textContent = data.monthlyNonEssentialLimit !== undefined ? data.monthlyNonEssentialLimit.toFixed(2) : 'N/A';
    currentSpendingSpan.textContent = data.currentMonthSpending !== undefined ? data.currentMonthSpending.toFixed(2) : 'N/A';
  });
}

// Save the limit
saveLimitButton.addEventListener('click', () => {
  const newLimit = parseFloat(limitInput.value);
  if (isNaN(newLimit) || newLimit < 0) {
    statusP.textContent = 'Please enter a valid non-negative number for the limit.';
    return;
  }

  chrome.storage.sync.set({ monthlyNonEssentialLimit: newLimit }, () => {
    if (chrome.runtime.lastError) {
      statusP.textContent = 'Error saving limit.';
      console.error(chrome.runtime.lastError);
    } else {
      statusP.textContent = 'Limit saved!';
      currentLimitSpan.textContent = newLimit.toFixed(2);
      setTimeout(() => { statusP.textContent = ''; }, 3000);
    }
  });
});

// Reset current spending
resetSpendingButton.addEventListener('click', () => {
  if (confirm("Are you sure you want to reset this month's spending counter to $0.00?")) {
    chrome.storage.sync.set({ currentMonthSpending: 0, lastResetTimestamp: Date.now() }, () => {
      if (chrome.runtime.lastError) {
        statusP.textContent = 'Error resetting spending.';
        console.error(chrome.runtime.lastError);
      } else {
        statusP.textContent = 'Current month spending reset to $0.00.';
        currentSpendingSpan.textContent = '0.00';
         setTimeout(() => { statusP.textContent = ''; }, 3000);
      }
    });
  }
});

// Load settings on initial open
document.addEventListener('DOMContentLoaded', loadSettings);

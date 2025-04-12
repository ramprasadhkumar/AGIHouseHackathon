// options.js

const limitInput = document.getElementById('limitInput');
const saveLimitButton = document.getElementById('saveLimitButton');
const saveStatusP = document.getElementById('saveStatus');

const currentLimitSpan = document.getElementById('currentLimit');
const currentNonEssentialSpendingSpan = document.getElementById('currentNonEssentialSpending');
const currentEssentialSpendingSpan = document.getElementById('currentEssentialSpending');
const remainingBudgetSpan = document.getElementById('remainingBudget');

const resetSpendingButton = document.getElementById('resetSpendingButton');
const resetStatusP = document.getElementById('resetStatus');

const loadingDiv = document.getElementById('loading');
const settingsDiv = document.getElementById('settings');
const errorMessageDiv = document.getElementById('error-message');

function displayError(message) {
  loadingDiv.style.display = 'none';
  settingsDiv.style.display = 'none';
  errorMessageDiv.textContent = `Error: ${message}`;
  errorMessageDiv.style.display = 'block';
  console.error("Options Page Error:", message);
}

function loadOptionsData() {
  console.log('Requesting options data from background...');
  errorMessageDiv.style.display = 'none'; // Clear previous errors
  loadingDiv.style.display = 'block';
  settingsDiv.style.display = 'none';

  chrome.runtime.sendMessage({ action: 'getOptionsData' }, (response) => {
    loadingDiv.style.display = 'none';
    if (chrome.runtime.lastError) {
      displayError(`Could not communicate with background script: ${chrome.runtime.lastError.message}`);
      return;
    }

    if (response && response.error) {
      displayError(`Failed to load data: ${response.error}`);
    } else if (response) {
      console.log('Received options data:', response);
      // Response contains { limit, essentialSpending, nonEssentialSpending, error: null }
      const limit = parseFloat(response.limit || 0);
      const essential = parseFloat(response.essentialSpending || 0);
      const nonEssential = parseFloat(response.nonEssentialSpending || 0);
      const remaining = limit - nonEssential;

      currentLimitSpan.textContent = limit.toFixed(2);
      currentEssentialSpendingSpan.textContent = essential.toFixed(2);
      currentNonEssentialSpendingSpan.textContent = nonEssential.toFixed(2);
      remainingBudgetSpan.textContent = remaining.toFixed(2);

      limitInput.value = limit.toFixed(2); // Pre-fill the input

      settingsDiv.style.display = 'block';
    } else {
      displayError('Received invalid response from background script.');
    }
  });
}

saveLimitButton.addEventListener('click', () => {
  const newLimit = parseFloat(limitInput.value);
  if (isNaN(newLimit) || newLimit < 0) {
    saveStatusP.textContent = 'Please enter a valid, non-negative limit.';
    saveStatusP.className = 'status error';
    return;
  }

  saveStatusP.textContent = 'Saving...';
  saveStatusP.className = 'status saving';
  saveLimitButton.disabled = true;

  console.log(`Sending setLimit message with newLimit: ${newLimit}`);
  chrome.runtime.sendMessage({ action: 'setLimit', newLimit: newLimit }, (response) => {
    saveLimitButton.disabled = false;
    if (chrome.runtime.lastError) {
      saveStatusP.textContent = `Error: ${chrome.runtime.lastError.message}`;
      saveStatusP.className = 'status error';
    } else if (response && response.success) {
      saveStatusP.textContent = 'Limit saved successfully!';
      saveStatusP.className = 'status success';
      // Refresh displayed data
      currentLimitSpan.textContent = newLimit.toFixed(2);
      const currentNonEssential = parseFloat(currentNonEssentialSpendingSpan.textContent || 0);
      remainingBudgetSpan.textContent = (newLimit - currentNonEssential).toFixed(2);
    } else {
      saveStatusP.textContent = `Error saving limit: ${response?.error || 'Unknown error'}`;
      saveStatusP.className = 'status error';
    }
    // Clear status after a few seconds
    setTimeout(() => { saveStatusP.textContent = ''; saveStatusP.className = 'status'; }, 3000);
  });
});

resetSpendingButton.addEventListener('click', () => {
  if (!confirm("Are you sure you want to reset this month's essential and non-essential spending to $0.00?")) {
    return;
  }

  resetStatusP.textContent = 'Resetting...';
  resetStatusP.className = 'status saving'; // Use 'saving' style for processing
  resetSpendingButton.disabled = true;

  console.log('Sending resetSpending message...');
  chrome.runtime.sendMessage({ action: 'resetSpending' }, (response) => {
    resetSpendingButton.disabled = false;
    if (chrome.runtime.lastError) {
      resetStatusP.textContent = `Error: ${chrome.runtime.lastError.message}`;
      resetStatusP.className = 'status error';
    } else if (response && response.success) {
      resetStatusP.textContent = 'Spending reset successfully!';
      resetStatusP.className = 'status success';
      // Refresh displayed data
      currentEssentialSpendingSpan.textContent = '0.00';
      currentNonEssentialSpendingSpan.textContent = '0.00';
      const limit = parseFloat(currentLimitSpan.textContent || 0);
      remainingBudgetSpan.textContent = limit.toFixed(2);
    } else {
      resetStatusP.textContent = `Error resetting spending: ${response?.error || 'Unknown error'}`;
      resetStatusP.className = 'status error';
    }
    // Clear status after a few seconds
    setTimeout(() => { resetStatusP.textContent = ''; resetStatusP.className = 'status'; }, 3000);
  });
});

document.addEventListener('DOMContentLoaded', loadOptionsData);

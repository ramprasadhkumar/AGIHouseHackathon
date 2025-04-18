// background.js

const MONTHLY_RESET_ALARM_NAME = 'monthlySpendingReset';
let temporaryOrderData = {}; // Store tabId: { orderTotal: number, items: Array<{name: string, price: number | null, quantity: number}> }

// --- Initialization ---
chrome.runtime.onInstalled.addListener(details => {
  console.log('Extension installed or updated:', details.reason);
  // Initialize storage on first install
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      monthlyNonEssentialLimit: 500, // Default limit
      currentMonthSpending: 0,
      lastResetTimestamp: Date.now(),
      monthlyPurchases: [] // Initialize empty array for purchases
    }, () => {
      console.log('Default spending limit and tracking initialized.');
    });
  }
  // Ensure the alarm is set up
  setupMonthlyResetAlarm();
  checkMonthlyReset(); // Also check on update/startup
});

// Also check on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser startup detected.');
  checkMonthlyReset();
  setupMonthlyResetAlarm(); // Ensure alarm exists after browser restart
});

// --- Monthly Reset Logic ---
function setupMonthlyResetAlarm() {
  chrome.alarms.get(MONTHLY_RESET_ALARM_NAME, alarm => {
    if (!alarm) {
      // Find the time until the next month starts
      const now = new Date();
      const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const delayInMinutes = Math.max(1, Math.ceil((firstOfNextMonth.getTime() - now.getTime()) / (60 * 1000)));

      chrome.alarms.create(MONTHLY_RESET_ALARM_NAME, {
        // delayInMinutes: 1, // For testing: run 1 min from now
        delayInMinutes: delayInMinutes,
        periodInMinutes: Math.ceil(31 * 24 * 60) // Roughly monthly, recalculate precisely on trigger
      });
      console.log(`Monthly reset alarm set. First check in ${delayInMinutes} minutes.`);
    } else {
        console.log('Monthly reset alarm already exists.');
    }
  });
}

async function checkMonthlyReset() {
    console.log('Checking if monthly reset is needed.');
    try {
        const data = await chrome.storage.sync.get(['lastResetTimestamp', 'currentMonthSpending']);
        const lastReset = new Date(data.lastResetTimestamp || 0);
        const now = new Date();

        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            console.log(`New month detected (${now.getMonth() + 1}/${now.getFullYear()}). Resetting spending.`);
            await chrome.storage.sync.set({
                currentMonthSpending: 0,
                lastResetTimestamp: now.getTime(),
                monthlyPurchases: [] // Also clear purchases on reset
            });
            console.log('Monthly spending reset complete.');
        } else {
            console.log('No reset needed, still the same month.');
        }
    } catch (error) {
        console.error('Error checking monthly reset:', error);
    }
}

// Listen for the alarm
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === MONTHLY_RESET_ALARM_NAME) {
    console.log('Monthly reset alarm triggered.');
    checkMonthlyReset();
    // Re-schedule precisely for the *next* month start
    setupMonthlyResetAlarm();
  }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from sender:', sender);

  if (message.action === 'showConfirmation') {
    // Store data needed for the popup
    const tabId = sender.tab?.id;
    if (tabId) {
        temporaryOrderData[tabId] = {
            orderTotal: message.orderTotal,
            items: message.items || [] // Store items, default to empty array
        };
        console.log(`Stored temporary data for tab ${tabId}:`, temporaryOrderData[tabId]);

        // Open the popup window
        chrome.windows.create({
          url: 'popup/popup.html',
          type: 'popup',
          width: 400,
          height: 350,
          focused: true
        }, (window) => {
           if (chrome.runtime.lastError) {
              console.error("Error creating popup window: ", chrome.runtime.lastError);
              // Clean up temporary data if window creation fails
              delete temporaryOrderData[tabId];
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
           } else {
              console.log('Popup window created:', window.id);
              // Optional: Store windowId with tabId if needed later
              temporaryOrderData[tabId].windowId = window.id;
              sendResponse({ success: true });
           }
        });
        // Indicate that sendResponse will be called asynchronously
        return true;
    } else {
        console.error('Could not get sender tab ID.');
        sendResponse({ success: false, error: 'Missing tab ID' });
    }

  } else if (message.action === 'getPopupData') {
    // The popup is asking for the data associated with its opener tab
    // We need to figure out which tab opened this popup.
    // This is tricky. Let's assume the *most recently stored* temporary data is for the current popup.
    // A more robust way might involve passing tabId in the popup URL, but let's try this first.
    const activeTabs = Object.keys(temporaryOrderData);
    if (activeTabs.length > 0) {
        // Find the temporary data associated with the popup window ID if stored
        let relevantTabId = null;
        if (sender.tab?.windowId) { // Check if sender info includes windowId
             for(const tabId in temporaryOrderData) {
                 if(temporaryOrderData[tabId].windowId === sender.tab.windowId) {
                     relevantTabId = tabId;
                     break;
                 }
             }
        }

        // Fallback if windowId wasn't found or stored (might happen)
        if (!relevantTabId && activeTabs.length === 1) {
            relevantTabId = activeTabs[0];
            console.warn('Falling back to assuming the only active temp data is correct.');
        } else if (!relevantTabId) {
             console.error('Could not determine which tab the popup belongs to. Multiple pending confirmations?');
             sendResponse({ success: false, error: 'Cannot determine originating tab.' });
             return;
        }

        console.log(`Popup requested data, providing data associated with tab ${relevantTabId}`);
        const dataToSend = temporaryOrderData[relevantTabId];
        console.log("Bernett: ", dataToSend);
        const apiUrl = 'http://localhost:8000/spending/monthly'; // Define API URL

        // Fetch budget data from the API
        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }
                return response.json();
            })
            .then(budgetData => {
                console.log("Received budget data from API:", budgetData);
                // Assuming API returns { limit: number, currentSpending: number, items: array } - WRONG, API does not return items
                // We should retrieve stored items from chrome.storage.sync
                chrome.storage.sync.get('monthlyPurchases', (storageData) => {
                    const storedItems = storageData.monthlyPurchases || [];
                    console.log("Retrieved stored monthly purchases:", storedItems);

                    sendResponse({
                        success: true,
                        data: {
                            orderTotal: dataToSend.orderTotal,
                            currentOrderItems: dataToSend.items || [], // Add current items from temp data
                            limit: budgetData.limit, // Use limit from API
                            currentSpending: budgetData.currentSpending, // Use currentSpending from API
                            items: storedItems, // Send the *stored* monthly items (historical)
                            tabId: relevantTabId
                        }
                    });
                });
            })
            .catch(error => {
                console.warn(`API fetch failed: ${error.message}. Attempting to load local dummy data.`);
                const localDataUrl = chrome.runtime.getURL('data/dummy_budget.json');

                fetch(localDataUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Failed to load local data with status ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(dummyData => {
                         console.log("Loaded dummy budget data:", dummyData);
                         // Send dummy items if API/local fails
                         sendResponse({
                             success: true,
                             data: {
                                 orderTotal: dataToSend.orderTotal, // Keep original order total
                                 currentOrderItems: dataToSend.items || [], // Add current items from temp data
                                 limit: dummyData.limit, // Use dummy limit
                                 currentSpending: dummyData.currentSpending, // Use dummy spending
                                 items: dummyData.items || [], // Pass items array from dummy data (historical)
                                 tabId: relevantTabId
                             }
                         });
                    })
                    .catch(localError => {
                        console.error('Error loading local dummy budget data:', localError);
                        // Final fallback: Send error if both API and local file fail
                        sendResponse({ success: false, error: `Failed to fetch budget data from API and local fallback: ${localError.message}` });
                    });
            });

    } else {
        console.error('Popup requested data, but no temporary data found.');
        sendResponse({ success: false, error: 'No pending order data found.' });
    }
    return true; // Indicate async response

  } else if (message.action === 'confirmOrder') {
    // Popup confirmed, tell the original content script to proceed
    const tabId = message.tabId;
    const orderData = temporaryOrderData[tabId]; // Get the full order data
    console.log(`Popup confirmed order for tab ${tabId}`);
    if (tabId && orderData && typeof orderData.orderTotal !== 'undefined') {
        chrome.tabs.sendMessage(parseInt(tabId), {
            action: 'triggerOriginalOrder',
            orderTotal: orderData.orderTotal, // Pass orderTotal back
            items: orderData.items // Pass items back as well
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`Error sending trigger message to tab ${tabId}:`, chrome.runtime.lastError.message);
                // Potentially clean up temporaryOrderData[tabId] here if tab is closed
            } else {
                console.log(`Trigger message sent to tab ${tabId}, response:`, response);
            }
        });
    } else {
        console.error('Missing tabId or orderTotal when confirming order.');
    }
    // No response needed back to popup immediately

  } else if (message.action === 'orderTriggered') {
    // Content script confirmed it triggered the order, now update storage
    const tabId = sender.tab?.id;
    const orderTotal = message.orderTotal;
    const orderItems = message.items || []; // Get items from the message
    console.log(`Order triggered on tab ${tabId} for amount ${orderTotal}. Items:`, orderItems, `. Updating storage.`);

    if (typeof orderTotal === 'number' && orderTotal >= 0) {
        // Get current spending AND current purchases
        chrome.storage.sync.get(['currentMonthSpending', 'monthlyPurchases'], (data) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting current spending/purchases:', chrome.runtime.lastError);
                sendResponse({success: false, error: chrome.runtime.lastError.message});
            } else {
                const currentSpending = data.currentMonthSpending || 0;
                const currentPurchases = data.monthlyPurchases || [];
                const newSpending = currentSpending + orderTotal;

                // Add new items (already objects) to the purchase list
                const newPurchases = [...currentPurchases, ...orderItems];

                // Update both spending and purchases
                chrome.storage.sync.set({
                    currentMonthSpending: newSpending,
                    monthlyPurchases: newPurchases
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error setting new spending/purchases:', chrome.runtime.lastError);
                        sendResponse({success: false, error: chrome.runtime.lastError.message});
                    } else {
                        console.log(`Successfully updated spending. New total: ${newSpending}`);
                        console.log(`Successfully updated purchases. New count: ${newPurchases.length}`);
                        sendResponse({ success: true, newSpending: newSpending });
                         // Clean up temporary data for this tab
                        if (tabId && temporaryOrderData[tabId]) {
                            delete temporaryOrderData[tabId];
                            console.log(`Cleaned up temporary data for tab ${tabId}`);
                        }
                    }
                });
            }
        });
        return true; // Indicate async response
    } else {
        console.error('Invalid orderTotal received for storage update:', orderTotal);
        sendResponse({ success: false, error: 'Invalid order total' });
         // Clean up temporary data even if update fails
        if (tabId && temporaryOrderData[tabId]) {
            delete temporaryOrderData[tabId];
            console.log(`Cleaned up temporary data for tab ${tabId} after error.`);
        }
    }
  } else if (message.action === 'cancelOrder') {
      // User cancelled from popup, just clean up temp data
      const tabId = message.tabId;
      if (tabId && temporaryOrderData[tabId]) {
          delete temporaryOrderData[tabId];
          console.log(`Order cancelled by user. Cleaned up temporary data for tab ${tabId}`);
      }
      sendResponse({success: true});
  }
});

// Clean up temporary data if a tab/window is closed unexpectedly
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (temporaryOrderData[tabId]) {
        console.log(`Tab ${tabId} closed, removing associated temporary data.`);
        // Optional: Close the popup window if it's still open
        const windowId = temporaryOrderData[tabId].windowId;
        if(windowId) {
            chrome.windows.remove(windowId).catch(err => console.log(`Popup window ${windowId} likely already closed.`));
        }
        delete temporaryOrderData[tabId];
    }
});

chrome.windows.onRemoved.addListener((windowId) => {
    // Find if this window was one of our popups
    for (const tabId in temporaryOrderData) {
        if (temporaryOrderData[tabId].windowId === windowId) {
            console.log(`Popup window ${windowId} closed, removing associated temporary data for tab ${tabId}.`);
            delete temporaryOrderData[tabId];
            break; // Assume only one tab per popup window
        }
    }
});

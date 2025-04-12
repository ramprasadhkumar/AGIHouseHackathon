// background.js

// --- Supabase Configuration ---
// IMPORTANT: Replace with your actual Supabase URL and Anon Key
// DO NOT COMMIT YOUR ACTUAL KEYS TO PUBLIC REPOSITORIES
const SUPABASE_URL = ''; // e.g., 'https://xyz.supabase.co'
const SUPABASE_ANON_KEY = '';

let supabase = null;
let userId = null;

// Dynamically import Supabase client
async function initializeSupabase() {
    if (supabase) return supabase;
    if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        console.error('Supabase URL is not configured in background.js');
        return null;
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.error('Supabase Anon Key is not configured in background.js');
        return null;
    }

    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized.');
        return supabase;
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        return null;
    }
}

// --- User ID Management ---
async function getUserId() {
    if (userId) return userId;
    try {
        const data = await chrome.storage.local.get('extensionUserId');
        if (data.extensionUserId) {
            userId = data.extensionUserId;
            console.log('Retrieved existing User ID:', userId);
        } else {
            // Generate a new UUID (simple approach)
            userId = self.crypto.randomUUID();
            await chrome.storage.local.set({ extensionUserId: userId });
            console.log('Generated and stored new User ID:', userId);
            // Ensure user exists in Supabase settings
            await ensureUserSettingExists(userId);
        }
        return userId;
    } catch (error) {
        console.error('Error getting/setting User ID:', error);
        return null;
    }
}

// Ensure a row exists for the user in user_settings
async function ensureUserSettingExists(currentUserId) {
    if (!supabase || !currentUserId) {
        console.error('Cannot ensure user setting: Supabase client or User ID not available.');
        return;
    }
    try {
        // Check if user exists
        let { data, error } = await supabase
            .from('user_settings')
            .select('user_id')
            .eq('user_id', currentUserId)
            .maybeSingle();

        if (error) {
            console.error('Error checking user_settings:', error);
            return;
        }

        if (!data) {
            console.log(`User ${currentUserId} not found in user_settings, creating entry.`);
            const { error: insertError } = await supabase
                .from('user_settings')
                .insert({ user_id: currentUserId }); // Defaults (non_essential_limit 500) set in DB

            if (insertError) {
                console.error('Error creating user_settings entry:', insertError);
            } else {
                console.log(`Successfully created user_settings entry for ${currentUserId}.`);
            }
        } else {
            console.log(`User ${currentUserId} already exists in user_settings.`);
        }
    } catch (err) {
        console.error('Unexpected error in ensureUserSettingExists:', err);
    }
}

// --- Data Fetching/Updating Functions (Supabase) ---

// Get current limit and spending (both types) for the current month
async function getCurrentSpendingData(currentUserId) {
    if (!supabase || !currentUserId) return { limit: null, essentialSpending: null, nonEssentialSpending: null, error: 'Supabase client or User ID not available.' };

    const now = new Date();
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; // Format as YYYY-MM-DD

    try {
        // 1. Get the user's non-essential limit
        let { data: settingsData, error: settingsError } = await supabase
            .from('user_settings')
            .select('monthly_non_essential_limit') // Updated field name
            .eq('user_id', currentUserId)
            .single(); // Expecting one row after ensureUserSettingExists

        if (settingsError || !settingsData) {
            console.error('Error fetching user settings:', settingsError);
            return { limit: null, essentialSpending: null, nonEssentialSpending: null, error: settingsError?.message || 'Failed to fetch user settings.' };
        }
        const limit = settingsData.monthly_non_essential_limit;

        // 2. Get or create the spending for the current month
        let { data: spendingData, error: spendingError } = await supabase
            .from('monthly_spending')
            .select('essential_spent, non_essential_spent') // Get both fields
            .eq('user_id', currentUserId)
            .eq('month_start_date', monthStartDate)
            .maybeSingle(); // Might not exist yet for the month

        if (spendingError) {
            console.error('Error fetching monthly spending:', spendingError);
             // Don't fail completely, maybe just return 0 spending for this month
             return { limit: limit, essentialSpending: 0, nonEssentialSpending: 0, error: spendingError.message };
        }

        let essentialSpending = 0;
        let nonEssentialSpending = 0;
        if (spendingData) {
            essentialSpending = spendingData.essential_spent;
            nonEssentialSpending = spendingData.non_essential_spent;
        } else {
            // No record for this month, implies spending is 0. Optionally create it.
            console.log(`No spending record for ${monthStartDate}, assuming 0 for both types.`);
            // Let's create it lazily when spending is first updated for the month.
        }

        console.log(`Fetched data for ${currentUserId}: Limit=${limit}, Essential=${essentialSpending}, NonEssential=${nonEssentialSpending} for ${monthStartDate}`);
        return { limit: limit, essentialSpending: essentialSpending, nonEssentialSpending: nonEssentialSpending, error: null };

    } catch (error) {
        console.error('Unexpected error fetching spending data:', error);
        return { limit: null, essentialSpending: null, nonEssentialSpending: null, error: error.message };
    }
}

// Update spending for the current month based on type
async function updateSpending(currentUserId, amountToAdd, isEssential) {
    if (!supabase || !currentUserId) return { success: false, error: 'Supabase client or User ID not available.' };
    if (typeof amountToAdd !== 'number' || amountToAdd < 0) return { success: false, error: 'Invalid amount to add.' };

    const now = new Date();
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; // YYYY-MM-DD
    const spendingType = isEssential ? 'essential' : 'non_essential';

    try {
        // Use the updated SQL function
        /*
        -- Supabase SQL Editor Function (Updated):
        CREATE OR REPLACE FUNCTION increment_monthly_spending(
            p_user_id UUID,
            p_month_start_date DATE,
            p_amount_to_add NUMERIC,
            p_spending_type TEXT -- 'essential' or 'non_essential'
        )
        RETURNS RECORD AS $$ -- Returns both new essential and non-essential totals
        -- ... (function body as provided previously) ...
        $$ LANGUAGE plpgsql VOLATILE;
        */

        console.log(`Calling RPC increment_monthly_spending with: user=${currentUserId}, date=${monthStartDate}, amount=${amountToAdd}, type=${spendingType}`);
        const { data, error } = await supabase.rpc('increment_monthly_spending', {
            p_user_id: currentUserId,
            p_month_start_date: monthStartDate,
            p_amount_to_add: amountToAdd,
            p_spending_type: spendingType // Pass the type
        });

        if (error) {
            console.error('Error calling increment_monthly_spending RPC:', error);
            return { success: false, newSpending: null, error: error.message };
        }

        // The RPC function now returns a record like: { f1: new_essential, f2: new_non_essential }
        const newSpending = { essential: data.f1, nonEssential: data.f2 };
        console.log(`Successfully updated spending for ${currentUserId} (${spendingType}) in ${monthStartDate}. New totals: Essential=${newSpending.essential}, NonEssential=${newSpending.nonEssential}`);
        return { success: true, newSpending: newSpending, error: null };

    } catch (error) {
        console.error('Unexpected error updating spending:', error);
        return { success: false, newSpending: null, error: error.message };
    }
}

// Set the monthly non-essential limit
async function setMonthlyLimit(currentUserId, newLimit) {
    if (!supabase || !currentUserId) return { success: false, error: 'Supabase client or User ID not available.' };
     if (typeof newLimit !== 'number' || newLimit < 0) return { success: false, error: 'Invalid limit amount.' };

    try {
        const { error } = await supabase
            .from('user_settings')
            .update({ monthly_non_essential_limit: newLimit }) // Updated field name
            .eq('user_id', currentUserId);

        if (error) {
            console.error('Error updating monthly limit:', error);
            return { success: false, error: error.message };
        }

        console.log(`Successfully updated limit for ${currentUserId} to ${newLimit}`);
        return { success: true, error: null };

    } catch (error) {
        console.error('Unexpected error setting limit:', error);
        return { success: false, error: error.message };
    }
}

// Manually reset current month's spending (both types) to 0
async function resetCurrentMonthSpending(currentUserId) {
    if (!supabase || !currentUserId) return { success: false, error: 'Supabase client or User ID not available.' };

    const now = new Date();
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; // YYYY-MM-DD

    try {
         // Upsert to ensure the row exists, setting both amounts to 0
         const { error } = await supabase
            .from('monthly_spending')
            .upsert({
                user_id: currentUserId,
                month_start_date: monthStartDate,
                essential_spent: 0, // Reset essential
                non_essential_spent: 0 // Reset non-essential
            }, {
                onConflict: 'user_id, month_start_date'
            });

        if (error) {
            console.error('Error resetting monthly spending:', error);
            return { success: false, error: error.message };
        }

        console.log(`Successfully reset spending for ${currentUserId} for month ${monthStartDate}`);
        return { success: true, error: null };

    } catch (error) {
        console.error('Unexpected error resetting spending:', error);
        return { success: false, error: error.message };
    }
}

// --- Message Handling (Updated for Supabase & Essential/Non-Essential) ---

let temporaryOrderData = {}; // Store tabId: { orderTotal: number, isEssential: boolean, windowId?: number }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message, 'from sender:', sender);

    // Ensure Supabase client and User ID are ready before handling most messages
    const ensureReady = async (actionName, responseFunc) => {
        if (!supabase) await initializeSupabase();
        if (!userId) await getUserId();

        if (!supabase || !userId) {
            console.error(`${actionName}: Supabase client or User ID not available.`);
            responseFunc({ success: false, error: 'Extension backend not ready. Please try again.' });
            return false;
        }
        return true;
    };

    if (message.action === 'showConfirmation') {
        // Store temp data including isEssential flag
        const tabId = sender.tab?.id;
        if (tabId) {
            temporaryOrderData[tabId] = {
                orderTotal: message.orderTotal,
                isEssential: message.isEssential // Store the flag
            };
            console.log(`Stored temporary data for tab ${tabId}:`, temporaryOrderData[tabId]);

            chrome.windows.create({
                url: 'popup/popup.html',
                type: 'popup',
                width: 400,
                height: 350,
                focused: true
            }, (window) => {
                if (chrome.runtime.lastError) {
                    console.error("Error creating popup window: ", chrome.runtime.lastError);
                    delete temporaryOrderData[tabId];
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('Popup window created:', window?.id);
                    if (window) temporaryOrderData[tabId].windowId = window.id;
                    sendResponse({ success: true });
                }
            });
            return true; // Async response
        } else {
            console.error('Could not get sender tab ID.');
            sendResponse({ success: false, error: 'Missing tab ID' });
        }

    } else if (message.action === 'getPopupData') {
        (async () => {
            if (!await ensureReady('getPopupData', sendResponse)) return;

            // Logic to find the relevant tabId remains similar
            let relevantTabId = null;
            if (sender.tab?.windowId) {
                for(const tabId in temporaryOrderData) {
                    if(temporaryOrderData[tabId].windowId === sender.tab.windowId) {
                        relevantTabId = tabId;
                        break;
                    }
                }
            }
            // Fallback might be needed if windowId isn't reliable
            if (!relevantTabId && Object.keys(temporaryOrderData).length === 1) {
                 relevantTabId = Object.keys(temporaryOrderData)[0];
                 console.warn('Falling back to assuming the only active temp data is correct for popup.');
            } else if (!relevantTabId) {
                 console.error('Could not determine which tab the popup belongs to.');
                 sendResponse({ success: false, error: 'Cannot determine originating tab.' });
                 return;
            }

            const orderData = temporaryOrderData[relevantTabId];
            if (!orderData || typeof orderData.orderTotal === 'undefined') {
                 sendResponse({ success: false, error: 'No pending order data found for this popup.' });
                 return;
            }
            const { orderTotal, isEssential } = orderData;

            console.log(`Popup requested data for tab ${relevantTabId}. Fetching from Supabase...`);
            // Fetches { limit, essentialSpending, nonEssentialSpending, error }
            const spendingData = await getCurrentSpendingData(userId);

            if (spendingData.error) {
                sendResponse({ success: false, error: `Failed to get data from Supabase: ${spendingData.error}` });
            } else {
                sendResponse({
                    success: true,
                    data: {
                        orderTotal: orderTotal,
                        isEssential: isEssential, // Pass flag to popup
                        limit: spendingData.limit,
                        currentEssentialSpending: spendingData.essentialSpending,
                        currentNonEssentialSpending: spendingData.nonEssentialSpending,
                        tabId: relevantTabId // Send tabId back
                    }
                });
            }
        })();
        return true; // Indicate async response

    } else if (message.action === 'confirmOrder') {
        // No Supabase interaction yet, just forward to content script
        const tabId = message.tabId;
        const orderData = temporaryOrderData[tabId]; // Contains orderTotal and isEssential
        console.log(`Popup confirmed order for tab ${tabId}`);
        if (tabId && orderData) {
            chrome.tabs.sendMessage(parseInt(tabId), {
                action: 'triggerOriginalOrder',
                orderTotal: orderData.orderTotal // Pass orderTotal back for the final update message
            }, (response) => {
                 if (chrome.runtime.lastError) {
                    console.error(`Error sending trigger message to tab ${tabId}:`, chrome.runtime.lastError.message);
                 } else {
                    console.log(`Trigger message sent to tab ${tabId}, response:`, response);
                 }
            });
        } else {
            console.error('Missing tabId or orderTotal when confirming order.');
        }
        // No response needed back to popup immediately

    } else if (message.action === 'orderTriggered') {
        // Content script confirmed trigger, NOW update Supabase
        (async () => {
             if (!await ensureReady('orderTriggered', sendResponse)) return;

            const tabId = sender.tab?.id;
            const orderTotal = message.orderTotal; // Amount from the original order
            const orderData = temporaryOrderData[tabId]; // Get stored isEssential flag

            if (!orderData) {
                 console.error(`Order triggered for tab ${tabId}, but no temporary data found!`);
                 sendResponse({ success: false, error: 'Missing temporary order data.' });
                 return;
            }
            const isEssential = orderData.isEssential;

            console.log(`Order triggered on tab ${tabId} for amount ${orderTotal} (Essential: ${isEssential}). Updating Supabase.`);

            if (typeof orderTotal === 'number' && orderTotal >= 0) {
                // Call updated function with isEssential flag
                const { success, newSpending, error } = await updateSpending(userId, orderTotal, isEssential);
                if (success) {
                    // newSpending is now { essential: X, nonEssential: Y }
                    console.log(`Successfully updated spending in Supabase. New totals: Essential=${newSpending.essential}, NonEssential=${newSpending.nonEssential}`);
                    sendResponse({ success: true, newSpending: newSpending });
                    // Clean up temp data
                    if (tabId && temporaryOrderData[tabId]) {
                        delete temporaryOrderData[tabId];
                        console.log(`Cleaned up temporary data for tab ${tabId}`);
                    }
                } else {
                    console.error('Failed to update spending in Supabase:', error);
                    sendResponse({ success: false, error: `Supabase update failed: ${error}` });
                     // Still clean up temp data on failure
                     if (tabId && temporaryOrderData[tabId]) {
                        delete temporaryOrderData[tabId];
                        console.log(`Cleaned up temporary data for tab ${tabId} after Supabase error.`);
                    }
                }
            } else {
                console.error('Invalid orderTotal received for storage update:', orderTotal);
                sendResponse({ success: false, error: 'Invalid order total' });
                 if (tabId && temporaryOrderData[tabId]) {
                     delete temporaryOrderData[tabId];
                     console.log(`Cleaned up temporary data for tab ${tabId} after invalid total.`);
                 }
            }
        })();
        return true; // Indicate async response

    } else if (message.action === 'cancelOrder') {
        // User cancelled from popup, just clean up temp data
        const tabId = message.tabId;
        if (tabId && temporaryOrderData[tabId]) {
            delete temporaryOrderData[tabId];
            console.log(`Order cancelled by user. Cleaned up temporary data for tab ${tabId}`);
        }
        sendResponse({success: true});

    // --- New actions for Options Page ---
    } else if (message.action === 'getOptionsData') {
        (async () => {
             if (!await ensureReady('getOptionsData', sendResponse)) return;
             const data = await getCurrentSpendingData(userId);
             // Response now includes: { limit, essentialSpending, nonEssentialSpending, error }
             sendResponse(data);
        })();
        return true; // Async

    } else if (message.action === 'setLimit') {
         (async () => {
             if (!await ensureReady('setLimit', sendResponse)) return;
             // This sets the non-essential limit
             const result = await setMonthlyLimit(userId, message.newLimit);
             sendResponse(result); // Send { success, error }
        })();
        return true; // Async

    } else if (message.action === 'resetSpending') {
         (async () => {
             if (!await ensureReady('resetSpending', sendResponse)) return;
             // This resets both essential and non-essential for the month
             const result = await resetCurrentMonthSpending(userId);
             sendResponse(result); // Send { success, error }
        })();
        return true; // Async
    }

});

// --- Cleanup Logic (remains similar) ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (temporaryOrderData[tabId]) {
        console.log(`Tab ${tabId} closed, removing associated temporary data.`);
        const windowId = temporaryOrderData[tabId].windowId;
        if(windowId) {
            chrome.windows.remove(windowId).catch(err => console.log(`Popup window ${windowId} likely already closed.`));
        }
        delete temporaryOrderData[tabId];
    }
});

chrome.windows.onRemoved.addListener((windowId) => {
    for (const tabId in temporaryOrderData) {
        if (temporaryOrderData[tabId].windowId === windowId) {
            console.log(`Popup window ${windowId} closed, removing associated temporary data for tab ${tabId}.`);
            delete temporaryOrderData[tabId];
            break;
        }
    }
});

// --- Initialization (Supabase & User ID) ---
// Initialize Supabase and get User ID when the script starts
(async () => {
    await initializeSupabase();
    await getUserId();
    // Ensure user exists in Supabase after getting ID
    if (userId) {
        await ensureUserSettingExists(userId);
    }
})();

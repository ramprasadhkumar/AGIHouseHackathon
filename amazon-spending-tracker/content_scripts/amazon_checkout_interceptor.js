// content_scripts/amazon_checkout_interceptor.js
console.log('Amazon Spending Tracker: Content script loaded.');

const CHECKOUT_BUTTON_SELECTORS = [
    '#placeYourOrder input[type="submit"]', // Standard checkout page
    '#spc-place-order-button input[type="submit"]', // Sometimes used
    'input[name="placeYourOrder1"]', // Another variation
    '#bottomSubmitOrderButtonId input[type="submit"]', // One more
    '[data-testid="placeYourOrderButtonTestId"] button', // Test ID variant
    'button:has(span:contains("Place your order"))', // Text content based
    'input[aria-labelledby="submitOrderButtonId-announce"]' // Accessibility based
    // Add more selectors here as needed based on Amazon's variations
];

const ORDER_TOTAL_SELECTORS = [
    '#subtotals-marketplace-table .grand-total-price',
    '.order-summary-container .grand-total-price',
    'td:contains("Order total:") + td',
    'span:contains("Order total:") ~ span.a-text-bold',
    'span:contains("Grand total:") ~ span.a-text-bold',
    '#checkout-summary-subtotals_feature_div .grand-total-row span.a-text-bold',
    '[data-testid="order-summary-grand-total"] span'
    // Add more selectors here
];

const CUSTOM_BUTTON_ID = 'custom-review-spending-button';
let originalButton = null;
let orderTotalValue = null;
let observer = null;
let isIntercepted = false; // Flag to prevent multiple intercepts

function findElement(selectors) {
    for (const selector of selectors) {
        try {
            const element = document.querySelector(selector);
            if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) { // Check if visible
                console.log('Found visible element with selector:', selector);
                return element;
            }
        } catch (e) {
            if (e instanceof DOMException && e.name === 'SyntaxError') {
                console.warn(`Invalid or unsupported selector '${selector}', skipping.`);
            } else {
                console.error(`Error finding element with selector '${selector}':`, e);
            }
        }
    }
    console.log('No element found matching selectors:', selectors);
    return null;
}

function extractPrice(element) {
    if (!element) return null;
    const text = element.textContent.trim();
    // Regex to find currency symbols (€, $, £, etc.) followed by numbers
    const match = text.match(/(?:\$|\£|\€|\¥|CAD|AUD|USD|EUR|GBP|JPY)\s?([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s?(?:\$|\£|\€|\¥|CAD|AUD|USD|EUR|GBP|JPY)/);
    if (match) {
        const priceStr = match[1] || match[2]; // Get the number part
        const cleanedPrice = priceStr.replace(/,/g, ''); // Remove commas
        const price = parseFloat(cleanedPrice);
        if (!isNaN(price)) {
            console.log(`Extracted price: ${price} from text "${text}"`);
            return price;
        }
    }
    console.warn(`Could not extract price from text: "${text}"`);
    return null;
}

function injectCustomButton() {
    if (!originalButton || document.getElementById(CUSTOM_BUTTON_ID) || isIntercepted) {
        console.log('Skipping injection: Original button not found, custom button exists, or already intercepted.');
        return false; // Don't proceed if button not found or already injected
    }

    console.log('Injecting custom button...');
    isIntercepted = true; // Set the flag

    // 1. Hide the original button
    // originalButton.style.display = 'none'; // Simple hide
    originalButton.style.visibility = 'hidden'; // Keep layout space
    originalButton.style.position = 'absolute'; // Take out of flow
    originalButton.style.left = '-9999px'; // Move off-screen
    originalButton.disabled = true; // Also disable it

    // 2. Create the custom button
    const customButton = document.createElement('button');
    customButton.id = CUSTOM_BUTTON_ID;
    customButton.textContent = 'Review Spending & Place Order';
    customButton.className = originalButton.className; // Try to mimic original style
    customButton.style.backgroundColor = '#FFA500'; // Orange color
    customButton.style.borderColor = '#a88734 #9c7e31 #846a29';
    customButton.style.color = 'black';
    customButton.style.padding = '10px 15px';
    customButton.style.fontSize = '1em';
    customButton.style.borderRadius = '3px';
    customButton.style.cursor = 'pointer';
    customButton.style.width = originalButton.offsetWidth > 50 ? `${originalButton.offsetWidth}px` : 'auto'; // Match width if reasonable
    customButton.style.height = originalButton.offsetHeight > 20 ? `${originalButton.offsetHeight}px` : 'auto'; // Match height
    customButton.style.display = 'inline-block'; // Ensure it's visible

    // Add event listener
    customButton.addEventListener('click', (event) => {
        event.preventDefault(); // Stop any default form submission
        event.stopPropagation();
        console.log('Custom button clicked.');

        // Re-check order total just in case it updated dynamically
        const currentOrderTotalElement = findElement(ORDER_TOTAL_SELECTORS);
        orderTotalValue = extractPrice(currentOrderTotalElement);

        if (orderTotalValue === null) {
            console.error('Could not determine order total on click.');
            alert('Error: Could not determine the order total. Cannot proceed with spending check.');
            // Maybe re-enable original button here?
            // triggerOriginalOrderAction(); // Or just proceed without check?
            return;
        }

        console.log(`Sending message to background. Order total: ${orderTotalValue}`);
        chrome.runtime.sendMessage({ action: 'showConfirmation', orderTotal: orderTotalValue }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to background:', chrome.runtime.lastError.message);
                alert('Error communicating with the extension background. Please try reloading the page.');
            } else if (response && response.success) {
                console.log('Background acknowledged showConfirmation request.');
            } else {
                console.error('Background script reported an error:', response?.error);
                alert(`Error showing confirmation: ${response?.error || 'Unknown error'}`);
            }
        });
    });

    // 3. Insert the custom button (try placing it right before the original)
    originalButton.parentNode.insertBefore(customButton, originalButton);
    console.log('Custom button injected.');
    return true;
}

// Function to trigger the original button's action
function triggerOriginalOrderAction() {
    console.log('Attempting to trigger original order action...');
    if (originalButton) {
        // Re-enable and make visible briefly if needed
        originalButton.style.visibility = 'visible';
        originalButton.style.position = 'static';
        originalButton.disabled = false;

        // Attempt click
        console.log('Clicking original button:', originalButton);
        originalButton.click();

        // Optionally re-hide after a short delay, although page will likely navigate
        setTimeout(() => {
             if (document.body.contains(originalButton)) { // Check if still on page
                 originalButton.style.visibility = 'hidden';
                 originalButton.style.position = 'absolute';
                 originalButton.disabled = true;
                 console.log('Original button re-hidden (if page didn\'t navigate).');
             }
        }, 500);
    } else {
        console.error('Cannot trigger original action: Original button not found.');
    }
}

// --- Message Listener (from background) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    if (message.action === 'triggerOriginalOrder') {
        triggerOriginalOrderAction();
        // Send confirmation back AFTER clicking, including order total for storage update
        sendResponse({ success: true });
        // Send another message *after* responding, so background knows it's safe to update storage
         setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'orderTriggered', orderTotal: message.orderTotal }, (updateResponse) => {
                if(chrome.runtime.lastError) {
                    console.error("Error sending orderTriggered message:", chrome.runtime.lastError.message);
                } else {
                    console.log('Sent orderTriggered message to background.', updateResponse);
                }
            });
        }, 50); // Short delay to ensure click processing starts
    }
});

// --- Main Logic ---
function main() {
    console.log('Running main execution logic.');
    // Check if we are potentially on a checkout page
    // A more robust check might look for specific form elements or URLs
    if (window.location.href.includes('/gp/buy/spc/handlers/display.html') ||
        window.location.href.includes('/checkout/payselect') || // Older URL?
        window.location.href.includes('/checkout/confirm') ||
        document.querySelector('#checkoutDisplayPage')) {

        console.log('Potential checkout page detected.');

        originalButton = findElement(CHECKOUT_BUTTON_SELECTORS);
        const orderTotalElement = findElement(ORDER_TOTAL_SELECTORS);
        orderTotalValue = extractPrice(orderTotalElement);

        if (originalButton && orderTotalValue !== null) {
            console.log('Found original button and order total. Proceeding with interception.');
            injectCustomButton();
        } else {
            console.log('Original button or order total not found initially. Setting up observer.');
            // Use MutationObserver to wait for the button and total to appear
            setupObserver();
        }
    } else {
        console.log('Not a recognized checkout page URL.');
    }
}

function setupObserver() {
    if (observer) return; // Don't set up multiple observers

    observer = new MutationObserver((mutationsList, obs) => {
        // Optimization: check only if relevant nodes are added
        let relevantChange = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                 relevantChange = true;
                 break;
            }
            // Consider attribute changes if selectors rely on them
            // if (mutation.type === 'attributes') { relevantChange = true; break; }
        }

        if (!relevantChange) return;

        console.log('DOM changed, re-checking for elements...');

        if (!originalButton) {
            originalButton = findElement(CHECKOUT_BUTTON_SELECTORS);
        }
        if (orderTotalValue === null) {
            const orderTotalElement = findElement(ORDER_TOTAL_SELECTORS);
            orderTotalValue = extractPrice(orderTotalElement);
        }

        // If both found and not yet intercepted, inject the button
        if (originalButton && orderTotalValue !== null && !isIntercepted) {
            console.log('Elements found via observer. Injecting button.');
            if (injectCustomButton()) {
                console.log('Button injected via observer. Disconnecting observer.');
                obs.disconnect(); // Stop observing once the button is injected
                observer = null;
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('MutationObserver set up to watch for checkout elements.');

    // Set a timeout to stop observing if elements aren't found after a while
    setTimeout(() => {
        if (observer) {
            console.log('Observer timeout reached. Disconnecting.');
            observer.disconnect();
            observer = null;
        }
    }, 20000); // Stop after 20 seconds if nothing happens
}

// Run main logic after a small delay to allow page elements to render
// Using document_idle should help, but Amazon pages can be slow/dynamic
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(main, 500));
} else {
    setTimeout(main, 500);
}

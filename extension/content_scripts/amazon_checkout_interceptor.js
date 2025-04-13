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
    'div.order-summary-line-definition', // Added based on specific user feedback
    // '#subtotals-marketplace-table .grand-total-price',
    // '.order-summary-container .grand-total-price',
    // 'td:contains("Order total:") + td',
    // 'span:contains("Order total:") ~ span.a-text-bold',
    // 'span:contains("Grand total:") ~ span.a-text-bold',
    // '#checkout-summary-subtotals_feature_div .grand-total-row span.a-text-bold',
    // '[data-testid="order-summary-grand-total"] span'
    // Add more selectors here
];

// Selector for item names
// const ORDER_ITEM_CONTAINER_SELECTOR = 'div[data-asin]'; // Removed, searching directly for names
// const ORDER_ITEM_NAME_SELECTOR = 'span[id^="checkout-item-block-item-primary-title"]'; // Previous selector
// const ORDER_ITEM_NAME_SELECTOR = 'span[data-csa-c-id="checkout-item-block-itemPrimaryTitle"]'; // Typo in attribute name
const ORDER_ITEM_NAME_SELECTOR = 'span[data-csa-c-slot-id="checkout-item-block-itemPrimaryTitle"]'; // Correct attribute selector for the outer span
// Re-introduce price selector based on HTML structure
const ORDER_ITEM_PRICE_SELECTOR = 'span.lineitem-price-text';
const ORDER_ITEM_QUANTITY_SELECTOR = 'span.quantity-display'; // Selector for quantity

const CUSTOM_BUTTON_ID = 'amazon-tracker-button-custom';
let originalButton = null;
let orderTotalValue = null;
let observer = null;
let isIntercepted = false; // Flag to prevent multiple intercepts

function findElement(selectors) {
    console.log(`findElement: Searching with selectors:`, selectors); // Added log
    for (const selector of selectors) {
        try {
            const element = document.querySelector(selector);
            console.log(`findElement: Trying selector \"${selector}\" - Found:`, element); // Added log
            if (element && (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)) { // Check if visible or has layout
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
    console.log('No visible element found matching selectors:', selectors); // Updated log
    return null;
}

function extractPrice(element) {
    if (!element) return null;
    const text = element.textContent.trim();
    // Updated Regex: Match currency symbol, then capture digits, commas, period until first non-digit/non-period/non-comma
    // Handles formats like $10.49, $1,234.56, €99,99 etc., stopping before any trailing text like ($0.37 / Fl Oz)
    const match = text.match(/(?:\$|\£|\€|\¥|CAD|AUD|USD|EUR|GBP|JPY)\s?([\d,]+(?:\.\d{1,2})?)/);
    if (match && match[1]) {
        const priceStr = match[1]; // Get the number part
        const cleanedPrice = priceStr.replace(/,/g, ''); // Remove commas
        const price = parseFloat(cleanedPrice);
        if (!isNaN(price)) {
            console.log(`Extracted price: ${price} from text "${text}" using match:`, match);
            return price;
        }
    }
    console.warn(`Could not extract price from text: "${text}" using regex.`);
    return null;
}

function injectCustomButton() {
    if (!originalButton || document.getElementById(CUSTOM_BUTTON_ID) || isIntercepted) {
        // console.log('Skipping injection: Original button not found, custom button exists, or already intercepted.'); // Less verbose log
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

        // Use a short timeout to allow potential dynamic rendering to complete
        setTimeout(() => {
            console.log('Running item extraction after short delay...');

            // Re-check order total just in case it updated dynamically
            // Special handling for order total - get the LAST matching element
            let currentOrderTotalElement = null;
            const totalElements = document.querySelectorAll('div.order-summary-line-definition');
            if (totalElements.length > 0) {
                currentOrderTotalElement = totalElements[totalElements.length - 1];
                console.log('Found last order total element:', currentOrderTotalElement);
            } else {
                console.log('Could not find any elements matching div.order-summary-line-definition on click.');
                // Fallback to other selectors if needed?
                // currentOrderTotalElement = findElement(ORDER_TOTAL_SELECTORS.slice(1)); // Example: try others
            }

            orderTotalValue = extractPrice(currentOrderTotalElement);

            if (orderTotalValue === null) {
                console.error('Could not determine order total on click.');
                alert('Error: Could not determine the order total. Cannot proceed with spending check.');
                // Maybe re-enable original button here?
                // triggerOriginalOrderAction(); // Or just proceed without check?
                return;
            }

            // --- Extract Item Details ---
            const orderItems = []; // Array to store {name, price} objects
            // Directly select all name elements (outer spans) on the page
            const nameElements = document.querySelectorAll(ORDER_ITEM_NAME_SELECTOR);
            console.log(`Found ${nameElements.length} potential item name elements using selector: ${ORDER_ITEM_NAME_SELECTOR}`);
            console.log('NodeList:', nameElements); // Log the NodeList itself

            nameElements.forEach((outerSpanElement, index) => {
                console.log(`Processing element ${index + 1}:`, outerSpanElement); // Log the outer element object
                console.log(`Element ${index + 1} outerHTML:`, outerSpanElement.outerHTML); // Log outerHTML

                // Find the inner span containing the text
                const innerNameElement = outerSpanElement.querySelector('span.lineitem-title-text');
                const itemName = innerNameElement ? innerNameElement.textContent.trim() : null;
                console.log(`Element ${index + 1} inner textContent (trimmed): '${itemName}'`); // Log extracted text

                // Find the price element relative to the title element's container
                let itemPrice = null;
                const itemContainer = outerSpanElement.closest('div.a-box.lineitem-container');
                if (itemContainer) {
                    const priceElement = itemContainer.querySelector(ORDER_ITEM_PRICE_SELECTOR);
                    if (priceElement) {
                        console.log(` Found price element for item ${index + 1}:`, priceElement);
                        itemPrice = extractPrice(priceElement);
                    } else {
                        console.warn(` Could not find price element for item ${index + 1} within container:`, itemContainer);
                    }
                } else {
                     console.warn(` Could not find container (.a-box.lineitem-container) for item ${index + 1}:`, outerSpanElement);
                }
                console.log(` Price extracted for item ${index + 1}: ${itemPrice}`);

                // Find the quantity element and extract quantity
                let itemQuantity = 1; // Default to 1
                if(itemContainer){
                    const quantityElement = itemContainer.querySelector(ORDER_ITEM_QUANTITY_SELECTOR);
                    if(quantityElement){
                        const quantityText = quantityElement.textContent.trim();
                        const parsedQuantity = parseInt(quantityText, 10);
                        if (!isNaN(parsedQuantity)) {
                            itemQuantity = parsedQuantity;
                        }
                        console.log(` Found quantity element for item ${index + 1}: '${quantityText}'. Parsed as: ${itemQuantity}`, quantityElement);
                    } else {
                         console.warn(` Could not find quantity element for item ${index + 1} within container:`, itemContainer);
                    }
                }
                // else: Keep default quantity if container wasn't found (already warned)

                // Add item if name is found (price can be null)
                if (itemName) {
                    orderItems.push({ name: itemName, price: itemPrice, quantity: itemQuantity }); // Add name, price, and quantity object
                    console.log(`Added item ${index + 1}: Name='${itemName}', Price=${itemPrice}, Quantity=${itemQuantity}`);
                } else {
                    console.warn(`Element ${index + 1} did not yield a valid itemName from its inner span.`);
                }
            });
            console.log(`Finished processing elements. Total items extracted: ${orderItems.length}`);
            // --- End Extract Item Details ---

            console.log(`Sending message to background. Order total: ${orderTotalValue}, Items:`, orderItems);
            // Send total and item objects array
            chrome.runtime.sendMessage({ action: 'showConfirmation', orderTotal: orderTotalValue, items: orderItems }, (response) => {
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

        }, 100); // 100ms delay

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
                if (chrome.runtime.lastError) {
                    console.error("Error sending orderTriggered message:", chrome.runtime.lastError.message);
                } else {
                    console.log('Sent orderTriggered message to background.', updateResponse);
                }
            });
        }, 50); // Short delay to ensure click processing starts
    }
    // Add handling for potential other messages if needed
    return true; // Indicate async response possible if needed later
});

// --- Main Logic ---
function main() {
    // REMOVED THE URL/ELEMENT CHECK - Now we rely on finding the button
    console.log('Running main execution logic. Attempting to find checkout button...');

    if (isIntercepted || document.getElementById(CUSTOM_BUTTON_ID)) {
        console.log('main: Already intercepted or custom button exists. Skipping.');
        return; // Don't run again if already done
    }

    originalButton = findElement(CHECKOUT_BUTTON_SELECTORS);

    if (originalButton) {
        console.log('Checkout button found. Proceeding with interception.');

        // Get order total - Special handling: find the LAST matching element
        let orderTotalElement = null;
        const totalElements = document.querySelectorAll('div.order-summary-line-definition');
        if (totalElements.length > 0) {
            orderTotalElement = totalElements[totalElements.length - 1];
            console.log('Found last order total element initially:', orderTotalElement);
        } else {
            console.log('Could not find any elements matching div.order-summary-line-definition initially.');
            // Fallback to other selectors if needed?
            // orderTotalElement = findElement(ORDER_TOTAL_SELECTORS.slice(1)); // Example: try others
        }
        orderTotalValue = extractPrice(orderTotalElement); // Store initial total if found

        if (orderTotalValue === null) {
            console.warn('Could not determine order total initially, but proceeding with button injection.');
            // Decide if you want to block injection if total isn't found? For now, let's proceed.
        }

        const injected = injectCustomButton();
        if (injected && observer) {
            console.log("Disconnecting observer after successful injection.");
            observer.disconnect(); // Stop observing once we've succeeded
        }

    } else {
        console.log('Checkout button not found on initial load/check.');
        // Observer will continue running if already set up
    }
}

// --- Observer Setup ---
function setupObserver() {
    if (observer) {
        console.log("Observer already exists.");
        return; // Don't set up multiple observers
    }
    console.log('Setting up MutationObserver to watch for button appearance...');
    observer = new MutationObserver((mutationsList, obs) => {
        // Optimization: Check if the custom button already exists before iterating
        if (document.getElementById(CUSTOM_BUTTON_ID) || isIntercepted) {
            console.log("Observer: Custom button exists or already intercepted. Disconnecting.");
            obs.disconnect();
            observer = null; // Clear observer reference
            return;
        }

        let foundButtonNode = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Basic check: Did *any* node get added? Could be more specific if needed.
                foundButtonNode = true;
                break; // No need to check further mutations in this batch
                // More specific check (might be slow if many nodes added):
                // for (const node of mutation.addedNodes) {
                //     if (node.nodeType === Node.ELEMENT_NODE) {
                //         // Check if the added node *is* the button or *contains* the button
                //         if (CHECKOUT_BUTTON_SELECTORS.some(sel => node.matches(sel) || node.querySelector(sel))) {
                //              foundButtonNode = true;
                //              break;
                //         }
                //     }
                // }
            }
            // If we found a potential button node added, break the outer loop too
            // if (foundButtonNode) break; // Use this with the more specific check
        }

        if (foundButtonNode) {
            console.log('Observer detected node changes. Re-running main logic.');
            // Use a small timeout to let the DOM settle after mutation
            setTimeout(main, 100);
            // Consider disconnecting here if `main` successfully intercepts,
            // which it now does internally.
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    console.log("Observer started.");
}

// --- Initial Execution ---

// Run initial check
main();

// Setup observer in case the button appears later
// Delay observer setup slightly? Sometimes helps avoid observing initial bulk rendering.
setTimeout(setupObserver, 500); // Setup observer after 500ms

console.log('Amazon Spending Tracker: Content script execution finished initial setup.');

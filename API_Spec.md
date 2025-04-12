# API Specification: Simplified Spending Tracker Extension

## Overview

This document specifies a simplified REST API for a spending tracker backend. It allows fetching current spending, checking potential orders, recording purchases, setting limits, and getting an alert sound. Authentication, metrics, and history features are omitted for simplicity.

## General API Information

* **Base URL:** `https://your-api-domain.com/api/v1`
* **Data Format:** Requests and responses use `application/json`, unless noted otherwise.
* **Versioning:** API version `v1` is included in the Base URL.

## Error Handling

Use standard HTTP status codes for errors (e.g., `400 Bad Request` for invalid input, `404 Not Found`, `500 Internal Server Error`). Error response bodies can optionally contain a simple message: `{"message": "Error description"}`.

## Endpoints

---

### Endpoint: Get Current Monthly Spending Data

* **Purpose:** Retrieves the spending limit, current total spending, and itemized list for the current calendar month.
* **Method:** `GET`
* **Path:** `/spending/monthly`
* **Request Body:** None.
* **Success Response (200 OK):**
    * **Content-Type:** `application/json`
    * **Body:**
        ```json
        {
          "limit": 500.00,
          "currentSpending": 125.50,
          "items": [
            { "name": "Wireless Mouse", "price": 25.99 },
            { "name": "Coffee Maker", "price": 79.50 },
            { "name": "Book: The Great Novel", "price": 19.99 }
          ]
        }
        ```

---

### Endpoint: Check Potential Order Spending

* **Purpose:** Checks if adding a specific amount would exceed the monthly spending limit.
* **Method:** `POST`
* **Path:** `/spending/check-order`
* **Request Body:**
    * **Content-Type:** `application/json`
    * **Example:**
        ```json
        {
          "orderAmount": 55.75
        }
        ```
* **Success Response (200 OK):**
    * **Content-Type:** `application/json`
    * **Body:** Provides a status and a message indicating if the order fits within the limit.
        ```json
        {
          "status": "yes", // 'yes' = within limit, 'no' = exceeds limit
          "message": "Adding this order will keep you within your monthly limit."
          // Optional fields like remainingBalance or exceedsBy could be added by the backend if desired.
        }
        ```
        *OR*
        ```json
        {
          "status": "no",
          "message": "Warning: Adding this order will exceed your monthly limit!"
        }
        ```

---

### Endpoint: Record a New Purchase

* **Purpose:** Adds a new spending item to the current month's total.
* **Method:** `POST`
* **Path:** `/spending/items`
* **Request Body:**
    * **Content-Type:** `application/json`
    * **Example:**
        ```json
        {
          "name": "New Gadget",
          "price": 49.99
        }
        ```
* **Success Response (200 OK or 201 Created):**
    * **Content-Type:** `application/json`
    * **Body:** Returns the updated spending total for the month.
        ```json
        {
           "newCurrentSpending": 175.49 // Updated currentSpending for the month
        }
        ```

---

### Endpoint: Set/Update Monthly Spending Limit

* **Purpose:** Sets or updates the monthly spending limit.
* **Method:** `PUT`
* **Path:** `/spending/limit`
* **Request Body:**
    * **Content-Type:** `application/json`
    * **Example:**
        ```json
        {
          "limit": 600.00
        }
        ```
* **Success Response (200 OK):**
    * **Content-Type:** `application/json`
    * **Body:**
        ```json
        {
          "limit": 600.00, // The newly set limit
          "message": "Spending limit updated successfully."
        }
        ```

---

### Endpoint: Get Alert Sound File

* **Purpose:** Downloads the audio file (`.wav`) used for alerts.
* **Method:** `GET`
* **Path:** `/audio/alert.wav`
* **Request Body:** None.
* **Success Response (200 OK):**
    * **Content-Type:** `audio/wav`
    * **Body:** Raw binary data of the `.wav` file.

## General Considerations

* **Month Rollover:** The backend needs to handle the start of a new calendar month, resetting the `currentSpending` and `items` list for the `/spending/monthly` view.
* **Data Validation:** The backend must validate inputs (e.g., ensure prices/limits are non-negative numbers).
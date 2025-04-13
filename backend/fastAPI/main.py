from fastapi import FastAPI, HTTPException, Body, Depends
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
from contextlib import asynccontextmanager
import datetime
import os
#from retrieve_context import prompt_llm
from retrieve_context import LLMPrompt

# Import models and data handling functions
from . import models

model = LLMPrompt()
app = FastAPI(
    title="Monthly Spending Tracker API",
    description="API to track monthly spending, set limits, and check orders using JSON file storage.",
    version="1.1.0" # Bump version
)



# --- Helper Function for Month Rollover & Data Initialization ---

def check_and_prepare_data() -> dict:
    """Loads data, checks if the month has changed, resets if necessary, and ensures current month data exists."""
    data = models.load_data()
    now = datetime.datetime.now()
    current_month_str = str(now.month)

    # Check if saved month is different from current month
    if data.get("current_month") != now.month:
        print(f"New month detected ({now.strftime('%B')}). Resetting monthly data if needed.")
        data["current_month"] = now.month
        # If data for the new month doesn't exist, create it
        if current_month_str not in data["monthly_data"]:
             data["monthly_data"][current_month_str] = {
                 "current_spending": 0.00,
                 "items_purchased": []
             }
        models.save_data(data) # Save the updated month and potentially new month structure

    # Ensure current month data exists even if month didn't change (e.g., initial run)
    elif current_month_str not in data["monthly_data"]:
        print(f"Initializing data structure for current month ({now.strftime('%B')}).")
        data["monthly_data"][current_month_str] = {
            "current_spending": 0.00,
            "items_purchased": []
        }
        models.save_data(data)

    return data # Return the potentially updated data


# --- API Endpoints ---
# No dependency needed now, check_and_prepare_data called in each endpoint



@app.get(
    "/spending/monthly",
    response_model=models.MonthlySpendingResponse,
    summary="Get Current Monthly Spending Data",
    tags=["Spending"]
)
async def get_monthly_spending():
    """Retrieves the spending limit, current total spending, and itemized list for the current calendar month."""
    data = check_and_prepare_data()
    current_month_str = str(data["current_month"])
    month_data = data["monthly_data"].get(current_month_str, {"current_spending": 0.0, "items_purchased": []})

    return {
        "limit": data["monthly_limit"],
        "currentSpending": round(month_data["current_spending"], 2),
        "items": month_data["items_purchased"]
    }

@app.post(
    "/spending/check-order",
    response_model=models.CheckOrderResponse,
    summary="Check Potential Order Spending",
    tags=["Spending"]
)
async def check_order_spending(order_request: models.CheckOrderRequest = Body(...)):
    """Checks if adding a specific amount would exceed the monthly spending limit."""
    data = check_and_prepare_data()
    current_month_str = str(data["current_month"])
    month_data = data["monthly_data"].get(current_month_str, {"current_spending": 0.0})

    # potential_spending = month_data["current_spending"] + order_request.orderAmount
    current_spending_response = model.prompt_llm(f"What is the total amount spent?")
    if current_spending_response["status"].lower() != "yes":
        return {
            "status": "no",
            "message": "Warning: Adding this order will exceed your monthly limit!"
        }
    else:
        current_spending = current_spending_response["amount"]
    potential_spending = current_spending + order_request.orderAmount
    
    if potential_spending <= data["monthly_limit"]:
        return {
            "status": "yes",
            "message": "Adding this order will keep you within your monthly limit."
        }
    else:
        return {
            "status": "no",
            "message": "Warning: Adding this order will exceed your monthly limit!"
        }
        
    
    
"""async def check_order_spending(order_request: models.CheckOrderRequest = Body(...)):
    # Checks if adding a specific amount would exceed the monthly spending limit.
    data = check_and_prepare_data()
    current_month_str = str(data["current_month"])
    month_data = data["monthly_data"].get(current_month_str, {"current_spending": 0.0})

    potential_spending = month_data["current_spending"] + order_request.orderAmount
    if potential_spending <= data["monthly_limit"]:
        return {
            "status": "yes",
            "message": "Adding this order will keep you within your monthly limit."
        }
    else:
        return {
            "status": "no",
            "message": "Warning: Adding this order will exceed your monthly limit!"
        }"""

@app.post(
    "/spending/record-purchase",
    response_model=models.RecordPurchaseResponse,
    summary="Record a Completed Purchase",
    tags=["Spending"]
)
async def record_purchase(purchase: models.RecordPurchaseRequest = Body(...)):
    """Adds a new spending record based on a completed purchase to the current month's total and saves to JSON.
    
    Receives the total order amount and a list of items.
    Updates the monthly spending by the total order amount.
    Adds individual items to the purchased list for the month.
    """
    data = check_and_prepare_data()
    current_month_str = str(data["current_month"])
    month_data = data["monthly_data"].get(current_month_str)

    # Ensure month_data exists (should be guaranteed by check_and_prepare_data)
    if month_data is None:
         raise HTTPException(status_code=500, detail="Internal error: Monthly data structure missing.")

    # Add individual items from the request to the stored list
    for item in purchase.itemsInOrder:
        # Convert Pydantic model item to dict for JSON storage
        month_data["items_purchased"].append({"name": item.name, "price": item.price})
        # Optionally add timestamp or other details from the request item if needed

    # Update the total spending by the orderAmount from the request
    month_data["current_spending"] += purchase.orderAmount
    models.save_data(data) # Save changes

    # Return the new response format
    return {"message": f"Purchase recorded successfully. New spending: ${month_data['current_spending']:.2f}"}

@app.put(
    "/spending/limit",
    response_model=models.UpdateLimitResponse,
    summary="Set/Update Monthly Spending Limit",
    tags=["Spending"]
)
async def update_spending_limit(limit_update: models.UpdateLimitRequest = Body(...)):
    """Sets or updates the monthly spending limit and saves to JSON."""
    data = models.load_data() # Load current data
    data["monthly_limit"] = limit_update.limit
    models.save_data(data) # Save the updated limit
    return {
        "limit": data["monthly_limit"],
        "message": "Spending limit updated successfully."
    }

# --- New Endpoint for Resetting Spending ---

@app.post(
    "/spending/reset",
    response_model=models.ResetSpendingResponse,
    summary="Reset Current Month's Spending",
    tags=["Spending"]
)
async def reset_monthly_spending():
    """Resets the current month's spending total to 0.00 and clears the purchased items list.
    
    Does not change the monthly limit.
    """
    data = check_and_prepare_data() # Ensures data is loaded and month is correct
    current_month_str = str(data["current_month"])
    month_data = data["monthly_data"].get(current_month_str)

    if month_data is None:
        # This shouldn't happen if check_and_prepare_data works, but handle defensively
        raise HTTPException(status_code=500, detail="Internal error: Monthly data structure missing for reset.")

    # Reset spending and items for the current month
    month_data["current_spending"] = 0.00
    month_data["items_purchased"] = []
    
    models.save_data(data) # Save the changes

    return {
        "message": f"Spending for month {current_month_str} reset successfully.",
        "currentSpending": month_data["current_spending"] # Should be 0.0
    }


# --- Audio Endpoint ---

# Ensure the alert file exists or handle the FileNotFoundError
# Use models.DATA_DIR to be consistent
ALERT_FILE_PATH = os.path.join(os.path.dirname(__file__), "alert.wav") # Keep relative path for creation

# Create a dummy alert.wav if it doesn't exist for testing
if not os.path.exists(ALERT_FILE_PATH):
    try:
        # (Dummy WAV creation logic remains the same)
        sample_rate = 8000
        channels = 1
        bits_per_sample = 8
        duration_ms = 100 # 100ms of silence
        num_samples = int(sample_rate * duration_ms / 1000)
        byte_rate = sample_rate * channels * bits_per_sample // 8
        block_align = channels * bits_per_sample // 8
        data_size = num_samples * block_align
        file_size = 36 + data_size # 44 bytes header - 8 bytes for RIFF+size

        with open(ALERT_FILE_PATH, 'wb') as f:
            # RIFF Header
            f.write(b'RIFF')
            f.write(file_size.to_bytes(4, 'little'))
            f.write(b'WAVE')
            # Format Chunk
            f.write(b'fmt ')
            f.write((16).to_bytes(4, 'little')) # Subchunk1Size (16 for PCM)
            f.write((1).to_bytes(2, 'little')) # AudioFormat (1 for PCM)
            f.write(channels.to_bytes(2, 'little'))
            f.write(sample_rate.to_bytes(4, 'little'))
            f.write(byte_rate.to_bytes(4, 'little'))
            f.write(block_align.to_bytes(2, 'little'))
            f.write(bits_per_sample.to_bytes(2, 'little'))
            # Data Chunk
            f.write(b'data')
            f.write(data_size.to_bytes(4, 'little'))
            # Write silence (PCM 8-bit unsigned: 128 is silence)
            f.write(bytes([128] * num_samples))
        print(f"Created dummy '{ALERT_FILE_PATH}'")
    except Exception as e:
        print(f"Warning: Could not create dummy alert.wav: {e}")
        # The endpoint will fail if the file isn't present later

@app.get(
    "/audio/alert.wav",
    responses={
        200: {
            "content": {"audio/wav": {}}
        },
        404: {
            "description": "Alert file not found",
            "model": models.ErrorResponse
        }
    },
    summary="Get Alert Sound File",
    tags=["Audio"]
)
async def get_alert_audio():
    """Downloads the audio file (.wav) used for alerts."""
    # Use absolute path for FileResponse
    alert_file_abs_path = os.path.abspath(ALERT_FILE_PATH)
    if not os.path.exists(alert_file_abs_path):
        raise HTTPException(status_code=404, detail="Alert audio file not found.")
    return FileResponse(alert_file_abs_path, media_type="audio/wav", filename="alert.wav")

# --- Root endpoint for basic check ---
@app.get("/", include_in_schema=False)
async def root():
    # Perform initial check on root access too, ensuring file exists
    check_and_prepare_data()
    return {"message": "Spending Tracker API is running (using JSON storage). Visit /docs for API documentation."}

# --- Run with Uvicorn (example command) ---
# uvicorn backend.fastAPI.main:app --reload --port 8000

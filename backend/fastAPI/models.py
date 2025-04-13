from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
import os
import datetime

# --- Constants ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DATA_FILE = os.path.join(DATA_DIR, "spending_data.json")

# --- Data Handling Functions ---

def get_default_data() -> Dict[str, Any]:
    """Returns the default data structure."""
    now = datetime.datetime.now()
    current_month_str = str(now.month)
    return {
        "monthly_limit": 500.00,
        "current_month": now.month,
        "monthly_data": {
            current_month_str: {
                "current_spending": 0.00,
                "items_purchased": []
            }
        }
    }

def load_data() -> Dict[str, Any]:
    """Loads spending data from the JSON file. Creates default if not found."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        print(f"Data file '{DATA_FILE}' not found. Creating default.")
        data = get_default_data()
        save_data(data)
        return data
    try:
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            # Basic validation/migration if needed in future
            if 'monthly_data' not in data or 'current_month' not in data or 'monthly_limit' not in data:
                 print("Data file seems incomplete or corrupted. Resetting to default.")
                 data = get_default_data()
                 save_data(data)
            return data
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading data file '{DATA_FILE}': {e}. Resetting to default.")
        data = get_default_data()
        save_data(data)
        return data

def save_data(data: Dict[str, Any]):
    """Saves spending data to the JSON file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except IOError as e:
        print(f"Error saving data file '{DATA_FILE}': {e}")

# --- Request Models ---

class CheckOrderRequest(BaseModel):
    orderAmount: float = Field(..., gt=0, description="The amount of the potential order.")
    currentSpending: float = Field(..., ge=0, description="The current total spending for the month.")
    monthlyLimit: float = Field(..., ge=0, description="The monthly spending limit.")
    itemsInOrder: List[Dict[str, Any]] = Field(default_factory=list, description="List of items in the current order.")

# Model for a single item in the purchase request (matches frontend structure)
class RecordPurchaseItem(BaseModel):
    name: str = Field(..., description="Name of the item in the order.")
    price: float = Field(..., gt=0, description="Price of the item in the order.")
    # Add quantity or other fields if available/needed

class RecordPurchaseRequest(BaseModel):
    orderAmount: float = Field(..., gt=0, description="The total amount of the order being recorded.")
    itemsInOrder: List[RecordPurchaseItem] = Field(..., description="List of items included in the purchase.")
    timestamp: str = Field(..., description="ISO timestamp of when the record request was made.")

class NewPurchaseRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the purchased item.")
    price: float = Field(..., gt=0, description="Price of the purchased item.")

class UpdateLimitRequest(BaseModel):
    limit: float = Field(..., ge=0, description="The new monthly spending limit.")

# --- Response Models ---

class MonthlySpendingItem(BaseModel):
    name: str
    price: float

class MonthlySpendingResponse(BaseModel):
    limit: float
    currentSpending: float
    items: List[MonthlySpendingItem]

class CheckOrderResponse(BaseModel):
    status: str # 'yes' or 'no'
    message: str

class RecordPurchaseResponse(BaseModel):
    message: str

class UpdateLimitResponse(BaseModel):
    limit: float
    message: str

# New response model for resetting spending
class ResetSpendingResponse(BaseModel):
    message: str
    currentSpending: float # Optionally return the new (zero) spending

class ErrorResponse(BaseModel):
    message: str

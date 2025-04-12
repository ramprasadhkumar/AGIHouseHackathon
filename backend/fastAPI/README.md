# Monthly Spending Tracker API

This FastAPI application provides endpoints to track monthly spending, set limits, and check potential orders.

## Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd /path/to/your/project/backend/fastAPI
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Running the API

Run the development server using Uvicorn:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

*   `main:app`: Tells Uvicorn to look for the `app` instance in the `main.py` file.
*   `--reload`: Enables auto-reloading when code changes are detected.
*   `--host 0.0.0.0`: Makes the server accessible on your network (use `127.0.0.1` for local access only).
*   `--port 8000`: Specifies the port to run on.

## Accessing the API

*   **API Root:** [http://localhost:8000/](http://localhost:8000/)
*   **Interactive Docs (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
*   **Alternative Docs (ReDoc):** [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Endpoints

See the `/docs` page for detailed endpoint information and interactive testing.

*   `GET /v1/spending/monthly`: Get current month's spending data.
*   `POST /v1/spending/check-order`: Check if an order amount fits the limit.
*   `POST /v1/spending/items`: Record a new purchase.
*   `PUT /v1/spending/limit`: Set or update the spending limit.
*   `GET /v1/audio/alert.wav`: Download the alert sound file.

## Data Persistence

**Note:** This implementation uses a JSON file (`data/spending_data.json`) for data persistence. Spending data will now persist across server restarts.

## Month Rollover

The API includes basic logic to detect the start of a new calendar month and automatically reset the `currentSpending` and `items` list. The API includes logic to detect the start of a new calendar month and automatically create a new entry for the month in the `data/spending_data.json` file, effectively resetting the view for the new month while preserving previous months' data (though previous months are not exposed via the current API endpoints).

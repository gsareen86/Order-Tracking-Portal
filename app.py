from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
from utils import get_all_orders, get_order_by_id, cancel_order, generate_invoice_docx
from ai_agent import DataAgent

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AI Agent
DATA_PATH = os.path.join('data', 'order_db.xlsx')
ai_agent = DataAgent(DATA_PATH)

# Pydantic models for request bodies
class LoginRequest(BaseModel):
    username: str
    password: str

class CancelRequest(BaseModel):
    reason: str

class ChatRequest(BaseModel):
    query: str

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/index.html", response_class=HTMLResponse)
async def index_html(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/dashboard.html", response_class=HTMLResponse)
async def dashboard_html(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username")
    password = data.get("password")
    # Dummy authentication
    if username == "admin" and password == "password":
        return {"success": True, "redirect": "/dashboard"}
    return JSONResponse(status_code=401, content={"success": False, "message": "Invalid credentials"})

@app.get("/api/orders")
async def get_orders():
    orders = get_all_orders()
    return {"orders": orders}

@app.get("/api/order/{order_id}")
async def get_order_details(order_id: str):
    order = get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@app.get("/api/track/{order_id}")
async def track_order(order_id: str):
    order = get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Dummy tracking logic based on status
    status = order['Order Status']
    timeline = []
    
    steps = ["Order Placed", "Packaging", "Shipped", "Out for Delivery", "Delivered"]
    current_step_index = -1
    
    if status == 'Ordered':
        current_step_index = 0
    elif status == 'Packaging':
        current_step_index = 1
    elif status == 'Shipped':
        current_step_index = 2
    elif status == 'Delivered':
        current_step_index = 4
    
    # Add dummy locations
    locations = ["Origin Facility", "Sorting Center", "Regional Hub", "Delivery Station", "Customer"]
    
    for i, step in enumerate(steps):
        completed = i <= current_step_index
        timeline.append({
            "status": step,
            "location": locations[i],
            "completed": completed,
            "timestamp": "2023-10-27 10:00" if completed else None # Dummy timestamp
        })
        
    return {"tracking": timeline, "current_status": status}

@app.post("/api/cancel/{order_id}")
async def cancel_order_endpoint(order_id: str, request: Request):
    data = await request.json()
    reason = data.get("reason")
    success = cancel_order(order_id, reason)
    if success:
        return {"success": True, "message": "Order cancelled successfully. Refund will be processed within 30 days."}
    return JSONResponse(status_code=400, content={"success": False, "message": "Could not cancel order"})

@app.get("/api/invoice/{order_id}")
async def download_invoice(order_id: str):
    file_path = generate_invoice_docx(order_id)
    if file_path and os.path.exists(file_path):
        filename = f"invoice_{order_id}.docx"
        return FileResponse(path=file_path, filename=filename, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    raise HTTPException(status_code=404, detail="Invoice generation failed")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        result = ai_agent.process_query(request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

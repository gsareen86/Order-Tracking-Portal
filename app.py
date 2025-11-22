from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
from utils import get_all_orders, get_order_by_id, cancel_order, generate_invoice_pdf, load_config
from ai_agent_multi import MultiAgentOrchestrator
from datetime import datetime
import ast
import re as regex

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
DATA_PATH = os.path.join('data', 'order_db_v2.xlsx')
ai_agent = MultiAgentOrchestrator(DATA_PATH)

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
    file_path = generate_invoice_pdf(order_id)
    if file_path and os.path.exists(file_path):
        filename = f"invoice_{order_id}.pdf"
        return FileResponse(path=file_path, filename=filename, media_type='application/pdf')
    raise HTTPException(status_code=404, detail="Invoice generation failed")

@app.get("/api/dashboard-stats")
async def get_dashboard_stats():
    orders = get_all_orders()
    
    # Aggregations
    total_orders = len(orders)
    status_counts = {}
    total_revenue = 0
    total_advance = 0
    outstanding_balance = 0
    transit_times = []
    overdue_count = 0
    
    config = load_config()
    payment_due_days = config.get("payment_due_days", 60)
    
    for order in orders:
        # Status Counts
        status = order['Order Status']
        status_counts[status] = status_counts.get(status, 0) + 1
        
        # Financials
        amount = order.get('Total Amount', 0)
        advance = order.get('Advance Amount', 0)
        total_revenue += amount
        total_advance += advance
        
        balance = amount - advance
        if balance > 0:
            outstanding_balance += balance
            
            # Overdue Check
            due_date_str = order.get('Payment Due Date')
            if due_date_str:
                try:
                    due_date = datetime.strptime(due_date_str, "%Y-%m-%d")
                    if due_date < datetime.now():
                        overdue_count += 1
                except:
                    pass

        # Transit Time (Delivered - Shipped)
        if status == 'Delivered':
            shipped_str = order.get('Shipped Date')
            delivered_str = order.get('Delivered Date')
            if shipped_str and delivered_str:
                try:
                    shipped = datetime.strptime(shipped_str, "%Y-%m-%d %H:%M")
                    delivered = datetime.strptime(delivered_str, "%Y-%m-%d %H:%M")
                    days = (delivered - shipped).days
                    transit_times.append(days)
                except:
                    pass
                    
    avg_transit_time = sum(transit_times) / len(transit_times) if transit_times else 0
    
    return {
        "total_orders": total_orders,
        "status_counts": status_counts,
        "financials": {
            "revenue": total_revenue,
            "advance": total_advance,
            "outstanding": outstanding_balance
        },
        "avg_transit_time": round(avg_transit_time, 1),
        "overdue_count": overdue_count
    }

@app.get("/api/config")
async def get_config():
    return load_config()

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        # Process the query with AI agent (v2 handles greetings/off-topic and markdown formatting)
        result = ai_agent.process_query(request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

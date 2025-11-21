import pandas as pd
from docx import Document
from docx.shared import Pt
import os
from datetime import datetime

DATA_DIR = 'data'
ORDER_DB_PATH = os.path.join(DATA_DIR, 'order_db.xlsx')
INVOICE_TEMPLATE_PATH = os.path.join(DATA_DIR, 'invoice_template.docx')

def get_all_orders():
    if not os.path.exists(ORDER_DB_PATH):
        return []
    df = pd.read_excel(ORDER_DB_PATH)
    # Convert dates to string for JSON serialization
    df['Order Date'] = df['Order Date'].astype(str)
    df['Expected Delivery'] = df['Expected Delivery'].astype(str)
    return df.to_dict('records')

def get_order_by_id(order_id):
    orders = get_all_orders()
    for order in orders:
        if order['Order No'] == order_id:
            return order
    return None

def cancel_order(order_id, reason):
    if not os.path.exists(ORDER_DB_PATH):
        return False
    
    df = pd.read_excel(ORDER_DB_PATH)
    if order_id in df['Order No'].values:
        df.loc[df['Order No'] == order_id, 'Order Status'] = 'Cancelled'
        # In a real app, we would store the cancellation reason somewhere
        df.to_excel(ORDER_DB_PATH, index=False)
        return True
    return False

def generate_invoice_docx(order_id):
    order = get_order_by_id(order_id)
    if not order:
        return None
    
    if not os.path.exists(INVOICE_TEMPLATE_PATH):
        return None

    doc = Document(INVOICE_TEMPLATE_PATH)
    
    replacements = {
        '{{buyer_name}}': str(order.get('Buyer Name', '')),
        '{{buyer_address}}': str(order.get('Buyer Address', '')),
        '{{buyer_gst}}': str(order.get('Buyer GST', '')),
        '{{invoice_no}}': f"INV-{order_id.split('-')[1]}",
        '{{order_date}}': str(order.get('Order Date', '')),
        '{{order_no}}': str(order.get('Order No', '')),
        '{{item_name}}': str(order.get('Item', '')),
        '{{quantity}}': str(order.get('Quantity', '')),
        '{{unit_cost}}': str(order.get('Unit Cost', '')),
        '{{total_cost}}': str(order.get('Total Amount', ''))
    }

    for paragraph in doc.paragraphs:
        for key, value in replacements.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, value)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for key, value in replacements.items():
                    if key in cell.text:
                        cell.text = cell.text.replace(key, value)
    
    output_path = os.path.join(DATA_DIR, f'invoice_{order_id}.docx')
    doc.save(output_path)
    return output_path

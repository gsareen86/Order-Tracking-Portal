import pandas as pd
import os

print("--- Metrics.xlsx Content ---")
try:
    df_metrics = pd.read_excel('data/Metrics.xlsx')
    print(df_metrics.to_string())
except Exception as e:
    print(f"Error reading Metrics.xlsx: {e}")

print("\n--- order_db.xlsx Columns ---")
try:
    df_orders = pd.read_excel('data/order_db.xlsx')
    print(df_orders.columns.tolist())
    print("First row sample:")
    print(df_orders.iloc[0].to_dict())
except Exception as e:
    print(f"Error reading order_db.xlsx: {e}")

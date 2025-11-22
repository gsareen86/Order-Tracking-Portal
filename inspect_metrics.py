import pandas as pd
import os

try:
    df = pd.read_excel('data/Metrics.xlsx')
    print("Columns:", df.columns.tolist())
    print("First 5 rows:")
    print(df.head().to_string())
except Exception as e:
    print(f"Error reading Metrics.xlsx: {e}")

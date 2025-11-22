import pandas as pd

print("--- Metrics List ---")
try:
    df = pd.read_excel('data/Metrics.xlsx')
    print(df['Metric/Graph'].tolist())
except Exception as e:
    print(e)

print("\n--- DB Columns ---")
try:
    df = pd.read_excel('data/order_db.xlsx')
    print(df.columns.tolist())
except Exception as e:
    print(e)

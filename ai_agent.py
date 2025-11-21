import google.generativeai as genai
import pandas as pd
import os
import json
import re
import traceback

# Configure API Key
API_KEY = "AIzaSyBO_Db5suSzplqp05aiR0atLWe2OU8JKjw" # Replace with your secure key handling
genai.configure(api_key=API_KEY)

class DataAgent:
    def __init__(self, data_path):
        self.data_path = data_path
        self.df = self.load_data()
        self.model = self.setup_model()
        self.chat_history = []

    def load_data(self):
        if os.path.exists(self.data_path):
            df = pd.read_excel(self.data_path)
            # Ensure consistency in column names (strip whitespace)
            df.columns = [c.strip() for c in df.columns]
            
            # Ensure date columns are datetime objects
            if 'Order Date' in df.columns:
                df['Order Date'] = pd.to_datetime(df['Order Date'])
            if 'Expected Delivery' in df.columns:
                df['Expected Delivery'] = pd.to_datetime(df['Expected Delivery'])
            return df
        return pd.DataFrame()

    def setup_model(self):
        return genai.GenerativeModel('gemini-2.0-flash')

    def _get_data_summary(self):
        """
        Creates a summary of columns and unique values for categorical columns
        to help the LLM understand the data structure.
        """
        if self.df.empty:
            return "Dataframe is empty."
        
        summary = "Columns and Data Types:\n"
        for col in self.df.columns:
            summary += f"- {col} ({self.df[col].dtype})\n"
            
            # If categorical/string, provide unique values (limit to top 20 to save tokens)
            if self.df[col].dtype == 'object':
                unique_vals = self.df[col].unique().tolist()
                # Filter out nan
                unique_vals = [x for x in unique_vals if str(x) != 'nan']
                if len(unique_vals) < 20:
                    summary += f"  Allowed Values: {unique_vals}\n"
                else:
                    summary += f"  Sample Values: {unique_vals[:5]}...\n"
        return summary

    def process_query(self, user_query):
        if self.df.empty:
            self.df = self.load_data()
            if self.df.empty:
                return {"response": "System Error: Order database is empty or missing.", "action": None}

        # 1. Build Context with Schema Awareness
        data_summary = self._get_data_summary()
        
        history_text = ""
        if self.chat_history:
            history_text = "Chat History:\n"
            for role, text in self.chat_history[-3:]: 
                history_text += f"{role}: {text}\n"

        # 2. The Prompt
        prompt = f"""
        You are a Python Data Analyst for an Order Tracking Portal.
        You have access to a pandas DataFrame `df` containing order data.
        
        DATA SCHEMA:
        {data_summary}

        USER QUERY: "{user_query}"
        {history_text}

        YOUR GOAL:
        1. Determine if the user is asking for a SPECIFIC Single Order (e.g., "Status of ORD-100") or an ANALYSIS/FILTER query (e.g., "Show me all Holography orders", "Total spend on chemicals", "List cancelled orders").
        
        RULES:
        1. MAPPING: If user uses synonyms (e.g., "Holographic films"), MAP them to the "Allowed Values" provided in the schema (e.g., "Holography").
        2. DATE HANDLING: `Order Date` and `Expected Delivery` are datetime objects. Use `.dt` accessor or comparison operators.
        3. OUTPUT: Return a JSON object. Do NOT include markdown formatting like ```json.
        
        JSON STRUCTURE:
        {{
            "type": "lookup" (for single order ID) OR "analysis" (for calculation/filtering),
            "order_id": "ORD-XXXX" (only if type is lookup, else null),
            "python_code": "..." (Valid pandas python code. Result MUST be assigned to variable `result`),
            "response_text": "..." (Natural language response. Use placeholder {{result}} for the data output)
        }}

        EXAMPLE - ANALYSIS:
        User: "Total amount for chemicals"
        Code: result = df[df['Order Type'] == 'Chemicals']['Total Amount'].sum()
        Response: "The total spend on Chemicals is ₹{{result}}."

        EXAMPLE - FILTERING:
        User: "List all cancelled orders"
        Code: result = df[df['Order Status'] == 'Cancelled'][['Order No', 'Total Amount']].to_dict('records')
        Response: "Here are the cancelled orders: {{result}}"
        """

        try:
            # Generate content
            response = self.model.generate_content(prompt)
            text_response = response.text.strip()
            
            # Sanitize JSON (remove markdown code blocks if model adds them)
            text_response = re.sub(r"```json\n?|```", "", text_response).strip()
            
            try:
                ai_plan = json.loads(text_response)
            except json.JSONDecodeError:
                # Fallback if JSON is malformed
                print(f"JSON Parse Error. Raw text: {text_response}")
                return {"response": "I understood your request but had trouble processing the data. Please try again.", "action": None}

            # Execution Logic
            final_response_text = ""
            action = None
            order_id_result = None

            # --- CASE 1: Single Order Lookup ---
            if ai_plan.get('type') == 'lookup' and ai_plan.get('order_id'):
                order_id = ai_plan['order_id']
                order_record = self.df[self.df['Order No'] == order_id]
                
                if not order_record.empty:
                    order_data = order_record.iloc[0].to_dict()
                    # Format dates
                    for k, v in order_data.items():
                        if isinstance(v, pd.Timestamp):
                            order_data[k] = v.strftime('%Y-%m-%d')
                    
                    final_response_text = f"Order {order_id} is currently **{order_data['Order Status']}**. Amount: ₹{order_data['Total Amount']:,}. Expected: {order_data['Expected Delivery']}."
                    action = "highlight_order"
                    order_id_result = order_id
                else:
                    final_response_text = f"I searched the database but could not find Order No: {order_id}."

            # --- CASE 2: Analysis / Aggregation / Filtering ---
            elif ai_plan.get('type') == 'analysis':
                code = ai_plan.get('python_code')
                template = ai_plan.get('response_text', "Result: {result}")
                
                # Safe execution environment
                local_vars = {'df': self.df, 'pd': pd}
                
                try:
                    # Execute generated code
                    exec(code, {}, local_vars)
                    result_obj = local_vars.get('result')
                    
                    # Format the Result Object for Natural Language
                    formatted_result = ""
                    
                    if isinstance(result_obj, (int, float)):
                        # Numbers (Sums, Counts)
                        formatted_result = f"{result_obj:,.2f}" if isinstance(result_obj, float) else f"{result_obj:,}"
                        
                    elif isinstance(result_obj, list):
                        # Lists (e.g. list of order IDs)
                        if not result_obj:
                            formatted_result = "None found"
                        elif isinstance(result_obj[0], dict): 
                            # List of dicts (complex rows)
                            formatted_result = "\n" + "\n".join([str(x) for x in result_obj[:5]]) # Limit to 5
                            if len(result_obj) > 5: formatted_result += f"\n...and {len(result_obj)-5} more."
                        else:
                            # List of strings/ints
                            formatted_result = ", ".join(str(x) for x in result_obj)
                            
                    elif isinstance(result_obj, pd.DataFrame) or isinstance(result_obj, pd.Series):
                        # If AI returns a raw dataframe
                        if result_obj.empty:
                            formatted_result = "No records found."
                        else:
                            # Convert to string or extract IDs
                            if 'Order No' in result_obj.values:
                                formatted_result = ", ".join(result_obj['Order No'].astype(str).tolist())
                            else:
                                formatted_result = str(result_obj.head().to_dict())

                    else:
                        formatted_result = str(result_obj)

                    final_response_text = template.replace('{result}', formatted_result)

                except Exception as exec_err:
                    print(f"Code Execution Error: {exec_err}")
                    print(f"Failed Code: {code}")
                    final_response_text = "I tried to calculate that, but I encountered a technical error with the calculation."

            else:
                final_response_text = "I'm not sure how to help with that. Try asking for an Order ID or a summary like 'Total orders'."

            # Update History
            self.chat_history.append(("User", user_query))
            self.chat_history.append(("AI", final_response_text))

            return {
                "response": final_response_text,
                "action": action,
                "order_id": order_id_result
            }

        except Exception as e:
            print(f"Critical Agent Error: {e}")
            traceback.print_exc()
            return {"response": "System error processing your request.", "action": None}
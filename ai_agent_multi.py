import re
import json
import pandas as pd
import google.generativeai as genai
from dotenv import load_dotenv
import os
from datetime import datetime
from utils import get_orders_df

# Load environment variables
load_dotenv()

# Configure API Key
API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=API_KEY)

class BaseAgent:
    def __init__(self, model_name='gemini-3-pro-preview'):
        self.model = genai.GenerativeModel(model_name)

    def generate_json(self, prompt):
        try:
            response = self.model.generate_content(prompt)
            text_response = response.text.strip()
            
            # Special case: If the response is ONLY a Python code block (for ExecutorAgent)
            if text_response.startswith('```python') and 'python_code' not in text_response:
                # Extract the code from the markdown block
                code_match = re.search(r'```python\n(.+?)\n```', text_response, re.DOTALL)
                if code_match:
                    code = code_match.group(1)
                    return {"python_code": code}
            
            # Robust JSON extraction
            # Look for the first '{' and the last '}'
            match = re.search(r"\{.*\}", text_response, re.DOTALL)
            if match:
                json_str = match.group(0)
                return json.loads(json_str)
            else:
                # Fallback: try cleaning markdown
                cleaned = re.sub(r"```json\n?|```", "", text_response).strip()
                if cleaned.startswith('{'):
                    return json.loads(cleaned)
                    
                # Last resort: If it's plain text (likely from ValidatorAgent), wrap it
                # This happens when the model returns a direct answer instead of JSON
                return {
                    "final_response": text_response,
                    "action": None,
                    "order_id": None
                }
                
        except Exception as e:
            print(f"JSON Generation Error: {e}")
            print(f"Raw Response: {response.text if 'response' in locals() else 'None'}")
            return None

class PlannerAgent(BaseAgent):
    def __init__(self, df):
        super().__init__()
        self.df = df
        self.data_summary = self._get_data_summary()

    def _get_data_summary(self):
        if self.df.empty: return "Dataframe is empty."
        summary = "Columns and Data Types:\n"
        for col in self.df.columns:
            summary += f"- {col} ({self.df[col].dtype})\n"
            if self.df[col].dtype == 'object':
                unique_vals = [x for x in self.df[col].unique().tolist() if str(x) != 'nan']
                if len(unique_vals) < 20:
                    summary += f"  Allowed Values: {unique_vals}\n"
                else:
                    summary += f"  Sample Values: {unique_vals[:5]}...\n"
        return summary

    def plan(self, user_query, chat_history):
        history_text = "\n".join([f"{role}: {text}" for role, text in chat_history[-3:]])
        current_date = datetime.now().strftime('%Y-%m-%d')
        
        prompt = f"""
        You are the PLANNER agent for an Order Tracking System.
        
        CURRENT DATE: {current_date}
        
        DATA SCHEMA:
        {self.data_summary}

        USER QUERY: "{user_query}"
        
        CHAT HISTORY:
        {history_text}

        GOAL: Analyze the query and create a step-by-step execution plan.

        INSTRUCTIONS:
        1. **CLASSIFY**: Determine if the query is:
           - `out_of_scope`: Greetings, jokes, weather, etc.
           - `clarification_needed`: Ambiguous query (e.g., "Show me the orders" without filters).
           - `data_query`: Valid query about orders.
        
        2. **PLANNING (for `data_query`)**:
           - Break down complex queries into logical steps.
           - **CRITICAL**: When filtering by category/product type, extract the EXACT name from the user query. For example: 'Chemical' -> 'Chemicals', 'Holography' -> 'Holography'. Cross-reference with the allowed values in DATA SCHEMA.
           - **CRITICAL**: If the user asks for a list/details, the final step MUST be to retrieve the data, not just count it.
           - **CRITICAL**: If the user asks for "overdue" orders OR "due date passed" OR "payment pending", you MUST check `Order Status == 'Delivered'` AND `Payment Due Date < Today`.
           - **DERIVED METRICS**: "Balance" = 'Total Amount' - 'Advance Amount'. If user asks for balance, include a step to calculate it.
        
        OUTPUT JSON FORMAT:
        {{
            "type": "out_of_scope" | "clarification_needed" | "data_query",
            "response_text": "..." (Only for out_of_scope or clarification_needed),
            "plan": [
                {{
                    "step_id": 1,
                    "description": "Filter orders by...",
                    "expected_output": "dataframe" | "number" | "list"
                }},
                ...
            ]
        }}
        """
        return self.generate_json(prompt)

class ExecutorAgent(BaseAgent):
    def __init__(self, df):
        super().__init__()
        self.df = df

    def execute_step(self, step, context):
        # Context contains results from previous steps
        context_summary = ""
        for k, v in context.items():
            context_summary += f"Step {k} Result Type: {type(v)}\n"
        
        current_date = datetime.now().strftime('%Y-%m-%d')

        prompt = f"""
        You are the EXECUTOR agent. Write Python code to execute a single step of a data analysis plan.
        
        CURRENT DATE: {current_date} (Use pd.Timestamp('{current_date}') for date comparisons)
        
        DATAFRAME VARIABLE: `df`
        DATAFRAME COLUMNS: {list(self.df.columns)}
        
        CURRENT STEP:
        {json.dumps(step)}
        
        CONTEXT FROM PREVIOUS STEPS:
        {context_summary}
        
        INSTRUCTIONS:
        1. Write valid Python code to perform the step.
        2. Store the result in a variable named `result`.
        3. Use `pd.to_datetime` for date comparisons.
        4. Handle case sensitivity (e.g., `str.lower()`).
        5. **CRITICAL**: For "overdue" / "due date passed" logic: Use the CURRENT DATE provided above, NOT pd.Timestamp.now(). Example: `df[(df['Order Status'] == 'Delivered') & (pd.to_datetime(df['Payment Due Date']) < pd.Timestamp('{current_date}'))]`
        6. **MAPPINGS**: "Category"->"Order Type", "Product"->"Item", "Unit Price"->"Unit Cost".
        7. **CALCULATIONS**: "Balance" = 'Total Amount' - 'Advance Amount'.
        8. **CONTEXT USAGE**: 
           - **INCORRECT**: `result = df[df['Col'] == 'Val']` (This ignores previous filters!)
           - **CORRECT**: `prev_df = context[1]; result = prev_df[prev_df['Col'] == 'Val']` (Always use the output of the previous step if it was a dataframe)
        9. **WARNING**: `df` is the ENTIRE dataset. Only use `df` if the step explicitly says "all orders" or "from the database". For "filtered orders", ALWAYS use `context`.
        10. **PANDAS BEST PRACTICE**: Always use `.copy()` when filtering DataFrames to avoid SettingWithCopyWarning. Use `.loc[]` for column assignments. Example: `result = df[df['Col'] == 'Val'].copy()` then `result.loc[:, 'NewCol'] = ...`
        
        OUTPUT JSON:
        {{
            "python_code": "..."
        }}
        """
        plan = self.generate_json(prompt)
        if not plan or 'python_code' not in plan:
            return None, "Failed to generate code"

        code = plan['python_code']
        local_vars = {'df': self.df, 'pd': pd, 'context': context}
        
        try:
            exec(code, {}, local_vars)
            return local_vars.get('result'), None
        except Exception as e:
            # Attempt self-correction
            print(f"Execution Error: {e}. Retrying...")
            return self._retry_execution(step, context, code, str(e))

    def _retry_execution(self, step, context, failed_code, error_msg):
        prompt = f"""
        You are the EXECUTOR agent. Your previous Python code failed. Fix it.
        
        DATAFRAME COLUMNS: {list(self.df.columns)}
        
        STEP: {json.dumps(step)}
        
        FAILED CODE:
        {failed_code}
        
        ERROR:
        {error_msg}
        
        INSTRUCTIONS:
        1. Analyze the error (e.g., KeyError means wrong column name).
        2. Use the provided column names to fix the code.
        3. Common Mappings: "Category" -> "Order Type", "Product" -> "Item", "Unit Price" -> "Unit Cost".
        
        OUTPUT JSON:
        {{
            "python_code": "..."
        }}
        """
        plan = self.generate_json(prompt)
        if not plan or 'python_code' not in plan:
            return None, f"Retry failed: {error_msg}"

        code = plan['python_code']
        local_vars = {'df': self.df, 'pd': pd, 'context': context}
        
        try:
            exec(code, {}, local_vars)
            return local_vars.get('result'), None
        except Exception as e:
            return None, f"Retry failed again: {e}"

class ValidatorAgent(BaseAgent):
    def validate(self, user_query, plan, execution_results):
        # Convert results to string summaries for the LLM
        results_summary = {}
        for step_id, res in execution_results.items():
            if isinstance(res, pd.DataFrame):
                results_summary[step_id] = f"DataFrame with {len(res)} rows. Columns: {list(res.columns)}"
                if not res.empty:
                    # Show up to 20 rows to avoid truncating small result sets
                    results_summary[step_id] += f"\nSample: {res.head(20).to_dict('records')}"
            elif isinstance(res, list):
                results_summary[step_id] = f"List with {len(res)} items: {res[:5]}..."
            else:
                results_summary[step_id] = str(res)

        prompt = f"""
        You are the VALIDATOR agent. Synthesize the final answer based on the plan execution.
        
        USER QUERY: "{user_query}"
        
        PLAN & RESULTS:
        {json.dumps(results_summary, indent=2)}
        
        INSTRUCTIONS:
        1. Answer the user's question clearly and concisely.
        2. **HALLUCINATION CHECK**: If the result is empty (e.g., 0 orders found), explicitly say so. Do NOT make up data.
        3. If the user asked for a list, format it as a markdown table.
        4. If the user asked for a count, provide the number.
        5. If the logic seems wrong (e.g., negative counts), apologize and state the error.
        6. **FORMATTING**: All monetary values MUST be formatted with '₹' and use Indian numbering (e.g. ₹1,50,000). For large text summaries, use 'Lakhs' or 'Crores'.
        
        OUTPUT JSON:
        {{
            "final_response": "...",
            "action": "highlight_order" | null,
            "order_id": "ORD-..." | null
        }}
        """
        return self.generate_json(prompt)

class MultiAgentOrchestrator:
    def __init__(self, data_path):
        self.data_path = data_path
        self.df = get_orders_df()
        self.planner = PlannerAgent(self.df)
        self.executor = ExecutorAgent(self.df)
        self.validator = ValidatorAgent()
        self.chat_history = []

    def process_query(self, user_query, progress_callback=None):
        if self.df.empty:
            self.df = get_orders_df()

        # 1. PLAN
        if progress_callback:
            progress_callback({"stage": "planning", "message": "Analyzing your question..."})
        
        plan_result = self.planner.plan(user_query, self.chat_history)
        
        if not plan_result:
            return {"response": "I'm having trouble understanding. Could you rephrase?", "action": None}

        if plan_result['type'] in ['out_of_scope', 'clarification_needed']:
            response = plan_result.get('response_text', "Could you clarify?")
            self.chat_history.append(("User", user_query))
            self.chat_history.append(("AI", response))
            return {"response": response, "action": None}

        # 2. EXECUTE
        context = {}
        execution_log = []
        total_steps = len(plan_result.get('plan', []))
        
        for idx, step in enumerate(plan_result.get('plan', []), 1):
            if progress_callback:
                progress_callback({
                    "stage": "executing", 
                    "message": f"Executing Step {idx} of {total_steps}...",
                    "step": idx,
                    "total_steps": total_steps
                })
            
            result, error = self.executor.execute_step(step, context)
            if error:
                print(f"Step {step['step_id']} failed: {error}")
                break
            context[step['step_id']] = result
            execution_log.append(f"Step {step['step_id']}: Success")

        # 3. VALIDATE & SYNTHESIZE
        if progress_callback:
            progress_callback({"stage": "validating", "message": "Generating final answer..."})
        
        final_result = self.validator.validate(user_query, plan_result['plan'], context)
        
        if not final_result:
             return {"response": "I processed the data but couldn't generate a summary. Please try again.", "action": None}

        response_text = final_result.get('final_response', "Here is the data.")
        action = final_result.get('action')
        order_id = final_result.get('order_id')

        self.chat_history.append(("User", user_query))
        self.chat_history.append(("AI", response_text))

        return {
            "response": response_text,
            "action": action,
            "order_id": order_id,
            "thinking": f"Plan: {json.dumps(plan_result['plan'])}\nLog: {execution_log}"
        }

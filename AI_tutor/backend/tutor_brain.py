import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# --- SMART SYSTEM INSTRUCTION ---
SYSTEM_INSTRUCTION = """
You are an adaptive AI Visual Tutor.
You output a JSON SCRIPT for a whiteboard animation.

**RULES FOR IMAGES (STRICT):**
1.  **WHEN TO GENERATE:** Only generate an "image" step if you are describing a physical object, anatomy, diagram, or geometry.
2.  **WHEN NOT TO GENERATE:** Do NOT use images for definitions, history, or abstract math.
3.  **PERSISTENCE:** Once you show an image, it stays on the screen.
4.  **PROMPTS:** Keep image prompts under 5 words for web search efficiency.

**RULES FOR SPEED:**
- If the user says "faster", "hurry up", or "quick", set "speaking_pace" to "fast".
- If the user says "slower", "explain slowly", set "speaking_pace" to "slow".
- Otherwise, set "speaking_pace" to "normal".

**OUTPUT FORMAT (JSON ONLY):**
{
  "topic": "Topic Name",
  "speaking_pace": "normal",  // OPTIONS: "slow", "normal", "fast"
  "steps": [
    {
      "audio": "Explanation script...",
      "visual_type": "image" OR "text" OR "math",
      "content": "content_here", 
      "action": "show" OR "write"
    }
  ]
}
"""

def generate_lesson_plan(user_query: str):
    """
    Generates a full lesson plan from scratch based on a user query.
    """
    full_prompt = f"{SYSTEM_INSTRUCTION}\n\nUSER REQUEST: {user_query}\n\nGENERATE JSON:"
    return _call_ai(full_prompt)

def adjust_lesson_plan(current_topic: str, feedback: str):
    """
    Rewrites the lesson mid-stream based on user feedback.
    Optimized for speed by generating fewer steps.
    """
    prompt = f"""
    {SYSTEM_INSTRUCTION}
    
    CONTEXT: You were explaining "{current_topic}".
    INTERRUPTION: The user said: "{feedback}".
    
    TASK:
    1. Acknowledge the feedback briefly (e.g. "Okay, let's speed up!").
    2. Adjust the "speaking_pace" variable based on the feedback.
    3. Continue the lesson BUT generate ONLY THE NEXT 3-4 KEY STEPS to ensure a fast response.
    4. Strictly apply the user's feedback (Speed/Simplicity).
    
    GENERATE JSON:
    """
    return _call_ai(prompt)

def _call_ai(prompt):
    """
    Helper function to call Gemini and robustly extract JSON.
    """
    try:
        # Use the Flash model for lowest latency
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        response = model.generate_content(prompt)
        text = response.text
        
        # Robust JSON Extraction: Find the outer brackets
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            json_str = text[start_idx : end_idx + 1]
            return json.loads(json_str)
        else:
            print(f"DEBUG - Invalid JSON received: {text}")
            raise ValueError("No JSON found in AI response")
            
    except Exception as e:
        print(f"Brain Error: {e}")
        # Return a safe error lesson so the app doesn't crash
        return {
            "topic": "Error",
            "speaking_pace": "normal",
            "steps": [
                {
                    "audio": "I encountered a technical glitch. Please ask your question again.",
                    "visual_type": "text",
                    "content": "System Error - Try Again",
                    "action": "write"
                }
            ]
        }
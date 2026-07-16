import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
import urllib.parse
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Cogni-Learn API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            topic TEXT,
            blocks TEXT,
            questions TEXT,
            date TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

TEACH_SYSTEM = """You are Cogni-Learn, an elite AI tutor. 
CRITICAL RULE: EVERY single tag MUST be explicitly closed. Example: [POINT] text [/POINT]. Do NOT leave any tags open.
Separate what you write on the board from what you say out loud. Generate COMPLETE, COMPREHENSIVE classroom notes (aim for 6 to 12 points minimum per topic). Do not provide short, lazy summaries.

Use these exact tags on their OWN LINE:
[HEADING] Short Title [/HEADING]
[POINT] Write ONE short sentence containing a core fact, rule, or step. NEVER put equations or formulas here. [/POINT]
[EXPLAIN] Conversational, detailed spoken explanation for the preceding tag. NEVER put this text on the board. [/EXPLAIN]
[CODE] Write the exact programming syntax or code block here. [/CODE]
[MATH] Pure LaTeX equation ONLY. Format strictly as LaTeX (e.g., a^2 + b^2 = c^2). NEVER place math formulas inside [POINT] tags. [/MATH]
[IMAGE] A specific single-word or 2-word noun to fetch a general image [/IMAGE]
[DIAGRAM] A short keyword (e.g., 'right triangle', 'triangle', 'circuit', 'graph', 'circle') to procedurally draw a concept [/DIAGRAM]

--- ADAPTIVE PROTOCOL ---
1. For Math/Physics Concepts & Theorems: 
   - Expand deeply! Explain the concept, the formula, the variables, and provide a full example application.
   - IMMEDIATELY generate a [DIAGRAM] tag using a descriptive keyword (e.g., 'right triangle' for Pythagoras).
   - ALWAYS place formulas inside [MATH] tags, NEVER in [POINT] tags.
   - Example Structure: 
     [POINT] The theorem relates the three sides of a right-angled triangle. [/POINT]
     [EXPLAIN] ... [/EXPLAIN]
     [POINT] The standard formula is expressed as: [/POINT]
     [MATH] a^2 + b^2 = c^2 [/MATH]
     [EXPLAIN] ... [/EXPLAIN]
2. For Math Sums: Solve strictly step-by-step showing every intermediate calculation using [MATH] tags.
3. For Coding: Use [CODE] to show syntax, followed by [EXPLAIN].
4. For General: Use [IMAGE] after the heading, then detailed, continuous [POINT] and [EXPLAIN] pairs.
"""

class TeachRequest(BaseModel):
    topic: str

class InterruptRequest(BaseModel):
    topic: str
    history: List[Dict[str, str]]
    question: str

class HistoryItem(BaseModel):
    id: str
    topic: str
    blocks: List[Dict[str, Any]]
    questionsAsked: List[str]
    date: str

async def stream_groq(messages: List[Dict[str, str]], system: str):
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": True,
        "temperature": 0.6
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", GROQ_API_URL, headers=headers, json=payload) as response:
            if response.status_code != 200:
                yield f"data: {json.dumps({'error': f'API Error: {response.status_code}'})}\n\n"
                return
            
            async for chunk in response.aiter_lines():
                if chunk.startswith("data: ") and chunk != "data: [DONE]":
                    try:
                        data = json.loads(chunk[6:])
                        if "choices" in data and len(data["choices"]) > 0:
                            delta = data["choices"][0].get("delta", {})
                            if "content" in delta:
                                yield f"data: {json.dumps({'text': delta['content']})}\n\n"
                    except json.JSONDecodeError:
                        continue
            yield "data: [DONE]\n\n"

@app.post("/api/teach")
async def start_lesson(req: TeachRequest):
    messages = [{"role": "user", "content": f"Teach me comprehensively about: {req.topic}"}]
    return StreamingResponse(
        stream_groq(messages, TEACH_SYSTEM),
        media_type="text/event-stream"
    )

@app.post("/api/interrupt")
async def interrupt_lesson(req: InterruptRequest):
    system_reminder = TEACH_SYSTEM + f"""
\nCRITICAL RULES FOR RESUMING:
1. EXTREMELY SHORT DOUBT RESOLUTION: Explain their specific doubt in 1 or 2 brief sentences maximum using the [EXPLAIN] tag.
2. EXPLICIT VISUALS/CODE: If the user explicitly asked for a diagram, image, or code, output the respective tag immediately.
3. RESUME MAIN TOPIC: Immediately after answering the doubt, seamlessly return to the exact point of the main topic you were explaining using the proper tags.
4. DO NOT write their question on the chalkboard. Keep the board clean.
5. DO NOT RESTART THE LESSON FROM THE BEGINNING.
"""
    messages = req.history + [
        {"role": "system", "content": system_reminder},
        {"role": "user", "content": f"Student feedback/interruption: {req.question}"}
    ]
    return StreamingResponse(
        stream_groq(messages, system_reminder),
        media_type="text/event-stream"
    )

@app.get("/api/image")
async def get_image(q: str):
    try:
        headers = {"User-Agent": "CogniLearnTutor/1.0"}
        search_url = f"https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(q)}&gsrlimit=1&prop=pageimages&piprop=original&format=json"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(search_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                pages = data.get("query", {}).get("pages", {})
                if pages:
                    page = list(pages.values())[0]
                    img_url = page.get("original", {}).get("source")
                    if img_url:
                        return RedirectResponse(url=img_url)
    except Exception:
        pass
    
    fallback_text = urllib.parse.quote(q)
    return RedirectResponse(url=f"https://placehold.co/800x600/131314/ffe699?text={fallback_text}")

@app.post("/api/history")
async def save_history(item: HistoryItem):
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO history (id, topic, blocks, questions, date) VALUES (?, ?, ?, ?, ?)",
              (item.id, item.topic, json.dumps(item.blocks), json.dumps(item.questionsAsked), item.date))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/history")
async def get_history():
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, topic, blocks, questions, date FROM history ORDER BY date DESC")
    rows = c.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        result.append({
            "id": r[0],
            "topic": r[1],
            "blocks": json.loads(r[2]),
            "questionsAsked": json.loads(r[3]),
            "date": r[4]
        })
    return result
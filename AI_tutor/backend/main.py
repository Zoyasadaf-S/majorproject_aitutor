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

TEACH_SYSTEM = """You are Cogni-Learn, an elite, highly interactive AI teacher capable of teaching ANY subject perfectly.
CRITICAL RULE: EVERY single tag MUST be explicitly closed. Example: [POINT] text [/POINT]. Do NOT leave any tags open.
You must strictly separate what is written on the chalkboard from what is spoken out loud.

Use these exact tags on their OWN LINE:
[HEADING] Main Topic, Sub-topic, or Specific Law/Theorem Name [/HEADING]
[POINT] Write ONE clear, concise bullet point (maximum 2 sentences) for the chalkboard. [/POINT]
[EXPLAIN] Speak directly to the student like a real teacher. Explain the preceding tag. NEVER put this text on the board. [/EXPLAIN]
[CODE] Exact programming syntax, snippets, or code blocks here. [/CODE]
[MATH] Pure LaTeX equation ONLY (e.g., F = ma). NEVER place math formulas inside [POINT] tags. [/MATH]
[IMAGE] A specific 1-2 word noun to fetch a relevant visual aid. [/IMAGE]
[DIAGRAM] Use EXACTLY one of these keywords ONLY: 'force block', 'right triangle', 'triangle', 'circuit', 'graph', 'circle'. [/DIAGRAM]
[QUESTION] Ask the student a direct, thought-provoking question to check their understanding. Stop the explanation here. [/QUESTION]
[WARNING] Highlight a common student mistake or misconception. [/WARNING]
[SUMMARY] Provide a brief wrap-up of the core concepts learned. [/SUMMARY]
[HOMEWORK] Assign a quick practice task or thing to think about. [/HOMEWORK]

--- UNIVERSAL TEACHING ALGORITHM ---
No matter what subject the user asks for, you MUST adapt and follow this strict interactive flow:

1. VISUAL INTRODUCTION:
   - Always start with a clear, descriptive [HEADING].
   - Follow with a relevant [DIAGRAM] or [IMAGE].

2. CORE CONCEPT BREAKDOWN & MANDATORY EQUATIONS:
   - Teach using a logical sequence of [POINT] and [EXPLAIN] pairs.
   - For Math/Physics/Science, use [MATH]. Every [MATH] tag MUST be immediately followed by an [EXPLAIN] tag that verbally defines EVERY variable (e.g., "In this formula, F represents force...").

3. INTERACTIVE PAUSE:
   - After explaining the main concept, you MUST ask the student a question using [QUESTION] followed by an [EXPLAIN] verbalizing the question.

4. CONCLUSION:
   - Use [WARNING] to clarify common mistakes.
   - Use [SUMMARY] to recap.
   - End the lesson with [HOMEWORK].
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
1. EXTREMELY SHORT DOUBT RESOLUTION: Evaluate their answer or explain their specific doubt in 1 or 2 brief sentences using the [EXPLAIN] tag.
2. RESUME MAIN TOPIC: Immediately after answering the doubt, seamlessly return to the next point of the main topic.
3. DO NOT write their question on the chalkboard. Keep the board clean.
"""
    messages = req.history + [
        {"role": "system", "content": system_reminder},
        {"role": "user", "content": f"Student response/doubt: {req.question}"}
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

@app.delete("/api/history/{item_id}")
async def delete_history(item_id: str):
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("DELETE FROM history WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}
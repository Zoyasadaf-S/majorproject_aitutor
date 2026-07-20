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
UNSPLASH_API_KEY = os.getenv("UNSPLASH_API_KEY")

TEACH_SYSTEM = """
You are Cogni-Learn.
You are NOT an AI chatbot.
You are an experienced classroom teacher with 25+ years of teaching experience.
Your job is to make the student truly understand the topic, not simply provide information.
The student should feel as if a real teacher is standing in front of a smart board.
======================================================
GENERAL BEHAVIOUR
======================================================
• Teach naturally.
• Speak like a friendly teacher.
• Never sound robotic.
• Never dump textbook paragraphs.
• Keep topics brief.
• Extensively use MORE [POINT] tags to list key facts instead of long texts.
• Explain one idea at a time.
• Keep the student curious.
• Encourage thinking.
• Adapt explanations according to the subject.
Always think before deciding
Should I
• explain?
• draw?
• show an image?
• show an equation?
• show code?
Choose whichever teaches the concept best.
======================================================
TEACHING STYLE
======================================================
Teach exactly like this.
1.
Introduce the topic naturally.
2.
Build intuition first.
3.
Then explain the formal definition.
4.
Use a real-world example.
5.
If suitable,
show an image or diagram.
6
Check understanding.
7.
Continue.
Never explain too many ideas at once.
Each explanation should take roughly 20–40 seconds.
If the topic is very large,
split it into multiple mini-lessons.
======================================================
BOARD VS SPEECH
======================================================
Everything written on the board must be concise.
Everything spoken should be detailed.
Never put long explanations on the board.
=====================================================
OUTPUT TAGS
======================================================
Every tag MUST be closed.
Use ONLY these tags.
[HEADING][/HEADING]
[POINT][/POINT]
[EXPLAIN][/EXPLAIN]
[IMAGE][/IMAGE]
[DIAGRAM][/DIAGRAM]
[MATH][/MATH]
[CODE][/CODE]
[QUESTION][/QUESTION]
[WARNING][/WARNING]
[SUMMARY][/SUMMARY]
[HOMEWORK][/HOMEWORK]
======================================================
HEADING
======================================================
Use for
Topic
Subtopic
Law
Theorem
Definition
Only one heading at a time.
======================================================
POINT
======================================================
Maximum
2 short sentences.
No equations.
No code.
No long paragraphs.
Use this heavily to outline facts briefly.
======================================================
EXPLAIN
======================================================
Speak like a real teacher.
Use
examples
analogies
daily-life situations
simple language.
Do NOT simply repeat the POINT.
Instead expand it naturally.
======================================================
VISUAL AIDS
======================================================
Before producing any visual aid, ALWAYS think:

Can this concept be DRAWN?

If YES:
Output a [DIAGRAM] tag.

If NO:
Output an [IMAGE] tag.

Never output both for the same concept.
======================================================
WHEN TO USE DIAGRAM
======================================================
[DIAGRAM] may ONLY contain ONE of these exact values:
force_block
right_triangle
triangle
graph
circle
circuit

If the concept cannot be represented by one of these,
DO NOT use DIAGRAM.
Use IMAGE instead.
======================================================
WHEN TO USE IMAGE
======================================================
Use IMAGE only for real-world objects.

Examples
People
Animals
Plants
Organs
Cells
Countries
Maps
Machines
Planets
Historical monuments
Historical leaders
Historical events
Microscope images
Laboratory apparatus
Chemical compounds
Earth layers
Solar System
======================================================
IMAGE SEARCH RULES
======================================================
CRITICAL
The text inside IMAGE must be the EXACT title that would appear on Wikipedia.

GOOD
[IMAGE]Human heart[/IMAGE]
[IMAGE]Animal cell[/IMAGE]
[IMAGE]Photosynthesis[/IMAGE]
[IMAGE]Solar System[/IMAGE]
[IMAGE]Mahatma Gandhi[/IMAGE]
[IMAGE]World War II[/IMAGE]
[IMAGE]Mount Everest[/IMAGE]
[IMAGE]Red Fort[/IMAGE]

BAD
[IMAGE]heart[/IMAGE]
[IMAGE]cell[/IMAGE]
[IMAGE]war[/IMAGE]
[IMAGE]plant[/IMAGE]
[IMAGE]mountain[/IMAGE]

Never use ambiguous words.
Never write full sentences.
Never exceed THREE words unless it is an official name.
Always generate the most specific educational keyword possible.
======================================================
MATHEMATICS
======================================================
Never output plain text equations.
Always output proper LaTeX.
CRITICAL: Put ONLY the raw LaTeX equation inside the [MATH] tag. Do NOT include $$, $ or any explanatory English text inside the tag.
Correct:
[MATH]a^{2}+b^{2}=c^{2}[/MATH]
Wrong:
[MATH]$$a^{2}+b^{2}=c^{2}$$ where a is...[/MATH]
Explanations of variables must be placed in a separate [POINT] or [EXPLAIN] tag AFTER the equation.
Never assume the student knows the variables.
======================================================
PHYSICS
=====================================================
If a diagram is required,
draw it.
Examples
Free body diagram
Projectile
Circuit
Wave
Ray diagram
Graph
Vectors
======================================================
PROGRAMMING
======================================================
Code should be short.
Explain line-by-line.
Never dump large code.
======================================================
QUESTIONING
======================================================
Every few concepts,
ask one meaningful question.
The question should make the student think.
Wait for the student's answer.
======================================================
INTERRUPTIONS
======================================================
The student may interrupt at any time.
When interrupted
Immediately stop the lesson.
Answer only the student's question.
Then continue exactly where the lesson stopped.
Never restart.
Never repeat previous explanations.
======================================================
SUMMARY
======================================================
Keep summaries short.
Maximum 4 bullet points.
======================================================
HOMEWORK
====================================================
Assign one small exercise.
Not a full worksheet.
======================================================
IMPORTANT
Choose the teaching method dynamically.
Sometimes
Image
Sometimes
Diagram
Sometimes
Equation
Sometimes
Animation
Sometimes
Code
Whatever helps the student understand best.
Your goal is not to finish the syllabus.
Your goal is to make the student understand.
Act exactly like an experienced human teacher.
"""

SUBJECT_PROMPTS = {
    "General": TEACH_SYSTEM,
    "Mathematics": TEACH_SYSTEM + "\n\n[SUBJECT OVERRIDE: MATHEMATICS]\nNever fetch Unsplash images. Heavily prioritize KaTeX [MATH] tags and [DIAGRAM] tags for geometry/graphs. Focus on step-by-step problem solving. Keep topics extremely brief with multiple [POINT] tags.",
    "Physics": TEACH_SYSTEM + "\n\n[SUBJECT OVERRIDE: PHYSICS]\nPrioritize [DIAGRAM] tags for free body diagrams, circuits, and vectors. Use KaTeX [MATH] for derivations and formulas. Keep topics extremely brief with multiple [POINT] tags.",
    "Computer Science": TEACH_SYSTEM + """\n\n[SUBJECT OVERRIDE: COMPUTER SCIENCE]
Use DIAGRAM whenever possible.
Flowchart
Binary Tree
Stack
Queue
Linked List
Network Topology
OSI Model
CPU Architecture

Only use IMAGE for
Motherboard
Hard Disk
CPU Chip
RAM Module
Computer Monitor
""",
    "Biology": TEACH_SYSTEM + """\n\n[SUBJECT OVERRIDE: BIOLOGY]
Biology requires educational visuals.
Always use IMAGE tags for
Human organs
Plant organs
Cells
Bacteria
Viruses
Animals
Plants
Body systems

Never use artistic photographs.
Always generate Wikipedia page titles.

Examples
Human heart
Animal cell
Neuron
DNA
Human brain
Kidney
Liver
Photosynthesis
Cell membrane
Mitochondrion
""",
    "Chemistry": TEACH_SYSTEM + "\n\n[SUBJECT OVERRIDE: CHEMISTRY]\nPrioritize [MATH] for chemical equations. Use [DIAGRAM] for molecular structures and [IMAGE] for laboratory apparatus. Keep topics extremely brief with multiple [POINT] tags.",
    "Social Science": TEACH_SYSTEM + """\n\n[SUBJECT OVERRIDE: SOCIAL SCIENCE]
Always generate Wikipedia titles.

Examples
French Revolution
Quit India Movement
Ashoka
Harappa
Indian Constitution
Red Fort
Mughal Empire
Indian Parliament

Never use generic terms like
war
king
fort
movement
country

Always use exact historical names.
"""
}

class TeachRequest(BaseModel):
    topic: str
    subject: str

class InterruptRequest(BaseModel):
    topic: str
    history: List[Dict[str, str]]
    question: str
    subject: str

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
        "temperature": 0.5
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
    system_prompt = SUBJECT_PROMPTS.get(req.subject, SUBJECT_PROMPTS["General"])
    messages = [{"role": "user", "content": f"Teach me comprehensively about: {req.topic}"}]
    return StreamingResponse(
        stream_groq(messages, system_prompt),
        media_type="text/event-stream"
    )

@app.post("/api/interrupt")
async def interrupt_lesson(req: InterruptRequest):
    base_system = SUBJECT_PROMPTS.get(req.subject, SUBJECT_PROMPTS["General"])
    
    system_reminder = base_system + """
\nCRITICAL RULES FOR RESUMING AFTER AN INTERRUPTION:
1. CRITICAL: Every interruption response MUST begin with:
   [EXPLAIN]
   ...
   [/EXPLAIN]
   Never answer using only POINT.
   Never answer using only IMAGE.
   Never answer using only MATH.
   Every answer MUST contain at least one EXPLAIN tag.
2. Maximum 2 explain blocks.
3. After answering continue exactly where you stopped.
4. Never restart the lesson.
5. Do not write the user's doubt onto the chalkboard.
"""
    
    recent_history = req.history[-5:] if len(req.history) > 5 else req.history
    
    messages = recent_history + [
        {
            "role": "user", 
            "content": f"Current topic: {req.topic}\nStudent asks: {req.question}\nAnswer ONLY this question.\nMaximum 2 explain blocks.\nAfter answering continue exactly where you stopped.\nNever restart the lesson."
        }
    ]
    
    return StreamingResponse(
        stream_groq(messages, system_reminder),
        media_type="text/event-stream"
    )

@app.get("/api/image")
async def get_image(q: str):
    q = q.strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action":"query",
                    "titles":q,
                    "prop":"pageimages",
                    "pithumbsize":900,
                    "format":"json"
                }
            )
            if search.status_code == 200:
                pages = search.json()["query"]["pages"]
                page = next(iter(pages.values()))
                if "thumbnail" in page:
                    return RedirectResponse(
                        page["thumbnail"]["source"]
                    )
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action":"query",
                    "generator":"search",
                    "gsrsearch":q,
                    "gsrlimit":1,
                    "prop":"pageimages",
                    "pithumbsize":900,
                    "format":"json"
                }
            )
            if search.status_code == 200:
                pages = search.json()["query"]["pages"]
                page = next(iter(pages.values()))
                if "thumbnail" in page:
                    return RedirectResponse(
                        page["thumbnail"]["source"]
                    )
    except Exception:
        pass

    return RedirectResponse(
        f"https://placehold.co/900x600/0b2e1b/ffe699?text={urllib.parse.quote(q)}"
    )

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
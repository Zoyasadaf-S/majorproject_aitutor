import sqlite3
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import urllib.parse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import json
import os
import re
import uuid
import edge_tts
from fastapi.responses import FileResponse
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

# ── Static files ──────────────────────────────────────────────────────────────
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Database ──────────────────────────────────────────────────────────────────
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
    c.execute('''
        CREATE TABLE IF NOT EXISTS practice_progress (
            id TEXT PRIMARY KEY,
            topic TEXT,
            subject TEXT,
            score INTEGER,
            total INTEGER,
            date TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ── API Keys ──────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "openai/gpt-oss-20b"
UNSPLASH_API_KEY = os.getenv("UNSPLASH_API_KEY")

# ── TTS voice map (verified against installed edge-tts) ───────────────────────
# Format: ISO-639-1 language code → preferred female voice
LANGUAGE_VOICE_MAP: Dict[str, str] = {
    # Indian languages — all verified present
    "hi": "hi-IN-SwaraNeural",
    "bn": "bn-IN-TanishaaNeural",
    "kn": "kn-IN-SapnaNeural",
    "ml": "ml-IN-SobhanaNeural",
    "mr": "mr-IN-AarohiNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "gu": "gu-IN-DhwaniNeural",
    "ur": "ur-IN-GulNeural",
    # International languages — all verified present
    "en": "en-IN-NeerjaNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "ar": "ar-SA-ZariyahNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "pt": "pt-BR-FranciscaNeural",
    # Safe fallback
    "default": "en-IN-NeerjaNeural",
}

def pick_voice(language_code: str) -> str:
    """Pick the best available TTS voice for a given ISO-639-1 language code."""
    if not language_code:
        return LANGUAGE_VOICE_MAP["default"]
    code = language_code.strip().lower()[:2]
    return LANGUAGE_VOICE_MAP.get(code, LANGUAGE_VOICE_MAP["default"])

# ── Generic Teaching System Prompt ────────────────────────────────────────────
TEACH_SYSTEM = """
You are Cogni-Learn.
You are NOT an AI chatbot.
You are an experienced classroom teacher with 25+ years of teaching experience.
Your job is to make the student truly understand the topic, not simply provide information.
The student should feel as if a real teacher is standing in front of a smart board.

======================================================
LANGUAGE DETECTION (CRITICAL — FIRST RULE)
======================================================
• Detect the language the student used in their question.
• Your ENTIRE response MUST be in that same language.
• The very FIRST token you output MUST be: [LANG]{ISO-639-1 code}[/LANG]
  Examples: [LANG]en[/LANG]  [LANG]hi[/LANG]  [LANG]kn[/LANG]  [LANG]te[/LANG]
• Use the standard ISO-639-1 two-letter code (en, hi, kn, te, ta, ml, bn, mr, fr, etc.)
• If the student mixes languages (e.g. Hinglish), use the dominant language code.
• If the student changes language mid-lesson during an interruption, switch your response
  language to match the interruption language, while preserving all lesson context.
• NEVER render [LANG] tags visibly — they are internal machine-readable tags only.
• Apply this rule to ALL content: headings, points, explanations, summaries, questions.

======================================================
SUBJECT COVERAGE & MANDATORY CONTENT COMPLETENESS
======================================================
• You MUST infer the subject from the student's question automatically.
• Applies to ALL academic and general subjects:
  Geography, History, General Knowledge, Biology, Physics, Chemistry, Mathematics,
  Social Science, Civics, Economics, Computer Science, Literature, Engineering, etc.

CRITICAL RULE FOR ALL SUBJECTS (NON-STEM, GEOGRAPHY, GENERAL, HISTORY, ETC.):
• NEVER output only a [HEADING] tag.
• NEVER output only an [IMAGE] or [DIAGRAM] without accompanying text explanations.
• Images and diagrams are SUPPORTING MATERIAL ONLY — they must NEVER replace text explanations.
• Every response for EVERY subject MUST contain a complete explanation payload:
  1. [HEADING] for the section title.
  2. At least 3 to 5 [POINT] tags providing key bullet facts.
  3. At least one substantial [EXPLAIN] block (6–10 detailed sentences).

======================================================
GENERAL BEHAVIOUR
======================================================
• Teach naturally, like a friendly classroom teacher.
• Never sound robotic. Never dump textbook paragraphs.
• Keep explanations clear, structured, comprehensive, and exam-useful.
• Prefer clarity, depth, and precision over extreme brevity.
• Use [POINT] tags heavily to list key facts as concise bullet points.
• Explain one idea at a time.
• Keep the student curious. Encourage thinking.
• Adapt based on subject context — be dynamic, not formulaic.

======================================================
EXPLANATION QUALITY & LENGTH (CRITICAL FOR [EXPLAIN])
======================================================
• Short 1-2 sentence explanations are STRICTLY FORBIDDEN.
• Explanations must be thorough, substantial, and clear. Target a total spoken TTS reading duration of roughly 2.5 to 3.5 minutes (approx. 300 to 450 words spread across 6 to 10 well-crafted sentences).
• Maintain clear, easy-to-understand language — neither overly technical/academic nor overly childish.
• Every complete [EXPLAIN] block MUST thoroughly integrate all four of these components:
  1. Clear Definition: Explain what the concept is in clear, direct language.
  2. Core Significance / Why it matters: Detail why this concept occurs, why it is important, and how it connects to the real world or exams.
  3. Simple Analogy or Real-World Example: Provide a relatable, step-by-step everyday scenario or comparison to make the concept intuitive.
  4. Key Takeaway: Provide a strong, memorable summary anchor that fixes the intuition firmly in the student's mind.
• Keep it structured and accessible. Avoid dense, unbroken textbook blocks.

======================================================
EXAM-ORIENTED OUTPUT (PRIMARY PURPOSE)
======================================================
• Every answer must help a student understand AND remember for an exam.
• Use enough bullet points to cover the concept adequately.
• Avoid: short surface-level answers, huge unreadable essays, repetition, filler.
• Structure: introduce → key points → detailed 6-10 sentence explanation → real-world example → visual aid if applicable.
• Substantial length overall. Allow enough sentences so the student truly grasps the idea.

======================================================
TEACHING STYLE
======================================================
1. Introduce the topic naturally.
2. Build intuition first — what is it, why does it matter?
3. Explain the formal definition / rule / formula.
4. Give a real-world example or analogy.
5. Show a diagram or image ONLY if it directly matches the topic and adds genuine educational value.
6. Continue.

Never explain too many ideas at once.
If the topic is large, split into mini-lessons.

======================================================
VISUAL AIDS — TWO CATEGORIES & STRICT DIAGRAM RULES
======================================================

A) [DIAGRAM] — Canvas-drawn educational diagrams.
   CRITICAL DIAGRAM ACCURACY RULE:
   You MUST ONLY emit a [DIAGRAM] tag when the concept DIRECTLY and EXACTLY matches one of the canvas diagram types below. NEVER guess or force a diagram tag for an unrelated topic.

   Supported [DIAGRAM] values and strict concept matching matrix:
   • force_block    : Physics mechanics, forces, friction, gravity, tension, mass on surface, Newton's laws.
   • ray_diagram    : Light, optics, reflection, refraction, lenses (convex/concave), mirrors, principal axis.
   • circuit        : Electricity, electric circuits, voltage, current, resistors, Ohm's law, series/parallel.
   • flow_diagram   : Sequential processes, algorithms, logic workflows, decision trees, lifecycle steps.
   • osi_layers     : Computer networking, OSI 7-layer model, network protocol stacks, TCP/IP layers.
   • water_cycle    : Environmental science, hydrology, water cycle (evaporation, condensation, precipitation, runoff).
   • graph          : Mathematical plots, coordinate geometry, functions, algebraic curves, y=f(x).
   • circle         : Geometry of circles, radius, diameter, area, circumference, circular motion.
   • triangle / right_triangle : Trigonometry, geometric triangles, right-angled triangles, Pythagorean theorem.
   • bar_chart      : Statistics, data comparison, categorical distributions.

   IF THE CONCEPT DOES NOT EXACTLY FIT ONE OF THESE TYPES, DO NOT USE A [DIAGRAM] TAG.

B) [IMAGE] — Real-world / reference images fetched from web search.
   Use when a real photograph, map, anatomy diagram, historical visual, or domain schematic helps.
   Use [IMAGE] instead of [DIAGRAM] for topics without an exact canvas diagram type (e.g. human heart anatomy, historical events, plant cell structures, chemical apparatus, geography maps, database ER diagrams).

   CRITICAL: Inside [IMAGE] tags, put ONLY a short factual educational search query (3–7 words). NOT an AI generation prompt. NOT the raw student question.

   Examples:
     [IMAGE]French Revolution storming Bastille historical[/IMAGE]
     [IMAGE]human heart anatomy labeled diagram[/IMAGE]
     [IMAGE]Harappan civilization Mohenjo-daro artifacts[/IMAGE]
     [IMAGE]layers of atmosphere Earth[/IMAGE]
     [IMAGE]graphite crystal structure layers[/IMAGE]

Only use [IMAGE] when it adds genuine educational value.
Do NOT use [IMAGE] for abstract concepts, definitions, math, or code.
DO NOT use both [IMAGE] and [DIAGRAM] in the same response unless each serves a distinct purpose.
DO NOT replace educational diagrams with random photographs.

======================================================
OUTPUT TAGS
======================================================
Every tag MUST be opened and closed. Use ONLY these tags:

[LANG][/LANG]       — Language code. ALWAYS first. NEVER rendered to student.
[HEADING][/HEADING] — Topic, subtopic, law, theorem, definition.
[POINT][/POINT]     — One bullet fact. Max 2 short sentences. No equations or code.
[EXPLAIN][/EXPLAIN] — Spoken explanation (6-10 sentences, ~2.5-3.5 mins spoken, with definition, significance, analogy, takeaway). No LaTeX. No shorthand units. Plain spoken language.
[IMAGE][/IMAGE]     — Educational search query for a real-world image.
[DIAGRAM][/DIAGRAM] — Diagram type keyword (MUST match valid diagram types strictly).
[MATH][/MATH]       — Raw LaTeX only. No $$, no explanations inside.
[CODE][/CODE]       — Short code snippet. Explain line-by-line.
[WARNING][/WARNING] — Important caution or common mistake.
[SUMMARY][/SUMMARY] — Max 4 bullet points recap.

======================================================
MATH RULES
======================================================
• Always use proper LaTeX inside [MATH] tags.
• CRITICAL: Put ONLY the raw LaTeX inside [MATH]. No $$, no text, no variables explained inside.
  Correct: [MATH]a^{2}+b^{2}=c^{2}[/MATH]
  Wrong: [MATH]$$a^{2}+b^{2}=c^{2}$$ where a is...[/MATH]
• Explain variables in a separate [POINT] or [EXPLAIN] AFTER the equation.

======================================================
SPEECH / TTS RULE (CRITICAL)
======================================================
• [EXPLAIN] is spoken aloud via Text-to-Speech.
• NEVER put LaTeX, raw math symbols, or shorthand units inside [EXPLAIN].
• Write numbers and formulas in full spoken words:
  "two centimeters per second squared" not "2 cm/s²"
  "equals" not "="
• Keep [MATH] strictly for the visual chalkboard equation display.

======================================================
INTERRUPTIONS — ADAPTIVE TEACHER BEHAVIOUR
======================================================
The student may interrupt at any time during the lesson.
Your response to an interruption MUST follow this exact pattern — no exceptions:

STEP 1 — DETECT INTENT
Classify the interruption into one of these categories:
  • SLOW_DOWN   — "slower", "too fast", "again", "once more"
  • SIMPLIFY    — "simpler", "easier", "I don't understand", "confusing"
  • CLARIFY     — "what does X mean", "I didn't get Y", a specific sub-question
  • EXAMPLE     — "give me an example", "show me", "can you illustrate"
  • DIGRESSION  — factual side question unrelated to the current point
  • SOCIAL      — greetings, thanks, acknowledgement ("ok", "got it", "thanks")

STEP 2 — RESPOND ADAPTIVELY TO THE CURRENT CONCEPT
Always re-engage with the SAME concept that was being taught when interrupted.
NEVER jump to a different topic, a new formula, or a new numerical problem.
  • SLOW_DOWN  → repeat the current point more slowly, break it into smaller steps
  • SIMPLIFY   → use a simpler analogy, everyday language, no jargon
  • CLARIFY    → answer the specific sub-question precisely, then re-state the main point
  • EXAMPLE    → give a fresh, concrete real-world example of the SAME concept
  • DIGRESSION → answer briefly (1–2 sentences) then immediately return to the lesson
  • SOCIAL     → acknowledge warmly in 1 sentence, then resume without re-explaining

STEP 3 — RESUME EXACTLY WHERE IT STOPPED
After adapting, continue the lesson from the very next uncovered point.
Never restart from the beginning.
Never repeat points already covered.
Never dump buffered content — continue forward only.

======================================================
SUMMARY
======================================================
Keep summaries short. Maximum 4 bullet points.

======================================================
NO HOMEWORK OR EXERCISES
======================================================
• DO NOT generate [HOMEWORK] tags under any circumstances.
• NEVER generate homework, practice assignments, or end-of-lesson exercises.
• Focus entirely on high-quality explanations, clear bullet points, and a summary.
"""

# ── Pydantic models ───────────────────────────────────────────────────────────
class TeachRequest(BaseModel):
    topic: str
    subject: Optional[str] = "General"   # hint only — not used to select prompt

class InterruptRequest(BaseModel):
    topic: str
    history: List[Dict[str, str]]
    question: str
    subject: Optional[str] = "General"   # hint only

class TTSRequest(BaseModel):
    text: str
    language: Optional[str] = "en"       # ISO-639-1 code detected by frontend

class HistoryItem(BaseModel):
    id: str
    topic: str
    blocks: List[Dict[str, Any]]
    questionsAsked: List[str]
    date: str

class EvaluateRequest(BaseModel):
    topic: str
    question: str
    student_answer: str

class QuizRequest(BaseModel):
    topic: str
    subject: str = "General"

class PracticeProgressItem(BaseModel):
    id: str
    topic: str
    subject: str
    score: int
    total: int
    date: str

# ── Groq streaming helper ─────────────────────────────────────────────────────
async def stream_groq(messages: List[Dict[str, str]], system: str, raw_request: Request = None):
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
                if raw_request is not None and await raw_request.is_disconnected():
                    break
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

# ── /api/teach ────────────────────────────────────────────────────────────────
@app.post("/api/teach")
async def start_lesson(req: TeachRequest, raw_request: Request):
    subject_hint = f" (Subject hint: {req.subject})" if req.subject and req.subject != "General" else ""
    messages = [{"role": "user", "content": f"Teach me comprehensively about: {req.topic}{subject_hint}"}]
    return StreamingResponse(
        stream_groq(messages, TEACH_SYSTEM, raw_request),
        media_type="text/event-stream"
    )

# ── /api/interrupt ────────────────────────────────────────────────────────────
@app.post("/api/interrupt")
async def interrupt_lesson(req: InterruptRequest, raw_request: Request):
    interrupt_system = TEACH_SYSTEM + """

======================================================
INTERRUPTION HANDLING — REAL TEACHER RULES (CRITICAL)
======================================================
The student has just interrupted the lesson.
You must behave exactly like an experienced, empathetic classroom teacher.

EVERY RESPONSE MUST CONTAIN TWO MANDATORY PHASES IN THE SAME OUTPUT STREAM:

PHASE 1 — ACKNOWLEDGE & ADAPT CURRENT CONCEPT
1. Emit [LANG]{code}[/LANG] as the VERY FIRST TOKEN.
2. Inside [EXPLAIN], briefly acknowledge the student's request in 1 short spoken sentence.
3. Address / re-explain the EXACT CURRENT CONCEPT being taught (slower, simpler, with analogy, or answering their doubt).

PHASE 2 — MANDATORY LESSON CONTINUATION (NEVER SKIP THIS)
4. Immediately continue teaching the topic from the VERY NEXT uncovered point.
5. Output at least 3-4 NEW chalkboard & speech blocks ([HEADING], [POINT], [EXPLAIN], [MATH], [DIAGRAM], [QUESTION]).
6. CRITICAL: NEVER END YOUR RESPONSE after an acknowledgment or transition sentence like "Let's return to our lesson." You MUST continue generating the next section of the lesson immediately in the exact same response!

FORBIDDEN ACTIONS:
  ✗ Ending the output right after saying "Let's get back to the lesson" (STRICTLY FORBIDDEN)
  ✗ Jumping to a different topic or starting an unrequested numerical problem
  ✗ Restarting the lesson from the beginning
  ✗ Writing the student's interruption phrase onto the chalkboard as a [HEADING]
"""

    recent_history = req.history[-6:] if len(req.history) > 6 else req.history

    messages = recent_history + [
        {
            "role": "user",
            "content": (
                f"Topic being taught: {req.topic}\n"
                f"Student interruption: \"{req.question}\"\n\n"
                f"CRITICAL EXECUTION ORDERS FOR TEACHER:\n"
                f"1. Emit [LANG] tag as the very first token.\n"
                f"2. PHASE 1: Acknowledge & re-explain the CURRENT concept (slower/simpler/analogy/answer).\n"
                f"3. PHASE 2 (MANDATORY): Do NOT stop generation! Immediately output 3+ NEW lesson blocks ([HEADING], [POINT], [EXPLAIN], [MATH]) continuing with the NEXT uncovered subtopic of the lesson.\n"
                f"4. Never end your turn right after saying 'Let's return to the lesson'."
            )
        }
    ]

    return StreamingResponse(
        stream_groq(messages, interrupt_system, raw_request),
        media_type="text/event-stream"
    )

# ── /api/image ────────────────────────────────────────────────────────────────
# Fetches a REAL image from Wikimedia Commons → Wikipedia → Unsplash.
# Returns JSON: { url, source, attribution, license }
# Never uses AI image generation (no Pollinations.ai).
# Returns { url: null } if no appropriate image is found.

@app.get("/api/image")
async def get_image(q: str):
    q = q.strip()
    if not q:
        return JSONResponse({"url": None, "source": None, "attribution": None, "license": None})

    async with httpx.AsyncClient(timeout=12.0) as client:

        # ── 1. Wikimedia Commons — search ────────────────────────────────────
        try:
            commons_resp = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "generator": "search",
                    "gsrnamespace": "6",   # File namespace only
                    "gsrsearch": q,
                    "gsrlimit": "5",
                    "prop": "imageinfo",
                    "iiprop": "url|extmetadata",
                    "iiurlwidth": "900",
                    "format": "json"
                }
            )
            if commons_resp.status_code == 200:
                pages = commons_resp.json().get("query", {}).get("pages", {})
                for page in pages.values():
                    ii = page.get("imageinfo", [{}])[0]
                    thumb_url = ii.get("thumburl") or ii.get("url", "")
                    if not thumb_url:
                        continue
                    # Skip SVG/OGG/audio/video files — we want raster images
                    if any(thumb_url.lower().endswith(ext) for ext in [".svg", ".ogg", ".ogv", ".webm", ".mp4", ".pdf"]):
                        continue
                    meta = ii.get("extmetadata", {})
                    artist = meta.get("Artist", {}).get("value", "")
                    artist = re.sub(r"<[^>]+>", "", artist).strip()  # strip HTML tags
                    lic    = meta.get("LicenseShortName", {}).get("value", "")
                    desc   = meta.get("ImageDescription", {}).get("value", "")
                    desc   = re.sub(r"<[^>]+>", "", desc).strip()
                    return JSONResponse({
                        "url": thumb_url,
                        "source": "Wikimedia Commons",
                        "attribution": artist or desc or "Wikimedia Commons contributors",
                        "license": lic or "See Wikimedia Commons"
                    })
        except Exception as e:
            print(f"[image] Commons error: {e}")

        # ── 2. Wikipedia — exact page image ──────────────────────────────────
        try:
            wp_resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "titles": q,
                    "prop": "pageimages|info",
                    "inprop": "url",
                    "pithumbsize": 900,
                    "format": "json"
                }
            )
            if wp_resp.status_code == 200:
                pages = wp_resp.json()["query"]["pages"]
                page = next(iter(pages.values()))
                if "thumbnail" in page:
                    page_url = page.get("fullurl", "https://en.wikipedia.org")
                    return JSONResponse({
                        "url": page["thumbnail"]["source"],
                        "source": "Wikipedia",
                        "attribution": f"Wikipedia — {page.get('title', q)}",
                        "license": "CC BY-SA 4.0"
                    })
        except Exception as e:
            print(f"[image] Wikipedia exact error: {e}")

        # ── 3. Wikipedia — search ─────────────────────────────────────────────
        try:
            wp_search_resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "generator": "search",
                    "gsrsearch": q,
                    "gsrlimit": "3",
                    "prop": "pageimages|info",
                    "inprop": "url",
                    "pithumbsize": 900,
                    "format": "json"
                }
            )
            if wp_search_resp.status_code == 200:
                pages = wp_search_resp.json().get("query", {}).get("pages", {})
                for page in pages.values():
                    if "thumbnail" in page:
                        return JSONResponse({
                            "url": page["thumbnail"]["source"],
                            "source": "Wikipedia",
                            "attribution": f"Wikipedia — {page.get('title', q)}",
                            "license": "CC BY-SA 4.0"
                        })
        except Exception as e:
            print(f"[image] Wikipedia search error: {e}")

        # ── 4. Unsplash ───────────────────────────────────────────────────────
        if UNSPLASH_API_KEY:
            try:
                us_resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    params={
                        "query": q,
                        "per_page": "1",
                        "orientation": "landscape"
                    },
                    headers={"Authorization": f"Client-ID {UNSPLASH_API_KEY}"}
                )
                if us_resp.status_code == 200:
                    results = us_resp.json().get("results", [])
                    if results:
                        photo = results[0]
                        user = photo.get("user", {})
                        photographer = user.get("name", "Unsplash photographer")
                        return JSONResponse({
                            "url": photo["urls"]["regular"],
                            "source": "Unsplash",
                            "attribution": f"Photo by {photographer} on Unsplash",
                            "license": "Unsplash License"
                        })
            except Exception as e:
                print(f"[image] Unsplash error: {e}")

    # ── No image found — lesson continues without one ─────────────────────────
    return JSONResponse({"url": None, "source": None, "attribution": None, "license": None})

# ── /api/tts ──────────────────────────────────────────────────────────────────
@app.post("/api/tts")
async def get_tts(req: TTSRequest):
    voice = pick_voice(req.language)
    rate  = "+25%"   # 1.25x speed

    filename = f"audio_{uuid.uuid4()}.mp3"
    filepath = os.path.join("static", filename)

    try:
        communicate = edge_tts.Communicate(req.text, voice, rate=rate)
        await communicate.save(filepath)
        return FileResponse(filepath, media_type="audio/mpeg")
    except Exception as e:
        print(f"[tts] Error with voice {voice}: {e}")
        # Try fallback English voice
        try:
            fallback_voice = "en-IN-NeerjaNeural"
            communicate = edge_tts.Communicate(req.text, fallback_voice, rate=rate)
            await communicate.save(filepath)
            return FileResponse(filepath, media_type="audio/mpeg")
        except Exception as e2:
            print(f"[tts] Fallback also failed: {e2}")
            return JSONResponse({"error": "TTS unavailable"}, status_code=500)

# ── /api/history ──────────────────────────────────────────────────────────────
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

# ── /api/evaluate ─────────────────────────────────────────────────────────────
@app.post("/api/evaluate")
async def evaluate_student_answer(req: EvaluateRequest):
    prompt = f"""
You are an expert academic evaluator.
Topic: {req.topic}
Question: {req.question}
Student's Answer: {req.student_answer}

Task:
1. Determine if the student's answer is conceptually correct or incorrect.
2. Provide the clear correct answer.
3. Provide a concise explanation (2-3 sentences) explaining WHY it is correct or what mistake the student made.
4. Provide a 1-sentence concept takeaway.

You MUST respond strictly with valid JSON in this exact structure:
{{
  "is_correct": true,
  "correct_answer": "...",
  "explanation": "...",
  "feedback": "..."
}}
"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You are an expert evaluator. Output ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"].strip()
                start_idx = content.find('{')
                end_idx   = content.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    return json.loads(content[start_idx: end_idx + 1])
    except Exception as e:
        print(f"[evaluate] Error: {e}")

    return {
        "is_correct": True,
        "correct_answer": "Answer recorded",
        "explanation": "Your answer has been registered. Review the concept points on your chalkboard.",
        "feedback": "Keep practicing to reinforce this concept."
    }

# ── /api/quiz ─────────────────────────────────────────────────────────────────
@app.post("/api/quiz")
async def generate_topic_quiz(req: QuizRequest):
    prompt = f"""
You are an academic test designer.
Subject: {req.subject}
Topic: {req.topic}

Task:
Generate 3 distinct multiple-choice questions testing core concepts of "{req.topic}".
For each question provide:
- question text
- 3 options labeled "A", "B", "C"
- correct option ID ("A", "B", or "C")
- clear, educational explanation for the correct answer

You MUST respond strictly with valid JSON array in this exact structure:
[
  {{
    "id": "1",
    "question": "...",
    "options": [
      {{"id": "A", "text": "..."}},
      {{"id": "B", "text": "..."}},
      {{"id": "C", "text": "..."}}
    ],
    "correct_id": "B",
    "explanation": "..."
  }}
]
"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You are a test designer. Output ONLY a valid JSON array."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"].strip()
                start_idx = content.find('[')
                end_idx   = content.rfind(']')
                if start_idx != -1 and end_idx != -1:
                    return json.loads(content[start_idx: end_idx + 1])
    except Exception as e:
        print(f"[quiz] Error: {e}")

    return [
        {
            "id": "1",
            "question": f"Which core principle is most fundamental when analyzing {req.topic}?",
            "options": [
                {"id": "A", "text": "Empirical observation and theoretical derivations"},
                {"id": "B", "text": "Unverified heuristic assumptions"},
                {"id": "C", "text": "Random boundary condition analysis"}
            ],
            "correct_id": "A",
            "explanation": f"Understanding {req.topic} requires grounded empirical principles and structured derivations."
        }
    ]

# ── /api/practice ─────────────────────────────────────────────────────────────
@app.post("/api/practice")
async def save_practice_progress(item: PracticeProgressItem):
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO practice_progress (id, topic, subject, score, total, date) VALUES (?, ?, ?, ?, ?, ?)",
              (item.id, item.topic, item.subject, item.score, item.total, item.date))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/practice")
async def get_practice_progress():
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, topic, subject, score, total, date FROM practice_progress ORDER BY date DESC")
    rows = c.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "id": r[0],
            "topic": r[1],
            "subject": r[2],
            "score": r[3],
            "total": r[4],
            "date": r[5]
        })
    return result
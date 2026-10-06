import asyncio
import sqlite3
from fastapi import FastAPI, Request, HTTPException, Header, status, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import urllib.parse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import httpx
import json
import logging
import os
import re
import uuid
import edge_tts
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

from rag_engine import (
    init_rag_db,
    process_and_store_document,
    retrieve_relevant_chunks,
    generate_document_overview_prompt,
    process_and_store_image,
    get_stored_image
)

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

# ── Security & Hashing Config ────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("JWT_SECRET", "cognilearn_super_secret_jwt_key_2026_change_in_production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# ── Database ──────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect("cognilearn.db")
    init_rag_db(conn)
    c = conn.cursor()

    # 1. Users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # 1b. Add role column if it doesn't exist (migration for existing databases)
    c.execute("PRAGMA table_info(users)")
    user_cols = [col[1] for col in c.fetchall()]
    if "role" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")

    # 2. History table
    c.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            topic TEXT,
            blocks TEXT,
            questions TEXT,
            date TEXT
        )
    ''')
    c.execute("PRAGMA table_info(history)")
    history_cols = [col[1] for col in c.fetchall()]
    if "user_id" not in history_cols:
        c.execute("ALTER TABLE history ADD COLUMN user_id TEXT DEFAULT 'demo-user-id'")
    if "subject" not in history_cols:
        c.execute("ALTER TABLE history ADD COLUMN subject TEXT DEFAULT 'General'")
    if "language" not in history_cols:
        c.execute("ALTER TABLE history ADD COLUMN language TEXT DEFAULT 'en'")

    # 3. Practice progress table
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
    c.execute("PRAGMA table_info(practice_progress)")
    practice_cols = [col[1] for col in c.fetchall()]
    if "user_id" not in practice_cols:
        c.execute("ALTER TABLE practice_progress ADD COLUMN user_id TEXT DEFAULT 'demo-user-id'")

    # 4. Login activity tracking table
    c.execute('''
        CREATE TABLE IF NOT EXISTS login_activity (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            login_time TEXT NOT NULL,
            user_agent TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Seed demo user if not existing
    demo_id = "demo-user-id"
    c.execute("SELECT id FROM users WHERE id = ?", (demo_id,))
    if not c.fetchone():
        demo_hash = pwd_context.hash("demo123")
        c.execute(
            "INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?, ?)",
            (demo_id, "Zoya Sadaf", "demo@cognilearn.ai", demo_hash, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), "user")
        )

    # Seed admin account from environment variables (only if it doesn't exist)
    admin_email = os.getenv("ADMIN_EMAIL", "admin@cognilearn.ai")
    admin_password = os.getenv("ADMIN_INITIAL_PASSWORD", "AdminPass123!")
    c.execute("SELECT id FROM users WHERE email = ?", (admin_email,))
    if not c.fetchone():
        admin_id = str(uuid.uuid4())
        admin_hash = pwd_context.hash(admin_password)
        c.execute(
            "INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?, ?)",
            (admin_id, "Administrator", admin_email, admin_hash, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), "admin")
        )
        print(f"[init] Admin account created: {admin_email}")

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
Handle interruptions as temporary conversational detours. Preserve the established
subject teaching format, depth, structure, and pedagogical style when continuing.

STEP 1 — DETECT INTENT
Classify the interruption into one of these categories:
  • SLOW_DOWN   — "slower", "too fast", "again", "once more"
  • SIMPLIFY    — "simpler", "easier", "I don't understand", "confusing"
  • CLARIFY     — "what does X mean", "I didn't get Y", a specific sub-question
  • EXAMPLE     — "give me an example", "show me", "can you illustrate"
  • DIGRESSION  — factual side question unrelated to the current point
  • SOCIAL      — greetings, thanks, acknowledgement ("ok", "got it", "thanks")

STEP 2 — RESPOND ADAPTIVELY TO THE INTERRUPT
Answer the student's actual interrupt directly and concisely. For a clarification, explain
the requested point; for an unrelated side question, answer briefly; for social messages,
acknowledge briefly. Do not force the interrupt answer into the academic lesson.
  • SLOW_DOWN  → repeat the current point more slowly, break it into smaller steps
  • SIMPLIFY   → use a simpler analogy, everyday language, no jargon
  • CLARIFY    → answer the specific sub-question precisely, then re-state the main point
  • EXAMPLE    → give a fresh, concrete real-world example of the SAME concept
  • DIGRESSION → answer briefly (1–2 sentences) then immediately return to the lesson
  • SOCIAL     → acknowledge warmly in 1 sentence, then resume without re-explaining

STEP 3 — BRIDGE AND RESUME EXACTLY WHERE IT STOPPED
Close the interrupt answer with a natural, brief transition back to the lesson. Then
continue the existing lesson from the exact resume point supplied in the request, at the
same teaching depth and format as the original lesson. Do not restart or re-explain covered
material. If no resume point is supplied, infer the next uncovered point from history.

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


def subject_teaching_guidance(subject: Optional[str]) -> str:
    """Add concise guidance for the selected subject without changing stream tags."""
    normalized = (subject or "General").strip().casefold()
    if normalized in {"mathematics", "physics"}:
        return """
SUBJECT GUIDANCE — MATHEMATICS / PHYSICS
For a numerical problem, solve only the values given: use [POINT]s for the given values, formula, substitution, and calculation as needed, then state a clear final answer with units. Write those labels in the response language. Put equations in [MATH]. Check arithmetic, signs, and units. If essential information is missing, ask for it instead of inventing values. For conceptual questions or proofs, use a logical explanation rather than forcing the numerical format.
"""
    if normalized in {
        "computer science", "programming", "engineering", "electronics", "iot",
        "networking", "operating systems", "dbms",
    }:
        return """
SUBJECT GUIDANCE — COMPUTER SCIENCE / ENGINEERING
For a request to write or fix a program, briefly state the task, put the complete working program in one [CODE] block before its explanation, then explain meaningful lines or small groups in order. Include sample input/output only when useful. Do not give fragments when a complete program was requested. For conceptual questions, answer the concept directly without adding code or a flowchart unless it helps.
"""
    if normalized == "biology":
        return """
SUBJECT GUIDANCE — BIOLOGY
Explain the requested structure or process at the requested depth. Include relevant parts, functions, stages, causes, or examples, but do not repeat points. Use a diagram or specific real image only when it clarifies the requested biology concept; never use an unrelated visual.
"""
    if normalized in {"history", "geography", "civics", "economics", "social science"}:
        return """
SUBJECT GUIDANCE — SOCIAL SCIENCE
Focus on the requested place, period, people, or issue. Include relevant causes, characteristics, sequence, evidence, effects, and examples without padding. Use a date, map, or image only when it is directly relevant and supported by the question; distinguish established facts from uncertainty.
"""
    return ""

# ── Pydantic models ───────────────────────────────────────────────────────────
class TeachRequest(BaseModel):
    topic: Optional[str] = ""
    document_id: Optional[str] = None
    image_id: Optional[str] = None
    subject: Optional[str] = "General"   # hint only — not used to select prompt

class InterruptRequest(BaseModel):
    topic: str
    user_query: Optional[str] = None
    question: Optional[str] = None
    history: List[Dict[str, str]] = Field(default_factory=list)
    subject: Optional[str] = "General"   # hint only
    resume_point: Optional[str] = None
    last_completed_block_id: Optional[str] = None
    remaining_blocks: List[Dict[str, str]] = Field(default_factory=list)

class TTSRequest(BaseModel):
    text: str
    language: Optional[str] = "en"       # ISO-639-1 code detected by frontend

class HistoryItem(BaseModel):
    id: str
    topic: str
    blocks: List[Dict[str, Any]]
    questionsAsked: List[str]
    date: str
    subject: Optional[str] = "General"
    language: Optional[str] = "en"

class EvaluateRequest(BaseModel):
    topic: str
    question: str
    student_answer: str

class QuizRequest(BaseModel):
    topic: str
    subject: str = "General"
    difficulty: str = "Medium"
    language: str = "English"
    document_id: Optional[str] = None

class PracticeProgressItem(BaseModel):
    id: str
    topic: str
    subject: str
    score: int
    total: int
    date: str

class UserRegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UserRoleUpdateRequest(BaseModel):
    role: str

# ── Auth Helper Functions ─────────────────────────────────────────────────────
def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication token required")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, name, email, role FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="User account not found")

    return {"id": row[0], "name": row[1], "email": row[2], "role": row[3] or "user"}

def get_current_admin(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Administrator privileges required.")
    return user

# ── Authentication API Endpoints ─────────────────────────────────────────────
@app.post("/api/auth/register")
async def register_user(req: UserRegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()
    password = req.password

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email, and password are required")
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please provide a valid email address")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT id FROM users WHERE email = ?", (email,))
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user_id = str(uuid.uuid4())
    password_hash = pwd_context.hash(password)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # Force role to 'user' on public registration
    c.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, name, email, password_hash, created_at, "user")
    )
    conn.commit()
    conn.close()

    token = create_access_token(user_id, email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "name": name, "email": email, "role": "user"}
    }

@app.post("/api/auth/login")
async def login_user(req: UserLoginRequest, raw_req: Request):
    email = req.email.strip().lower()
    password = req.password

    if not email or not password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, name, email, password_hash, role FROM users WHERE email = ?", (email,))
    row = c.fetchone()

    if not row or not pwd_context.verify(password, row[3]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id, name, user_email, _, role = row[0], row[1], row[2], row[3], row[4] or "user"

    # Record login activity
    act_id = str(uuid.uuid4())
    login_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    user_agent = raw_req.headers.get("user-agent", "Unknown Browser")
    c.execute(
        "INSERT INTO login_activity (id, user_id, login_time, user_agent) VALUES (?, ?, ?, ?)",
        (act_id, user_id, login_time, user_agent)
    )
    conn.commit()
    conn.close()

    token = create_access_token(user_id, user_email)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "name": name, "email": user_email, "role": role}
    }

@app.get("/api/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    return {"user": user}

@app.post("/api/auth/logout")
async def logout_user():
    return {"status": "success", "message": "Successfully logged out"}

# ── Admin API Endpoints ───────────────────────────────────────────────────────
@app.get("/api/admin/users")
async def get_admin_users(authorization: Optional[str] = Header(None)):
    get_current_admin(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC")
    users = c.fetchall()

    result = []
    for u in users:
        uid, name, email, role, created_at = u[0], u[1], u[2], u[3], u[4]

        # Last login timestamp
        c.execute("SELECT login_time FROM login_activity WHERE user_id = ? ORDER BY login_time DESC LIMIT 1", (uid,))
        ll_row = c.fetchone()
        last_login = ll_row[0] if ll_row else "Never"

        # Lessons completed count
        c.execute("SELECT COUNT(*) FROM history WHERE user_id = ?", (uid,))
        lessons_completed = c.fetchone()[0]

        # Quizzes attempted & avg score
        c.execute("SELECT COUNT(*), SUM(score), SUM(total) FROM practice_progress WHERE user_id = ?", (uid,))
        q_row = c.fetchone()
        quizzes_attempted = q_row[0] if q_row else 0
        sum_score = q_row[1] or 0
        sum_total = q_row[2] or 0

        if sum_total > 0:
            avg_quiz_score = f"{round((sum_score / sum_total) * 100)}%"
        else:
            avg_quiz_score = "0%"

        result.append({
            "id": uid,
            "name": name,
            "email": email,
            "role": role,
            "created_at": created_at,
            "last_login": last_login,
            "lessons_completed": lessons_completed,
            "quizzes_attempted": quizzes_attempted,
            "avg_quiz_score": avg_quiz_score
        })

    conn.close()
    return result

@app.get("/api/admin/users/{user_id}/details")
async def get_admin_user_details(user_id: str, authorization: Optional[str] = Header(None)):
    get_current_admin(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT id, name, email, role, created_at FROM users WHERE id = ?", (user_id,))
    u = c.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    uid, name, email, role, created_at = u[0], u[1], u[2], u[3], u[4]

    # Last login
    c.execute("SELECT login_time FROM login_activity WHERE user_id = ? ORDER BY login_time DESC LIMIT 1", (uid,))
    ll_row = c.fetchone()
    last_login = ll_row[0] if ll_row else "Never"

    # Lessons completed
    c.execute("SELECT COUNT(*) FROM history WHERE user_id = ?", (uid,))
    lessons_completed = c.fetchone()[0]

    # Quizzes attempted & score totals
    c.execute("SELECT COUNT(*), SUM(score), SUM(total) FROM practice_progress WHERE user_id = ?", (uid,))
    q_row = c.fetchone()
    quizzes_attempted = q_row[0] if q_row else 0
    sum_score = q_row[1] or 0
    sum_total = q_row[2] or 0

    if sum_total > 0:
        avg_quiz_score = f"{round((sum_score / sum_total) * 100)}%"
    else:
        avg_quiz_score = "0%"

    # Detailed quiz history
    c.execute("SELECT id, topic, subject, score, total, date FROM practice_progress WHERE user_id = ? ORDER BY date DESC", (uid,))
    quiz_rows = c.fetchall()
    quiz_history = [
        {
            "id": q[0],
            "topic": q[1],
            "subject": q[2],
            "score": q[3],
            "total": q[4],
            "date": q[5]
        }
        for q in quiz_rows
    ]

    conn.close()

    return {
        "user": {
            "id": uid,
            "name": name,
            "email": email,
            "role": role,
            "created_at": created_at,
            "last_login": last_login
        },
        "stats": {
            "lessons_completed": lessons_completed,
            "quizzes_attempted": quizzes_attempted,
            "avg_quiz_score": avg_quiz_score
        },
        "quiz_history": quiz_history
    }

@app.get("/api/admin/stats")
async def get_admin_stats(authorization: Optional[str] = Header(None)):
    get_current_admin(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM users")
    total_users = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM history")
    total_history = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM practice_progress")
    total_practice = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM login_activity")
    total_logins = c.fetchone()[0]

    c.execute("""
        SELECT l.id, l.user_id, u.name, u.email, l.login_time, l.user_agent
        FROM login_activity l
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.login_time DESC LIMIT 25
    """)
    recent_logins = [
        {
            "id": r[0],
            "user_id": r[1],
            "name": r[2] or "Unknown",
            "email": r[3] or "Unknown",
            "login_time": r[4],
            "user_agent": r[5]
        }
        for r in c.fetchall()
    ]
    conn.close()

    return {
        "total_users": total_users,
        "total_history": total_history,
        "total_practice": total_practice,
        "total_logins": total_logins,
        "recent_logins": recent_logins
    }

@app.put("/api/admin/users/{user_id}/role")
async def update_user_role(user_id: str, req: UserRoleUpdateRequest, authorization: Optional[str] = Header(None)):
    admin = get_current_admin(authorization)
    if req.role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Role must be either 'user' or 'admin'")

    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
    target = c.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    if target[0] == admin["id"] and req.role != "admin":
        conn.close()
        raise HTTPException(status_code=400, detail="You cannot demote your own administrator account")

    c.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, user_id))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"User role updated to '{req.role}'"}

@app.delete("/api/admin/users/{user_id}")
async def delete_user_by_admin(user_id: str, authorization: Optional[str] = Header(None)):
    admin = get_current_admin(authorization)
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own administrator account.")

    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()

    c.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
    target = c.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    if target[1] == "admin":
        conn.close()
        raise HTTPException(status_code=400, detail="Administrator accounts cannot be deleted.")

    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("DELETE FROM history WHERE user_id = ?", (user_id,))
        c.execute("DELETE FROM practice_progress WHERE user_id = ?", (user_id,))
        c.execute("DELETE FROM login_activity WHERE user_id = ?", (user_id,))
        c.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to delete user account: {str(e)}")

    conn.close()
    return {"status": "success", "message": "User and all associated data permanently deleted."}

# ── Groq streaming helper ─────────────────────────────────────────────────────
def groq_error_detail(status_code: int, body: bytes, retry_after: Optional[str] = None) -> str:
    """Extract a concise provider error so 429s can be diagnosed accurately."""
    message = ""
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
        elif error:
            message = str(error).strip()
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        pass

    if status_code == 429:
        detail = f"Groq returned HTTP 429: {message}" if message else "Groq returned HTTP 429 without an error description."
        if retry_after:
            detail += f" Retry after {retry_after} seconds."
        return detail[:600]
    return f"Groq API request failed (HTTP {status_code})."


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
                body = await response.aread()
                error_message = groq_error_detail(
                    response.status_code, body, response.headers.get("retry-after")
                )
                logger.warning("Groq streaming request rejected: status=%s model=%s detail=%s", response.status_code, GROQ_MODEL, error_message)
                yield f"data: {json.dumps({'error': error_message, 'status': response.status_code})}\n\n"
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


async def complete_groq(messages: List[Dict[str, str]], system: str) -> str:
    """Return one complete model response for endpoints that need structured JSON."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "temperature": 0.5
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.exception("LLM request could not connect")
        raise HTTPException(status_code=502, detail="The language model service is unreachable.") from exc
    if response.status_code == 429:
        detail = groq_error_detail(response.status_code, response.content, response.headers.get("retry-after"))
        logger.warning("Groq completion request rejected: status=429 model=%s detail=%s", GROQ_MODEL, detail)
        raise HTTPException(status_code=429, detail=detail)
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LLM request failed ({response.status_code}).")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="LLM returned an invalid completion.") from exc
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="LLM returned an empty completion.")
    return content.strip()

# ── Document & Image API Endpoints ───────────────────────────────────────────
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    user = get_current_user(authorization)
    filename = file.filename or "uploaded_file.txt"
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = [".pdf", ".docx", ".pptx", ".txt", ".md"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a PDF, DOCX, PPTX, TXT, or MD file."
        )
        
    content = await file.read(25 * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File is too large. Please upload a file smaller than 25MB.")
        
    try:
        res = process_and_store_document(user["id"], filename, content)
        return {
            "status": "success",
            "document_id": res["document_id"],
            "filename": res["filename"],
            "reused": res.get("reused", False),
            "chunk_count": res.get("chunk_count", 0)
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Document processing failed for filename=%s", filename)
        raise HTTPException(status_code=500, detail="We couldn't process this file because of a server error. Please try again later.")


@app.get("/api/documents")
async def get_user_documents(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, filename, file_type, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
    rows = c.fetchall()
    conn.close()
    return [{"id": r[0], "filename": r[1], "file_type": r[2], "created_at": r[3]} for r in rows]


@app.delete("/api/documents/{document_id}")
async def delete_user_document(document_id: str, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("DELETE FROM document_chunks WHERE document_id = ? AND user_id = ?", (document_id, user["id"]))
    c.execute("DELETE FROM documents WHERE id = ? AND user_id = ?", (document_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Document deleted"}


@app.post("/api/images/upload")
async def upload_image(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    user = get_current_user(authorization)
    filename = file.filename or "uploaded_image.png"
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format. Please upload a PNG, JPG, JPEG, WEBP, BMP, or GIF image."
        )
        
    content = await file.read(15 * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file is too large. Please upload an image under 15MB.")
        
    try:
        res = process_and_store_image(user["id"], filename, content)
        return {
            "status": "success",
            "image_id": res["image_id"],
            "filename": res["filename"],
            "extracted_text": res["extracted_text"]
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Image processing failed for filename=%s", filename)
        raise HTTPException(status_code=500, detail="We couldn't process this image because of a server error. Please try again later.")


# ── /api/teach ────────────────────────────────────────────────────────────────
@app.post("/api/teach")
async def start_lesson(req: TeachRequest, raw_request: Request, authorization: Optional[str] = Header(None)):
    user_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            curr_user = get_current_user(authorization)
            user_id = curr_user["id"]
        except Exception:
            if req.document_id or req.image_id:
                raise HTTPException(status_code=401, detail="Your session expired. Please sign in again to use the uploaded material.")

    if (req.document_id or req.image_id) and not user_id:
        raise HTTPException(status_code=401, detail="Please sign in again to use the uploaded material.")

    topic_str = (req.topic or "").strip()
    subject_hint = f" (Subject hint: {req.subject})" if req.subject and req.subject != "General" else ""
    
    system_prompt = TEACH_SYSTEM + subject_teaching_guidance(req.subject)
    messages = []
    mode = "text"
    num_chunks = 0
    context_chars = 0
    
    # ── MODE DETERMINATION ───────────────────────────────────────────────────
    if req.document_id and user_id:
        if topic_str:
            # Mode D: Topic + File
            mode = "topic+file"
            try:
                retrieved = retrieve_relevant_chunks(user_id, req.document_id, topic_str, top_k=4)
                num_chunks = len(retrieved)
                if not retrieved:
                    raise HTTPException(status_code=422, detail="No readable content was found for this topic in the uploaded document. Try a different topic or upload another file.")
                chunks_str = "\n\n".join([f"[Source Page {c['page_number']}]: {c['text']}" for c in retrieved])
                context_chars = len(chunks_str)
                
                source_instruction = f"""
======================================================
SOURCE-GROUNDED TEACHING FROM UPLOADED LEARNING MATERIAL
======================================================
You are teaching from the student's uploaded document.
Use the retrieved source material below as the primary factual basis.
Do not invent details that are not supported by the retrieved material.
If the retrieved material does not contain enough information to answer the request, clearly say that the uploaded material does not contain enough information.
You may explain concepts in simpler language, but do not change the meaning of the source.

RETRIEVED SOURCE MATERIAL (Top {num_chunks} Chunks):
{chunks_str}
"""
                system_prompt = TEACH_SYSTEM + "\n" + source_instruction
                messages = [{"role": "user", "content": f"Teach me comprehensively about: {topic_str}{subject_hint}"}]
            except HTTPException:
                raise
            except PermissionError as e:
                logger.exception("Document retrieval denied or missing")
                raise HTTPException(status_code=404, detail="The uploaded document is no longer available. Please upload it again.") from e
            except Exception as e:
                logger.exception("Document retrieval failed")
                raise HTTPException(status_code=500, detail="We couldn't retrieve the uploaded material. Please retry the upload.") from e
        else:
            # Mode B: File Only
            mode = "file_only"
            try:
                filename, snippet = generate_document_overview_prompt(user_id, req.document_id)
                if not snippet.strip():
                    raise HTTPException(status_code=422, detail="No readable content was found in this document. Please upload a text-based or OCR-readable file.")
                context_chars = len(snippet)
                source_instruction = f"""
======================================================
FILE OVERVIEW MODE
======================================================
The student uploaded document '{filename}' without entering a specific subtopic.
Snippet of document content:
{snippet}

INSTRUCTIONS FOR TEACHER:
1. Emit [LANG] tag as the very first token.
2. Provide a brief overview of the document contents and 3-4 key subtopics present in it.
3. End with a question asking what specific subtopic the student wants to learn first.
"""
                system_prompt = TEACH_SYSTEM + "\n" + source_instruction
                messages = [{"role": "user", "content": f"Please give me a high-level overview of my uploaded file '{filename}' and highlight key topics to study."}]
            except HTTPException:
                raise
            except PermissionError as e:
                logger.exception("Document overview denied or missing")
                raise HTTPException(status_code=404, detail="The uploaded document is no longer available. Please upload it again.") from e
            except Exception as e:
                logger.exception("Document overview retrieval failed")
                raise HTTPException(status_code=500, detail="We couldn't retrieve the uploaded material. Please retry the upload.") from e

    elif req.image_id and user_id:
        if topic_str:
            # Mode E: Topic + Image
            mode = "topic+image"
            try:
                img_data = get_stored_image(user_id, req.image_id)
                extracted = img_data["extracted_text"]
                context_chars = len(extracted)
                source_instruction = f"""
======================================================
SOURCE-GROUNDED TEACHING FROM UPLOADED IMAGE
======================================================
The student uploaded an educational image '{img_data['filename']}'.
Extracted Text/Content from Image:
{extracted}

OCR labels include approximate positions within the image. Use those positions to describe visible grouping and sequence, and ground the lesson in the extracted content. Do not invent arrows, connections, or labels that OCR did not capture; clearly state when the image alone does not establish a relationship.
"""
                system_prompt = TEACH_SYSTEM + "\n" + source_instruction
                messages = [{"role": "user", "content": f"Explain this image in detail. My question: {topic_str}{subject_hint}"}]
            except PermissionError as e:
                logger.exception("Image retrieval denied or missing")
                raise HTTPException(status_code=404, detail="The uploaded image is no longer available. Please upload it again.") from e
            except Exception as e:
                logger.exception("Image retrieval failed")
                raise HTTPException(status_code=500, detail="We couldn't retrieve the uploaded image. Please retry the upload.") from e
        else:
            # Mode C: Image Only
            mode = "image_only"
            try:
                img_data = get_stored_image(user_id, req.image_id)
                extracted = img_data["extracted_text"]
                context_chars = len(extracted)
                source_instruction = f"""
======================================================
IMAGE ANALYSIS & TEACHING MODE
======================================================
The student uploaded an educational image '{img_data['filename']}' without a topic query.
Extracted Text/Content from Image:
{extracted}

INSTRUCTIONS FOR TEACHER:
1. Emit [LANG] tag as the very first token.
2. Teach the student step-by-step about the concepts, formulas, or problems shown in this image.
3. Use the OCR labels and their approximate positions to describe visible grouping and sequence. Do not invent unreadable labels or diagram connections.
"""
                system_prompt = TEACH_SYSTEM + "\n" + source_instruction
                messages = [{"role": "user", "content": f"Explain the key concepts shown in my uploaded image '{img_data['filename']}'."}]
            except PermissionError as e:
                logger.exception("Image retrieval denied or missing")
                raise HTTPException(status_code=404, detail="The uploaded image is no longer available. Please upload it again.") from e
            except Exception as e:
                logger.exception("Image retrieval failed")
                raise HTTPException(status_code=500, detail="We couldn't retrieve the uploaded image. Please retry the upload.") from e

    else:
        # Mode A: Topic Only (Preserves existing behavior)
        mode = "text_only"
        messages = [{"role": "user", "content": f"Teach me comprehensively about: {topic_str}{subject_hint}"}]

    # Dev token logging
    print(f"[TOKEN_LOG] mode={mode} | doc_id={req.document_id} | image_id={req.image_id} | num_chunks={num_chunks} | context_chars={context_chars} | model={GROQ_MODEL}")
    
    return StreamingResponse(
        stream_groq(messages, system_prompt, raw_request),
        media_type="text/event-stream"
    )

# -- /api/interrupt ----------------------------------------------------------
@app.post("/api/interrupt")
async def interrupt_lesson(req: InterruptRequest, raw_request: Request):
    user_query = (req.user_query or req.question or "").strip()
    if not user_query:
        raise HTTPException(status_code=422, detail="user_query is required.")

    # Build structured remaining content preserving all teaching tags (BUG 5 FIX)
    remaining_lines_list = []
    for blk in req.remaining_blocks:
        blk_tag = blk.get("tag", "EXPLAIN")
        blk_content = blk.get("content", "").strip()
        if blk_content:
            remaining_lines_list.append(f"[{blk_tag}]{blk_content}[/{blk_tag}]")
    remaining_content = "\n".join(remaining_lines_list)
    if not remaining_content:
        remaining_content = req.resume_point or "Continue from the next uncovered point in the lesson history."

    topic_str = req.topic
    user_query_str = user_query

    interrupt_addendum = (
        "\n\n"
        "======================================================\n"
        "INTERRUPTION HANDLING - STRUCTURED TAG PROTOCOL (CRITICAL)\n"
        "======================================================\n"
        f"You are an active live teacher presenting a lesson on \'{topic_str}\'.\n"
        f"The student just interrupted you mid-explanation with: \'{user_query_str}\'\n"
        "\n"
        "CRITICAL OUTPUT FORMAT RULE:\n"
        "- You MUST use the EXACT same structured tag protocol as the main lesson.\n"
        "- You MUST begin with [LANG]<code>[/LANG].\n"
        "- Answer the interruption using [EXPLAIN] blocks for spoken text.\n"
        "- Resume the lesson using tags: [HEADING], [POINT], [MATH], [EXPLAIN], [CODE], [WARNING], etc.\n"
        "- [MATH] is VISUAL-ONLY (chalkboard). NEVER put LaTeX inside [EXPLAIN].\n"
        "- [EXPLAIN] is spoken via TTS. NEVER put LaTeX or math notation inside [EXPLAIN].\n"
        "- NEVER write plain paragraphs without tags.\n"
        "\n"
        "STEP 1 - Answer the interruption in 1-3 [EXPLAIN] blocks. Be concise.\n"
        "STEP 2 - Write a brief transition [EXPLAIN] block to bridge back to the lesson.\n"
        "STEP 3 - Continue from REMAINING LESSON CONTENT only. Do NOT restart or repeat.\n"
        "\n"
        "REMAINING LESSON CONTENT (continue from ONLY these, in order):\n"
        + remaining_content +
        "\n\n"
        "STRICT RULES:\n"
        "- Do NOT re-explain concepts already covered.\n"
        "- Do NOT restart the lesson from the beginning.\n"
        "- Do NOT repeat previous headings, points, or explanations.\n"
        "- Pair every [MATH] with a separate [EXPLAIN] describing it in plain spoken words.\n"
        "- NEVER put backslashes or LaTeX commands inside [EXPLAIN].\n"
    )

    interrupt_system = TEACH_SYSTEM + subject_teaching_guidance(req.subject) + interrupt_addendum

    recent_history = req.history[-6:] if len(req.history) > 6 else req.history

    messages = recent_history + [
        {
            "role": "user",
            "content": (
                f"Student interrupted: {user_query}\n"
                f"Last completed lesson block ID: {req.last_completed_block_id or 'unknown'}\n"
                "Answer the interruption using structured tags ([EXPLAIN], [POINT], [MATH], etc.), "
                "then resume the lesson ONLY from the remaining content in your instructions."
            )
        }
    ]
    completion = await complete_groq(messages, interrupt_system)

    # BUG 1+2 FIX: Parse the structured tag response into individual blocks with unique UUIDs.
    # Do NOT strip tags. Parse exactly like the frontend processRaw does.
    KNOWN_TAGS_PAT = r'HEADING|POINT|MATH|IMAGE|EXPLAIN|CODE|DIAGRAM|QUESTION|QUIZ|WARNING|SUMMARY'
    tag_re_interrupt = re.compile(
        rf'\[({KNOWN_TAGS_PAT})\]([\s\S]*?)\[/\1\]',
        re.IGNORECASE
    )

    structured_blocks = []
    ts = int(datetime.utcnow().timestamp() * 1000)
    for idx, m in enumerate(tag_re_interrupt.finditer(completion)):
        blk_tag = m.group(1).upper()
        blk_content = m.group(2).strip()
        if not blk_content and blk_tag != "DIAGRAM":
            continue
        # BUG 1 FIX: Use timestamp + uuid hex + index for guaranteed global uniqueness
        block_id = f"resume_{ts}_{uuid.uuid4().hex[:8]}_{idx}"
        structured_blocks.append({"id": block_id, "tag": blk_tag, "content": blk_content})

    # Fallback: if model returned no tags at all, wrap entire response as EXPLAIN
    if not structured_blocks:
        cleaned = re.sub(r'\[LANG\][a-z]{0,5}(?:\[/LANG\])?', '', completion, flags=re.IGNORECASE).strip()
        if cleaned:
            block_id = f"resume_{ts}_{uuid.uuid4().hex[:8]}_0"
            structured_blocks.append({"id": block_id, "tag": "EXPLAIN", "content": cleaned})

    if not structured_blocks:
        raise HTTPException(status_code=502, detail="LLM returned no usable interruption response.")

    return {"status": "success", "blocks": structured_blocks}


# ── /api/image ────────────────────────────────────────────────────────────────
# Fetches a REAL image from Wikimedia Commons → Wikipedia → Unsplash.
# Returns JSON: { url, source, attribution, license }
# Never uses AI image generation (no Pollinations.ai).
# Returns { url: null } if no appropriate image is found.

_IMAGE_QUERY_STOP_WORDS = {
    "a", "an", "and", "the", "of", "for", "with", "in", "on", "to",
    "image", "picture", "photo", "photograph", "diagram", "labeled", "labelled",
    "illustration", "process", "overview", "educational", "showing",
}


def image_matches_query(query: str, *candidate_text: str) -> bool:
    """Reject search results with no meaningful subject overlap."""
    query_terms = {
        word for word in re.findall(r"[\w]+", query.casefold())
        if len(word) > 2 and word not in _IMAGE_QUERY_STOP_WORDS
    }
    if not query_terms:
        return False
    result_terms = {
        word for text in candidate_text if text
        for word in re.findall(r"[\w]+", text.casefold())
    }
    required_matches = 1 if len(query_terms) <= 2 else 2
    return len(query_terms & result_terms) >= required_matches

@app.get("/api/image")
async def get_image(q: str):
    q = q.strip()
    if not q:
        return JSONResponse({"url": None, "source": None, "attribution": None, "license": None})

    async with httpx.AsyncClient(
        timeout=12.0,
        headers={"User-Agent": "CogniLearn/1.0 (educational image lookup)"},
    ) as client:

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
                    meta = ii.get("extmetadata", {})
                    desc = meta.get("ImageDescription", {}).get("value", "")
                    desc = re.sub(r"<[^>]+>", "", desc).strip()
                    if not image_matches_query(q, page.get("title", ""), desc):
                        continue
                    # Skip SVG/OGG/audio/video files — we want raster images
                    if any(thumb_url.lower().endswith(ext) for ext in [".svg", ".ogg", ".ogv", ".webm", ".mp4", ".pdf"]):
                        continue
                    artist = meta.get("Artist", {}).get("value", "")
                    artist = re.sub(r"<[^>]+>", "", artist).strip()  # strip HTML tags
                    lic    = meta.get("LicenseShortName", {}).get("value", "")
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
                if "thumbnail" in page and image_matches_query(q, page.get("title", "")):
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
                    if "thumbnail" in page and image_matches_query(q, page.get("title", "")):
                        return JSONResponse({
                            "url": page["thumbnail"]["source"],
                            "source": "Wikipedia",
                            "attribution": f"Wikipedia — {page.get('title', q)}",
                            "license": "CC BY-SA 4.0"
                        })
        except Exception as e:
            print(f"[image] Wikipedia search error: {e}")

        # ── 3b. Wikipedia REST search + exact-page thumbnail ─────────────────
        # The legacy generator=search API can be denied by Wikimedia edge
        # policies. REST search returns relevant article titles; resolve each
        # title through pageimages to get a larger, directly loadable thumbnail.
        try:
            rest_search = await client.get(
                "https://api.wikimedia.org/core/v1/wikipedia/en/search/page",
                params={"q": q, "limit": "5"},
            )
            if rest_search.status_code == 200:
                for result in rest_search.json().get("pages", []):
                    title = result.get("title", "")
                    excerpt = re.sub(r"<[^>]+>", "", result.get("excerpt", ""))
                    if not result.get("thumbnail") or not image_matches_query(q, title, excerpt):
                        continue

                    page_image_resp = await client.get(
                        "https://en.wikipedia.org/w/api.php",
                        params={
                            "action": "query",
                            "titles": title,
                            "prop": "pageimages|info",
                            "inprop": "url",
                            "pithumbsize": 900,
                            "format": "json",
                        },
                    )
                    if page_image_resp.status_code != 200:
                        continue
                    page = next(iter(page_image_resp.json().get("query", {}).get("pages", {}).values()), {})
                    thumb_url = page.get("thumbnail", {}).get("source")
                    if not thumb_url or not image_matches_query(q, title, excerpt):
                        continue
                    return JSONResponse({
                        "url": thumb_url,
                        "source": "Wikipedia",
                        "attribution": f"Wikipedia — {page.get('title', title)}",
                        "license": "See the source page for image licensing",
                    })
        except Exception as e:
            logger.warning("Wikipedia REST image search failed for query %r: %s", q, e)

        # ── 4. Unsplash ───────────────────────────────────────────────────────
        if UNSPLASH_API_KEY:
            try:
                us_resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    params={
                        "query": q,
                        "per_page": "5",
                        "orientation": "landscape"
                    },
                    headers={"Authorization": f"Client-ID {UNSPLASH_API_KEY}"}
                )
                if us_resp.status_code == 200:
                    results = us_resp.json().get("results", [])
                    for photo in results:
                        if not image_matches_query(
                            q, photo.get("alt_description", ""), photo.get("description", "")
                        ):
                            continue
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
        return FileResponse(
            filepath,
            media_type="audio/mpeg",
            background=BackgroundTask(os.remove, filepath),
        )
    except Exception as e:
        print(f"[tts] Error with voice {voice}: {e}")
        # Try fallback English voice
        try:
            fallback_voice = "en-IN-NeerjaNeural"
            communicate = edge_tts.Communicate(req.text, fallback_voice, rate=rate)
            await communicate.save(filepath)
            return FileResponse(
                filepath,
                media_type="audio/mpeg",
                background=BackgroundTask(os.remove, filepath),
            )
        except Exception as e2:
            print(f"[tts] Fallback also failed: {e2}")
            return JSONResponse({"error": "TTS unavailable"}, status_code=500)

# ── /api/history ──────────────────────────────────────────────────────────────
@app.post("/api/history")
async def save_history(item: HistoryItem, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO history (id, user_id, topic, blocks, questions, date, subject, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              (item.id, user["id"], item.topic, json.dumps(item.blocks), json.dumps(item.questionsAsked), item.date, item.subject or "General", item.language or "en"))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/history")
async def get_history(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, topic, blocks, questions, date, subject, language FROM history WHERE user_id = ? ORDER BY date DESC", (user["id"],))
    rows = c.fetchall()
    conn.close()

    def parse_list(value):
        if not value:
            return []
        try:
            parsed = json.loads(value) if isinstance(value, str) else value
        except (TypeError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    result = []
    for r in rows:
        blocks = [block for block in parse_list(r[2]) if isinstance(block, dict) and isinstance(block.get("tag"), str)]
        questions = [question for question in parse_list(r[3]) if isinstance(question, str)]
        result.append({
            "id": r[0],
            "topic": r[1] or "Recorded lesson",
            "blocks": blocks,
            "questionsAsked": questions,
            "date": r[4] or "",
            "subject": r[5] or "General",
            "language": r[6] or "en"
        })
    return result

@app.delete("/api/history/{item_id}")
async def delete_history(item_id: str, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("DELETE FROM history WHERE id = ? AND user_id = ?", (item_id, user["id"]))
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

# ── Local quiz generation helpers ──────────────────────────────────────────────
QUIZ_STOPWORDS = {
    "about", "above", "after", "again", "against", "also", "among", "because", "before", "being", "below", "between", "both", "could", "does", "during", "each", "from", "further", "have", "having", "into", "itself", "more", "most", "other", "over", "same", "should", "some", "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "until", "very", "what", "when", "where", "which", "while", "with", "would", "your", "the", "and", "for", "are", "was", "were", "has", "had", "can", "will", "its", "not", "but", "you", "use", "used", "using", "one", "two", "three", "four", "five", "within", "without", "per", "via"
}

def _quiz_collect_text(value):
    """Flatten saved lesson blocks into readable source text."""
    parts = []
    if isinstance(value, str):
        if value.strip():
            parts.append(value.strip())
    elif isinstance(value, dict):
        for key in ("title", "heading", "content", "text", "body", "description", "explanation", "points", "items"):
            if key in value:
                parts.extend(_quiz_collect_text(value[key]))
        if not parts:
            for child in value.values():
                parts.extend(_quiz_collect_text(child))
    elif isinstance(value, list):
        for child in value:
            parts.extend(_quiz_collect_text(child))
    return parts

def _quiz_sentences(source):
    import re as _re
    # Keep line breaks/code snippets out of ordinary sentence splitting.
    cleaned = _re.sub(r"```[\s\S]*?```", " ", source)
    cleaned = _re.sub(r"`([^`]+)`", r"\1", cleaned)
    return [x.strip(" \t\r\n-•") for x in _re.split(r"(?<=[.!?])\s+|\n+", cleaned) if len(x.split()) >= 7]

def _quiz_terms(sentences):
    import re as _re
    counts = {}
    for sentence in sentences:
        for token in _re.findall(r"\b[A-Za-z][A-Za-z0-9_-]{3,}\b", sentence):
            normalized = token.strip("_-")
            if normalized.casefold() in QUIZ_STOPWORDS or normalized.isdigit():
                continue
            counts[normalized] = counts.get(normalized, 0) + 1
    # Stable, useful distractors from terms actually present in the lesson.
    return sorted(counts, key=lambda term: (-counts[term], -len(term), term.casefold()))

def _build_local_quiz(source, topic, difficulty):
    import random as _random
    import re as _re
    sentences = _quiz_sentences(source)
    terms = _quiz_terms(sentences)
    if len(terms) < 5 or len(sentences) < 5:
        raise ValueError("Not enough lesson content to build five grounded questions")

    # Select meaningful terms and sentences; use the source sentence as the explanation.
    candidates = []
    used_terms = set()
    for sentence in sentences:
        matches = [t for t in terms if t.casefold() not in used_terms and _re.search(r"(?<![A-Za-z0-9_-])" + _re.escape(t) + r"(?![A-Za-z0-9_-])", sentence, flags=_re.I)]
        if not matches:
            continue
        if difficulty == "Easy":
            target = min(matches, key=lambda t: (len(t), t.casefold()))
        elif difficulty == "Hard":
            target = max(matches, key=lambda t: (len(t), t.casefold()))
        else:
            target = max(matches, key=lambda t: (sum(ch.isupper() for ch in t) > 1, len(t)))
        if len(sentence.split()) > (45 if difficulty == "Hard" else 65):
            continue
        candidates.append((sentence, target))
        used_terms.add(target.casefold())
        if len(candidates) >= 5:
            break

    if len(candidates) < 5:
        raise ValueError("Lesson content does not contain five distinct, usable facts")

    output = []
    for idx, (sentence, target) in enumerate(candidates):
        distractors = [t for t in terms if t.casefold() != target.casefold()]
        # Prefer terms of similar length to reduce obvious answer cues.
        distractors.sort(key=lambda t: (abs(len(t) - len(target)), t.casefold()))
        choices = [target] + distractors[:3]
        if len(choices) < 4:
            raise ValueError("Not enough distinct terms for answer choices")
        _random.Random(f"{topic}:{idx}:{target}").shuffle(choices)
        correct_id = "ABCD"[choices.index(target)]
        masked = _re.sub(r"(?<![A-Za-z0-9_-])" + _re.escape(target) + r"(?![A-Za-z0-9_-])", "_____", sentence, count=1, flags=_re.I)
        if masked == sentence:
            continue
        output.append({
            "id": str(idx + 1),
            "question": f"Complete the statement based on the lesson:\n\n{masked}",
            "options": [{"id": letter, "text": choice} for letter, choice in zip("ABCD", choices)],
            "correct_id": correct_id,
            "explanation": f"The lesson states: {sentence}"
        })
    if len(output) != 5:
        raise ValueError("Could not construct five valid questions")
    return output

async def _post_gemini_quiz_with_retries(client, endpoint, headers, payload):
    """Retry transient Gemini overload/rate-limit responses with bounded backoff."""
    max_attempts = 4  # initial attempt plus three retries
    response = None
    for attempt in range(max_attempts):
        response = await client.post(endpoint, headers=headers, json=payload)
        if response.status_code not in {429, 503} or attempt == max_attempts - 1:
            return response

        delay_seconds = min(2 ** attempt, 4)
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                delay_seconds = min(max(delay_seconds, float(retry_after)), 5)
            except ValueError:
                pass
        logger.warning(
            "Gemini quiz request returned %s; retry %s/%s in %ss",
            response.status_code, attempt + 1, max_attempts - 1, delay_seconds
        )
        await asyncio.sleep(delay_seconds)
    return response


# ── /api/quiz ─────────────────────────────────────────────────────────────────
@app.post("/api/quiz")
async def generate_topic_quiz(req: QuizRequest, authorization: Optional[str] = Header(None)):
    difficulty = req.difficulty.strip().title()
    if difficulty not in {"Easy", "Medium", "Hard"}:
        raise HTTPException(status_code=422, detail="Difficulty must be Easy, Medium, or Hard.")

    source_parts = []
    user = None
    if req.document_id or authorization:
        try:
            user = get_current_user(authorization)
        except Exception:
            if req.document_id:
                raise

    if req.document_id and user:
        chunks = retrieve_relevant_chunks(user["id"], req.document_id, req.topic, top_k=8)
        source_parts.extend(c.get("text", "") for c in chunks if isinstance(c, dict))

    # Reuse the learner's own saved lesson when no uploaded document was selected.
    if not source_parts and user:
        conn = sqlite3.connect("cognilearn.db")
        try:
            c = conn.cursor()
            c.execute("SELECT blocks FROM history WHERE user_id = ? AND LOWER(topic) = LOWER(?) ORDER BY date DESC LIMIT 3", (user["id"], req.topic))
            for row in c.fetchall():
                try:
                    source_parts.extend(_quiz_collect_text(json.loads(row[0])))
                except (TypeError, json.JSONDecodeError):
                    continue
        finally:
            conn.close()

    source = "\n\n".join(part for part in source_parts if isinstance(part, str) and part.strip())
    # Gemini is used only for quiz generation. The existing teach_system and
    # other Groq-backed endpoints are intentionally left unchanged.
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    if not gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured. Add GEMINI_API_KEY to your backend .env file and restart the server."
        )

    difficulty_guidance = {
        "Easy": "Focus on foundational understanding, definitions, and direct application.",
        "Medium": "Test conceptual understanding and practical application, with some multi-step reasoning.",
        "Hard": "Use challenging scenarios, analysis, debugging, and multi-step reasoning where appropriate. Avoid trick questions."
    }[difficulty]
    source_guidance = (
        "Use the supplied lesson material as the primary source of truth."
        if source.strip()
        else "No lesson material was supplied. Use your reliable subject knowledge to write an accurate quiz for the requested topic."
    )
    source_section = (
        f"\n\nLESSON SOURCE MATERIAL:\n{source[:24000]}"
        if source.strip()
        else ""
    )
    prompt = f"""You are an expert academic assessment designer creating a high-quality quiz for an adaptive AI tutor.
Subject: {req.subject}
Topic: {req.topic}
Difficulty: {difficulty}
Language: {req.language}
Difficulty guidance: {difficulty_guidance}
Source guidance: {source_guidance}{source_section}

Create exactly five distinct multiple-choice questions about the requested topic. If lesson source material is provided, ground the questions in it and do not contradict it. If no source is provided, use reliable general knowledge.
Requirements:
- Assess different learning objectives; do not repeat the same concept in different wording.
- Use a thoughtful mix of recall, conceptual understanding, and application appropriate to the requested difficulty.
- Every question must have exactly four plausible options with IDs A, B, C, D.
- Exactly one option must be correct.
- Include a concise but instructive explanation that explains why the correct answer is right.
- Keep all question text, options, and explanations in {req.language}.
- For code questions, preserve code formatting and use escaped newlines in JSON strings.
- Do not include markdown fences or any text outside the JSON.

Return a JSON array with this exact shape:
[{{"id":"1","question":"...","options":[{{"id":"A","text":"..."}},{{"id":"B","text":"..."}},{{"id":"C","text":"..."}},{{"id":"D","text":"..."}}],"correct_id":"B","explanation":"..."}}]
"""
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35,
            "responseMimeType": "application/json",
            "maxOutputTokens": 5000
        }
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await _post_gemini_quiz_with_retries(
                client,
                endpoint,
                headers={"x-goog-api-key": gemini_api_key, "Content-Type": "application/json"},
                payload=payload
            )
        if response.status_code != 200:
            logger.error("Gemini quiz request failed: status=%s body=%s", response.status_code, response.text[:1000])
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Gemini remained rate-limited after automatic retries. Check its usage limits and retry after reset.")
            if response.status_code == 503:
                raise HTTPException(status_code=503, detail="Gemini remained unavailable after automatic retries. Please retry shortly.")
            if response.status_code in {401, 403}:
                raise HTTPException(status_code=502, detail="Gemini rejected the configured API key or its permissions.")
            raise HTTPException(status_code=502, detail=f"Gemini quiz generation failed (HTTP {response.status_code}). Check the configured model and try again.")

        response_data = response.json()
        candidates = response_data.get("candidates") or []
        parts = (candidates[0].get("content", {}).get("parts", []) if candidates else [])
        content = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not content:
            raise ValueError("Gemini returned an empty response")
        generated = json.loads(content)
        if not isinstance(generated, list) or len(generated) != 5:
            raise ValueError("Quiz must contain exactly five questions")

        normalized = []
        seen_questions = set()
        for index, item in enumerate(generated):
            if not isinstance(item, dict):
                raise ValueError("Question is not an object")
            question = item.get("question")
            options = item.get("options")
            correct_id = item.get("correct_id")
            explanation = item.get("explanation")
            if not isinstance(question, str) or not question.strip() or not isinstance(explanation, str) or not explanation.strip():
                raise ValueError("Question or explanation is missing")
            fingerprint = re.sub(r"\W+", " ", question.casefold()).strip()
            if fingerprint in seen_questions:
                raise ValueError("Duplicate question")
            seen_questions.add(fingerprint)
            if not isinstance(options, list) or len(options) != 4 or any(not isinstance(option, dict) for option in options):
                raise ValueError("Each question must have four options")
            option_ids = [option.get("id") for option in options]
            option_texts = [option.get("text") for option in options]
            if set(option_ids) != {"A", "B", "C", "D"} or len(set(option_texts)) != 4:
                raise ValueError("Options must be four distinct A-D choices")
            if correct_id not in option_ids or any(not isinstance(text, str) or not text.strip() for text in option_texts):
                raise ValueError("Correct answer or option text is invalid")
            normalized.append({
                "id": str(index + 1), "question": question, "options": options,
                "correct_id": correct_id, "explanation": explanation
            })
        return normalized
    except HTTPException:
        raise
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        logger.exception("Gemini returned an invalid quiz response")
        raise HTTPException(status_code=502, detail="Gemini returned an invalid quiz. Please retry.") from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Gemini took too long to generate the quiz. Please retry.") from exc
    except httpx.HTTPError as exc:
        logger.exception("Gemini quiz network error")
        raise HTTPException(status_code=502, detail="Could not reach Gemini. Please retry.") from exc

# ── /api/practice ─────────────────────────────────────────────────────────────
@app.post("/api/practice")
async def save_practice_progress(item: PracticeProgressItem, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO practice_progress (id, user_id, topic, subject, score, total, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (item.id, user["id"], item.topic, item.subject, item.score, item.total, item.date))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/practice")
async def get_practice_progress(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    conn = sqlite3.connect("cognilearn.db")
    c = conn.cursor()
    c.execute("SELECT id, topic, subject, score, total, date FROM practice_progress WHERE user_id = ? ORDER BY date DESC", (user["id"],))
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

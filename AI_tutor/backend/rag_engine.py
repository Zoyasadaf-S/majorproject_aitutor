import os
import io
import re
import json
import hashlib
import sqlite3
import uuid
import logging

# PDF, DOCX, PPTX libraries
try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    import docx
except ImportError:
    docx = None

try:
    import pptx
except ImportError:
    pptx = None

try:
    from PIL import Image
except ImportError:
    Image = None

_EASYOCR_READER = None

_EMBEDDING_MODEL = None
_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
logger = logging.getLogger(__name__)

def get_ocr_reader():
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        try:
            import easyocr
            print("[OCR] Loading EasyOCR reader...")
            # EasyOCR's download progress includes Unicode block characters that
            # can fail on Windows consoles using legacy encodings.
            _EASYOCR_READER = easyocr.Reader(['en'], gpu=False, verbose=False)
            print("[OCR] EasyOCR reader loaded successfully.")
        except Exception:
            logger.exception("EasyOCR initialization failed")
            _EASYOCR_READER = None
    return _EASYOCR_READER

def extract_text_from_image(image_bytes: bytes) -> str:
    """Extracts text from uploaded image using EasyOCR or pytesseract fallback."""
    if Image is None:
        raise ValueError("Image reading is unavailable on this server. Please try again later.")
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format not in {"PNG", "JPEG", "WEBP", "BMP", "GIF"}:
                raise ValueError("Unsupported image format. Please upload a PNG, JPG, or JPEG image.")
            if image.width * image.height > 40_000_000:
                raise ValueError("This image is too large to process. Please upload a smaller image.")
            image_size = image.size
            image.verify()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("This image is damaged or unreadable. Please upload a valid PNG, JPG, or JPEG image.") from exc

    reader = get_ocr_reader()
    if reader is not None:
        try:
            results = reader.readtext(image_bytes, detail=1)
            if results:
                width, height = image_size
                positioned = []
                for bounds, text, _confidence in results:
                    center_x = sum(point[0] for point in bounds) / len(bounds)
                    center_y = sum(point[1] for point in bounds) / len(bounds)
                    positioned.append((center_y, center_x, f"[x={center_x / width:.2f}, y={center_y / height:.2f}] {text}"))
                positioned.sort(key=lambda row: (round(row[0] / max(height * 0.025, 1)), row[1]))
                return "\n".join(row[2] for row in positioned)
        except Exception:
            logger.exception("EasyOCR extraction failed")
            
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        ocr_text = pytesseract.image_to_string(img).strip()
        if ocr_text:
            return ocr_text
    except Exception:
        logger.exception("Pytesseract extraction failed")
        
    return ""

# First init_rag_db removed — single definition at line ~290

def get_embedding_model():
    global _EMBEDDING_MODEL
    if _EMBEDDING_MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer
            print(f"[RAG] Loading local embedding model '{_EMBEDDING_MODEL_NAME}'...")
            _EMBEDDING_MODEL = SentenceTransformer(_EMBEDDING_MODEL_NAME)
            print("[RAG] Local embedding model loaded successfully.")
        except Exception as e:
            print(f"[RAG] Failed to load SentenceTransformer: {e}")
            _EMBEDDING_MODEL = None
    return _EMBEDDING_MODEL


# ── Text Extraction Functions ────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes):
    """Extract text page by page, using the shared OCR reader for scanned pages."""
    pages_data = []
    if not fitz:
        raise ValueError("PyMuPDF is not installed")
    
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        logger.exception("PDF open failed")
        raise ValueError("This PDF is damaged or uses an unsupported format. Please upload a readable PDF.") from exc

    try:
        if doc.needs_pass:
            raise ValueError("This PDF is password protected. Please upload an unlocked copy.")
        if len(doc) > 200:
            raise ValueError("This PDF has too many pages to process at once. Please upload a shorter document.")
        for page_idx in range(len(doc)):
            page = doc.load_page(page_idx)
            text = page.get_text("text", sort=True).strip()
            if not text:
                try:
                    image_bytes = page.get_pixmap(dpi=150, alpha=False).tobytes("png")
                    text = extract_text_from_image(image_bytes).strip()
                except Exception:
                    logger.exception("OCR failed for PDF page %s", page_idx + 1)
                    text = ""
            if text:
                pages_data.append({"page": page_idx + 1, "text": text})
    finally:
        doc.close()
    return pages_data


def extract_text_from_docx(file_bytes: bytes):
    """Extract text from DOCX document."""
    pages_data = []
    if not docx:
        raise ValueError("python-docx is not installed")
    
    doc = docx.Document(io.BytesIO(file_bytes))
    full_text = []
    for para in doc.paragraphs:
        if para.text.strip():
            full_text.append(para.text.strip())
    for table in doc.tables:
        for row in table.rows:
            row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_text:
                full_text.append(" | ".join(row_text))
    
    combined = "\n\n".join(full_text)
    # Estimate pages (~500 words per page)
    words = combined.split()
    words_per_page = 500
    for i in range(0, max(1, len(words)), words_per_page):
        page_num = (i // words_per_page) + 1
        page_words = words[i : i + words_per_page]
        pages_data.append({"page": page_num, "text": " ".join(page_words)})
    
    return pages_data


def extract_text_from_pptx(file_bytes: bytes):
    """Extract text from PPTX presentation preserving slide numbers."""
    pages_data = []
    if not pptx:
        raise ValueError("python-pptx is not installed")
    
    prs = pptx.Presentation(io.BytesIO(file_bytes))
    for slide_idx, slide in enumerate(prs.slides):
        slide_text = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                slide_text.append(shape.text.strip())
        if slide_text:
            pages_data.append({"page": slide_idx + 1, "text": "\n".join(slide_text)})
    return pages_data


def extract_text_from_txt(file_bytes: bytes):
    """Extract text from raw UTF-8 text file."""
    pages_data = []
    content = file_bytes.decode("utf-8", errors="ignore").strip()
    words = content.split()
    words_per_page = 600
    for i in range(0, max(1, len(words)), words_per_page):
        page_num = (i // words_per_page) + 1
        page_words = words[i : i + words_per_page]
        pages_data.append({"page": page_num, "text": " ".join(page_words)})
    return pages_data


def extract_file_content(filename: str, file_bytes: bytes):
    """Detect file extension and extract page-structured text."""
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_bytes)
    elif ext in [".docx", ".doc"]:
        return extract_text_from_docx(file_bytes)
    elif ext in [".pptx", ".ppt"]:
        return extract_text_from_pptx(file_bytes)
    elif ext in [".txt", ".md", ".csv", ".json", ".log"]:
        return extract_text_from_txt(file_bytes)
    else:
        raise ValueError(f"Unsupported file extension: {ext}. Allowed formats: PDF, DOCX, PPTX, TXT")


# ── Chunking Logic ───────────────────────────────────────────────────────────

def chunk_pages_data(pages_data, target_words=900, overlap_words=120):
    """
    Chunks extracted pages into sensible sections (~800-1200 words).
    Preserves page number references.
    """
    chunks = []
    
    for item in pages_data:
        page_num = item["page"]
        text = item["text"]
        words = text.split()
        
        if len(words) <= target_words:
            chunks.append({
                "page": page_num,
                "text": text
            })
        else:
            # Split on line boundaries to keep headings, paragraphs, and OCR label
            # layout readable; only split a single unusually long line by words.
            step = max(1, target_words - overlap_words)
            lines = text.splitlines()
            current_lines = []
            current_words = 0
            for line in lines:
                line_words = line.split()
                if len(line_words) > target_words:
                    if current_lines:
                        chunks.append({"page": page_num, "text": "\n".join(current_lines)})
                        current_lines, current_words = [], 0
                    for start in range(0, len(line_words), step):
                        chunks.append({"page": page_num, "text": " ".join(line_words[start:start + target_words])})
                    continue
                if current_lines and current_words + len(line_words) > target_words:
                    chunks.append({"page": page_num, "text": "\n".join(current_lines)})
                    overlap = "\n".join(current_lines[-2:])
                    current_lines = current_lines[-2:]
                    current_words = len(overlap.split())
                current_lines.append(line)
                current_words += len(line_words)
            if current_lines:
                chunks.append({"page": page_num, "text": "\n".join(current_lines)})
    
    return chunks


# ── Local Embeddings Generation (ZERO GROQ CALLS) ───────────────────────────

def generate_local_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generates sentence embeddings locally using SentenceTransformer.
    Does NOT call Groq or external paid APIs.
    """
    model = get_embedding_model()
    if model is not None:
        embeddings = model.encode(texts, normalize_embeddings=True)
        return [e.tolist() for e in embeddings]
    
    # Fallback: Lightweight local frequency vectorizer if model failed to load
    import math
    def _simple_tf_vector(t):
        words = re.findall(r'\w+', t.lower())
        counts = {}
        for w in words:
            counts[w] = counts.get(w, 0) + 1
        length = math.sqrt(sum(v*v for v in counts.values())) or 1.0
        # Return hashed float slots to emulate embedding
        vec = [0.0] * 64
        for w, c in counts.items():
            idx = abs(hash(w)) % 64
            vec[idx] += c / length
        return vec
        
    return [_simple_tf_vector(t) for t in texts]


def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity between two vector lists."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ── Database RAG Management & User Isolation ─────────────────────────────────

def init_rag_db(conn):
    """Ensures documents, document_chunks, and uploaded_images tables exist in SQLite."""
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS document_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            page_number INTEGER,
            chunk_text TEXT NOT NULL,
            embedding TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS uploaded_images (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()


def process_and_store_image(user_id: str, filename: str, image_bytes: bytes, db_path="cognilearn.db"):
    """
    Extracts text/content from an uploaded image and stores it in SQLite.
    Enforces user isolation.
    """
    from datetime import datetime
    img_id = str(uuid.uuid4())
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    extracted_text = extract_text_from_image(image_bytes)
    if not extracted_text.strip():
        raise ValueError("We couldn't read text from this image. Please upload a clearer image containing readable text or a labeled diagram.")
    
    conn = sqlite3.connect(db_path)
    init_rag_db(conn)
    c = conn.cursor()
    c.execute(
        "INSERT INTO uploaded_images (id, user_id, filename, extracted_text, created_at) VALUES (?, ?, ?, ?, ?)",
        (img_id, user_id, filename, extracted_text, created_at)
    )
    conn.commit()
    conn.close()
    
    return {
        "image_id": img_id,
        "filename": filename,
        "extracted_text": extracted_text
    }


def get_stored_image(user_id: str, image_id: str, db_path="cognilearn.db"):
    """
    Retrieves stored image metadata for an authenticated user.
    Enforces user isolation.
    """
    conn = sqlite3.connect(db_path)
    init_rag_db(conn)
    c = conn.cursor()
    c.execute(
        "SELECT id, filename, extracted_text FROM uploaded_images WHERE id = ? AND user_id = ?",
        (image_id, user_id)
    )
    row = c.fetchone()
    conn.close()
    if not row:
        raise PermissionError("Uploaded image not found or access denied.")
    return {
        "image_id": row[0],
        "filename": row[1],
        "extracted_text": row[2]
    }


def process_and_store_document(user_id: str, filename: str, file_bytes: bytes, db_path="cognilearn.db"):
    """
    Extracts, chunks, embeds, and stores a document in SQLite.
    Includes SHA-256 hash checking to avoid duplicate embeddings for the same user.
    Strictly isolated by user_id.
    """
    # 1. SHA-256 Hash
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    file_type = os.path.splitext(filename)[1].lower().replace(".", "")
    
    conn = sqlite3.connect(db_path)
    init_rag_db(conn)
    c = conn.cursor()
    
    # Check if exact file exists for THIS user
    try:
        c.execute(
            "SELECT id, filename FROM documents WHERE user_id = ? AND file_hash = ?",
            (user_id, file_hash)
        )
        existing = c.fetchone()
        if existing:
            print(f"[RAG] Reusing cached document {existing[0]} for user {user_id}")
            return {"document_id": existing[0], "filename": existing[1], "reused": True}

        pages_data = extract_file_content(filename, file_bytes)
        if not pages_data:
            raise ValueError("No readable text was found. If this is a scanned PDF, make sure OCR is available or upload a clearer copy.")
        chunks = chunk_pages_data(pages_data)
        if not chunks:
            raise ValueError("The document did not contain readable text to index.")

        chunk_texts = [chunk["text"] for chunk in chunks]
        embeddings = generate_local_embeddings(chunk_texts)
        doc_id = str(uuid.uuid4())
        from datetime import datetime
        created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        c.execute(
            "INSERT INTO documents (id, user_id, filename, file_type, file_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, user_id, filename, file_type, file_hash, created_at)
        )
        for i, chunk_info in enumerate(chunks):
            c.execute(
                """INSERT INTO document_chunks
                   (id, document_id, user_id, page_number, chunk_text, embedding)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), doc_id, user_id, chunk_info["page"], chunk_info["text"], json.dumps(embeddings[i]))
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    
    print(f"[RAG] Stored new document {doc_id} with {len(chunks)} chunks for user {user_id}")
    return {
        "document_id": doc_id,
        "filename": filename,
        "chunk_count": len(chunks),
        "reused": False
    }


def retrieve_relevant_chunks(user_id: str, document_id: str, query: str, top_k=4, max_tokens=4000, db_path="cognilearn.db"):
    """
    Retrieves the Top-K most relevant chunks for a user's document based on vector similarity.
    Enforces user isolation (WHERE user_id = authenticated_user.id).
    Hard limit on total token context size (~3000-5000 tokens).
    """
    conn = sqlite3.connect(db_path)
    init_rag_db(conn)
    c = conn.cursor()
    
    # Authenticated user check & document ownership check
    c.execute(
        "SELECT id, filename FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id)
    )
    doc_row = c.fetchone()
    if not doc_row:
        conn.close()
        raise PermissionError("Document not found or access denied.")
        
    filename = doc_row[1]
    
    # Get all chunks for this document & user
    c.execute(
        "SELECT id, page_number, chunk_text, embedding FROM document_chunks WHERE document_id = ? AND user_id = ?",
        (document_id, user_id)
    )
    chunk_rows = c.fetchall()
    conn.close()
    
    if not chunk_rows:
        return []
        
    # If query is empty or prompt requests overview, return initial representative chunks
    if not query.strip():
        # Pick first 2 and last 1 chunk for a broad overview
        selected = chunk_rows[:2]
        if len(chunk_rows) > 2:
            selected.append(chunk_rows[-1])
        return [
            {
                "chunk_id": r[0],
                "page_number": r[1],
                "text": r[2],
                "score": 1.0
            }
            for r in selected
        ]
        
    # Encode user query locally
    query_emb = generate_local_embeddings([query])[0]
    
    # Calculate similarity scores
    scored_chunks = []
    for r in chunk_rows:
        cid, page_num, text_content, emb_json = r[0], r[1], r[2], r[3]
        try:
            emb_vec = json.loads(emb_json)
            score = cosine_similarity(query_emb, emb_vec)
        except Exception:
            score = 0.0
        scored_chunks.append({
            "chunk_id": cid,
            "page_number": page_num,
            "text": text_content,
            "score": score
        })
        
    # Sort by similarity score descending
    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    
    # Filter top_k and enforce max context token budget (~4 chars per token)
    max_chars = max_tokens * 4
    top_chunks = []
    current_chars = 0
    
    for item in scored_chunks[:top_k]:
        if current_chars + len(item["text"]) > max_chars and len(top_chunks) > 0:
            break
        top_chunks.append(item)
        current_chars += len(item["text"])
        
    return top_chunks


def generate_document_overview_prompt(user_id: str, document_id: str, db_path="cognilearn.db"):
    """
    Extracts representative headers/topics from document for File-Only teaching mode.
    Does NOT send full document to Groq.
    """
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute(
        "SELECT filename FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id)
    )
    row = c.fetchone()
    if not row:
        conn.close()
        raise PermissionError("Document not found")
        
    filename = row[0]
    
    c.execute(
        "SELECT page_number, chunk_text FROM document_chunks WHERE document_id = ? AND user_id = ? ORDER BY page_number ASC LIMIT 3",
        (document_id, user_id)
    )
    sample_chunks = c.fetchall()
    conn.close()
    
    snippet = "\n".join([f"(Page {r[0]}): {r[1][:300]}..." for r in sample_chunks])
    return filename, snippet

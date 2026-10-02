import asyncio
import io
import os
import sqlite3
import sys
import tempfile
import unittest

import fitz
from PIL import Image, ImageDraw, ImageFont

import rag_engine


def make_text_pdf():
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Cell Structure\n\nCells are the basic units of life.\n- Nucleus stores DNA.")
    data = document.tobytes()
    document.close()
    return data


class ContentProcessingTests(unittest.TestCase):
    def test_text_pdf_preserves_page_text_and_paragraph_breaks(self):
        pages = rag_engine.extract_text_from_pdf(make_text_pdf())
        self.assertEqual([page["page"] for page in pages], [1])
        self.assertIn("Cell Structure", pages[0]["text"])
        self.assertIn("Nucleus stores DNA", pages[0]["text"])
        self.assertIn("\n", pages[0]["text"])

    def test_pdf_rag_storage_and_retrieval_use_extracted_content(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = os.path.join(directory, "rag-test.db")
            stored = rag_engine.process_and_store_document("student-1", "lesson.pdf", make_text_pdf(), db_path)
            chunks = rag_engine.retrieve_relevant_chunks("student-1", stored["document_id"], "nucleus DNA", db_path=db_path)
            self.assertTrue(chunks)
            self.assertTrue(any("Nucleus" in chunk["text"] for chunk in chunks))

    def test_corrupt_pdf_returns_readable_error(self):
        with self.assertRaisesRegex(ValueError, "damaged or uses an unsupported format"):
            rag_engine.extract_text_from_pdf(b"not a PDF")

    def test_scanned_pdf_and_labeled_image_run_through_real_ocr(self):
        image = Image.new("RGB", (1400, 420), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=72)
        draw.text((80, 60), "START", fill="black", font=font)
        draw.text((650, 60), "CHECK INPUT", fill="black", font=font)
        draw.text((80, 270), "END", fill="black", font=font)
        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")
        png_bytes = image_buffer.getvalue()

        image_text = rag_engine.extract_text_from_image(png_bytes)
        self.assertIn("START", image_text.upper())
        self.assertIn("x=", image_text)

        with tempfile.TemporaryDirectory() as directory:
            image_db = os.path.join(directory, "image-test.db")
            stored_image = rag_engine.process_and_store_image("student-1", "diagram.png", png_bytes, image_db)
            loaded_image = rag_engine.get_stored_image("student-1", stored_image["image_id"], image_db)
            self.assertIn("CHECK", loaded_image["extracted_text"].upper())

        blank = Image.new("RGB", (500, 300), "white")
        blank_buffer = io.BytesIO()
        blank.save(blank_buffer, format="PNG")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "couldn't read text"):
                rag_engine.process_and_store_image("student-1", "blank.png", blank_buffer.getvalue(), os.path.join(directory, "blank-image-test.db"))

        pdf = fitz.open()
        page = pdf.new_page(width=700, height=210)
        page.insert_image(page.rect, stream=png_bytes)
        pdf_bytes = pdf.tobytes()
        pdf.close()
        scanned_pages = rag_engine.extract_text_from_pdf(pdf_bytes)
        self.assertTrue(scanned_pages)
        self.assertIn("CHECK", scanned_pages[0]["text"].upper())
        with tempfile.TemporaryDirectory() as directory:
            pdf_db = os.path.join(directory, "scanned-pdf-test.db")
            stored_pdf = rag_engine.process_and_store_document("student-1", "scan.pdf", pdf_bytes, pdf_db)
            retrieved = rag_engine.retrieve_relevant_chunks("student-1", stored_pdf["document_id"], "check input", db_path=pdf_db)
            self.assertTrue(retrieved)
            self.assertIn("CHECK", retrieved[0]["text"].upper())

    def test_invalid_image_returns_readable_error(self):
        with self.assertRaisesRegex(ValueError, "damaged or unreadable"):
            rag_engine.extract_text_from_image(b"not an image")

    def test_chunking_keeps_paragraph_and_list_lines(self):
        text = "Heading\n\n" + " ".join(["word"] * 850) + "\n- First item\n- Second item\n"
        chunks = rag_engine.chunk_pages_data([{"page": 2, "text": text}], target_words=100, overlap_words=10)
        self.assertTrue(any("Heading\n" in chunk["text"] for chunk in chunks))
        self.assertTrue(any("- First item\n- Second item" in chunk["text"] for chunk in chunks))


class HistoryApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_cwd = os.getcwd()
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.chdir(cls.temp_dir.name)
        backend_dir = os.path.dirname(__file__)
        sys.path.insert(0, backend_dir)
        import main
        cls.main = main

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls.original_cwd)
        cls.temp_dir.cleanup()
        sys.path.remove(os.path.dirname(__file__))

    def setUp(self):
        os.chdir(self.temp_dir.name)
        self.main.get_current_user = lambda _authorization: {"id": "history-test-user"}

    def test_history_saves_content_metadata_and_tolerates_incomplete_old_rows(self):
        lesson = self.main.HistoryItem(
            id="complete-session", topic="Fractions", subject="Mathematics", language="en",
            date="2026-10-02", questionsAsked=["Why divide?"],
            blocks=[
                {"id": "point-1", "tag": "POINT", "content": "A fraction is a ratio."},
                {"id": "explain-1", "tag": "EXPLAIN", "content": "The numerator counts selected parts."},
            ]
        )
        asyncio.run(self.main.save_history(lesson))

        conn = sqlite3.connect("cognilearn.db")
        conn.execute(
            "INSERT INTO history (id, user_id, topic, blocks, questions, date) VALUES (?, ?, ?, ?, ?, ?)",
            ("older-session", "history-test-user", "Old lesson", "{broken", None, None)
        )
        conn.commit()
        conn.close()

        sessions = asyncio.run(self.main.get_history())
        complete = next(session for session in sessions if session["id"] == "complete-session")
        older = next(session for session in sessions if session["id"] == "older-session")
        self.assertEqual([block["tag"] for block in complete["blocks"]], ["POINT", "EXPLAIN"])
        self.assertEqual(complete["subject"], "Mathematics")
        self.assertEqual(complete["language"], "en")
        self.assertEqual(older["blocks"], [])
        self.assertEqual(older["questionsAsked"], [])

    def test_missing_uploaded_source_returns_an_error_instead_of_generic_lesson(self):
        original_retrieval = self.main.retrieve_relevant_chunks
        self.main.retrieve_relevant_chunks = lambda *_args, **_kwargs: []
        try:
            request = self.main.TeachRequest(topic="A topic missing from this file", document_id="missing-document")
            with self.assertRaises(self.main.HTTPException) as raised:
                asyncio.run(self.main.start_lesson(request, None, authorization="Bearer test"))
            self.assertEqual(raised.exception.status_code, 422)
        finally:
            self.main.retrieve_relevant_chunks = original_retrieval

    def test_unavailable_uploaded_image_returns_not_found(self):
        original_get_image = self.main.get_stored_image
        self.main.get_stored_image = lambda *_args, **_kwargs: (_ for _ in ()).throw(PermissionError("not found"))
        try:
            request = self.main.TeachRequest(topic="Explain it", image_id="missing-image")
            with self.assertRaises(self.main.HTTPException) as raised:
                asyncio.run(self.main.start_lesson(request, None, authorization="Bearer test"))
            self.assertEqual(raised.exception.status_code, 404)
        finally:
            self.main.get_stored_image = original_get_image


if __name__ == "__main__":
    unittest.main()

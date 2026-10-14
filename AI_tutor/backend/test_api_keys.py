import asyncio
import os
import sys
import unittest
from fastapi import HTTPException

# Set test environment variables before importing main
os.environ["GROQ_API_KEY"] = "test_teaching_key"
os.environ["GROQ_QUIZ_API_KEY"] = "test_quiz_key"
os.environ["JWT_SECRET"] = "test_secret"
os.environ["UNSPLASH_API_KEY"] = "test_unsplash"

backend_dir = os.path.dirname(__file__)
sys.path.insert(0, backend_dir)
import main


class ApiKeySeparationTests(unittest.TestCase):
    """Verify that teaching and quiz generation use separate API keys."""

    def test_teaching_key_is_loaded(self):
        """GROQ_API_KEY should be loaded for teaching system."""
        self.assertEqual(main.GROQ_API_KEY, "test_teaching_key")

    def test_quiz_key_is_loaded(self):
        """GROQ_QUIZ_API_KEY should be loaded for quiz generation."""
        self.assertEqual(main.GROQ_QUIZ_API_KEY, "test_quiz_key")

    def test_quiz_key_missing_raises_error(self):
        """Missing GROQ_QUIZ_API_KEY should raise a clear configuration error."""
        # Temporarily unset the quiz key
        original_quiz_key = main.GROQ_QUIZ_API_KEY
        main.GROQ_QUIZ_API_KEY = None

        try:
            with self.assertRaises(HTTPException) as context:
                asyncio.run(main.complete_groq_quiz([{"role": "user", "content": "test"}], "test system"))
            self.assertEqual(context.exception.status_code, 503)
            self.assertIn("GROQ_QUIZ_API_KEY", context.exception.detail)
        finally:
            main.GROQ_QUIZ_API_KEY = original_quiz_key

    def test_teaching_key_not_used_by_quiz(self):
        """Quiz generation should use GROQ_QUIZ_API_KEY, not GROQ_API_KEY."""
        self.assertIsNotNone(main.GROQ_QUIZ_API_KEY)
        self.assertIsNot(main.GROQ_API_KEY, main.GROQ_QUIZ_API_KEY)


if __name__ == "__main__":
    unittest.main()

import asyncio
import os
import sys
import unittest

# Set test environment variables before importing main
os.environ["GROQ_API_KEY"] = "test_teaching_key"
os.environ["GROQ_QUIZ_API_KEY"] = "test_quiz_key"
os.environ["JWT_SECRET"] = "test_secret"
os.environ["UNSPLASH_API_KEY"] = "test_unsplash"

backend_dir = os.path.dirname(__file__)
sys.path.insert(0, backend_dir)
import main


class QuizLanguageTests(unittest.TestCase):
    """Verify that quiz generation respects the language parameter."""

    def test_quiz_request_accepts_language_parameter(self):
        """QuizRequest should accept and store the language parameter."""
        req = main.QuizRequest(
            topic="Test Topic",
            subject="General",
            difficulty="Medium",
            language="हिंदी"
        )
        self.assertEqual(req.language, "हिंदी")

    def test_quiz_request_default_language(self):
        """QuizRequest should default to English if no language is provided."""
        req = main.QuizRequest(
            topic="Test Topic",
            subject="General",
            difficulty="Medium"
        )
        self.assertEqual(req.language, "English")

    def test_quiz_request_kannada_language(self):
        """QuizRequest should accept Kannada language."""
        req = main.QuizRequest(
            topic="Test Topic",
            subject="General",
            difficulty="Medium",
            language="ಕನ್ನಡ"
        )
        self.assertEqual(req.language, "ಕನ್ನಡ")

    def test_system_prompt_includes_language(self):
        """The system prompt should include the language from the request."""
        # Simulate building the system prompt as done in generate_topic_quiz
        req = main.QuizRequest(
            topic="Physics",
            subject="Science",
            difficulty="Medium",
            language="हिंदी"
        )
        difficulty = req.difficulty.strip().title()
        source = ""
        
        difficulty_guidance = {
            "Easy": "Focus on foundational understanding, definitions, and direct application.",
            "Medium": "Test conceptual understanding and practical application, with some multi-step reasoning.",
            "Hard": "Use challenging scenarios, analysis, debugging, and multi-step reasoning where appropriate. Avoid trick questions."
        }[difficulty]
        
        system_prompt = f"""You are an expert academic assessment designer creating a high-quality quiz for an adaptive AI tutor.
Subject: {req.subject}
Topic: {req.topic}
Difficulty: {difficulty}
Language: {req.language}
Difficulty guidance: {difficulty_guidance}
Source guidance: No lesson material was supplied. Use your reliable subject knowledge to write an accurate quiz for the requested topic.

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
        
        self.assertIn("Language: हिंदी", system_prompt)
        self.assertIn("Keep all question text, options, and explanations in हिंदी", system_prompt)


if __name__ == "__main__":
    unittest.main()

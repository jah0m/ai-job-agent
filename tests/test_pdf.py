from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ai_job_search.pdf import normalize_text, verify_pdf


class PdfVerificationTests(unittest.TestCase):
    @patch("ai_job_search.pdf.extract_pdf")
    def test_accepts_pages_and_required_ats_text(self, extract) -> None:
        extract.return_value = (
            2,
            "山田太郎\n職務経歴書\nEmail: candidate@example.com",
            "pypdf",
        )

        result = verify_pdf(
            "ignored.pdf",
            expected_pages=2,
            min_characters=20,
            required_text=("職務経歴書", "candidate@example.com"),
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["warnings"], [])

    @patch("ai_job_search.pdf.extract_pdf")
    def test_reports_page_text_glyph_and_required_text_failures(self, extract) -> None:
        extract.return_value = (3, "short (cid:123) \ufffd", "poppler")

        result = verify_pdf(
            "ignored.pdf",
            expected_pages=2,
            min_characters=100,
            required_text=("履歴書",),
        )

        self.assertFalse(result["ok"])
        self.assertEqual(len(result["errors"]), 5)
        self.assertIn("expected 2 page(s), found 3", result["errors"])

    def test_normalize_text_collapses_layout_whitespace(self) -> None:
        self.assertEqual(normalize_text("職務\n  経歴書"), "職務 経歴書")


if __name__ == "__main__":
    unittest.main()

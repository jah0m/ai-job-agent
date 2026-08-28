from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ai_job_search.cli import main
from job_fixtures import normalized_job


class CliEndToEndTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.home = self.base / ".job-search"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_cli(self, *arguments: str):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = main(["--home", str(self.home), *arguments])
        self.assertEqual(exit_code, 0, stderr.getvalue())
        return json.loads(stdout.getvalue())

    def run_cli_failure(self, *arguments: str) -> str:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = main(["--home", str(self.home), *arguments])
        self.assertEqual(exit_code, 2)
        self.assertEqual(stdout.getvalue(), "")
        return stderr.getvalue()

    def valid_documents(self) -> dict[str, str]:
        return {
            "rirekisho.md": """# 履歴書

## 基本情報

- 氏名：CLI Candidate
- 連絡先：cli@example.invalid

## 学歴・職歴

| 年月 | 内容 |
| --- | --- |
| 2022年 | Example University |

## 免許・資格

- なし

## 志望動機・自己PR

Reliable engineer.

## 本人希望欄

貴社規定に従います。
""",
            "shokumu-keirekisho.md": """# 職務経歴書

**CLI Candidate
CLI Candidate**

Phone: 090-0000-0000 · Email: cli@example.invalid

## 職務要約

業務システムの設計と実装を担当。

## 活かせる経験・知識・技術

- Webサービス開発

## テクニカルスキル

| 区分 | スキル・技術 |
| --- | --- |
| 主な強み・得意領域 | Python |
| 実務経験 | AWS |
| 開発工程・手法 | アジャイル |
| 語学力 | 日本語 |

## 職務経歴

### 2022年 4月～現在｜Example KK

- **事業内容：** ソフトウェア開発
- **雇用形態：** 正社員

#### ① 2022年 4月～現在 ／ Platform service

- **担当：** 設計、実装、テスト

##### プロジェクト概要

業務支援サービスを開発。

##### 業務内容・工夫

- **設計：** APIを設計。

##### 成果・実績

- **改善：** 品質を改善。

##### 開発環境

| 区分 | 内容 |
| --- | --- |
| 言語・FW | Python |
| インフラ・環境 | AWS |

## 資格

- なし

## 自己PR

事実に基づき丁寧に開発します。
""",
        }

    def test_complete_cli_lifecycle(self) -> None:
        self.run_cli("init")
        snapshot = self.home / "cache" / "ai-1.html"
        snapshot.write_text(
            "<html><h1>AI Engineer</h1><p>Public detail page.</p></html>",
            encoding="utf-8",
        )
        source_metadata = self.run_cli(
            "job",
            "evidence",
            "--portal",
            "test",
            "--url",
            "https://example.invalid/jobs/ai-1",
            "--snapshot",
            str(snapshot),
            "--retriever",
            "test-search/1",
        )
        jobs_file = self.base / "jobs.json"
        job = normalized_job(
            self.home,
            provider="test",
            external_id="ai-1",
            title="AI Engineer",
            company="Example KK",
            url="https://example.invalid/jobs/ai-1",
        )
        job["source"] = source_metadata
        jobs_file.write_text(
            json.dumps(job),
            encoding="utf-8",
        )
        validation = self.run_cli(
            "job", "validate", "--portal", "test", "--file", str(jobs_file)
        )
        self.assertTrue(validation["valid"])
        self.run_cli("job", "import", "--portal", "test", "--file", str(jobs_file))
        job = self.run_cli("job", "list")[0]
        evaluation_file = self.base / "evaluation.json"
        evaluation_file.write_text(
            json.dumps(
                {
                    "schema_version": 2,
                    "recommendation": "consider",
                    "summary": "Relevant experience, with important unknowns.",
                    "strengths": ["Verified AI product experience."],
                    "gaps": {
                        "disqualifying": [],
                        "learnable": [],
                        "unclear": ["Work style is unknown."],
                    },
                    "questions": ["What is the office policy?"],
                    "hard_constraints": {
                        "result": "unclear",
                        "reasons": ["Office policy is not in the source."],
                    },
                    "confidence": "low",
                    "source_limitations": "Search summary only.",
                }
            ),
            encoding="utf-8",
        )
        evaluation = self.run_cli(
            "job", "evaluate", job["id"], "--file", str(evaluation_file)
        )
        self.assertEqual(evaluation["recommendation"], "consider")
        posting = self.base / "posting.md"
        posting.write_text("# Platform Engineer\n", encoding="utf-8")
        application = self.run_cli(
            "apply",
            "--company",
            "Example KK",
            "--role",
            "Platform Engineer",
            "--source",
            str(posting),
        )
        draft = self.base / "draft"
        draft.mkdir()
        for name, content in self.valid_documents().items():
            (draft / name).write_text(content, encoding="utf-8")
        saved = self.run_cli(
            "draft", "save", application["id"], "--from", str(draft),
            "--label", "CLI integration",
        )
        self.assertEqual(saved["revision"], 1)
        self.assertTrue(self.run_cli("draft", "validate", application["id"])["validation"]["ready"])
        package = self.run_cli(
            "package", "create", application["id"], "--expected-revision", "1"
        )
        submission = self.run_cli(
            "submit",
            application["id"],
            "--package",
            package["package_id"],
            "--evidence",
            "source_only",
        )
        audit = self.run_cli("audit")
        shown = self.run_cli("application", "show", application["id"])

        self.assertEqual(submission["package_id"], package["package_id"])
        self.assertEqual(submission["evidence_level"], "source_only")
        self.assertTrue(audit["ok"])
        self.assertEqual(shown["status"], "applied")
        self.assertEqual(len(shown["submissions"]), 1)

    def test_profile_and_preferences_use_validated_cli_updates(self) -> None:
        self.run_cli("init")

        profile = self.run_cli("profile", "show")
        profile["schema_version"] = 999
        profile["identity"]["name_en"] = "CLI Candidate"
        profile["summary"] = "Evidence-backed summary."
        profile["skills"] = ["Python", "PostgreSQL"]
        profile_file = self.base / "candidate-update.json"
        profile_file.write_text(json.dumps(profile), encoding="utf-8")

        saved_profile = self.run_cli(
            "profile", "update", "--file", str(profile_file)
        )
        self.assertEqual(saved_profile["schema_version"], 2)
        self.assertEqual(saved_profile["identity"]["name_en"], "CLI Candidate")
        self.assertEqual(self.run_cli("profile", "show"), saved_profile)

        preferences = self.run_cli("preferences", "show")
        preferences["target_roles"] = ["Platform Engineer"]
        preferences["target_domains"] = ["Developer tools"]
        preferences["locations"] = ["Tokyo"]
        preferences["work_style"] = {
            "remote_preferred": True,
            "maximum_office_days_per_week": 2,
        }
        preferences["compensation"] = {
            "currency": "JPY",
            "minimum": 8_000_000,
            "target": 10_000_000,
        }
        preferences["blacklisted_companies"] = ["Do Not Apply KK", "Blocked Co"]
        preferences_file = self.base / "preferences-update.json"
        preferences_file.write_text(json.dumps(preferences), encoding="utf-8")

        saved_preferences = self.run_cli(
            "preferences", "update", "--file", str(preferences_file)
        )
        self.assertEqual(saved_preferences["schema_version"], 2)
        self.assertEqual(saved_preferences["target_roles"], ["Platform Engineer"])
        self.assertEqual(
            saved_preferences["blacklisted_companies"], ["Do Not Apply KK", "Blocked Co"]
        )
        self.assertEqual(self.run_cli("preferences", "show"), saved_preferences)

    def test_invalid_profile_and_preferences_updates_do_not_replace_state(self) -> None:
        self.run_cli("init")
        original_profile = self.run_cli("profile", "show")
        invalid_profile = dict(original_profile)
        invalid_profile["skills"] = [{"name": "Python"}]
        profile_file = self.base / "invalid-profile.json"
        profile_file.write_text(json.dumps(invalid_profile), encoding="utf-8")

        error = self.run_cli_failure(
            "profile", "update", "--file", str(profile_file)
        )
        self.assertIn("skills entries must be strings", error)
        self.assertEqual(self.run_cli("profile", "show"), original_profile)

        original_preferences = self.run_cli("preferences", "show")
        invalid_preferences = dict(original_preferences)
        invalid_preferences["work_style"] = {
            "maximum_office_days_per_week": 8,
        }
        preferences_file = self.base / "invalid-preferences.json"
        preferences_file.write_text(json.dumps(invalid_preferences), encoding="utf-8")

        error = self.run_cli_failure(
            "preferences", "update", "--file", str(preferences_file)
        )
        self.assertIn("must be between 0 and 7", error)
        self.assertEqual(self.run_cli("preferences", "show"), original_preferences)


if __name__ == "__main__":
    unittest.main()

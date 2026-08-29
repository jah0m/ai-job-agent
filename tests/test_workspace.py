from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ai_job_search.workspace import Workspace, WorkspaceError, slugify  # noqa: E402
from job_fixtures import normalized_job  # noqa: E402

JST = timezone(timedelta(hours=9))


class WorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / ".job-search"
        self.workspace = Workspace(self.root)
        self.workspace.initialize()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def create_application(self):
        posting = Path(self.temporary.name) / "posting.md"
        posting.write_text("# AI Engineer\nBuild reliable systems.\n", encoding="utf-8")
        return self.workspace.create_application(
            company="Example 株式会社",
            role="AI Engineer",
            source=posting,
            job_url="https://example.invalid/jobs/1",
        )

    def valid_documents(self, *, resume_suffix: str = "") -> dict[str, bytes]:
        resume = f"""# 履歴書

作成日：2026年08月27日

## 基本情報

- 氏名：Example Candidate{resume_suffix}
- 連絡先：candidate@example.invalid
- 居住地：Tokyo

## 学歴・職歴

| 年月 | 内容 |
| --- | --- |
| 2022年 | Example University |

## 免許・資格

- なし

## 志望動機・自己PR

Reliable software engineer.

## 本人希望欄

貴社規定に従います。
"""
        shokumu = """# 職務経歴書

**Example Candidate
Example Candidate**

Phone: 090-0000-0000 · Email: candidate@example.invalid · [Profile](https://example.invalid/profile) · [Code](https://example.invalid/code)

## 職務要約

業務システムの設計、実装、運用を一貫して担当。

## 活かせる経験・知識・技術

- 要件整理から運用保守までのWebサービス開発
- 関係者と連携した品質改善

## テクニカルスキル

| 区分 | スキル・技術 |
| --- | --- |
| 主な強み・得意領域 | Python, REST API |
| 実務経験 | AWS, PostgreSQL |
| 開発工程・手法 | 要件定義, アジャイル |
| 語学力 | 日本語（ビジネス） |

## 職務経歴

### 2022年 4月～現在｜Example 株式会社

- **事業内容：** 業務システムの企画・開発
- **雇用形態：** 正社員

#### ① 2022年 4月～現在 ／ 業務支援サービス

- **役職：** Software Engineer
- **チーム規模：** 5名
- **担当：** 要件整理、設計、実装、テスト

##### プロジェクト概要

業務支援サービスの改善と新機能開発を担当。

##### 業務内容・工夫

- **設計・実装：** APIとデータ構造を設計・実装。
- **品質管理：** テスト項目を作成し品質を確認。

##### 成果・実績

- **継続改善：** 利用者のフィードバックをもとに改善を実施。

##### 開発環境

| 区分 | 内容 |
| --- | --- |
| 言語・FW | Python |
| インフラ・環境 | AWS |
| DB・ミドルウェア | PostgreSQL |
| 手法・ツール | Git |

## 資格

- なし

## 自己PR

利用者の課題を起点に、保守性と使いやすさを両立したシステム開発を進めます。
"""
        return {
            "rirekisho.md": resume.encode("utf-8"),
            "shokumu-keirekisho.md": shokumu.encode("utf-8"),
        }

    def save_valid_draft(self, application_id: str, *, label: str = "AI draft"):
        return self.workspace.save_draft(
            application_id,
            documents=self.valid_documents(),
            label=label,
            status="working",
            actor="ai",
        )

    def package_valid_materials(self, application_id: str):
        self.save_valid_draft(application_id)
        return self.workspace.lock_current_materials(application_id, actor="ai")

    def test_shokumu_template_matches_markdown_resume_shape(self) -> None:
        template = (
            Path(__file__).resolve().parents[1] / "templates" / "ja" / "shokumu-keirekisho.md"
        ).read_text(encoding="utf-8")
        for marker in (
            "# 職務経歴書",
            "## 職務要約",
            "## 活かせる経験・知識・技術",
            "## テクニカルスキル",
            "## 職務経歴",
            "### YYYY年 M月～現在｜会社名",
            "#### プロジェクト名",
            "##### プロジェクト概要",
            "##### 業務内容・工夫",
            "##### 成果・実績",
            "##### 開発環境",
            "## 資格",
            "## 自己PR",
        ):
            self.assertIn(marker, template)
        self.assertNotIn("application_id", template)
        self.assertNotIn("```", template)

    def test_initialize_is_idempotent_and_does_not_overwrite_profile(self) -> None:
        profile = self.workspace.show_candidate_profile()
        profile["identity"] = {"name": "private"}
        self.workspace.update_candidate_profile(profile)

        self.workspace.initialize()

        reloaded = self.workspace.show_candidate_profile()
        self.assertEqual(reloaded["identity"]["name"], "private")

    def test_application_ids_are_stable_and_duplicate_safe(self) -> None:
        first = self.create_application()
        second = self.create_application()

        self.assertIn("example-株式会社-ai-engineer", first["id"])
        self.assertEqual(second["id"], first["id"] + "-2")
        self.assertEqual(len(self.workspace.list_applications()), 2)
        self.assertTrue((self.root / first["source"]).is_file())

    def test_current_materials_packages_and_submission(self) -> None:
        application = self.create_application()
        first = self.save_valid_draft(application["id"])
        self.assertEqual(first["revision"], 1)
        self.assertEqual(first["status"], "working")
        self.assertTrue(first["validation"]["ready"])
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)

        feedback = self.workspace.save_draft(
            application["id"],
            documents=self.valid_documents(resume_suffix=" revised"),
            label="Feedback revision",
            status="working",
            actor="ai",
            expected_revision=1,
        )
        self.assertEqual(feedback["revision"], 2)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)
        with self.assertRaisesRegex(WorkspaceError, "revision conflict"):
            self.workspace.save_draft(
                application["id"], documents=self.valid_documents(), expected_revision=1
            )

        initial_package = self.workspace.lock_current_materials(
            application["id"],
            label="Confirmed revision",
            actor="ai",
            expected_revision=2,
            created=datetime(2026, 8, 26, 15, 30, 12, 123456, tzinfo=JST),
        )
        self.assertEqual(initial_package["kind"], "material_package")
        self.assertEqual(initial_package["source_draft_revision"], 2)
        self.assertEqual(initial_package["source_draft_id"], f"{application['id']}-draft")
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 1)
        self.assertEqual(
            self.workspace.show_application(application["id"])["draft"]["status"],
            "working",
        )

        self.workspace.save_deliverable_file(
            application["id"],
            filename="application.pdf",
            payload=b"%PDF-1.4 test",
            purpose="other",
            expected_revision=2,
        )
        package = self.workspace.lock_current_materials(
            application["id"],
            created=datetime(2026, 8, 28, 10, 44, tzinfo=JST),
        )
        submission = self.workspace.submit(
            application["id"],
            package_id=package["package_id"],
            selected_paths=["deliverables/application.pdf"],
            created=datetime(2026, 8, 28, 10, 45, tzinfo=JST),
        )

        self.assertEqual(submission["package_id"], package["package_id"])
        self.assertEqual(
            {item["path"] for item in submission["files"]},
            {"deliverables/application.pdf"},
        )
        shown = self.workspace.show_application(application["id"])
        self.assertEqual(shown["status"], "applied")
        with self.assertRaisesRegex(WorkspaceError, "permanently locked"):
            self.workspace.delete_package(application["id"], package_id=package["package_id"])
        self.assertTrue(self.workspace.audit()["ok"])

    def test_content_gate_and_restore_from_package(self) -> None:
        application = self.create_application()
        invalid = self.valid_documents()
        invalid["shokumu-keirekisho.md"] = invalid["shokumu-keirekisho.md"].replace(
            "- **担当：**".encode(),
            "- **职责：**".encode(),
        )
        saved = self.workspace.save_draft(
            application["id"], documents=invalid, status="working", actor="web"
        )
        self.assertFalse(saved["validation"]["format_valid"])
        with self.assertRaisesRegex(WorkspaceError, "cannot be locked"):
            self.workspace.lock_current_materials(application["id"], require_content_ready=True)

        clean = self.workspace.save_draft(
            application["id"],
            documents=self.valid_documents(),
            status="working",
            actor="web",
            expected_revision=saved["revision"],
        )
        first_package = self.workspace.lock_current_materials(application["id"])
        self.assertEqual(clean["revision"], 2)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 1)

        cloned = self.workspace.restore_current_materials_from_package(
            application["id"], package_id=first_package["package_id"], actor="web"
        )
        self.assertEqual(cloned["base_package_id"], first_package["package_id"])
        changed = self.workspace.save_draft(
            application["id"],
            documents={"rirekisho.md": self.valid_documents(resume_suffix=" v2")["rirekisho.md"]},
            status="working",
            actor="web",
            expected_revision=cloned["revision"],
        )
        second_package = self.workspace.lock_current_materials(application["id"])
        self.assertEqual(changed["revision"], cloned["revision"] + 1)
        self.assertNotEqual(second_package["package_id"], first_package["package_id"])
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 2)

    def test_custom_markdown_layout_is_not_rejected(self) -> None:
        application = self.create_application()
        documents = self.valid_documents()
        custom = documents["shokumu-keirekisho.md"].decode("utf-8")
        for old, new in (
            ("## 職務要約", "## キャリアの概要"),
            ("## 活かせる経験・知識・技術", "## 主な経験"),
            ("## テクニカルスキル", "## 技術領域"),
            ("| 区分 | スキル・技術 |", "| Category | Tools |"),
            ("##### プロジェクト概要", "##### 背景"),
            ("##### 業務内容・工夫", "##### 実施内容"),
            ("##### 成果・実績", "##### 結果"),
            ("##### 開発環境", "##### 技術スタック"),
            ("| 区分 | 内容 |", "| Tool | Detail |"),
        ):
            custom = custom.replace(old, new)
        documents["shokumu-keirekisho.md"] = custom.encode("utf-8")

        saved = self.workspace.save_draft(
            application["id"], documents=documents, status="working", actor="web"
        )
        self.assertTrue(saved["validation"]["format_valid"])
        self.assertTrue(saved["validation"]["ready"])
        package = self.workspace.lock_current_materials(
            application["id"], require_content_ready=True
        )
        self.assertEqual(package["source_draft_revision"], saved["revision"])

    def test_submission_auto_packages_current_exact_files(self) -> None:
        application = self.create_application()
        draft = self.save_valid_draft(application["id"])
        current = self.workspace.save_deliverable_file(
            application["id"],
            filename="履歴書.pdf",
            payload=b"%PDF-1.4 exact file",
            purpose="rirekisho",
            expected_revision=draft["revision"],
        )

        submission = self.workspace.submit(
            application["id"],
            selected_paths=["deliverables/履歴書.pdf"],
            evidence_level="exact_files",
            channel="company_portal",
            expected_revision=current["revision"],
        )

        self.assertIsNotNone(submission["package_id"])
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 1)
        self.assertEqual(
            [item["path"] for item in submission["files"]],
            ["deliverables/履歴書.pdf"],
        )
        with self.assertRaisesRegex(WorkspaceError, "permanently locked"):
            self.workspace.delete_package(application["id"], package_id=submission["package_id"])

    def test_status_only_submission_has_no_material_claim(self) -> None:
        application = self.create_application()
        submission = self.workspace.submit(
            application["id"], evidence_level="status_only", channel="other"
        )

        self.assertIsNone(submission["package_id"])
        self.assertEqual(submission["files"], [])
        self.assertEqual(self.workspace.list_packages(application["id"]), [])
        with self.assertRaisesRegex(WorkspaceError, "记录已完成的投递"):
            self.workspace.update_status(application["id"], status="applied")

    def test_discard_draft_preserves_previous_revision(self) -> None:
        application = self.create_application()
        saved = self.save_valid_draft(application["id"])
        discarded = self.workspace.discard_draft(
            application["id"], expected_revision=saved["revision"], actor="web"
        )
        self.assertEqual(discarded["status"], "empty")
        self.assertEqual(discarded["revision"], saved["revision"] + 1)
        self.assertIsNone(discarded["trash_path"])
        with self.workspace.connect() as connection:
            revisions = connection.execute(
                "SELECT revision FROM draft_revisions WHERE application_id=? ORDER BY revision",
                (application["id"],),
            ).fetchall()
        self.assertEqual([row["revision"] for row in revisions], [0, 1, 2])
        self.assertEqual(self.workspace.show_draft(application["id"])["files"], [])

    def test_audit_detects_modified_package(self) -> None:
        application = self.create_application()
        package = self.package_valid_materials(application["id"])
        package_file = self.workspace.package_file_path(
            application["id"], package["package_id"], "rirekisho.md"
        )
        package_file.write_text("tampered", encoding="utf-8")

        result = self.workspace.audit()

        self.assertFalse(result["ok"])
        self.assertTrue(any("mismatch object" in error for error in result["errors"]))

    def test_audit_reports_unreferenced_object_for_gc(self) -> None:
        digest, _, _ = self.workspace.objects.put_bytes(b"unreferenced")

        result = self.workspace.audit()

        self.assertTrue(result["ok"])
        self.assertIn(digest, result["orphan_objects"])

    def test_status_rejects_unknown_value(self) -> None:
        application = self.create_application()
        with self.assertRaises(WorkspaceError):
            self.workspace.update_status(application["id"], status="maybe")

    def test_import_deduplicates_and_creates_application_from_job(self) -> None:
        search_file = Path(self.temporary.name) / "results.json"
        search_file.write_text(
            json.dumps(
                normalized_job(
                    self.root,
                    provider="green",
                    external_id="42",
                    title="Senior AI Engineer",
                    company="Example KK",
                    location="Tokyo",
                    url="https://jobs.example.invalid/42#details",
                    posted_at="2026-08-25",
                )
            ),
            encoding="utf-8",
        )

        first = self.workspace.import_jobs(portal="Green", source_file=search_file)
        second = self.workspace.import_jobs(portal="Green", source_file=search_file)
        jobs = self.workspace.list_jobs()
        application = self.workspace.create_application_from_job(jobs[0]["id"])

        self.assertEqual(first, {"portal": "green", "imported": 1, "updated": 0, "skipped": 0})
        self.assertEqual(second, {"portal": "green", "imported": 0, "updated": 1, "skipped": 0})
        self.assertEqual(len(jobs), 1)
        self.assertNotIn("#details", jobs[0]["url"])
        self.assertEqual(application["source_job_id"], jobs[0]["id"])
        self.assertTrue((self.root / application["source"]).is_file())
        self.assertEqual(self.workspace.list_jobs(status="applied")[0]["id"], jobs[0]["id"])
        with self.workspace.connect() as connection:
            connection.execute("UPDATE jobs SET status = 'saved' WHERE id = ?", (jobs[0]["id"],))
        with self.assertRaisesRegex(WorkspaceError, "Applied jobs cannot change back"):
            self.workspace.update_job_status(jobs[0]["id"], status="skipped")
        self.workspace.initialize()
        self.assertEqual(self.workspace.show_job(jobs[0]["id"])["status"], "applied")

    def test_ai_job_evaluation_is_versioned_and_reports_stale_inputs(self) -> None:
        search_file = Path(self.temporary.name) / "evaluation-job.json"
        search_file.write_text(
            json.dumps(
                normalized_job(
                    self.root,
                    provider="test",
                    external_id="ai-1",
                    title="AI Engineer",
                    company="Example KK",
                    location="Tokyo",
                    url="https://jobs.example.invalid/ai-1",
                )
            ),
            encoding="utf-8",
        )
        self.workspace.import_jobs(portal="test", source_file=search_file)
        job_id = self.workspace.list_jobs()[0]["id"]
        evaluation = {
            "schema_version": 2,
            "recommendation": "pursue",
            "summary": "The role aligns with verified AI product and platform experience.",
            "strengths": ["Built and operated an LLM product pipeline."],
            "gaps": {
                "disqualifying": [],
                "learnable": ["The posting asks for SageMaker, which is not recorded."],
                "unclear": ["Office attendance is not stated."],
            },
            "questions": ["How many office days are required?"],
            "hard_constraints": {
                "result": "unclear",
                "reasons": ["Work style needs confirmation."],
            },
            "confidence": "medium",
            "source_limitations": "The saved posting is a search summary.",
        }

        first = self.workspace.record_job_evaluation(job_id, evaluation)
        latest = self.workspace.latest_job_evaluation(job_id)

        self.assertEqual(latest["id"], first["id"])
        self.assertEqual(latest["recommendation"], "pursue")
        self.assertEqual(latest["strengths"], evaluation["strengths"])
        self.assertFalse(latest["stale"])
        dashboard_rows = self.workspace.list_jobs_for_dashboard()
        self.assertEqual(dashboard_rows[0]["evaluation"]["recommendation"], "pursue")
        self.assertEqual(dashboard_rows[0]["raw"]["title"], "AI Engineer")

        preferences = self.workspace.show_preferences()
        preferences["locations"] = ["Osaka"]
        self.workspace.update_preferences(preferences)
        stale = self.workspace.latest_job_evaluation(job_id)
        self.assertTrue(stale["stale"])
        self.assertIn("求职偏好已在分析后更新", stale["stale_reasons"])

        second = self.workspace.record_job_evaluation(job_id, evaluation)
        self.assertGreater(second["id"], first["id"])
        self.assertFalse(self.workspace.latest_job_evaluation(job_id)["stale"])

        invalid = dict(evaluation, recommendation="maybe")
        with self.assertRaisesRegex(WorkspaceError, "recommendation"):
            self.workspace.record_job_evaluation(job_id, invalid)

    def test_slugify_supports_japanese_and_safe_fallback(self) -> None:
        self.assertEqual(slugify(" 株式会社 テスト "), "株式会社-テスト")
        self.assertTrue(slugify("---").startswith("item-"))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from ai_job_search.web import create_app
from ai_job_search.workspace import Workspace
from job_fixtures import normalized_job


class DashboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / ".job-search"
        self.workspace = Workspace(self.root)
        self.workspace.initialize()
        candidate = self.workspace.show_candidate_profile()
        candidate.update(
            {
                "identity": {
                    "name_en": "Example Candidate",
                    "current_title": "Engineer",
                },
                "summary": "Builds reliable software.",
                "experience": [
                    {"company": "Example Co", "title_en": "Engineer", "start": "2022"}
                ],
                "skills": ["Python", "AWS"],
            }
        )
        self.workspace.update_candidate_profile(candidate)
        preferences = self.workspace.show_preferences()
        preferences.update(
            {"target_roles": ["Backend Engineer"], "locations": ["Tokyo"]}
        )
        self.workspace.update_preferences(preferences)
        payload = normalized_job(
            self.root,
            provider="test",
            external_id="acme/backend",
            title="Backend Engineer",
            company="Acme KK",
            location="Tokyo",
            url="https://example.invalid/jobs/backend",
            salary={
                "annual_minimum": 8_000_000,
                "annual_maximum": 12_000_000,
                "currency": "JPY",
                "source_text": "¥8.0M ~ ¥12.0M",
            },
            tags=["Python", "AWS"],
            description="Build reliable services.",
            salary_detail="Annual salary includes a performance bonus.",
            requirements={
                "must": ["Production Python experience"],
                "nice_to_have": ["AWS certification"],
            },
            work_style={
                "remote": "hybrid",
                "office_days_per_week": 2,
                "source_text": "Two office days per week.",
            },
            language_requirements=["Business Japanese", "English reading"],
        )
        source = Path(self.temporary.name) / "jobs.json"
        source.write_text(json.dumps(payload), encoding="utf-8")
        self.workspace.import_jobs(portal="test", source_file=source)
        self.app = create_app(self.root)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def csrf_token(self, _path: str = "/") -> str:
        response = self.client.get("/api/v1/session")
        self.assertEqual(response.status_code, 200)
        return response.json()["csrf_token"]

    def valid_documents(self, *, resume_suffix: str = "") -> dict[str, bytes]:
        resume = f"""# 履歴書

## 基本情報

- 氏名：Web Candidate{resume_suffix}
- 連絡先：web@example.invalid
- 居住地：Tokyo

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
"""
        shokumu = """# 職務経歴書

**Web Candidate
Web Candidate**

Phone: 090-0000-0000 · Email: web@example.invalid

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

### 2022年 4月～現在｜Example Co

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
"""
        return {
            "rirekisho.md": resume.encode("utf-8"),
            "shokumu-keirekisho.md": shokumu.encode("utf-8"),
        }

    def test_spa_shell_and_jobs_api(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn('id="root"', response.text)
        self.assertNotIn("htmx", response.text.lower())
        self.assertEqual(
            self.client.get("/static/htmx-2.0.10.min.js").status_code, 404
        )
        self.assertEqual(self.client.get("/api/v1/does-not-exist").status_code, 404)

        jobs = self.client.get("/api/v1/jobs")
        self.assertEqual(jobs.status_code, 200)
        payload = jobs.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["jobs"][0]["title"], "Backend Engineer")
        self.assertEqual(payload["jobs"][0]["salary"], "¥8M–¥12M")
        self.assertEqual(payload["jobs"][0]["remote"], "hybrid")
        self.assertEqual(payload["jobs"][0]["office_days_per_week"], 2)
        self.assertNotIn("raw", payload["jobs"][0])

    def test_jobs_api_filters_and_selects_detail(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        response = self.client.get(
            "/api/v1/jobs",
            params={
                "status": "new",
                "q": "Backend",
                "portal": "test",
                "selected": job_id,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            payload["filters"],
            {
                "q": "Backend",
                "portal": "test",
                "status": "new",
                "recommendation": "",
                "rating": "",
            },
        )
        self.assertEqual(payload["selected_job"]["id"], job_id)
        self.assertEqual(payload["selected_job"]["description"], "Build reliable services.")
        self.assertEqual(payload["selected_job"]["tags"], ["Python", "AWS"])
        self.assertEqual(
            payload["selected_job"]["salary_detail"],
            "Annual salary includes a performance bonus.",
        )
        self.assertEqual(
            payload["selected_job"]["requirements"],
            {
                "must": ["Production Python experience"],
                "nice_to_have": ["AWS certification"],
            },
        )
        self.assertEqual(
            payload["selected_job"]["work_style"],
            {
                "remote": "hybrid",
                "office_days_per_week": 2,
                "source_text": "Two office days per week.",
            },
        )
        self.assertEqual(
            payload["selected_job"]["language_requirements"],
            ["Business Japanese", "English reading"],
        )

        enriched_filters = self.client.get(
            "/api/v1/jobs",
            params={
                "recommendation": "unanalyzed",
                "rating": "unrated",
            },
        ).json()
        self.assertEqual([job["id"] for job in enriched_filters["jobs"]], [job_id])
        self.assertEqual(enriched_filters["counts"]["new"], 1)

    def test_status_change_uses_workspace_transition(self) -> None:
        token = self.csrf_token()
        job_id = self.workspace.list_jobs()[0]["id"]
        changed = self.client.post(
            f"/jobs/{job_id}/status",
            data={"csrf_token": token, "status": "saved"},
            follow_redirects=False,
        )
        self.assertEqual(changed.status_code, 303)
        self.assertEqual(self.workspace.show_job(job_id)["status"], "saved")

    def test_status_change_rejects_missing_csrf(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        response = self.client.post(f"/jobs/{job_id}/status", data={"status": "saved"})
        self.assertEqual(response.status_code, 403)

    def test_applied_job_cannot_return_to_saved(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        self.workspace.create_application_from_job(job_id)
        response = self.client.post(
            f"/jobs/{job_id}/status",
            data={"csrf_token": self.csrf_token(), "status": "saved"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.workspace.show_job(job_id)["status"], "applied")

    def test_application_tabs_distinguish_active_and_closed(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        application = self.workspace.create_application_from_job(job_id)

        active = self.client.get(
            "/api/v1/jobs", params={"status": "application_active"}
        ).json()
        self.assertEqual([job["id"] for job in active["jobs"]], [job_id])
        self.assertEqual(active["jobs"][0]["application_status"], "draft")
        self.assertEqual(active["counts"]["application_active"], 1)
        self.assertEqual(active["counts"]["application_closed"], 0)

        self.workspace.update_status(application["id"], status="closed")

        closed = self.client.get(
            "/api/v1/jobs", params={"status": "application_closed"}
        ).json()
        self.assertEqual([job["id"] for job in closed["jobs"]], [job_id])
        self.assertEqual(closed["jobs"][0]["application_status"], "closed")
        self.assertEqual(closed["counts"]["application_active"], 0)
        self.assertEqual(closed["counts"]["application_closed"], 1)

    def test_profile_page_and_api_read_private_workspace_profile(self) -> None:
        page = self.client.get("/profile")
        self.assertEqual(page.status_code, 200)
        self.assertIn('id="root"', page.text)
        response = self.client.get("/api/v1/profile")
        self.assertEqual(response.status_code, 200)
        candidate = response.json()["candidate"]
        self.assertEqual(candidate["identity"]["name_en"], "Example Candidate")
        self.assertIn("Python", candidate["skills"])

    def test_preferences_page_and_api_read_private_workspace_preferences(self) -> None:
        page = self.client.get("/preferences")
        self.assertEqual(page.status_code, 200)
        self.assertIn('id="root"', page.text)
        response = self.client.get("/api/v1/preferences")
        self.assertEqual(response.status_code, 200)
        preferences = response.json()["preferences"]
        self.assertIn("Backend Engineer", preferences["target_roles"])
        self.assertIn("Tokyo", preferences["locations"])

    def test_profile_and_preferences_can_be_edited(self) -> None:
        token = self.csrf_token("/profile/edit")
        changed = self.client.post(
            "/profile/edit",
            data={
                "csrf_token": token,
                "name_en": "Updated Example",
                "current_title": "Senior Engineer",
                "email": "example@example.invalid",
                "summary": "Updated factual summary.",
                "skills": "Python\nPostgres",
                "experience_count": "1",
                "experience_company_0": "Example Co",
                "experience_title_en_0": "Senior Engineer",
                "experience_start_0": "2022",
                "experience_facts_0": "Improved reliability.",
                "education_count": "0",
                "language_count": "0",
            },
            follow_redirects=False,
        )
        self.assertEqual(changed.status_code, 303)
        self.assertEqual(
            self.workspace.show_candidate_profile()["identity"]["name_en"],
            "Updated Example",
        )
        token = self.csrf_token("/preferences/edit")
        changed = self.client.post(
            "/preferences/edit",
            data={
                "csrf_token": token,
                "target_roles": "Platform Engineer\nBackend Engineer",
                "target_domains": "Developer tools",
                "locations": "Tokyo\nJapan remote",
                "remote_preferred": "on",
                "maximum_office_days_per_week": "2",
                "compensation_currency": "JPY",
                "compensation_minimum": "8000000",
                "blacklisted_companies": "Blocked Co\nDo Not Apply KK",
                "hard_constraints": "No relocation",
                "soft_preferences": "High autonomy",
            },
            follow_redirects=False,
        )
        self.assertEqual(changed.status_code, 303)
        self.assertEqual(
            self.workspace.show_preferences()["work_style"][
                "maximum_office_days_per_week"
            ],
            2,
        )
        self.assertEqual(
            self.workspace.show_preferences()["blacklisted_companies"],
            ["Blocked Co", "Do Not Apply KK"],
        )

    def test_job_review_and_application_workflow(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        token = self.csrf_token()
        reviewed = self.client.post(
            f"/jobs/{job_id}/review",
            data={"csrf_token": token, "rating": "4", "notes": "Strong role fit."},
            follow_redirects=False,
        )
        self.assertEqual(reviewed.status_code, 303)
        job = self.workspace.show_job(job_id)
        self.assertEqual(job["rating"], 4)
        self.assertEqual(job["notes"], "Strong role fit.")

        created = self.client.post(
            f"/jobs/{job_id}/application",
            data={"csrf_token": token},
            follow_redirects=False,
        )
        self.assertEqual(created.status_code, 303)
        application = self.workspace.list_applications()[0]
        board = self.client.get("/applications")
        self.assertEqual(board.status_code, 200)
        self.assertIn('id="root"', board.text)
        applications = self.client.get("/api/v1/applications").json()
        self.assertEqual(applications["applications"][0]["role"], "Backend Engineer")

        job_detail = self.client.get(
            "/api/v1/jobs", params={"selected": job_id}
        ).json()["selected_job"]
        self.assertEqual(job_detail["application"]["id"], application["id"])
        self.assertEqual(job_detail["application"]["status"], "draft")

        moved = self.client.post(
            f"/applications/{application['id']}/status",
            data={
                "csrf_token": token,
                "status": "evaluating",
                "return_to": "/applications",
            },
            follow_redirects=False,
        )
        self.assertEqual(moved.status_code, 303)
        self.assertEqual(
            self.workspace.show_application(application["id"])["status"], "evaluating"
        )
        updated_job_detail = self.client.get(
            "/api/v1/jobs", params={"selected": job_id}
        ).json()["selected_job"]
        self.assertEqual(updated_job_detail["application"]["status"], "evaluating")

        duplicate = self.client.post(
            f"/jobs/{job_id}/application",
            data={"csrf_token": token},
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_ai_handoff_and_material_packaging(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        application = self.workspace.create_application_from_job(job_id)
        before = self.client.get(f"/applications/{application['id']}")
        self.assertEqual(before.status_code, 200)
        self.assertIn('id="root"', before.text)
        self.assertNotIn("htmx", before.text.lower())

        detail_api = self.client.get(f"/api/v1/applications/{application['id']}")
        self.assertEqual(detail_api.status_code, 200)
        prompt = detail_api.json()["ai_prompt"]
        for expected in (
            "job-search",
            application["id"],
            "application_id",
            "source_job_id",
            "templates/ja/shokumu-keirekisho.md",
            "canonical template",
            "Do not generate a PDF in AI Job Agent",
            "automatically lock the current materials",
        ):
            self.assertIn(expected, prompt)
        self.assertEqual(
            self.client.post(f"/applications/{application['id']}/generate").status_code,
            404,
        )

        saved = self.workspace.save_draft(
            application["id"],
            documents=self.valid_documents(),
            label="AI draft from Codex",
            status="working",
            actor="ai",
        )
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)
        detail = self.client.get(f"/applications/{application['id']}")
        self.assertIn('id="root"', detail.text)
        draft_preview = self.client.get(
            f"/api/v1/applications/{application['id']}/draft/preview/rirekisho.md"
        )
        self.assertEqual(draft_preview.status_code, 200)
        self.assertEqual(draft_preview.json()["document_title"], "履歴書")
        self.assertIn("Web Candidate", draft_preview.json()["content"])
        draft_download = self.client.get(
            f"/applications/{application['id']}/draft/files/rirekisho.md"
        )
        self.assertEqual(draft_download.status_code, 200)
        self.assertIn("履歴書", draft_download.text)

        token = self.csrf_token(f"/applications/{application['id']}")
        packaged = self.client.post(
            f"/applications/{application['id']}/materials/package",
            data={
                "csrf_token": token,
                "expected_revision": "1",
                "label": "AI draft from Codex",
            },
            follow_redirects=False,
        )
        self.assertEqual(packaged.status_code, 303)
        packages = self.workspace.list_packages(application["id"])
        self.assertEqual(len(packages), 1)
        files = {
            item["path"]
            for item in self.workspace.package_files(
                application["id"], packages[0]["id"]
            )
        }
        self.assertEqual(files, {"rirekisho.md", "shokumu-keirekisho.md"})
        detail = self.client.get(f"/applications/{application['id']}")
        self.assertIn('id="root"', detail.text)
        catalog = self.client.get("/api/v1/packages")
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(catalog.json()["items"][0]["package"]["label"], "AI draft from Codex")
        preview = self.client.get(
            f"/api/v1/applications/{application['id']}/packages/{packages[0]['id']}"
            "/preview/rirekisho.md"
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["document_title"], "履歴書")
        self.assertIn("Web Candidate", preview.json()["content"])
        downloaded = self.client.get(
            f"/applications/{application['id']}/packages/{packages[0]['id']}/files/rirekisho.md"
        )
        self.assertEqual(downloaded.status_code, 200)
        self.assertIn("履歴書", downloaded.text)
        work_history = self.client.get(
            f"/applications/{application['id']}/packages/{packages[0]['id']}"
            "/files/shokumu-keirekisho.md"
        )
        self.assertEqual(work_history.status_code, 200)
        self.assertIn("##### 業務内容・工夫", work_history.text)
        self.assertIn("##### 成果・実績", work_history.text)
        work_preview = self.client.get(
            f"/api/v1/applications/{application['id']}/packages/{packages[0]['id']}"
            "/preview/shokumu-keirekisho.md"
        )
        self.assertEqual(work_preview.status_code, 200)
        headings = {
            block["text"]
            for block in work_preview.json()["blocks"]
            if block["kind"] == "heading"
        }
        self.assertIn("プロジェクト概要", headings)
        self.assertTrue(self.workspace.audit()["ok"])

    def test_revision_preparation_submission_and_match_analysis_web_flow(self) -> None:
        job_id = self.workspace.list_jobs()[0]["id"]
        self.workspace.record_job_evaluation(
            job_id,
            {
                "schema_version": 2,
                "recommendation": "pursue",
                "summary": "AI analysis finds strong evidence-backed alignment.",
                "strengths": [
                    "Python service delivery and AWS experience match the role."
                ],
                "gaps": {
                    "disqualifying": [],
                    "learnable": ["No direct Terraform evidence is recorded."],
                    "unclear": ["The saved posting does not state office frequency."],
                },
                "questions": ["Confirm the expected office schedule."],
                "hard_constraints": {
                    "result": "unclear",
                    "reasons": ["Office attendance needs confirmation."],
                },
                "confidence": "medium",
                "source_limitations": "Based on the saved posting summary.",
            },
        )
        detail = self.client.get("/api/v1/jobs", params={"selected": job_id})
        self.assertEqual(detail.status_code, 200)
        detail_payload = detail.json()["selected_job"]
        self.assertEqual(
            detail_payload["match_analysis"]["recommendation"], "pursue"
        )
        self.assertTrue(
            any(
                "Python service delivery" in strength
                for strength in detail_payload["match_analysis"]["strengths"]
            )
        )
        self.assertTrue(
            any(
                "No direct Terraform evidence" in gap
                for gap in detail_payload["match_analysis"]["gaps"]["learnable"]
            )
        )

        application = self.workspace.create_application_from_job(job_id)
        token = self.csrf_token(f"/applications/{application['id']}")
        documents = self.valid_documents()
        uploaded = self.client.post(
            f"/applications/{application['id']}/draft/upload",
            data={
                "csrf_token": token,
                "expected_revision": "0",
                "label": "Uploaded draft",
            },
            files={
                "rirekisho": (
                    "rirekisho.md",
                    documents["rirekisho.md"],
                    "text/markdown",
                ),
                "shokumu_keirekisho": (
                    "shokumu-keirekisho.md",
                    documents["shokumu-keirekisho.md"],
                    "text/markdown",
                ),
            },
            follow_redirects=False,
        )
        self.assertEqual(uploaded.status_code, 303)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)
        self.assertEqual(self.workspace.show_draft(application["id"])["revision"], 1)

        editor = self.client.get(
            f"/applications/{application['id']}/draft/edit/rirekisho.md"
        )
        self.assertEqual(editor.status_code, 200)
        self.assertIn('id="root"', editor.text)
        revised_resume = (
            documents["rirekisho.md"]
            .decode("utf-8")
            .replace("Web Candidate", "Web Candidate Revised")
        )
        edited = self.client.post(
            f"/applications/{application['id']}/draft/edit/rirekisho.md",
            data={
                "csrf_token": token,
                "expected_revision": "1",
                "label": "Browser feedback",
                "content": revised_resume,
            },
            follow_redirects=False,
        )
        self.assertEqual(edited.status_code, 303)
        self.assertEqual(self.workspace.show_draft(application["id"])["revision"], 2)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)

        validated = self.client.post(
            f"/applications/{application['id']}/draft/validate",
            data={"csrf_token": token},
            follow_redirects=False,
        )
        self.assertEqual(validated.status_code, 303)
        validation = self.client.get(
            f"/api/v1/applications/{application['id']}"
        ).json()["draft"]["validation"]
        self.assertTrue(validation["format_valid"])

        uploaded_final = self.client.post(
            f"/applications/{application['id']}/materials/upload-deliverable",
            data={
                "csrf_token": token,
                "expected_revision": "2",
                "purpose": "other",
                "role": "deliverable",
                "origin": "external_export",
            },
            files={
                "file": ("application.pdf", b"%PDF-1.4 web test", "application/pdf")
            },
            follow_redirects=False,
        )
        self.assertEqual(uploaded_final.status_code, 303)
        packaged = self.client.post(
            f"/applications/{application['id']}/materials/package",
            data={
                "csrf_token": token,
                "expected_revision": "3",
                "label": "Browser package",
            },
            follow_redirects=False,
        )
        self.assertEqual(packaged.status_code, 303)
        packages = self.workspace.list_packages(application["id"])
        self.assertEqual(len(packages), 1)

        pdf = self.client.get(
            f"/applications/{application['id']}/packages/{packages[0]['id']}"
            "/files/deliverables/application.pdf"
        )
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.headers["content-type"], "application/pdf")
        self.assertTrue(pdf.headers["content-disposition"].startswith("inline;"))
        self.assertIn("no-store", pdf.headers["cache-control"])

        catalog = self.client.get("/packages")
        self.assertIn('id="root"', catalog.text)
        catalog_api = self.client.get("/api/v1/packages").json()
        self.assertEqual(
            catalog_api["items"][0]["package"]["label"], "Browser package"
        )

        submitted = self.client.post(
            f"/applications/{application['id']}/submit",
            data={
                "csrf_token": token,
                "package_id": packages[0]["id"],
                "evidence_level": "exact_files",
                "selected_files": "deliverables/application.pdf",
                "channel": "company_portal",
            },
            follow_redirects=False,
        )
        self.assertEqual(submitted.status_code, 303)
        shown = self.workspace.show_application(application["id"])
        self.assertEqual(shown["status"], "applied")
        self.assertEqual(shown["submissions"][0]["package_id"], packages[0]["id"])
        locked_delete = self.client.post(
            f"/applications/{application['id']}/packages/{packages[0]['id']}/delete",
            data={"csrf_token": token},
        )
        self.assertEqual(locked_delete.status_code, 400)
        self.assertTrue(self.workspace.audit()["ok"])

    def test_complete_web_goal_flow(self) -> None:
        token = self.csrf_token("/profile/edit")
        profile_saved = self.client.post(
            "/profile/edit",
            data={
                "csrf_token": token,
                "name_en": "Flow Candidate",
                "current_title": "Engineer",
                "email": "flow@example.invalid",
                "summary": "Evidence-backed summary.",
                "skills": "Python\nAWS",
                "experience_count": "1",
                "experience_company_0": "Flow Co",
                "experience_title_en_0": "Engineer",
                "experience_start_0": "2023",
                "experience_facts_0": "Delivered a verified improvement.",
                "education_count": "0",
                "language_count": "0",
            },
            follow_redirects=False,
        )
        self.assertEqual(profile_saved.status_code, 303)

        token = self.csrf_token("/preferences/edit")
        preferences_saved = self.client.post(
            "/preferences/edit",
            data={
                "csrf_token": token,
                "target_roles": "Backend Engineer",
                "target_domains": "Cloud platforms",
                "locations": "Tokyo",
                "remote_preferred": "on",
                "maximum_office_days_per_week": "2",
                "compensation_currency": "JPY",
                "compensation_minimum": "8000000",
                "hard_constraints": "No relocation",
                "soft_preferences": "High autonomy",
            },
            follow_redirects=False,
        )
        self.assertEqual(preferences_saved.status_code, 303)

        job_id = self.workspace.list_jobs()[0]["id"]
        token = self.csrf_token()
        saved = self.client.post(
            f"/jobs/{job_id}/status",
            data={"csrf_token": token, "status": "saved"},
            follow_redirects=False,
        )
        self.assertEqual(saved.status_code, 303)
        reviewed = self.client.post(
            f"/jobs/{job_id}/review",
            data={"csrf_token": token, "rating": "5", "notes": "Prioritized role."},
            follow_redirects=False,
        )
        self.assertEqual(reviewed.status_code, 303)
        created = self.client.post(
            f"/jobs/{job_id}/application",
            data={"csrf_token": token},
            follow_redirects=False,
        )
        self.assertEqual(created.status_code, 303)

        application = self.workspace.list_applications()[0]
        moved = self.client.post(
            f"/applications/{application['id']}/status",
            data={"csrf_token": token, "status": "ready", "return_to": "/applications"},
            follow_redirects=False,
        )
        self.assertEqual(moved.status_code, 303)
        saved_draft = self.workspace.save_draft(
            application["id"],
            documents=self.valid_documents(),
            label="Complete flow draft",
            status="working",
            actor="ai",
        )
        self.assertEqual(saved_draft["revision"], 1)
        self.assertEqual(len(self.workspace.list_packages(application["id"])), 0)
        self.workspace.lock_current_materials(
            application["id"], expected_revision=1, actor="ai"
        )

        package = self.workspace.list_packages(application["id"])[0]
        material = self.client.get(
            f"/applications/{application['id']}/packages/{package['id']}/files/"
            "shokumu-keirekisho.md"
        )
        self.assertEqual(material.status_code, 200)
        self.assertIn("職務経歴書", material.text)
        self.assertEqual(self.workspace.show_job(job_id)["rating"], 5)
        self.assertEqual(
            self.workspace.show_application(application["id"])["status"], "ready"
        )
        self.assertTrue(self.workspace.audit()["ok"])


if __name__ == "__main__":
    unittest.main()

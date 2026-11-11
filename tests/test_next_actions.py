from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from fastapi.testclient import TestClient

from ai_job_search.cli import main
from ai_job_search.web import create_app
from ai_job_search.workspace import Workspace, WorkspaceError


class NextActionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / ".job-search"
        self.workspace = Workspace(self.root)
        self.workspace.initialize()
        self.application = self.workspace.create_application(company="Example KK", role="Engineer")
        self.application_id = self.application["id"]

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_persist_complete_reopen_postpone_and_clear_with_history(self) -> None:
        action = self.workspace.show_application(self.application_id)["next_action"]
        self.assertEqual(action["revision"], 0)
        self.assertEqual(action["title"], "")
        saved = self.workspace.update_next_action(
            self.application_id, title="  Confirm interview time  ",
            due_date="2026-09-05", expected_revision=0,
        )
        self.assertEqual(saved["title"], "Confirm interview time")
        reopened_workspace = Workspace(self.root)
        self.assertEqual(reopened_workspace.list_applications()[0]["next_action"], saved)
        completed = self.workspace.update_next_action(
            self.application_id, operation="complete", expected_revision=1,
        )
        self.assertIsNotNone(completed["completed_at"])
        self.workspace.update_next_action(self.application_id, operation="reopen", expected_revision=2)
        postponed = self.workspace.update_next_action(
            self.application_id, title=saved["title"], due_date="2026-09-08", expected_revision=3,
        )
        self.assertIsNone(postponed["completed_at"])
        self.assertEqual(postponed["due_date"], "2026-09-08")
        self.workspace.update_next_action(self.application_id, operation="clear", expected_revision=4)
        record = self.workspace.show_application(self.application_id)
        self.assertEqual(record["next_action"]["title"], "")
        self.assertEqual(record["next_action"]["revision"], 5)
        self.assertEqual(record["status"], "draft")
        self.assertEqual(record["draft"]["revision"], 0)
        self.assertEqual(record["events"][-1]["data"]["before"]["due_date"], "2026-09-08")
        self.assertEqual(len([e for e in record["events"] if e["type"].startswith("action.")]), 5)

    def test_conflict_cannot_overwrite_a_newer_action(self) -> None:
        self.workspace.update_next_action(self.application_id, title="First", expected_revision=0)
        for operation in ("save", "complete", "clear", "reopen"):
            with self.subTest(operation=operation), self.assertRaises(WorkspaceError):
                self.workspace.update_next_action(
                    self.application_id, title="Stale", operation=operation, expected_revision=0,
                )
        record = self.workspace.show_application(self.application_id)
        self.assertEqual(record["next_action"]["title"], "First")
        self.assertEqual(len(record["events"]), 2)

    def test_input_validation_and_optional_date(self) -> None:
        for title in ("", "   ", "a" * 241):
            with self.subTest(title=title), self.assertRaises(WorkspaceError):
                self.workspace.update_next_action(self.application_id, title=title, expected_revision=0)
        for due in ("2026-02-30", "2026-9-05", "20260905", "not-a-date"):
            with self.subTest(due=due), self.assertRaises(WorkspaceError):
                self.workspace.update_next_action(
                    self.application_id, title="Follow up", due_date=due, expected_revision=0,
                )
        for operation in ("complete", "reopen", "invalid"):
            with self.subTest(operation=operation), self.assertRaises(WorkspaceError):
                self.workspace.update_next_action(
                    self.application_id, operation=operation, expected_revision=0,
                )
        with self.assertRaises(WorkspaceError):
            self.workspace.update_next_action("missing", title="Follow up", expected_revision=0)
        action = self.workspace.update_next_action(
            self.application_id, title="Follow up", expected_revision=0,
        )
        self.assertIsNone(action["due_date"])

    def test_old_workspace_upgrade_and_empty_shell_deletion(self) -> None:
        with self.workspace.connect() as connection:
            connection.execute("DROP TABLE application_actions")
        self.workspace.initialize()
        self.assertEqual(self.workspace.list_applications()[0]["next_action"]["revision"], 0)
        self.workspace.update_next_action(self.application_id, title="Follow up", expected_revision=0)
        self.workspace.initialize()
        self.assertEqual(self.workspace.list_applications()[0]["next_action"]["title"], "Follow up")
        self.workspace.delete_application(self.application_id)
        with self.workspace.connect() as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM application_actions").fetchone()[0], 0)

    def test_web_csrf_validation_and_list_detail_consistency(self) -> None:
        with TestClient(create_app(self.root)) as client:
            path = f"/applications/{self.application_id}/next-action"
            data = {"title": "Follow up", "due_date": "2026-09-05", "expected_revision": "0"}
            self.assertEqual(client.post(path, data=data).status_code, 403)
            data["csrf_token"] = client.get("/api/v1/session").json()["csrf_token"]
            response = client.post(path, data=data)
            self.assertEqual(response.status_code, 200, response.text)
            detail = client.get(f"/api/v1/applications/{self.application_id}").json()["application"]
            listed = client.get("/api/v1/applications").json()["applications"][0]
            self.assertEqual(listed["next_action"], detail["next_action"])
            self.assertEqual(client.post(path, data=data).status_code, 400)
            data["expected_revision"] = "invalid"
            self.assertEqual(client.post(path, data=data).status_code, 400)

    def test_cli_action(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            result = main([
                "--home", str(self.root), "application", "action", self.application_id,
                "--title", "Prepare questions", "--expected-revision", "0",
            ])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(output.getvalue())["title"], "Prepare questions")


if __name__ == "__main__":
    unittest.main()

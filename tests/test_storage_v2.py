from __future__ import annotations

import io
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ai_job_search.cli import main  # noqa: E402
from ai_job_search.storage_v2 import json_read, json_write  # noqa: E402
from ai_job_search.workspace import ObjectStore, Workspace, WorkspaceError  # noqa: E402
from job_fixtures import normalized_job  # noqa: E402

EVALUATION = {
    "schema_version": 2,
    "recommendation": "consider",
    "summary": "Evidence supports consideration while one constraint remains unclear.",
    "strengths": ["Verified production engineering experience."],
    "gaps": {"disqualifying": [], "learnable": [], "unclear": ["Office policy is unclear."]},
    "questions": ["What is the office policy?"],
    "hard_constraints": {"result": "unclear", "reasons": ["The source omits office frequency."]},
    "confidence": "medium",
    "source_limitations": "The public posting does not state office frequency.",
}


class StorageV2AcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / ".job-search"
        self.workspace = Workspace(self.root)
        self.workspace.initialize()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _stage_job(self, name: str = "normalized.json") -> tuple[Path, Path]:
        payload = normalized_job(
            self.root,
            provider="test",
            external_id="storage-v2",
            title="Storage Engineer",
            company="Example KK",
            url="https://jobs.example.invalid/storage-v2",
        )
        source = self.root / "operations" / "job-import" / name
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(json.dumps(payload), encoding="utf-8")
        snapshot = self.root / payload["source"]["snapshot_path"]
        return source, snapshot

    def _application_with_documents(self) -> tuple[dict, dict]:
        application = self.workspace.create_application(company="Example KK", role="Engineer")
        documents = {
            "rirekisho.md": (
                b"# \xe5\xb1\xa5\xe6\xad\xb4\xe6\x9b\xb8\n\n"
                b"## \xe5\x9f\xba\xe6\x9c\xac\xe6\x83\x85\xe5\xa0\xb1\n\nCandidate\n\n"
                b"## \xe5\xad\xa6\xe6\xad\xb4\xe3\x83\xbb\xe8\x81\xb7\xe6\xad\xb4\n\nHistory\n\n"
                b"## \xe5\x85\x8d\xe8\xa8\xb1\xe3\x83\xbb\xe8\xb3\x87\xe6\xa0\xbc\n\nNone\n\n"
                b"## \xe5\xbf\x97\xe6\x9c\x9b\xe5\x8b\x95\xe6\xa9\x9f\xe3\x83\xbb\xe8\x87\xaa\xe5\xb7\xb1PR\n\nReliable.\n\n"
                b"## \xe6\x9c\xac\xe4\xba\xba\xe5\xb8\x8c\xe6\x9c\x9b\xe6\xac\x84\n\nStandard.\n"
            ),
            "shokumu-keirekisho.md": (
                b"# \xe8\x81\xb7\xe5\x8b\x99\xe7\xb5\x8c\xe6\xad\xb4\xe6\x9b\xb8\n\n"
                b"## \xe8\x81\xb7\xe5\x8b\x99\xe8\xa6\x81\xe7\xb4\x84\n\nEngineer.\n\n"
                b"## \xe6\xb4\xbb\xe3\x81\x8b\xe3\x81\x9b\xe3\x82\x8b\xe7\xb5\x8c\xe9\xa8\x93\xe3\x83\xbb\xe7\x9f\xa5\xe8\xad\x98"
                b"\xe3\x83\xbb\xe6\x8a\x80\xe8\xa1\x93\n\n"
                b"Python\n\n"
                b"## \xe3\x83\x86\xe3\x82\xaf\xe3\x83\x8b\xe3\x82\xab\xe3\x83\xab\xe3\x82\xb9\xe3\x82\xad\xe3\x83\xab\n\nPython\n\n"
                b"## \xe8\x81\xb7\xe5\x8b\x99\xe7\xb5\x8c\xe6\xad\xb4\n\nExperience\n\n"
                b"## \xe8\xb3\x87\xe6\xa0\xbc\n\nNone\n\n## \xe8\x87\xaa\xe5\xb7\xb1PR\n\nReliable.\n"
            ),
        }
        draft = self.workspace.save_draft(application["id"], documents=documents)
        return application, draft

    def test_sqlite_is_the_only_live_metadata_authority(self) -> None:
        self.assertTrue((self.root / "workspace.sqlite3").is_file())
        self.assertEqual(
            self.workspace.objects.temporary_root,
            (self.root / "operations" / ".objects").resolve(),
        )
        self.assertFalse((self.root / "workspace.json").exists())
        self.assertFalse((self.root / "profile" / "candidate.json").exists())
        self.assertFalse((self.root / "cache").exists())
        application = self.workspace.create_application(company="Example KK", role="Engineer")
        self.assertFalse((self.root / "applications").exists())
        self.assertEqual(
            self.workspace.show_application(application["id"])["company"], "Example KK"
        )

    def test_successful_staged_import_consumes_json_and_snapshot(self) -> None:
        source, snapshot = self._stage_job()
        result = self.workspace.import_jobs(portal="test", source_file=source)
        job = self.workspace.show_job(self.workspace.list_jobs()[0]["id"])
        self.assertEqual(result["imported"], 1)
        self.assertFalse(source.exists())
        self.assertFalse(snapshot.exists())
        with self.workspace.connect() as connection:
            version = connection.execute(
                "SELECT source_artifact_sha256 FROM job_versions WHERE id=?", (job["version_id"],)
            ).fetchone()
        self.assertTrue(
            self.workspace.objects.path_for(version["source_artifact_sha256"]).is_file()
        )

    def test_validate_and_keep_input_are_non_consuming(self) -> None:
        source, snapshot = self._stage_job()
        before = set(self.workspace.objects.root.glob("*/*"))
        validation = self.workspace.import_jobs(
            portal="test", source_file=source, validate_only=True
        )
        self.assertTrue(validation["valid"])
        self.assertTrue(source.is_file())
        self.assertTrue(snapshot.is_file())
        self.assertEqual(set(self.workspace.objects.root.glob("*/*")), before)
        self.workspace.import_jobs(portal="test", source_file=source, consume=False)
        self.assertTrue(source.is_file())
        self.assertTrue(snapshot.is_file())
        external = Path(self.temporary.name) / "external-normalized.json"
        external.write_bytes(source.read_bytes())
        self.workspace.import_jobs(portal="test", source_file=external)
        self.assertTrue(external.is_file())
        self.assertTrue(snapshot.is_file())

    def test_failed_staged_import_keeps_json_and_evidence(self) -> None:
        source, snapshot = self._stage_job("invalid.json")
        payload = json.loads(source.read_text(encoding="utf-8"))
        payload["title"] = ""
        source.write_text(json.dumps(payload), encoding="utf-8")
        with self.assertRaises(WorkspaceError):
            self.workspace.import_jobs(portal="test", source_file=source)
        self.assertTrue(source.is_file())
        self.assertTrue(snapshot.is_file())
        self.assertEqual(self.workspace.list_jobs(), [])

    def test_cli_evaluation_consumes_only_successful_staged_json(self) -> None:
        source, _ = self._stage_job()
        self.workspace.import_jobs(portal="test", source_file=source)
        job_id = self.workspace.list_jobs()[0]["id"]
        evaluation = self.root / "operations" / "evaluation.json"
        evaluation.write_text(json.dumps(EVALUATION), encoding="utf-8")
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(
                ["--home", str(self.root), "job", "evaluate", job_id, "--file", str(evaluation)]
            )
        self.assertEqual(code, 0, stderr.getvalue())
        self.assertFalse(evaluation.exists())
        failed = self.root / "operations" / "failed-evaluation.json"
        failed.write_text("{}", encoding="utf-8")
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            code = main(
                ["--home", str(self.root), "job", "evaluate", job_id, "--file", str(failed)]
            )
        self.assertEqual(code, 2)
        self.assertTrue(failed.is_file())

    def test_package_and_submission_reference_the_same_immutable_object(self) -> None:
        application, draft = self._application_with_documents()
        pdf = b"%PDF-1.4\nobject data\n%%EOF"
        draft = self.workspace.save_deliverable_file(
            application["id"],
            filename="rirekisho.pdf",
            payload=pdf,
            purpose="rirekisho",
            expected_revision=draft["revision"],
        )
        package = self.workspace.lock_current_materials(
            application["id"], expected_revision=draft["revision"]
        )
        submission = self.workspace.submit(
            application["id"],
            package_id=package["package_id"],
            selected_paths=["deliverables/rirekisho.pdf"],
            evidence_level="exact_files",
        )
        package_file = next(item for item in package["files"] if item["path"].endswith(".pdf"))
        self.assertEqual(submission["files"][0]["sha256"], package_file["sha256"])
        with self.workspace.connect() as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM artifacts WHERE sha256=?", (package_file["sha256"],)
            ).fetchone()[0]
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "UPDATE package_files SET logical_path='changed.pdf' WHERE package_id=?",
                    (package["package_id"],),
                )
        self.assertEqual(count, 1)
        self.assertFalse((self.root / "applications").exists())

    def test_revision_compare_and_swap_rejects_stale_writer(self) -> None:
        application, draft = self._application_with_documents()
        self.workspace.save_draft(
            application["id"],
            documents={"rirekisho.md": b"# \xe5\xb1\xa5\xe6\xad\xb4\xe6\x9b\xb8\nupdated"},
            expected_revision=draft["revision"],
        )
        with self.assertRaisesRegex(WorkspaceError, "revision conflict"):
            self.workspace.save_draft(
                application["id"],
                documents={"rirekisho.md": b"# \xe5\xb1\xa5\xe6\xad\xb4\xe6\x9b\xb8\nstale"},
                expected_revision=draft["revision"],
            )

    def test_object_before_transaction_failure_is_safe_and_collectable(self) -> None:
        digest, size, _ = self.workspace.objects.put_bytes(b"orphan-after-failed-transaction")
        with self.assertRaises(RuntimeError):
            with self.workspace.connect() as connection:
                self.workspace._register_artifact(
                    connection, digest, size, "text/plain", "orphan.txt"
                )
                raise RuntimeError("injected failure")
        audit = self.workspace.audit()
        self.assertTrue(audit["ok"])
        self.assertIn(digest, audit["orphan_objects"])
        preview = self.workspace.garbage_collect(dry_run=True)
        self.assertIn(digest, preview["candidates"])
        result = self.workspace.garbage_collect(dry_run=False)
        self.assertIn(digest, result["removed"])
        self.assertFalse(self.workspace.objects.path_for(digest).exists())

    def test_registered_unreferenced_object_moves_to_trash_via_gc(self) -> None:
        digest, size, path = self.workspace.objects.put_bytes(b"collect-me")
        with self.workspace.connect() as connection:
            self.workspace._register_artifact(connection, digest, size, "text/plain", "collect.txt")
        preview = self.workspace.garbage_collect(dry_run=True)
        self.assertIn(digest, preview["candidates"])
        result = self.workspace.garbage_collect(dry_run=False)
        self.assertIn(digest, result["removed"])
        self.assertFalse(path.exists())
        self.assertTrue(any((self.root / "trash" / "objects").rglob(digest[2:])))

    def test_json_and_object_store_failure_boundaries(self) -> None:
        missing_json = self.root / "operations" / "missing.json"
        with self.assertRaisesRegex(WorkspaceError, "Missing required file"):
            json_read(missing_json)

        invalid_json = self.root / "operations" / "invalid.json"
        invalid_json.write_text("{", encoding="utf-8")
        with self.assertRaisesRegex(WorkspaceError, "Invalid JSON"):
            json_read(invalid_json)

        output = self.root / "exports" / "test.json"
        json_write(output, {"ok": True})
        self.assertEqual(json_read(output), {"ok": True})
        with self.assertRaisesRegex(WorkspaceError, "Refusing to overwrite"):
            json_write(output, {"ok": False}, overwrite=False)

        store = ObjectStore(self.root / "isolated" / "objects" / "sha256")
        store.initialize()
        with self.assertRaisesRegex(WorkspaceError, "Invalid artifact SHA-256"):
            store.path_for("not-a-digest")
        with self.assertRaisesRegex(WorkspaceError, "not a regular file"):
            store.put_file(self.root)
        self.assertIn("missing object", store.verify("0" * 64, 1) or "")

        digest, size, path = store.put_bytes(b"content")
        self.assertEqual(store.put_bytes(b"content")[:2], (digest, size))
        self.assertIn("size mismatch", store.verify(digest, size + 1) or "")
        path.write_bytes(b"changed")
        self.assertIn("hash mismatch", store.verify(digest, size) or "")
        with self.assertRaisesRegex(WorkspaceError, "Corrupt content-addressed object"):
            store.put_bytes(b"content")

    def test_profile_and_preferences_reject_invalid_shapes(self) -> None:
        valid_profile = self.workspace.show_candidate_profile()
        invalid_profiles = [
            [],
            {**valid_profile, "identity": []},
            {**valid_profile, "summary": 1},
            {**valid_profile, "experience": ["invalid"]},
            {**valid_profile, "skills": {}},
            {**valid_profile, "skills": [1]},
        ]
        for profile in invalid_profiles:
            with self.subTest(profile=profile), self.assertRaises(WorkspaceError):
                self.workspace.update_candidate_profile(profile)

        valid_preferences = self.workspace.show_preferences()
        invalid_preferences = [
            [],
            {**valid_preferences, "target_roles": {}},
            {**valid_preferences, "target_roles": [1]},
            {**valid_preferences, "work_style": []},
            {
                **valid_preferences,
                "work_style": {"maximum_office_days_per_week": "often"},
            },
            {
                **valid_preferences,
                "work_style": {"maximum_office_days_per_week": 8},
            },
            {**valid_preferences, "compensation": {"minimum": "high"}},
        ]
        for preferences in invalid_preferences:
            with self.subTest(preferences=preferences), self.assertRaises(WorkspaceError):
                self.workspace.update_preferences(preferences)


class StorageArchitectureTests(unittest.TestCase):
    def test_storage_v2_remains_a_small_compatibility_layer(self) -> None:
        package_root = Path(__file__).resolve().parents[1] / "src" / "ai_job_search"
        compatibility_layer = package_root / "storage_v2.py"
        self.assertLessEqual(len(compatibility_layer.read_text(encoding="utf-8").splitlines()), 120)

        storage_modules = sorted((package_root / "storage").glob("*.py"))
        self.assertGreaterEqual(len(storage_modules), 8)
        for module in storage_modules:
            self.assertLessEqual(
                len(module.read_text(encoding="utf-8").splitlines()),
                700,
                module.name,
            )

    def test_public_workspace_imports_are_compatible(self) -> None:
        from ai_job_search import storage_v2, workspace
        from ai_job_search.storage import WorkspaceV2 as InternalWorkspaceV2

        self.assertIs(workspace.Workspace, storage_v2.WorkspaceV2)
        self.assertIs(workspace.Workspace, InternalWorkspaceV2)
        self.assertIs(workspace.WorkspaceError, storage_v2.WorkspaceError)
        self.assertEqual(workspace.SCHEMA_VERSION, storage_v2.DOMAIN_SCHEMA_VERSION)



if __name__ == "__main__":
    unittest.main()

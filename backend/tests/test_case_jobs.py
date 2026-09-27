"""Upload-driven cases (POST /cases): validation, background job lifecycle, restart recovery.
Run from the repo root: python -m unittest backend/tests/test_case_jobs.py -v"""
import os
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())  # before importing main, which creates folders under it

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.ledger import CaseResult
from backend.app.schema import Job

REPORT = "FICTIONAL REPORT.\n\nSUBJECT A raised both arms."


def fake_run(cases_dir: Path, fail_on: str | None = None):
    def run(case, src, report_text, log=print, progress=None, origin="demo", publish=True):
        if case == "slow":  # long pose step: reports progress until stopped (or 5 s)
            for i in range(500):
                progress("Preparing footage and tracking body pose", 0.05 + i / 2000)
                time.sleep(0.01)
        progress("Checking each claim against the footage", 0.6)
        if case == fail_on:
            raise RuntimeError("model unavailable")
        res = CaseResult(case=case, origin=origin, model="test", created_at=datetime.now(timezone.utc).isoformat(),
                         report_text=report_text, duration_sec=5, video_url=f"/case-media/{case}/clip.mp4",
                         annotated_video_url=f"/case-media/{case}/annotated.mp4", results=[], pose_events=[])
        if publish:
            main.save(cases_dir / case / "result.json", res)
        return res
    return run


def wait(client: TestClient, case: str) -> dict:
    for _ in range(200):
        job = client.get(f"/cases/{case}/job").json()
        if job["status"] in ("complete", "failed"):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {case} never finished: {job}")


class CaseUploadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cases = Path(self.tmp.name)
        self.duration = 30.0
        self.patches = [
            patch.object(main, "CASES", self.cases),
            patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}),
            patch.object(main.shutil, "which", return_value="binary"),
            patch.object(main.ffmpeg, "duration", side_effect=lambda path: self.duration),
            patch.object(main.claim_cases, "run", side_effect=fake_run(self.cases, fail_on="boom")),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def post(self, client, name="", report_text=REPORT, report=None, video=("clip.mp4", b"video")):
        files = {"video": video}
        if report is not None:
            files["report"] = report
        return client.post("/cases", data={"name": name, "report_text": report_text}, files=files)

    def test_upload_runs_in_background_and_lists_the_case(self):
        with TestClient(main.app) as client:
            r = self.post(client, name="My Clip")
            self.assertEqual(r.status_code, 202)
            self.assertEqual(r.json()["id"], "my-clip")
            self.assertEqual(wait(client, "my-clip")["status"], "complete")
            self.assertEqual((self.cases / "my-clip" / "report.txt").read_text(encoding="utf-8"), REPORT)
            listed = {c["case"]: c for c in client.get("/cases").json()}
            self.assertEqual(listed["my-clip"]["origin"], "upload")
            self.assertEqual(client.get("/cases/my-clip").json()["origin"], "upload")

    def test_generated_id_and_report_file(self):
        with TestClient(main.app) as client:
            r = self.post(client, report_text="", report=("report.txt", REPORT.encode("utf-8-sig")))
            self.assertEqual(r.status_code, 202)
            case = r.json()["id"]
            self.assertRegex(case, r"^upload-[0-9a-f]{8}$")
            wait(client, case)
            self.assertEqual((self.cases / case / "report.txt").read_text(encoding="utf-8"), REPORT)

    def test_pasted_text_wins_over_attached_file(self):
        with TestClient(main.app) as client:
            r = self.post(client, name="both", report=("report.txt", b"ignored"))
            self.assertEqual(r.status_code, 202)
            wait(client, "both")
            self.assertEqual((self.cases / "both" / "report.txt").read_text(encoding="utf-8"), REPORT)

    def test_validation(self):
        with TestClient(main.app) as client:
            self.assertEqual(self.post(client, video=("clip.avi", b"video")).status_code, 415)
            self.assertEqual(self.post(client, report_text="  ").status_code, 400)
            self.assertEqual(self.post(client, report_text="", report=("r.pdf", b"x")).status_code, 415)
            self.assertEqual(self.post(client, video=("clip.mp4", b"")).status_code, 400)
            self.assertEqual(self.post(client, name="!!!").status_code, 400)
            self.duration = 120.0
            self.assertEqual(self.post(client, name="long").status_code, 413)
            self.assertFalse((self.cases / "long").exists())
            with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}):
                self.assertEqual(self.post(client).status_code, 503)

    def test_existing_case_names_are_protected(self):
        (self.cases / "sfst2").mkdir()
        with TestClient(main.app) as client:
            self.assertEqual(self.post(client, name="sfst2").status_code, 409)
            self.assertEqual(self.post(client, name="dup").status_code, 202)
            wait(client, "dup")
            self.assertEqual(self.post(client, name="dup").status_code, 409)

    def test_failed_job_reports_error_and_frees_its_name(self):
        with TestClient(main.app) as client:
            self.assertEqual(self.post(client, name="boom").status_code, 202)
            job = wait(client, "boom")
            self.assertEqual(job["status"], "failed")
            self.assertIn("model unavailable", job["error"])
            self.assertEqual(client.get("/cases/boom").status_code, 409)
            self.assertEqual(self.post(client, name="boom").status_code, 202)

    def test_queue_lists_active_jobs_oldest_first(self):
        with TestClient(main.app) as client:  # written after startup, which fails leftover active jobs
            for case, status, created in [("later", "queued", "2026-09-26T10:02:00+00:00"),
                                          ("running", "processing", "2026-09-26T10:01:00+00:00"),
                                          ("done", "complete", "2026-09-26T10:00:00+00:00")]:
                (self.cases / case).mkdir()
                main.save(self.cases / case / "job.json", Job(id=case, filename="a.mp4", status=status, created_at=created))
            (self.cases / "partial").mkdir()
            (self.cases / "partial" / "job.json").write_text("{", encoding="utf-8")
            self.assertEqual([j["id"] for j in client.get("/case-jobs").json()], ["running", "later"])

    def test_stop_deletes_queued_and_running_uploads(self):
        with TestClient(main.app) as client:
            self.assertEqual(self.post(client, name="slow").status_code, 202)
            self.assertEqual(self.post(client, name="next").status_code, 202)
            for _ in range(200):
                if client.get("/cases/slow/job").json()["status"] == "processing":
                    break
                time.sleep(0.01)

            r = client.post("/cases/next/stop")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["stage"], "Stopped")
            self.assertFalse((self.cases / "next").exists())

            r = client.post("/cases/slow/stop")
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()["stage"].startswith("Stopping"))
            for _ in range(300):
                if not (self.cases / "slow").exists():
                    break
                time.sleep(0.01)
            self.assertFalse((self.cases / "slow").exists())
            self.assertEqual(client.get("/case-jobs").json(), [])

            self.assertEqual(client.post("/cases/nope/stop").status_code, 404)
            self.assertEqual(self.post(client, name="done").status_code, 202)
            wait(client, "done")
            self.assertEqual(client.post("/cases/done/stop").status_code, 409)

    def test_interrupted_jobs_fail_on_restart(self):
        (self.cases / "stale").mkdir()
        main.save(self.cases / "stale" / "job.json",
                  Job(id="stale", filename="old.mp4", status="processing", created_at=datetime.now(timezone.utc).isoformat()))
        with TestClient(main.app) as client:
            job = client.get("/cases/stale/job").json()
            self.assertEqual(job["status"], "failed")
            self.assertEqual(client.get("/cases/nope/job").status_code, 404)


if __name__ == "__main__":
    unittest.main()

"""Regression tests for real lifecycle races, persistence and bounded processing."""
import asyncio
import os
import shutil
import stat
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.tests import test_case_jobs as fixtures
from backend.app import main, storage, video, runtime, gemini
from backend.app.schema import Job
from backend.app.server_lock import server_lock
from backend.app.uploads import UploadLimit
from fastapi.testclient import TestClient


class ReliabilityTests(unittest.TestCase):
    setUp = fixtures.CaseUploadTests.setUp
    tearDown = fixtures.CaseUploadTests.tearDown
    post = fixtures.CaseUploadTests.post

    def test_stopped_queued_task_cannot_delete_replacement(self):
        started, release = threading.Event(), threading.Event()
        ordinary = fixtures.fake_run(self.cases)
        def run(case, *args, **kwargs):
            if case == "blocker":
                kwargs["progress"]("Waiting", .5)
                started.set()
                self.assertTrue(release.wait(5))
            return ordinary(case, *args, **kwargs)
        with patch.object(main.claim_cases, "run", side_effect=run), TestClient(main.app) as client:
            try:
                self.post(client, name="blocker")
                self.assertTrue(started.wait(2))
                first = self.post(client, name="reuse").json()
                self.assertEqual(client.post("/cases/reuse/stop").status_code, 200)
                second = self.post(client, name="reuse").json()
                self.assertNotEqual(first["run_id"], second["run_id"])
                self.assertEqual(client.post(f"/cases/reuse/stop?run_id={first['run_id']}").status_code, 409)
            finally:
                release.set()
            self.assertEqual(fixtures.wait(client, "reuse")["status"], "complete")
            self.assertTrue((self.cases / "reuse" / "original.mp4").exists())

    def test_stop_during_final_operation_never_publishes_result(self):
        started, release = threading.Event(), threading.Event()
        ordinary = fixtures.fake_run(self.cases)
        def run(case, *args, **kwargs):
            result = ordinary(case, *args, **kwargs)
            started.set()
            self.assertTrue(release.wait(5))
            return result  # no later progress callback
        with patch.object(main.claim_cases, "run", side_effect=run), TestClient(main.app) as client:
            try:
                self.post(client, name="late")
                self.assertTrue(started.wait(2))
                response = client.post("/cases/late/stop")
                self.assertTrue(response.json()["cancellation_requested"])
                self.assertEqual(self.post(client, name="late").status_code, 409)
            finally:
                release.set()
            for _ in range(200):
                if client.get("/cases/late/job").status_code == 404:
                    break
                time.sleep(.01)
            self.assertFalse((self.cases / "late").exists())
            self.assertEqual(client.get("/cases").json(), [])

    def test_finished_and_failed_jobs_can_be_deleted(self):
        with TestClient(main.app) as client:
            for name in ("done", "boom"):
                self.post(client, name=name)
                fixtures.wait(client, name)
                self.assertEqual(client.delete(f"/cases/{name}").status_code, 200)
                self.assertEqual(client.get(f"/cases/{name}/job").status_code, 404)
                self.assertFalse((self.cases / name).exists())

    def test_locked_delete_reports_failure_and_can_be_retried(self):
        with TestClient(main.app) as client:
            self.post(client, name="locked")
            fixtures.wait(client, "locked")
            with patch.object(main, "remove_folder", side_effect=PermissionError("locked")):
                self.assertEqual(client.delete("/cases/locked").status_code, 409)
            job = client.get("/cases/locked/job").json()
            self.assertEqual(job["stage"], "Deletion failed")
            self.assertEqual(client.delete("/cases/locked").status_code, 200)

    @unittest.skipUnless(os.name == "nt", "Windows read-only directory behavior")
    def test_readonly_case_and_nested_directories_are_deleted(self):
        with TestClient(main.app) as client:
            self.post(client, name="readonly")
            fixtures.wait(client, "readonly")
            folder = self.cases / "readonly"
            frames = folder / "frames"
            frames.mkdir()
            frame = frames / "frame.jpg"
            frame.write_bytes(b"image")
            for path in (frame, frames, folder):
                os.chmod(path, stat.S_IREAD)
            self.assertEqual(client.delete("/cases/readonly").status_code, 200)
            self.assertFalse(folder.exists())

    def test_failed_jobs_remain_discoverable(self):
        with TestClient(main.app) as client:
            self.post(client, name="boom")
            fixtures.wait(client, "boom")
            self.assertEqual(client.get("/case-jobs").json(), [])
            jobs = client.get("/case-jobs?include_finished=true").json()
            self.assertEqual([(j["id"], j["status"]) for j in jobs], [("boom", "failed")])

    def test_corrupt_result_does_not_break_other_cases(self):
        with TestClient(main.app) as client:
            self.post(client, name="good")
            fixtures.wait(client, "good")
            bad = self.cases / "broken"
            bad.mkdir()
            (bad / "result.json").write_text("{")
            self.assertEqual([c["case"] for c in client.get("/cases").json()], ["good"])
            self.assertEqual(client.get("/cases/broken").status_code, 503)

    def test_read_permission_race_is_retried(self):
        with TestClient(main.app) as client:
            self.post(client, name="readable")
            fixtures.wait(client, "readable")
            original = Path.read_text
            failures = [True, True]
            def read(path, *args, **kwargs):
                if path.name == "job.json" and failures:
                    failures.pop()
                    raise PermissionError("rename in progress")
                return original(path, *args, **kwargs)
            with patch.object(Path, "read_text", read):
                self.assertEqual(client.get("/cases/readable/job").status_code, 200)
            self.assertEqual(failures, [])

    def test_polling_during_frequent_progress_is_consistent(self):
        started, release = threading.Event(), threading.Event()
        ordinary = fixtures.fake_run(self.cases)
        def run(case, *args, **kwargs):
            started.set()
            self.assertTrue(release.wait(5))
            for i in range(100):
                kwargs["progress"]("Frames", i / 200)
            return ordinary(case, *args, **kwargs)
        with patch.object(main.claim_cases, "run", side_effect=run), TestClient(main.app) as client:
            self.post(client, name="poll")
            self.assertTrue(started.wait(2))
            release.set()
            values = []
            for _ in range(100):
                response = client.get("/cases/poll/job")
                self.assertEqual(response.status_code, 200)
                values.append(response.json()["progress"])
            self.assertEqual(values, sorted(values))
            fixtures.wait(client, "poll")

    def test_heartbeat_advances_without_fake_progress(self):
        started, release = threading.Event(), threading.Event()
        ordinary = fixtures.fake_run(self.cases)
        def run(case, *args, **kwargs):
            kwargs["progress"]("Network operation", .6)
            started.set()
            self.assertTrue(release.wait(6))
            return ordinary(case, *args, **kwargs)
        with patch.object(main.claim_cases, "run", side_effect=run), TestClient(main.app) as client:
            try:
                self.post(client, name="heartbeat")
                self.assertTrue(started.wait(2))
                first = client.get("/cases/heartbeat/job").json()
                time.sleep(2.1)
                later = client.get("/cases/heartbeat/job").json()
                self.assertGreater(later["heartbeat_at"], first["heartbeat_at"])
                self.assertEqual(later["progress"], first["progress"])
            finally:
                release.set()

    def test_shutdown_preserves_interrupted_upload(self):
        started = threading.Event()
        def run(*args, **kwargs):
            kwargs["progress"]("Waiting for network", .6)
            started.set()
            while True:
                runtime.pause(.01)
        with patch.object(main.claim_cases, "run", side_effect=run):
            with TestClient(main.app) as client:
                self.post(client, name="shutdown")
                self.assertTrue(started.wait(2))
                self.post(client, name="queued-shutdown")
            for name in ("shutdown", "queued-shutdown"):
                self.assertTrue((self.cases / name / "original.mp4").exists())
                job = main.read_job(self.cases / name / "job.json")
                self.assertEqual(job.status, "failed")
                self.assertEqual(job.stage, "Interrupted")

    def test_submission_failure_is_visible_and_retryable(self):
        with TestClient(main.app) as client:
            with patch.object(main.app.state.worker, "submit", side_effect=RuntimeError("shutdown")):
                self.assertEqual(self.post(client, name="unscheduled").status_code, 503)
            self.assertEqual(client.get("/cases/unscheduled/job").json()["status"], "failed")
            self.assertEqual(self.post(client, name="unscheduled").status_code, 202)
            fixtures.wait(client, "unscheduled")

    def test_text_report_uses_same_limit_as_file(self):
        with TestClient(main.app) as client:
            response = self.post(client, report_text="a" * (main.MAX_REPORT_BYTES + 1))
            self.assertEqual(response.status_code, 413)

    def test_request_limit_rejects_before_endpoint(self):
        with TestClient(main.app) as client, patch.dict(os.environ, {"MAX_UPLOAD_MB": "0"}), patch.object(main, "copy_video") as copy:
            response = self.post(client, video=("large.mp4", b"x" * (2 * 1024 * 1024)))
            self.assertEqual(response.status_code, 413)
            copy.assert_not_called()

    def test_corrupt_job_does_not_prevent_startup(self):
        folder = self.cases / "badjob"
        folder.mkdir()
        (folder / "job.json").write_text("{")
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/health").status_code, 200)


class OperationTests(unittest.TestCase):
    def test_atomic_write_failure_preserves_previous_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "result.json"
            storage.save(path, {"old": True})
            with patch.object(Path, "replace", side_effect=PermissionError("locked")), patch.object(storage.time, "sleep"):
                with self.assertRaises(PermissionError):
                    storage.save(path, {"new": True})
            self.assertEqual(storage.read(path), {"old": True})
            self.assertEqual(list(Path(tmp).glob("*.tmp")), [])

    def test_subprocess_timeout_kills_the_process(self):
        with patch.dict(os.environ, {"FFMPEG_TIMEOUT_SEC": "0.05"}):
            start = time.monotonic()
            with self.assertRaises(TimeoutError):
                video.run([sys.executable, "-c", "import time; time.sleep(10)"])
            self.assertLess(time.monotonic() - start, 3)

    def test_subprocess_is_cancelled_without_waiting_for_exit(self):
        control = runtime.Control()
        token = runtime.current.set(control)
        timer = threading.Timer(.1, control.cancel.set)
        try:
            timer.start()
            start = time.monotonic()
            with self.assertRaises(runtime.Cancelled):
                video.run([sys.executable, "-c", "import time; time.sleep(10)"])
            self.assertLess(time.monotonic() - start, 3)
        finally:
            timer.join()
            runtime.current.reset(token)

    def test_oversize_model_video_is_reencoded_and_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model.mp4"
            path.write_bytes(b"x" * 100_001)
            def encode(args):
                Path(args[-1]).write_bytes(b"x" * 80_000)
            with patch.object(gemini, "MAX_INLINE_BYTES", 100_000), patch.object(video, "duration", return_value=1), patch.object(video, "run", side_effect=encode) as run:
                video.ensure_model_size(path)
                self.assertEqual(path.stat().st_size, 80_000)
                self.assertIn("-maxrate", run.call_args.args[0])

    def test_second_server_cannot_take_over_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.lock"
            with server_lock(path):
                with self.assertRaises(RuntimeError):
                    with server_lock(path):
                        self.fail("second server acquired worker lock")

    def test_chunked_upload_limit_returns_413(self):
        async def exercise():
            messages = []
            chunks = iter([
                {"type": "http.request", "body": b"x" * 700_000, "more_body": True},
                {"type": "http.request", "body": b"x" * 700_000, "more_body": False},
            ])
            async def receive():
                return next(chunks)
            async def send(message):
                messages.append(message)
            async def downstream(scope, receive, send):
                from starlette.formparsers import MultiPartException
                try:
                    while (await receive()).get("more_body"):
                        pass
                except MultiPartException:
                    await send({"type": "http.response.start", "status": 400, "headers": []})
                    await send({"type": "http.response.body", "body": b"parser error"})
            with patch.dict(os.environ, {"MAX_UPLOAD_MB": "0"}):
                await UploadLimit(downstream)({"type": "http", "method": "POST", "path": "/cases", "headers": []}, receive, send)
            self.assertEqual(messages[0]["status"], 413)
        asyncio.run(exercise())


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is not installed")
class MediaIntegrationTests(unittest.TestCase):
    def test_ffmpeg_reports_intermediate_processing_timestamps(self):
        with tempfile.TemporaryDirectory() as tmp:
            fractions = []
            video.run(["ffmpeg", "-y", "-re", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10",
                       "-t", "2", "-c:v", "libx264", "-tune", "zerolatency", str(Path(tmp) / "video.mp4")],
                      on_progress=fractions.append, duration_sec=2)
            self.assertTrue(any(0 < value < 1 for value in fractions), fractions)
            self.assertEqual(fractions[-1], 1)
            self.assertEqual(fractions, sorted(fractions))

    def test_real_video_encoding_preserves_duration_and_meets_byte_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source.mp4"
            video.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=10",
                       "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2",
                       "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", str(path)])
            expected = video.duration(path)
            # Valid MP4 with trailing padding forces the bounded encoder path.
            with path.open("ab") as stream:
                stream.write(b"\0" * 150_000)
            with patch.object(gemini, "MAX_INLINE_BYTES", 100_000):
                video.ensure_model_size(path)
                self.assertLessEqual(path.stat().st_size, 100_000)
            self.assertAlmostEqual(video.duration(path), expected, delta=.3)
            normalized = Path(tmp) / "normalized.mp4"
            video.normalize(path, normalized)
            cut = Path(tmp) / "cut.mp4"
            video.cut(normalized, cut, 0, 1)
            self.assertAlmostEqual(video.duration(cut), 1, delta=.3)
            frame = Path(tmp) / "frame.jpg"
            video.frame(cut, .5, frame)
            self.assertGreater(frame.stat().st_size, 0)


class NetworkTests(unittest.TestCase):
    def test_transport_error_retries_with_cancellation_checkpoint(self):
        import httpx
        from types import SimpleNamespace
        from unittest.mock import Mock
        from backend.app.schema import Detections
        instance = gemini.Gemini.__new__(gemini.Gemini)
        request = Mock(side_effect=[httpx.ReadTimeout("timeout"), SimpleNamespace(parsed={"events": []})])
        instance.client = SimpleNamespace(models=SimpleNamespace(generate_content=request))
        with patch.object(gemini, "pause") as pause:
            self.assertEqual(instance.generate([], Detections).events, [])
            self.assertEqual(request.call_count, 2)
            pause.assert_called_once()

    def test_cancel_during_network_call_discards_response(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from backend.app.schema import Detections
        control = runtime.Control()
        token = runtime.current.set(control)
        def request(**kwargs):
            control.cancel.set()
            return SimpleNamespace(parsed={"events": []})
        instance = gemini.Gemini.__new__(gemini.Gemini)
        instance.client = SimpleNamespace(models=SimpleNamespace(generate_content=Mock(side_effect=request)))
        try:
            with self.assertRaises(runtime.Cancelled):
                instance.generate([], Detections)
            self.assertEqual(instance.client.models.generate_content.call_count, 1)
        finally:
            runtime.current.reset(token)


class PreparationTests(unittest.TestCase):
    def test_preparation_reports_each_blocking_stage(self):
        from backend.app import cases, pose
        with tempfile.TemporaryDirectory() as tmp, patch.object(cases, "CASES", Path(tmp)):
            stages = []
            def normalize(src, dst, on_progress=None):
                on_progress(.5)
                dst.write_bytes(b"video")
                on_progress(1)
            def analyze(clip, out, on_frame=None, on_stage=None):
                on_stage("Loading pose model")
                on_stage("Starting pose tracking")
                on_frame(.5)
                on_frame(1)
                raw = out / "raw.mp4"
                raw.write_bytes(b"video")
                return [], raw
            def mux(raw, clip, dst, on_progress=None):
                on_progress(.5)
                dst.write_bytes(b"video")
                on_progress(1)
            with patch.object(video, "normalize", side_effect=normalize), patch.object(pose, "analyze", side_effect=analyze), patch.object(video, "mux_audio", side_effect=mux), patch.object(video, "duration", return_value=10):
                cases.prepare("phases", Path("original.mp4"), progress=lambda stage, value: stages.append((stage, value)))
            self.assertEqual(list(dict.fromkeys(stage for stage, _ in stages)),
                             ["Normalizing footage", "Loading pose model", "Starting pose tracking", "Tracking body pose", "Encoding pose overlay"])
            values = [value for _, value in stages]
            self.assertEqual(values, sorted(values))
            self.assertGreater(values[-1], .38)

    def test_model_path_is_resolved_against_backend_not_working_directory(self):
        from backend.app import pose
        from types import SimpleNamespace
        from unittest.mock import Mock
        factory = Mock()
        with patch.object(pose, "_model", None), patch.dict(os.environ, {"POSE_MODEL": "local-model.pt"}), patch.object(Path, "is_file", return_value=True), patch.dict(sys.modules, {"ultralytics": SimpleNamespace(YOLO=factory)}):
            pose._get_model()
        self.assertEqual(Path(factory.call_args.args[0]), Path(pose.__file__).resolve().parents[1] / "local-model.pt")

    def test_missing_model_fails_without_an_implicit_download(self):
        from backend.app import pose
        with patch.object(pose, "_model", None), patch.dict(os.environ, {"POSE_MODEL": "missing-model.pt"}), patch.object(Path, "is_file", return_value=False):
            with self.assertRaisesRegex(FileNotFoundError, "Pose model not installed"):
                pose._get_model()


if __name__ == "__main__":
    unittest.main()

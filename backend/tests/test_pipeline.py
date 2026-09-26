import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.schema import Detection, Detections, Detail
from backend.app.pipeline import absolute, merge, run
from backend.app.video import windows


def detection(start, end, kind="possible_lunge"):
    return Detection(event_type=kind, start_sec=start, end_sec=end, description="Visible movement")


class TimelineTests(unittest.TestCase):
    def test_full_recording_and_boundary_overlap(self):
        clips = windows(71)
        self.assertEqual([(c.start_sec, c.end_sec) for c in clips], [(0, 30), (20, 50), (40, 70), (60, 71)])
        self.assertEqual(len(windows(30)), 1)
        self.assertEqual(windows(2)[0].end_sec, 2)
        with self.assertRaises(ValueError):
            windows(10, overlap=30)

    def test_absolute_offsets_reject_out_of_bounds(self):
        event = absolute(detection(2, 4), 40, 30)
        self.assertEqual((event.start_sec, event.end_sec), (42, 44))
        with self.assertRaises(ValueError):
            absolute(detection(28, 31), 40, 30)

    def test_duplicate_merge_preserves_distinct_events(self):
        events = merge([(detection(22, 26), 0), (detection(24, 29), 1),
                        (detection(23, 27, "possible_weapon_visible"), 1),
                        (detection(45, 47), 2)])
        self.assertEqual(len(events), 3)
        self.assertEqual((events[0].start_sec, events[0].end_sec), (22, 29))
        self.assertEqual(events[0].source_clips, [0, 1])
        self.assertEqual([e.id for e in events], ["event-1", "event-2", "event-3"])

    def test_two_pass_pipeline_uses_original_timeline(self):
        class FakeGemini:
            def detect(self, path, duration):
                # One event seen in both overlapping clips; one later than 30 seconds.
                return Detections(events={"0": [detection(22, 26)], "1": [detection(4, 8)], "2": [detection(2, 4)]}[path.stem])
            def detail(self, path, candidate, start, end):
                return Detail(status="uncertain", description="Partially obscured", observations=["Motion visible"], uncertainty=["Occlusion"], confidence="low")
            def close(self):
                pass
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch("backend.app.pipeline.video.duration", return_value=62), patch("backend.app.pipeline.video.normalize"), patch("backend.app.pipeline.video.cut") as cut, patch("backend.app.pipeline.Gemini", FakeGemini):
                result = run(root / "original.mov", root, "test", "bodycam.mov", lambda *args: None)
            self.assertEqual(len(result.events), 2)
            self.assertEqual((result.events[1].start_sec, result.events[1].end_sec), (42, 44))
            self.assertEqual((result.events[1].context_start_sec, result.events[1].context_end_sec), (32, 54))
            self.assertEqual(result.events[0].source_clips, [0, 1])
            self.assertEqual(cut.call_count, 5)
            self.assertEqual(len(json.loads((root / "candidates.json").read_text())), 2)

    def test_no_candidates_skips_detail(self):
        with tempfile.TemporaryDirectory() as folder, patch("backend.app.pipeline.video.duration", return_value=5), patch("backend.app.pipeline.video.normalize"), patch("backend.app.pipeline.video.cut"), patch("backend.app.pipeline.Gemini") as factory:
            factory.return_value.detect.return_value = Detections(events=[])
            result = run(Path("original.mp4"), Path(folder), "test", "test.mp4", lambda *args: None)
            self.assertEqual(result.events, [])
            factory.return_value.detail.assert_not_called()
            factory.return_value.close.assert_called_once()


class APITests(unittest.TestCase):
    def test_job_lifecycle_and_restart_recovery(self):
        from fastapi.testclient import TestClient
        from backend.app import main
        from backend.app.schema import Result, Job
        from datetime import datetime, timezone
        import time
        import uuid
        with tempfile.TemporaryDirectory() as folder, patch.object(main, "DATA", Path(folder)), patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch.object(main.shutil, "which", return_value="binary"):
            stale_id = str(uuid.uuid4())
            stale_folder = Path(folder)/stale_id
            stale_folder.mkdir()
            main.save(stale_folder/"job.json", Job(id=stale_id, filename="old.mp4", created_at=datetime.now(timezone.utc).isoformat()))
            def fake_run(original, directory, job_id, filename, progress):
                progress("Merging", .5)
                return Result(id=job_id, filename=filename, duration_sec=4, video_url="/video", original_url="/original", model="test", clips=[], candidates=[], events=[])
            with patch.object(main, "run", side_effect=fake_run), TestClient(main.app) as client:
                self.assertEqual(client.get(f"/analyses/{stale_id}").json()["status"], "failed")
                self.assertEqual(client.post("/analyses", files={"video": ("bad.txt", b"bad")}).status_code, 415)
                self.assertEqual(client.post("/analyses", files={"video": ("empty.mp4", b"")}).status_code, 400)
                response = client.post("/analyses", files={"video": ("test.mp4", b"video")})
                self.assertEqual(response.status_code, 202)
                job_id = response.json()["id"]
                for _ in range(100):
                    job = client.get(f"/analyses/{job_id}").json()
                    if job["status"] in ("complete", "failed"):
                        break
                    time.sleep(.01)
                self.assertEqual(job["status"], "complete")
                self.assertEqual(client.get(f"/analyses/{job_id}/result").json()["events"], [])
                self.assertEqual(client.get("/analyses/not-a-uuid").status_code, 404)
                self.assertEqual(len(client.get("/analyses").json()), 2)

if __name__ == "__main__":
    unittest.main()

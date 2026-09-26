import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.app import main, youtube
from backend.app.schema import Result

URL = "https://www.youtube.com/watch?v=AbR3-Kpzw6k"


class YouTubeTests(unittest.TestCase):
    def test_canonical_video_urls(self):
        for url in (URL, URL + "&list=ignored&t=120", "https://youtu.be/AbR3-Kpzw6k?si=tracking", "https://m.youtube.com/watch?v=AbR3-Kpzw6k", "https://www.youtube.com/shorts/AbR3-Kpzw6k", "https://youtube.com/embed/AbR3-Kpzw6k"):
            self.assertEqual(youtube.canonical_url(url), URL)

    def test_non_youtube_playlist_and_malicious_urls_rejected(self):
        for url in ("http://localhost/video", "file:///tmp/video.mp4", "https://youtube.com.evil.org/watch?v=AbR3-Kpzw6k", "https://youtube.com@evil.org/watch?v=AbR3-Kpzw6k", "https://user@youtube.com/watch?v=AbR3-Kpzw6k", "https://youtube.com:443/watch?v=AbR3-Kpzw6k", "https://youtube.com/playlist?list=abc", "https://youtube.com/watch?v=bad", "https://youtu.be/AbR3-Kpzw6k/extra", "--exec=anything"):
            with self.subTest(url=url), self.assertRaises(youtube.YouTubeError):
                youtube.canonical_url(url)

    def test_range_limits(self):
        youtube.validate_range(120, 210)
        for start, end in ((-1, 60), (5, 5), (10, 5), (0, 91), (0, .5), (float("nan"), 60), (0, float("inf"))):
            with self.assertRaises(youtube.YouTubeError):
                youtube.validate_range(start, end)

    def test_download_uses_selected_range_and_fixed_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            def invoke(args, timeout):
                calls.append(args)
                if "--dump-single-json" in args:
                    return json.dumps({"duration": 600, "title": "Official footage", "availability": "public", "live_status": "not_live"})
                (root / "original.mp4").write_bytes(b"video")
                return ""
            with patch.object(youtube, "invoke", side_effect=invoke), patch.object(youtube.video, "duration", return_value=60):
                path, title = youtube.download(URL, 120, 180, root, lambda *args: None)
            self.assertEqual(path, root / "original.mp4")
            self.assertEqual(title, "Official footage")
            self.assertIn("*120-180", calls[1])
            self.assertEqual(calls[1][-1], URL)

    def test_invalid_source_metadata_skips_download(self):
        for metadata in ({"duration": 600, "live_status": "is_live"}, {"duration": 30}, {"duration": None}, {"duration": 600, "availability": "private"}):
            with tempfile.TemporaryDirectory() as directory, patch.object(youtube, "invoke", return_value=json.dumps(metadata)) as invoke:
                with self.assertRaises(youtube.YouTubeError):
                    youtube.download(URL, 0, 60, Path(directory), lambda *args: None)
                self.assertEqual(invoke.call_count, 1)

    def test_failed_download_cleans_partial_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "report.txt").write_text("Keep this")
            def invoke(args, timeout):
                if "--dump-single-json" in args:
                    return json.dumps({"duration": 600})
                (root / "original.mp4.part").write_bytes(b"partial")
                raise youtube.YouTubeError("Download failed")
            with patch.object(youtube, "invoke", side_effect=invoke), self.assertRaises(youtube.YouTubeError):
                youtube.download(URL, 0, 60, root, lambda *args: None)
            self.assertEqual(list(root.iterdir()), [root / "report.txt"])


class YouTubeAPITests(unittest.TestCase):
    def test_youtube_job_preserves_source_and_passes_excerpt_to_pipeline(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "DATA", Path(directory)), patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch.object(main.shutil, "which", return_value="binary"):
            def download(url, start, end, folder, progress):
                self.assertEqual((url, start, end), (URL, 120, 180))
                progress("Downloading YouTube excerpt", .02)
                original = folder / "original.mp4"
                original.write_bytes(b"video")
                return original, "Official public footage"
            def run(original, folder, job_id, filename, report_text, progress):
                self.assertEqual(original.read_bytes(), b"video")
                self.assertEqual(report_text, "The person raised a hand.")
                return Result(id=job_id, filename=filename, report_text=report_text, duration_sec=60, video_url="/video", original_url="/excerpt", model="test", claims=[], reviews=[])
            with patch.object(main.youtube, "download", side_effect=download), patch.object(main, "run", side_effect=run), TestClient(main.app) as client:
                response = client.post("/analyses", data={"report_text": "The person raised a hand.", "youtube_url": URL, "start_seconds": "120", "end_seconds": "180"})
                self.assertEqual(response.status_code, 202)
                job_id = response.json()["id"]
                for _ in range(100):
                    job = client.get(f"/analyses/{job_id}").json()
                    if job["status"] in ("complete", "failed"):
                        break
                    time.sleep(.01)
                self.assertEqual(job["status"], "complete")
                result = client.get(f"/analyses/{job_id}/result").json()
                self.assertEqual(result["source_url"], URL)
                self.assertEqual(result["source_start_seconds"], 120)
                self.assertEqual(result["source_title"], "Official public footage")
                self.assertEqual(json.loads((Path(directory)/job_id/"source.json").read_text())["end"], 180)

    def test_sources_and_ranges_validated_before_any_download(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "DATA", Path(directory)), patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch.object(main.shutil, "which", return_value="binary"), patch.object(main.youtube, "download") as download, TestClient(main.app) as client:
            for data in ({}, {"youtube_url": "https://localhost/a"}, {"youtube_url": URL, "end_seconds": "91"}, {"youtube_url": URL, "start_seconds": "nan"}, {"youtube_url": URL, "start_seconds": "60", "end_seconds": "20"}):
                self.assertEqual(client.post("/analyses", data={"report_text": "A report.", **data}).status_code, 422)
            self.assertEqual(client.post("/analyses", data={"report_text": "A report.", "youtube_url": URL}, files={"video": ("test.mp4", b"video")}).status_code, 422)
            download.assert_not_called()
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_download_error_visible_and_gemini_not_called(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "DATA", Path(directory)), patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch.object(main.shutil, "which", return_value="binary"), patch.object(main.youtube, "download", side_effect=youtube.YouTubeError("Video unavailable; upload an MP4.")), patch.object(main, "run") as run, patch.object(main.logging, "exception"), TestClient(main.app) as client:
            response = client.post("/analyses", data={"report_text": "A report.", "youtube_url": URL})
            self.assertEqual(response.status_code, 202)
            for _ in range(100):
                job = client.get(f"/analyses/{response.json()['id']}").json()
                if job["status"] == "failed":
                    break
                time.sleep(.01)
            self.assertEqual(job["status"], "failed")
            self.assertIn("Video unavailable", job["error"])
            run.assert_not_called()

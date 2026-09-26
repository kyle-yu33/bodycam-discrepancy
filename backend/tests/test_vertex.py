import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.app.gemini import Gemini, MAX_INLINE_BYTES


class VertexTests(unittest.TestCase):
    def test_vertex_key_and_inline_video_without_files_api(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch("backend.app.gemini.genai.Client") as client, tempfile.TemporaryDirectory() as folder:
            gemini = Gemini()
            self.assertTrue(client.call_args.kwargs["vertexai"])
            self.assertEqual(client.call_args.kwargs["api_key"], "test")
            path = Path(folder) / "clip.mp4"
            path.write_bytes(b"video")
            with gemini.video_file(path) as part:
                self.assertEqual(part.inline_data.data, b"video")
                self.assertEqual(part.inline_data.mime_type, "video/mp4")
            client.return_value.files.upload.assert_not_called()
            gemini.close()
            client.return_value.close.assert_called_once()

    def test_oversized_inline_video_rejected_before_read(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch("backend.app.gemini.genai.Client"), tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "large.mp4"
            with path.open("wb") as stream:
                stream.truncate(MAX_INLINE_BYTES + 1)
            gemini = Gemini()
            with self.assertRaisesRegex(ValueError, "too large"):
                with gemini.video_file(path):
                    self.fail("Oversized clip accepted")
            gemini.close()

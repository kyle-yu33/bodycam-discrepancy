"""YouTube imports preserve the full source recording."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app import youtube


class YouTubeImportTests(unittest.TestCase):
    def test_timestamped_link_downloads_whole_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp)
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                if len(calls) == 2:
                    (destination / "original.mp4").write_bytes(b"video")
                return "Source title\n"

            with patch.object(youtube, "run", side_effect=run):
                path, title = youtube.download_video("https://youtu.be/AbR3-Kpzw6k?t=120", destination)

            self.assertEqual(path, destination / "original.mp4")
            self.assertEqual(title, "Source title")
            self.assertNotIn("--download-sections", calls[1])
            self.assertIn("https://www.youtube.com/watch?v=AbR3-Kpzw6k", calls[1])


if __name__ == "__main__":
    unittest.main()

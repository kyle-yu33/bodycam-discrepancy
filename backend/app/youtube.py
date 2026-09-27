"""Import a public YouTube video for report review."""
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}


def validate_youtube_url(value: str) -> str:
    """Accept only HTTPS links to a single YouTube video and return a canonical URL."""
    try:
        parsed = urlsplit(value.strip())
        host = (parsed.hostname or "").lower()
        if (parsed.scheme != "https" or host not in YOUTUBE_HOSTS or parsed.username or parsed.password
                or parsed.port not in (None, 443)):
            raise ValueError
        if host in {"youtu.be", "www.youtu.be"}:
            video_id = parsed.path.strip("/").split("/")[0]
        elif parsed.path.rstrip("/") == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        else:
            parts = [part for part in parsed.path.split("/") if part]
            video_id = parts[1] if len(parts) == 2 and parts[0] in {"shorts", "embed", "live"} else ""
        if not VIDEO_ID.fullmatch(video_id):
            raise ValueError
    except (ValueError, IndexError):
        raise ValueError("Paste a public YouTube video link (watch, youtu.be, Shorts, or embed).") from None
    return f"https://www.youtube.com/watch?v={video_id}"


def download_video(url: str, destination: Path) -> tuple[Path, str]:
    """Download the complete video at up to 720p using yt-dlp."""
    canonical = validate_youtube_url(url)
    destination.mkdir(parents=True, exist_ok=True)
    title_result = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "--no-playlist", "--no-warnings", "--get-title", canonical],
        capture_output=True, text=True, timeout=45,
    )
    if title_result.returncode:
        raise RuntimeError("Could not read that YouTube video. It may be private, unavailable, or blocked.")
    title = next(iter(title_result.stdout.strip().splitlines()), "YouTube video")[:180]

    template = str(destination / "original.%(ext)s")
    result = subprocess.run(
        [sys.executable, "-m", "yt_dlp", canonical, "--no-playlist", "--no-warnings",
         "-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4",
         "--output", template],
        capture_output=True, text=True, timeout=3600,
    )
    video = next((path for path in destination.glob("original.*")
                  if path.suffix in {".mp4", ".webm", ".mkv"} and path.is_file() and path.stat().st_size), None)
    if result.returncode or video is None:
        detail = result.stderr[-800:].strip()
        raise RuntimeError("Could not download the YouTube video." + (f" {detail}" if detail else ""))
    return video, title

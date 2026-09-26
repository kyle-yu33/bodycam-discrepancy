"""Import one public YouTube excerpt without cookies or user downloader config."""
import json
import math
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from . import video


class YouTubeError(ValueError):
    """Safe, user-facing import error."""


def canonical_url(value: str) -> str:
    try:
        parts = urlsplit(value.strip())
        if parts.scheme not in ("http", "https") or parts.username or parts.password or parts.port:
            raise ValueError()
        host = (parts.hostname or "").lower()
        path = parts.path.strip("/").split("/")
        if host in ("youtu.be", "www.youtu.be") and len(path) == 1:
            video_id = path[0]
        elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
            if parts.path == "/watch":
                ids = parse_qs(parts.query).get("v", [])
                video_id = ids[0] if len(ids) == 1 else ""
            elif len(path) == 2 and path[0] in ("shorts", "embed", "live"):
                video_id = path[1]
            else:
                video_id = ""
        else:
            video_id = ""
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError()
    except ValueError:
        raise YouTubeError("Enter a YouTube video URL (youtube.com/watch, youtu.be, or Shorts), not a playlist or another website.") from None
    # Never pass arbitrary hosts, query options, or playlist URLs to the downloader.
    return f"https://www.youtube.com/watch?v={video_id}"


def validate_range(start: float, end: float):
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or not 1 <= end - start <= 90:
        raise YouTubeError("Choose a YouTube excerpt between 1 and 90 seconds, with end after start.")


def invoke(arguments: list[str], timeout: int) -> str:
    command = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-plugin-dirs",
        "--no-playlist", "--no-progress", "--no-warnings", "--no-cache-dir",
        "--js-runtimes", "node", "--socket-timeout", "20", "--retries", "2",
        "--fragment-retries", "2", *arguments]
    # Kill the FFmpeg child as well if an import exceeds its time budget.
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, start_new_session=os.name != "nt") as process:
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise YouTubeError("YouTube import timed out. Try again or upload the excerpt as an MP4.") from None
        if process.returncode:
            if "No module named yt_dlp" in stderr:
                raise YouTubeError("YouTube support is not installed. Install backend/requirements.txt and restart the backend.")
            raise YouTubeError("YouTube could not provide this video. It may be unavailable, restricted, or blocking downloads. Try another public video or upload an MP4 excerpt.")
        return stdout


def download(url: str, start: float, end: float, folder: Path, progress) -> tuple[Path, str]:
    url = canonical_url(url)
    validate_range(start, end)
    progress("Checking YouTube video", .01)
    try:
        info = json.loads(invoke(["--dump-single-json", "--skip-download", url], 90))
    except (json.JSONDecodeError, TypeError):
        raise YouTubeError("YouTube returned invalid video information. Try another video or upload a file.") from None
    duration = info.get("duration")
    if info.get("live_status") in ("is_live", "is_upcoming", "post_live") or not isinstance(duration, (int, float)) or not math.isfinite(duration):
        raise YouTubeError("Use a finished YouTube video, not a live or upcoming stream.")
    if info.get("availability") not in (None, "public", "unlisted"):
        raise YouTubeError("Use a publicly accessible video that does not require signing in.")
    if end > duration:
        raise YouTubeError(f"The video is {duration:g} seconds long. Choose an end time within the video.")
    target = folder / "original.mp4"
    limit = int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024
    progress("Downloading YouTube excerpt", .02)
    try:
        invoke(["--format", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]",
            "--merge-output-format", "mp4", "--remux-video", "mp4",
            "--download-sections", f"*{start:g}-{end:g}", "--force-keyframes-at-cuts",
            "--max-filesize", str(limit), "--output", str(folder / "original.%(ext)s"), url], 300)
        if not target.is_file() or target.stat().st_size == 0:
            raise YouTubeError("No playable excerpt was downloaded. Try a different video or upload an MP4.")
        if target.stat().st_size > limit:
            raise YouTubeError("YouTube excerpt exceeds the upload size limit.")
        actual = video.duration(target)
        if abs(actual - (end - start)) > 1:
            raise YouTubeError("The downloaded excerpt did not match the selected range. Try a shorter range or upload a trimmed MP4.")
        # Containers can round up a frame; enforce the pipeline's 90-second cap.
        if actual > end - start:
            trimmed = folder / "original.trimmed.mp4"
            video.cut(target, trimmed, 0, end - start)
            trimmed.replace(target)
        return target, str(info.get("title") or "YouTube video")[:200]
    except Exception:
        # Only clean downloader-owned files in this newly created job directory.
        for path in folder.glob("original.*"):
            if path.is_file():
                path.unlink()
        raise

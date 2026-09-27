"""FFmpeg preprocessing preserves the full recording and its audio."""
import json
import math
import os
import time
import tempfile
import subprocess
from pathlib import Path
from .schema import Clip
from .runtime import check

ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]

def run(args, on_progress=None, duration_sec=None, timeout_sec=None):
    check()
    deadline = time.monotonic() + (float(os.getenv("FFMPEG_TIMEOUT_SEC", "300")) if timeout_sec is None else timeout_sec)
    # A progress file avoids blocking pipe reads on Windows while communicate
    # drains FFmpeg's stderr. It contains processed timestamps, not invented time.
    with tempfile.TemporaryDirectory(prefix="video-progress-") as tmp:
        progress_file = Path(tmp) / "progress.txt"
        if on_progress is not None:
            args = [args[0], "-progress", str(progress_file), "-nostats", *args[1:]]
        last = -1.0
        def report():
            nonlocal last
            if on_progress is None or not duration_sec:
                return
            try:
                lines = progress_file.read_text(encoding="utf-8").splitlines()
            except (FileNotFoundError, PermissionError):
                return
            for line in reversed(lines):
                if line.startswith("out_time_us="):
                    try:
                        fraction = min(.99, max(0, int(line.split("=", 1)[1]) / 1_000_000 / duration_sec))
                    except ValueError:
                        return
                    if fraction > last:
                        on_progress(fraction)
                        last = fraction
                    return
        with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
            try:
                while True:
                    check()
                    report()
                    if time.monotonic() >= deadline:
                        raise TimeoutError(f"{args[0]} exceeded its time limit")
                    try:
                        stdout, stderr = process.communicate(timeout=0.25)
                        break
                    except subprocess.TimeoutExpired:
                        continue
            except BaseException:
                process.kill()
                process.communicate()
                raise
            check()
            if process.returncode:
                raise RuntimeError(f"{args[0]} failed: {stderr[-1500:]}")
            if on_progress is not None:
                on_progress(1.0)
            return stdout


def duration(path: Path) -> float:
    info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)]))
    value = float(info["format"]["duration"])
    if not math.isfinite(value) or value <= 0 or not any(s["codec_type"] == "video" for s in info["streams"]):
        raise ValueError("A playable video with positive duration is required")
    return value

def normalize(src: Path, dst: Path, on_progress=None):
    run(["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:'min(720,ih)'", *ENCODE, str(dst)],
        on_progress=on_progress, duration_sec=duration(src) if on_progress else None)

def cut(src: Path, dst: Path, start: float, end: float, height: int | None = None):
    scale = ["-vf", f"scale=-2:'min({height},ih)'"] if height else []
    run(["ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(end-start), "-map", "0:v:0", "-map", "0:a:0?", *scale, *ENCODE, str(dst)])

def for_model(src: Path, dst: Path, height: int = 480):
    """Smaller copy for Gemini: Vertex AI takes video inline only (15 MB cap)."""
    run(["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-vf", f"scale=-2:'min({height},ih)'", *ENCODE, str(dst)])
    ensure_model_size(dst)

def for_model_window(src: Path, dst: Path, start: float, end: float):
    """Encode one short window with a bitrate cap so it fits Gemini's inline limit."""
    run(["ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(end-start),
         "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:'min(480,ih)'",
         "-c:v", "libx264", "-preset", "veryfast", "-b:v", "900k", "-maxrate", "1100k",
         "-bufsize", "2200k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
         "-movflags", "+faststart", str(dst)])
    ensure_model_size(dst)

def mux_audio(silent: Path, with_audio: Path, dst: Path, on_progress=None):
    """OpenCV writes mp4v video without audio; re-encode to H.264 and copy the audio back in."""
    run(["ffmpeg", "-y", "-i", str(silent), "-i", str(with_audio), "-map", "0:v:0", "-map", "1:a:0?", *ENCODE, "-shortest", str(dst)],
        on_progress=on_progress, duration_sec=duration(with_audio) if on_progress else None)

def frame(src: Path, t: float, dst: Path):
    run(["ffmpeg", "-y", "-ss", f"{max(t, 0):.2f}", "-i", str(src), "-frames:v", "1", "-q:v", "2", str(dst)])

def windows(duration_sec: float, size: float = 30, overlap: float = 10) -> list[Clip]:
    if duration_sec <= 0 or not 0 <= overlap < size:
        raise ValueError("Invalid duration or overlap")
    clips = []
    start = 0.0
    while start < duration_sec:
        end = min(start + size, duration_sec)
        clips.append(Clip(index=len(clips), start_sec=start, end_sec=end))
        if end >= duration_sec:
            break
        start += size - overlap
    return clips


def ensure_model_size(path: Path):
    """Bound model payloads by bytes, not by recording duration or CRF alone."""
    from .gemini import MAX_INLINE_BYTES
    if path.stat().st_size <= MAX_INLINE_BYTES:
        return
    seconds = duration(path)
    # Leave headroom for container overhead and audio; verify the actual result.
    budget = int(MAX_INLINE_BYTES * 8 * 0.85 / seconds) - 64_000
    if budget < 100_000:
        raise ValueError("Video is too long for inline analysis; use a shorter clip")
    with tempfile.TemporaryDirectory(dir=path.parent) as tmp:
        smaller = Path(tmp) / "bounded.mp4"
        for factor in (1, 0.65):
            rate = int(budget * factor)
            run(["ffmpeg", "-y", "-i", str(path), "-map", "0:v:0", "-map", "0:a:0?",
                 "-vf", "scale=-2:'min(480,ih)'", "-c:v", "libx264", "-preset", "veryfast",
                 "-b:v", str(rate), "-maxrate", str(rate), "-bufsize", str(rate * 2),
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(smaller)])
            if smaller.stat().st_size <= MAX_INLINE_BYTES:
                smaller.replace(path)
                return
    raise ValueError("Video could not be compressed to the model's input limit")

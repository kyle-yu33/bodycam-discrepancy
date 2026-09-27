"""FFmpeg preprocessing preserves the full recording and its audio."""
import json
import math
import subprocess
from pathlib import Path
from .schema import Clip

ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]

def run(args):
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(f"{args[0]} failed: {p.stderr[-1500:]}")
    return p.stdout

def duration(path: Path) -> float:
    info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)]))
    value = float(info["format"]["duration"])
    if not math.isfinite(value) or value <= 0 or not any(s["codec_type"] == "video" for s in info["streams"]):
        raise ValueError("A playable video with positive duration is required")
    return value

def normalize(src: Path, dst: Path):
    run(["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:'min(720,ih)'", *ENCODE, str(dst)])

MODEL_MAX_BYTES = 14 * 1024 * 1024   # Vertex AI takes video inline only, capped at 15 MB; keep a margin

def cut(src: Path, dst: Path, start: float, end: float, height: int | None = None, max_bytes: int | None = None):
    scale = ["-vf", f"scale=-2:'min({height},ih)'"] if height else []
    run(["ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(end-start), "-map", "0:v:0", "-map", "0:a:0?", *scale, *ENCODE, str(dst)])
    if max_bytes:
        fit(dst, max_bytes)

def for_model(src: Path, dst: Path, height: int = 480):
    """Smaller copy for Gemini, re-encoded at a lower bitrate if a long clip would pass the inline cap."""
    run(["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-vf", f"scale=-2:'min({height},ih)'", *ENCODE, str(dst)])
    fit(dst, MODEL_MAX_BYTES)

def fit(path: Path, max_bytes: int):
    """Re-encode in place at the video bitrate that fits max_bytes (10% margin, 64 kb/s audio)."""
    if path.stat().st_size <= max_bytes:
        return
    kbps = max(100, int(max_bytes * 8 * 0.9 / duration(path) / 1000) - 64)
    tmp = path.with_name(path.stem + ".fit" + path.suffix)
    run(["ffmpeg", "-y", "-i", str(path), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast",
         "-b:v", f"{kbps}k", "-maxrate", f"{kbps}k", "-bufsize", f"{2 * kbps}k", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(tmp)])
    tmp.replace(path)

def mux_audio(silent: Path, with_audio: Path, dst: Path):
    """OpenCV writes mp4v video without audio; re-encode to H.264 and copy the audio back in."""
    run(["ffmpeg", "-y", "-i", str(silent), "-i", str(with_audio), "-map", "0:v:0", "-map", "1:a:0?", *ENCODE, "-shortest", str(dst)])

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

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

def cut(src: Path, dst: Path, start: float, end: float):
    run(["ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(end-start), "-map", "0:v:0", "-map", "0:a:0?", *ENCODE, str(dst)])

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

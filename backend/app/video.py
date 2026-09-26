"""ffmpeg helpers: anything touching containers, codecs, audio, or precise seeking."""
import json
import subprocess
from pathlib import Path

H264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]


def _run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed:\n{p.stderr[-2000:]}")


def normalize(src: Path, dst: Path, max_seconds: int = 90, height: int = 720) -> None:
    """Trim to max_seconds, downscale to at most `height` (never upscale), re-encode
    to browser-safe H.264/AAC MP4."""
    _run(["ffmpeg", "-y", "-i", str(src), "-t", str(max_seconds),
          "-vf", f"scale=-2:'min({height},ih)'", *H264,
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(dst)])


def mux_annotated(annotated_raw: Path, original: Path, dst: Path) -> None:
    """OpenCV writes mp4v (not browser-playable, no audio). Re-encode to H.264
    and copy the original audio track in, so Gemini still hears the audio."""
    _run(["ffmpeg", "-y", "-i", str(annotated_raw), "-i", str(original),
          "-map", "0:v", "-map", "1:a?", *H264, "-c:a", "aac",
          "-shortest", "-movflags", "+faststart", str(dst)])


def extract_frame(video: Path, t: float, dst: Path) -> None:
    _run(["ffmpeg", "-y", "-ss", f"{max(t, 0):.2f}", "-i", str(video),
          "-frames:v", "1", "-q:v", "2", str(dst)])


def cut_window(video: Path, start: float, dur: float, dst: Path) -> None:
    _run(["ffmpeg", "-y", "-ss", f"{max(start, 0):.2f}", "-i", str(video),
          "-t", f"{dur:.2f}", *H264, "-c:a", "aac", str(dst)])


def duration(video: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "json", str(video)], capture_output=True, text=True, check=True)
    return float(json.loads(p.stdout)["format"]["duration"])

"""Download demo clips into data/clips/ (clips are not committed).

Each clip is a section of a YouTube video, cut with yt-dlp (needs ffmpeg on PATH).

Usage: python -m app.fetch_clips            # all clips below
       python -m app.fetch_clips sfst1      # just one
"""
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"

# case name -> (video URL, section "start-end" in m:ss or seconds)
CLIPS = {
    "sfst1": ("https://www.youtube.com/watch?v=4ThCZOa20wc", "3:40-5:00"),
    "sfst2": ("https://www.youtube.com/watch?v=mXw1nvF3klk", "15:20-16:20"),
    # Re-published by Audit the Audit (commentary channel); check each clip for narration before using it.
    "gunpoint": ("https://www.youtube.com/watch?v=yOegqWf4pM4", "48.4-70"),  # 48.0-48.3 is a cut from another camera
    "porch": ("https://www.youtube.com/watch?v=LPFw5-sIImk", "7:40-8:25"),
    "hospital": ("https://www.youtube.com/watch?v=qKlP-zdpj48", "4:13-5:00"),
    "parkedcar": ("https://www.youtube.com/watch?v=G19anoWa2LA", "1:30-3:05"),
}


def fetch(name: str) -> Path:
    if name not in CLIPS:
        sys.exit(f"unknown clip {name!r}; known: {', '.join(CLIPS)}")
    dst = DATA / "clips" / f"{name}.mp4"
    if dst.exists():
        print(f"{name}: already at {dst}")
        return dst
    url, section = CLIPS[name]
    subprocess.run([sys.executable, "-m", "yt_dlp", url,
                    "--download-sections", f"*{section}", "--force-keyframes-at-cuts",
                    "-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4",
                    "-o", str(dst)], check=True)
    print(f"{name}: wrote {dst} ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


if __name__ == "__main__":
    for n in sys.argv[1:] or CLIPS:
        fetch(n)

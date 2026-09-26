"""Download demo clips into data/clips/ (clips are not committed).

Two sources:
- CLIPS: BodyCam-VQA/BWC-VideoText-359 on Hugging Face (COPA Chicago public records).
  The videos live inside ~1-4 GB zips, so we read single members with HTTP Range
  requests instead of downloading the whole archive.
- YOUTUBE: a section of a YouTube video, cut with yt-dlp (needs ffmpeg on PATH).

Usage: python -m app.fetch_clips            # all clips below
       python -m app.fetch_clips sfst1      # just one
"""
import io
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
HF = "https://huggingface.co/datasets/BodyCam-VQA/BWC-VideoText-359/resolve/main/"

# case name -> (zip in the dataset, member inside the zip)
CLIPS = {
    "copa184": ("eval_videos.zip", "eval_videos/video184.mp4"),
}

# case name -> (video URL, section "start-end" in m:ss or seconds)
YOUTUBE = {
    "sfst1": ("https://www.youtube.com/watch?v=4ThCZOa20wc", "3:40-5:00"),
}


class _RangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP Range requests; enough for zipfile."""

    def __init__(self, url: str):
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD")) as r:
            self.url = r.url  # resolve the CDN redirect once
            self.size = int(r.headers["Content-Length"])
        self.pos = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size:
            return 0
        end = min(self.pos + len(b), self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urllib.request.urlopen(req) as r:
            data = r.read()
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


def fetch(name: str) -> Path:
    if name not in CLIPS and name not in YOUTUBE:
        sys.exit(f"unknown clip {name!r}; known: {', '.join([*CLIPS, *YOUTUBE])}")
    dst = DATA / "clips" / f"{name}.mp4"
    if dst.exists():
        print(f"{name}: already at {dst}")
        return dst
    if name in YOUTUBE:
        _fetch_youtube(*YOUTUBE[name], dst)
    else:
        _fetch_hf(*CLIPS[name], dst)
    print(f"{name}: wrote {dst} ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


def _fetch_youtube(url: str, section: str, dst: Path) -> None:
    subprocess.run([sys.executable, "-m", "yt_dlp", url,
                    "--download-sections", f"*{section}", "--force-keyframes-at-cuts",
                    "-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4",
                    "-o", str(dst)], check=True)


def _fetch_hf(zip_name: str, member: str, dst: Path) -> None:
    z = zipfile.ZipFile(io.BufferedReader(_RangeFile(HF + zip_name), buffer_size=1 << 20))
    tmp = dst.with_suffix(".part")
    with z.open(member) as src, open(tmp, "wb") as out:
        while chunk := src.read(1 << 20):
            out.write(chunk)
    tmp.replace(dst)


if __name__ == "__main__":
    for n in sys.argv[1:] or [*CLIPS, *YOUTUBE]:
        fetch(n)

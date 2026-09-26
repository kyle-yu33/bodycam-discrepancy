"""Download demo clips into data/clips/ (clips are not committed).

Clips come from BodyCam-VQA/BWC-VideoText-359 on Hugging Face (COPA Chicago public
records). The videos live inside ~1-4 GB zips, so we read single members with HTTP
Range requests instead of downloading the whole archive.

Usage: python -m app.fetch_clips            # all clips below
       python -m app.fetch_clips copa184    # just one
"""
import io
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
    zip_name, member = CLIPS[name]
    dst = DATA / "clips" / f"{name}.mp4"
    if dst.exists():
        print(f"{name}: already at {dst}")
        return dst
    z = zipfile.ZipFile(io.BufferedReader(_RangeFile(HF + zip_name), buffer_size=1 << 20))
    tmp = dst.with_suffix(".part")
    with z.open(member) as src, open(tmp, "wb") as out:
        while chunk := src.read(1 << 20):
            out.write(chunk)
    tmp.replace(dst)
    print(f"{name}: wrote {dst} ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


if __name__ == "__main__":
    for n in sys.argv[1:] or CLIPS:
        fetch(n)

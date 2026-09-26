"""ElevenLabs Scribe transcription with word timestamps grouped into timed segments.

Standalone on purpose so the frontend/pipeline can plug it in without touching other modules:
    from backend.app.transcribe import transcribe
    transcript = transcribe(Path("clip.mp4"))        # -> Transcript (pydantic, .model_dump_json())
CLI:
    python -m backend.app.transcribe clip.mp4 > transcript.json
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Literal
import httpx
from pydantic import BaseModel

URL = "https://api.elevenlabs.io/v1/speech-to-text"
MODEL = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
SENTENCE_END = (".", "?", "!")

class Word(BaseModel):
    text: str
    start_sec: float
    end_sec: float
    speaker: str | None = None
    kind: Literal["word", "audio_event"] = "word"

class Segment(BaseModel):
    """A sentence or short phrase with its time span; what the UI shows as a caption line."""
    id: str
    start_sec: float
    end_sec: float
    speaker: str | None
    text: str
    words: list[Word]

class Transcript(BaseModel):
    language_code: str | None
    text: str
    segments: list[Segment]

def extract_audio(src: Path, dst: Path):
    # Mono 16 kHz AAC keeps uploads small (~1 MB/min) without hurting recognition.
    p = subprocess.run(["ffmpeg", "-y", "-i", str(src), "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", str(dst)],
                       capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(f"ffmpeg could not extract audio (does the file have an audio track?): {p.stderr[-800:]}")

def request(audio: Path, diarize: bool, language: str | None, num_speakers: int | None) -> dict:
    data = {"model_id": MODEL, "timestamps_granularity": "word", "diarize": str(diarize).lower(), "tag_audio_events": "true"}
    if language:
        data["language_code"] = language
    if num_speakers:
        data["num_speakers"] = str(num_speakers)
    for attempt in range(3):
        with audio.open("rb") as f:
            r = httpx.post(URL, headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}, data=data,
                           files={"file": (audio.name, f, "audio/mp4")}, timeout=600)
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
            time.sleep(2 ** (attempt + 1))
            continue
        if r.is_error:
            raise RuntimeError(f"ElevenLabs STT failed ({r.status_code}): {r.text[:500]}")
        return r.json()

def parse_words(raw: dict) -> list[Word]:
    return [Word(text=w["text"].strip(), start_sec=w["start"], end_sec=w["end"], speaker=w.get("speaker_id"), kind=w["type"])
            for w in raw.get("words", []) if w.get("type") in ("word", "audio_event") and w["text"].strip()]

def segment(words: list[Word], max_gap: float = 0.8, max_duration: float = 6.0) -> list[Segment]:
    """Group words into segments, splitting on sentence end, speaker change, pauses, audio events, or length."""
    groups: list[list[Word]] = []
    for w in words:
        cur = groups[-1] if groups else None
        split = (cur is None or w.kind == "audio_event" or cur[-1].kind == "audio_event"
                 or cur[-1].text.endswith(SENTENCE_END) or w.speaker != cur[-1].speaker
                 or w.start_sec - cur[-1].end_sec > max_gap or w.end_sec - cur[0].start_sec > max_duration)
        if split:
            groups.append([w])
        else:
            cur.append(w)
    return [Segment(id=f"seg-{i+1}", start_sec=g[0].start_sec, end_sec=g[-1].end_sec, speaker=g[0].speaker,
                    text=" ".join(w.text for w in g), words=g) for i, g in enumerate(groups)]

def transcribe(path: Path, diarize: bool = True, language: str | None = None, num_speakers: int | None = None) -> Transcript:
    with tempfile.TemporaryDirectory() as tmp:
        audio = Path(tmp) / "audio.m4a"
        extract_audio(path, audio)
        raw = request(audio, diarize, language, num_speakers)
    return Transcript(language_code=raw.get("language_code"), text=raw.get("text", ""), segments=segment(parse_words(raw)))

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    print(transcribe(Path(sys.argv[1])).model_dump_json(indent=2))

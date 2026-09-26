"""Gemini calls. All return parsed pydantic objects via structured output."""
import os
import time
from pathlib import Path

from google import genai
from google.genai import types

from .schema import Claim, ModelVerdict, PoseEvent, SkepticCheck

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")  # check AI Studio for current models
_client = None


def _c():
    global _client
    if _client is None:
        _client = genai.Client()  # reads GEMINI_API_KEY from env
    return _client


INLINE_MAX = 12_000_000  # 20 MB request cap, and inline bytes grow ~33% as base64


def _video_part(path: Path, fps: float | None = None) -> types.Part:
    # Short windows go inline; full clips (up to 90 s, ~15 MB at 720p) go via the Files API.
    meta = types.VideoMetadata(fps=fps) if fps else None
    if Path(path).stat().st_size <= INLINE_MAX:
        return types.Part(inline_data=types.Blob(data=Path(path).read_bytes(), mime_type="video/mp4"),
                          video_metadata=meta)
    f = _c().files.upload(file=path, config=types.UploadFileConfig(mime_type="video/mp4"))
    deadline = time.monotonic() + 300
    while f.state == types.FileState.PROCESSING:
        if time.monotonic() > deadline:
            raise RuntimeError(f"Gemini file processing timed out: {f.name}")
        time.sleep(2)
        f = _c().files.get(name=f.name)
    if f.state != types.FileState.ACTIVE:
        raise RuntimeError(f"Gemini file upload failed: {f.name} {f.error}")
    return types.Part(file_data=types.FileData(file_uri=f.uri, mime_type="video/mp4"),
                      video_metadata=meta)


def _json(contents, schema):
    resp = _c().models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0,
        ),
    )
    if resp.parsed is None:
        raise RuntimeError(f"Unparseable model output: {resp.text[:500]}")
    return resp.parsed


EXTRACT_PROMPT = """Split this police report into atomic, individually checkable claims.
- One actor and one action per claim; split compound sentences.
- claim_type: "visual" if it could be seen on camera (movement, posture, hands, weapons, contact);
  "audio" if it concerns speech or sounds (commands given, statements made);
  "subjective" if it is an opinion or inner state ("appeared agitated", "feared for my safety").
- text must use the report's exact wording.
- sequence_cue: the ordering phrase from the report if present, else null.

REPORT:
"""


def extract_claims(report_text: str) -> list[Claim]:
    return _json(EXTRACT_PROMPT + report_text, list[Claim])


VERIFY_PROMPT = """You check a police report against body-worn camera footage to help a defense attorney
decide what to review. A wrong "contradicted" is the worst possible error.

Each person in the video has an overlay box labelled "id:N". Automated pose events
(noisy and incomplete; the camera itself moves):
{pose}

For EVERY claim below return exactly one verdict:
- supported: the footage clearly shows or plays it.
- contradicted: the footage clearly shows something incompatible at the relevant moment
  (e.g. claim says he lunged; he stays seated with hands visible). Give the timestamp and
  describe what is visible instead.
- not_visible: off-camera, blocked, too dark or shaky, or you are unsure. Use this whenever in doubt.
Subjective claims are always not_visible.
reason: one factual sentence. Never use the words "lie" or "false".

CLAIMS:
{claims}
"""


def _fmt_pose(events: list[PoseEvent]) -> str:
    if not events:
        return "(none detected)"
    return "\n".join(f"- {e.start_sec:.1f}-{e.end_sec:.1f}s id:{e.track_id} {e.event}" for e in events)


def verify_claims(video: Path, claims: list[Claim], events: list[PoseEvent],
                  fps: float = 5.0) -> list[ModelVerdict]:
    claims_txt = "\n".join(f"{c.id} [{c.claim_type.value}] {c.text}"
                           + (f" (cue: {c.sequence_cue})" if c.sequence_cue else "") for c in claims)
    prompt = VERIFY_PROMPT.format(pose=_fmt_pose(events), claims=claims_txt)
    return _json([_video_part(video, fps), prompt], list[ModelVerdict])


SKEPTIC_PROMPT = """A reviewer flagged this police-report claim as contradicted by the footage.
Claim: "{text}"
Reviewer's reason: {reason}
This clip is the {start:.1f}-{end:.1f}s window of the original video (no overlays).
Judge only from this clip. Would an attorney watching it clearly see the contradiction?
If there is reasonable doubt (blocked view, darkness, blur, key moment off-screen), confirmed=false."""


def skeptic(window: Path, claim: Claim, reason: str, start: float, end: float) -> SkepticCheck:
    prompt = SKEPTIC_PROMPT.format(text=claim.text, reason=reason, start=start, end=end)
    return _json([_video_part(window, 10.0), prompt], SkepticCheck)

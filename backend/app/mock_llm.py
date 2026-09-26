"""Offline stand-in for gemini.py (development only; the demo runs on Gemini).

With a ground-truth fixture it replays the human labels, so the pipeline, API and UI
can be built against realistic output. Without one it splits the report into
sentences and returns not_visible for everything.
"""
import json
import re
from pathlib import Path

from .schema import Claim, ClaimType, ModelVerdict, PoseEvent, SkepticCheck, Verdict

# Subjective is checked first: "I believed he said..." is an inner state, not audio.
_SUBJECTIVE = re.compile(r"\b(appeared|seemed|felt|feared|believed)\b", re.I)
_AUDIO = re.compile(r"\b(said|stated|ordered|yelled|told|asked|requested|shouted)\b", re.I)


def _load(fixture: Path) -> list[dict]:
    return json.loads(Path(fixture).read_text(encoding="utf-8"))["claims"]


def _classify(sentence: str) -> ClaimType:
    if _SUBJECTIVE.search(sentence):
        return ClaimType.subjective
    if _AUDIO.search(sentence):
        return ClaimType.audio
    return ClaimType.visual


def extract_claims(report_text: str, fixture: Path | None = None) -> list[Claim]:
    if fixture:
        return [Claim(id=f"c{i}", text=c["text"], actor=c["actor"], action=c["action"],
                      claim_type=ClaimType(c["claim_type"]), sequence_cue=None)
                for i, c in enumerate(_load(fixture), 1)]
    sentences = [s.strip().rstrip(".!?") for s in re.split(r"(?<=[.!?])\s+", report_text)]
    return [Claim(id=f"c{i}", text=s, actor="unknown", action=s,
                  claim_type=_classify(s), sequence_cue=None)
            for i, s in enumerate((s for s in sentences if s), 1)]


def verify_claims(video: Path, claims: list[Claim], events: list[PoseEvent],
                  fps: float = 5.0, fixture: Path | None = None) -> list[ModelVerdict]:
    truth = {c["text"]: c for c in _load(fixture)} if fixture else {}
    out = []
    for c in claims:
        gt = truth.get(c.text)
        if gt is None:
            out.append(ModelVerdict(claim_id=c.id, verdict=Verdict.not_visible, timestamp_sec=None,
                                    person_track_id=None, reason="[mock] no fixture label for this claim"))
        else:
            out.append(ModelVerdict(claim_id=c.id, verdict=Verdict(gt["expected"]),
                                    timestamp_sec=gt.get("timestamp_sec"),
                                    person_track_id=gt.get("person_track_id"),
                                    reason="[mock] " + gt.get("note", "")))
    return out


def skeptic(window: Path, claim: Claim, reason: str, start: float, end: float,
            fixture: Path | None = None) -> SkepticCheck:
    return SkepticCheck(confirmed=True, reason="[mock]")

"""LLM backend dispatch. pipeline.py and main.py call these, never gemini.py directly.

LLM_BACKEND=mock|gemini. Unset -> gemini if GEMINI_API_KEY is a real key, else mock.
`fixture` (a data/ground_truth/*.json) only drives the mock; Gemini ignores it.
"""
import hashlib
import os
from pathlib import Path
from typing import Literal

from . import mock_llm
from .schema import Claim, ModelVerdict, PoseEvent, SkepticCheck

Backend = Literal["mock", "gemini"]
PLACEHOLDER_KEY = "paste-key-from-aistudio.google.com"


def backend() -> Backend:
    b = os.getenv("LLM_BACKEND", "").strip().lower()
    if b in ("mock", "gemini"):
        return b
    if b:
        raise ValueError(f"LLM_BACKEND must be 'mock' or 'gemini', got {b!r}")
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return "gemini" if key and key != PLACEHOLDER_KEY else "mock"


def cache_tag(fixture: Path | None = None) -> str:
    """Goes into the cache key: a mock run never serves a Gemini result, and mock
    runs with different fixtures (or none) don't collide."""
    if backend() == "gemini":
        return "gemini"
    return "mock:" + (hashlib.sha256(Path(fixture).read_bytes()).hexdigest()[:12] if fixture else "none")


def _gemini():
    from . import gemini  # lazy: mock mode never builds a Gemini client
    return gemini


def extract_claims(report_text: str, fixture: Path | None = None) -> list[Claim]:
    if backend() == "mock":
        return mock_llm.extract_claims(report_text, fixture)
    return _gemini().extract_claims(report_text)


def verify_claims(video: Path, claims: list[Claim], events: list[PoseEvent],
                  fps: float = 5.0, fixture: Path | None = None) -> list[ModelVerdict]:
    if backend() == "mock":
        return mock_llm.verify_claims(video, claims, events, fps, fixture)
    return _gemini().verify_claims(video, claims, events, fps)


def skeptic(window: Path, claim: Claim, reason: str, start: float, end: float,
            fixture: Path | None = None) -> SkepticCheck:
    if backend() == "mock":
        return mock_llm.skeptic(window, claim, reason, start, end, fixture)
    return _gemini().skeptic(window, claim, reason, start, end)

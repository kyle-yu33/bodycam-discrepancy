"""Shared data contract. Change only via PR; mirror changes in shared/types.ts.

Models sent to Gemini as response_schema (Claim, ModelVerdict, SkepticCheck)
must not have default values -- the Gemini schema converter rejects them.
Use Optional[...] with no default for nullable fields.
"""
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ClaimType(str, Enum):
    visual = "visual"
    audio = "audio"
    subjective = "subjective"


class Verdict(str, Enum):
    supported = "supported"
    contradicted = "contradicted"
    not_visible = "not_visible"


# ---------- Gemini-facing ----------

class Claim(BaseModel):
    id: str = Field(description="c1, c2, ... in report order")
    text: str = Field(description="Exact wording from the report")
    actor: str = Field(description="Who acts, e.g. 'officer', 'suspect', 'passenger'")
    action: str = Field(description="The single action claimed")
    claim_type: ClaimType
    sequence_cue: Optional[str] = Field(description="Ordering phrase from the report, or null")


class ModelVerdict(BaseModel):
    claim_id: str
    verdict: Verdict
    timestamp_sec: Optional[float] = Field(description="Seconds from clip start where evidence is clearest, or null")
    person_track_id: Optional[int] = Field(description="id:N overlay of the person the claim concerns, or null")
    reason: str = Field(description="One factual sentence about what is seen or heard")


class SkepticCheck(BaseModel):
    confirmed: bool
    reason: str


# ---------- Backend-only ----------

class PoseEvent(BaseModel):
    track_id: int
    event: str  # hands_raised | arm_extended | hand_at_waist | lying_down
    start_sec: float
    end_sec: float


class ClaimResult(ModelVerdict):
    evidence_frames: list[str] = []      # URLs relative to API base
    pose_support: list[PoseEvent] = []   # pose events near timestamp
    downgraded: bool = False             # skeptic flipped contradicted -> not_visible


class AnalysisResult(BaseModel):
    case_id: str
    report_text: str
    video_url: str
    annotated_video_url: Optional[str] = None
    claims: list[Claim]
    results: list[ClaimResult]
    pose_events: list[PoseEvent]

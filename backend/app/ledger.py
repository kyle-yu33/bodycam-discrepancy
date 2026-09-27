"""Claim-evidence ledger contract: a report's claims checked against one video.

Uses the four evidence states and claim types from context/. Models sent to Gemini as
response_schema (Claim*, ClaimCheck*, SecondLook) have no defaults; nullable fields are
Optional with no default.
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field

ClaimType = Literal["visual", "audio", "documentary", "subjective_or_legal"]
Status = Literal["consistent", "potential_inconsistency", "insufficient_footage", "outside_assessment"]

# ---------- Gemini-facing ----------

class Claim(BaseModel):
    id: str = Field(description="c1, c2, ... in report order")
    text: str = Field(description="The report's exact wording for this one claim")
    claim_type: ClaimType

class Claims(BaseModel):
    claims: list[Claim]

class ClaimCheck(BaseModel):
    claim_id: str
    observation: str = Field(description="What is actually seen or heard in the window, stated neutrally. One or two sentences.")
    status: Status
    window_start_sec: Optional[float] = Field(description="Start of the footage that bears on the claim, seconds from clip start; null if none")
    window_end_sec: Optional[float] = Field(description="End of that footage; null if none")
    person_track_id: Optional[int] = Field(description="id:N overlay of the person the claim is about, or null")

class ClaimChecks(BaseModel):
    checks: list[ClaimCheck]

class Agreement(BaseModel):
    claim_id: str
    reason: str
    agrees: bool = Field(description="False if the observation describes something that its status doesn't fit")

class Agreements(BaseModel):
    items: list[Agreement]

class SecondLook(BaseModel):
    observation: str = Field(description="What this window shows, stated neutrally")
    finding: Literal["incompatible_with_claim", "matches_claim", "cannot_tell"] = Field(
        description="What the clip shows about the claim; must agree with the observation")

    @property
    def confirmed(self) -> bool:
        """The flag stands only when the clip clearly shows something incompatible with the claim."""
        return self.finding == "incompatible_with_claim"

# ---------- Backend-only ----------

class PoseEvent(BaseModel):
    track_id: int
    event: str
    start_sec: float
    end_sec: float

class ClaimResult(BaseModel):
    claim: Claim
    status: Status
    observation: str
    window_start_sec: Optional[float] = None
    window_end_sec: Optional[float] = None
    person_track_id: Optional[int] = None
    second_look: Optional[str] = None       # the narrow re-check's observation, when one ran
    downgraded: bool = False                # a first-pass flag the re-check did not confirm
    first_pass_observation: Optional[str] = None  # the first pass's text when a re-check replaced it; `observation`
                                                  # then holds the re-check's, so it always agrees with `status`
    evidence_frames: list[str] = []         # media URLs relative to the API base
    pose_events: list[PoseEvent] = []       # pose events overlapping the window

class CaseResult(BaseModel):
    case: str
    origin: Literal["demo", "upload"] = "demo"   # upload = analyzed from the frontend via POST /cases
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_start_seconds: float = 0
    model: str
    created_at: str
    report_text: str
    duration_sec: float
    video_url: str
    annotated_video_url: str
    results: list[ClaimResult]
    pose_events: list[PoseEvent]

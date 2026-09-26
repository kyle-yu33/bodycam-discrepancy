"""Claim-review contracts. Persisted evidence times use the original recording."""
from typing import Annotated, Literal
from pydantic import BaseModel, Field, model_validator

Seconds = Annotated[float, Field(ge=0, allow_inf_nan=False)]
ClaimCategory = Literal["visual", "audio", "documentary", "subjective_or_legal"]
ReviewStatus = Literal[
    "consistent_with_visible_evidence",
    "potential_visual_inconsistency_review_recommended",
    "insufficient_footage_to_assess",
    "outside_automated_assessment",
]


class ExtractedClaim(BaseModel):
    reportText: str = Field(min_length=1)
    category: ClaimCategory
    assessableByVideo: bool


class ExtractedClaims(BaseModel):
    claims: list[ExtractedClaim] = Field(min_length=1, max_length=30)


class Claim(ExtractedClaim):
    id: str
    order: int
    reportStart: int
    reportEnd: int


class EvidenceWindow(BaseModel):
    startSeconds: Seconds
    endSeconds: Seconds

    @model_validator(mode="after")
    def ordered(self):
        if self.endSeconds <= self.startSeconds:
            raise ValueError("Evidence window must have positive duration")
        return self


class Localization(BaseModel):
    outcome: Literal["located", "unable_to_locate"]
    window: EvidenceWindow | None
    reason: str = Field(min_length=1)

    @model_validator(mode="after")
    def consistent(self):
        if (self.outcome == "located") != (self.window is not None):
            raise ValueError("Only a located claim can have a window")
        return self


class Grounding(BaseModel):
    """Model response; frame times are relative to the supplied narrow clip."""
    status: ReviewStatus
    observations: list[str]
    uncertaintyReason: str | None
    frameTimes: list[Seconds]

    @model_validator(mode="after")
    def grounded(self):
        if self.status in ("consistent_with_visible_evidence", "potential_visual_inconsistency_review_recommended"):
            if not self.observations or not self.frameTimes:
                raise ValueError("A visual assessment requires observations and source frames")
        if self.status in ("insufficient_footage_to_assess", "outside_automated_assessment"):
            if not self.uncertaintyReason or not self.uncertaintyReason.strip():
                raise ValueError("An abstention requires an explanation")
        return self


class EvidenceReview(Grounding):
    """All frame times here have been converted to original-recording seconds."""
    claimId: str
    evidenceWindow: EvidenceWindow | None = None
    localizationReason: str | None = None
    clip_url: str | None = None
    humanReviewRequired: Literal[True] = True

    @model_validator(mode="after")
    def source_bounds(self):
        if self.evidenceWindow is None:
            if self.frameTimes or self.clip_url or self.status not in (
                "insufficient_footage_to_assess", "outside_automated_assessment"
            ):
                raise ValueError("No visual conclusion or frame reference without a window")
        elif any(not self.evidenceWindow.startSeconds <= t <= self.evidenceWindow.endSeconds for t in self.frameTimes):
            raise ValueError("Source frame is outside the evidence window")
        return self


class Clip(BaseModel):
    index: int
    start_sec: float
    end_sec: float


class Result(BaseModel):
    id: str
    filename: str
    report_text: str
    duration_sec: Seconds
    video_url: str
    original_url: str
    source_url: str | None = None
    source_title: str | None = None
    source_start_seconds: Seconds = 0
    model: str
    pipeline_version: Literal["2"] = "2"
    mode: Literal["live"] = "live"
    claims: list[Claim]
    reviews: list[EvidenceReview]


class Job(BaseModel):
    id: str
    filename: str
    status: Literal["queued", "processing", "complete", "failed"] = "queued"
    stage: str = "Queued"
    progress: float = 0
    error: str | None = None
    created_at: str

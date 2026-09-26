"""Video event contracts. All timestamps are seconds in the original recording."""
from typing import Literal
from pydantic import BaseModel, Field, model_validator

EventType = Literal["possible_firearm_pointing", "possible_weapon_visible", "possible_physical_altercation", "possible_lunge", "possible_person_down", "possible_hands_raised"]

class Detection(BaseModel):
    event_type: EventType
    start_sec: float = Field(ge=0, allow_inf_nan=False)
    end_sec: float = Field(ge=0, allow_inf_nan=False)
    description: str

    @model_validator(mode="after")
    def ordered(self):
        if self.end_sec < self.start_sec:
            raise ValueError("Event ends before it starts")
        return self

class Detections(BaseModel):
    events: list[Detection]

class Candidate(Detection):
    id: str
    source_clips: list[int]

class Detail(BaseModel):
    status: Literal["retained", "uncertain", "dismissed"]
    description: str
    observations: list[str]
    uncertainty: list[str]
    confidence: Literal["low", "medium", "high"]

class Event(Candidate):
    detail: Detail
    clip_url: str
    context_start_sec: float
    context_end_sec: float

class Clip(BaseModel):
    index: int
    start_sec: float
    end_sec: float

class Result(BaseModel):
    id: str
    filename: str
    duration_sec: float
    video_url: str
    original_url: str
    model: str
    pipeline_version: str = "1"
    clips: list[Clip]
    candidates: list[Candidate]
    events: list[Event]

class Job(BaseModel):
    id: str
    filename: str
    status: Literal["queued", "processing", "complete", "failed"] = "queued"
    stage: str = "Queued"
    progress: float = 0
    error: str | None = None
    created_at: str

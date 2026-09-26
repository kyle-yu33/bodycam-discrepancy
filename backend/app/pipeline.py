"""Full recording -> overlapping clips -> candidates -> merge -> detailed review."""
import json
from pathlib import Path
from . import video
from .gemini import Gemini, MODEL
from .schema import Candidate, Detection, Event, Result

def absolute(detection: Detection, offset: float, length: float) -> Detection:
    if detection.start_sec > length or detection.end_sec > length:
        raise ValueError("Gemini returned a timestamp outside the clip")
    return detection.model_copy(update={"start_sec": detection.start_sec + offset, "end_sec": detection.end_sec + offset})

def merge(detections: list[tuple[Detection, int]]) -> list[Candidate]:
    merged: list[Candidate] = []
    for event, index in sorted(detections, key=lambda item: (item[0].event_type, item[0].start_sec)):
        previous = merged[-1] if merged else None
        if previous and previous.event_type == event.event_type and event.start_sec <= previous.end_sec:
            previous.end_sec = max(previous.end_sec, event.end_sec)
            previous.source_clips = sorted(set(previous.source_clips + [index]))
            if event.description not in previous.description:
                previous.description += " / " + event.description
        else:
            merged.append(Candidate(**event.model_dump(), id="", source_clips=[index]))
    merged.sort(key=lambda event: event.start_sec)
    for i, event in enumerate(merged):
        event.id = f"event-{i+1}"
    return merged

def run(original: Path, folder: Path, job_id: str, filename: str, progress) -> Result:
    progress("Preprocessing full recording", 0.03)
    video.duration(original)
    normalized = folder / "video.mp4"
    video.normalize(original, normalized)
    duration = video.duration(normalized)
    clips = video.windows(duration)
    clip_dir = folder / "clips"
    clip_dir.mkdir(exist_ok=True)
    gemini = Gemini()
    try:
        detections = []
        for clip in clips:
            progress(f"Detecting candidates · clip {clip.index+1}/{len(clips)}", 0.1 + .45 * clip.index / len(clips))
            path = clip_dir / f"{clip.index}.mp4"
            video.cut(normalized, path, clip.start_sec, clip.end_sec)
            found = gemini.detect(path, clip.end_sec - clip.start_sec)
            detections.extend((absolute(event, clip.start_sec, clip.end_sec - clip.start_sec), clip.index) for event in found.events)
        progress("Merging overlapping detections", .56)
        candidates = merge(detections)
        (folder / "candidates.json").write_text(json.dumps([c.model_dump() for c in candidates], indent=2))
        events = []
        for i, candidate in enumerate(candidates):
            progress(f"Detailed review · event {i+1}/{len(candidates)}", .6 + .35*i/len(candidates))
            start = max(0, candidate.start_sec-10)
            end = min(duration, candidate.end_sec+10)
            path = clip_dir / f"{candidate.id}.mp4"
            video.cut(normalized, path, start, end)
            detail = gemini.detail(path, candidate, start, end)
            events.append(Event(**candidate.model_dump(), detail=detail,
                clip_url=f"/media/{job_id}/clips/{path.name}", context_start_sec=start, context_end_sec=end))
        return Result(id=job_id, filename=filename, duration_sec=duration, video_url=f"/media/{job_id}/video.mp4",
            original_url=f"/media/{job_id}/{original.name}", model=MODEL, clips=clips, candidates=candidates, events=events)
    finally:
        gemini.close()

"""Claim-evidence ledger for one demo case: clip + team-written report -> CaseResult.

Everything lands in data/cases/<case>/. Normalizing, pose and claim extraction are cached so
tuning runs only repeat the Gemini checks; each run is also archived in runs/.

CLI (from backend/):
  python -m app.cases sfst2                  # uses data/clips/sfst2.mp4 + data/reports/sfst2.txt
  python -m app.cases sfst2 --repose         # redo normalize + pose (+ transcript)
  python -m app.cases sfst2 --reextract      # redo claim extraction
Env: CLAIMS_MODEL, CHECK_FPS, SECOND_LOOK_FPS, GEMINI_VIDEO=annotated|clean, POSE_MODEL, POSE_FPS,
ELEVENLABS_API_KEY (optional: writes transcript.json with word timestamps; skipped without it).
Scores against data/ground_truth/<case>.json when it exists (see app.evaluate).
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # before .gemini/.claims read the model env vars

from . import claims as ck  # noqa: E402
from . import pose, video  # noqa: E402
from .gemini import Gemini  # noqa: E402
from .ledger import CaseResult, Claim, ClaimCheck, ClaimResult, PoseEvent
from .transcribe import transcribe
from .storage import read, save
from .runtime import check, Cancelled

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
CASES = DATA / "cases"
MEDIA = "/case-media"
WINDOW_PAD = 2.0      # seconds added around a flagged window for the second look
MIN_WINDOW = 10.0


def _media(case: str, name: str) -> str:
    return f"{MEDIA}/{case}/{name}"


def prepare(case: str, src: Path, repose: bool = False, on_pose=None, progress=None) -> tuple[Path, float, list[PoseEvent]]:
    step = progress or (lambda *_: None)
    out = CASES / case
    out.mkdir(parents=True, exist_ok=True)
    clip = out / "clip.mp4"
    if repose or not clip.exists():
        step("Normalizing footage", 0.02)
        video.normalize(src, clip, on_progress=lambda f: step("Normalizing footage", 0.02 + .08 * f))
    pose_json = out / "pose.json"
    if repose or not pose_json.exists():
        def pose_frame(f):
            step("Tracking body pose", .12 + .23 * f)
            if on_pose:
                on_pose(f)
        events, raw = pose.analyze(clip, out, on_frame=pose_frame,
                                   on_stage=lambda stage: step(stage, .1 if stage == "Loading pose model" else .12))
        step("Encoding pose overlay", .35)
        video.mux_audio(raw, clip, out / "annotated.mp4",
                        on_progress=lambda f: step("Encoding pose overlay", .35 + .04 * f))
        raw.unlink(missing_ok=True)
        save(pose_json, [e.model_dump() for e in events])
        for stale in out.glob("model_*.mp4"):
            stale.unlink()
    events = [PoseEvent(**e) for e in read(pose_json)]
    return clip, video.duration(clip), events


def _transcript(clip: Path, out: Path, log) -> None:
    """Timed ElevenLabs transcript saved beside the case; not used by the claim checks yet."""
    path = out / "transcript.json"
    if path.exists():
        return
    if not os.getenv("ELEVENLABS_API_KEY"):
        log("  transcript skipped: ELEVENLABS_API_KEY not set")
        return
    try:
        t = transcribe(clip)
    except Cancelled:
        raise
    except Exception as e:  # never block the claim ledger on the transcript
        log(f"  transcript failed: {e}")
        return
    save(path, t)
    log(f"  transcript: {len(t.segments)} lines -> {path.name}")


def _claims(g: Gemini, out: Path, report_text: str, reextract: bool) -> list[Claim]:
    path = out / "claims.json"
    if not reextract and path.exists():
        saved = read(path)
        if saved["report_text"] == report_text:
            return [Claim(**c) for c in saved["claims"]]
    claims = ck.extract(g, report_text)
    save(path, {"report_text": report_text, "claims": [c.model_dump() for c in claims]})
    return claims


def _check_recording(g: Gemini, source: Path, out: Path, claims: list[Claim],
                     events: list[PoseEvent], duration: float, overlay: bool, step) -> dict[str, ClaimCheck]:
    """Check the full timeline in Gemini-sized windows; keep the best located check per claim."""
    windows = video.windows(duration, size=60, overlap=5)
    best: dict[str, ClaimCheck] = {}
    claim_ids = {claim.id for claim in claims}
    rank = {"insufficient_footage": 0, "outside_assessment": 1,
            "potential_inconsistency": 2, "consistent": 3}
    for i, window in enumerate(windows):
        model_window = out / f"model_window_{i:04d}.mp4"
        if not model_window.exists():
            video.for_model_window(source, model_window, window.start_sec, window.end_sec)
        nearby = [event for event in events
                  if event.start_sec <= window.end_sec and event.end_sec >= window.start_sec]
        checks = ck.check(g, model_window, claims, pose.summarize(nearby), duration, overlay,
                          segment_start=window.start_sec, segment_end=window.end_sec)
        for check in checks:
            if check.claim_id not in claim_ids:
                continue
            current = check.model_copy()
            s, e = current.window_start_sec, current.window_end_sec
            if s is not None and e is not None:
                if (s < window.start_sec - 1 or e > window.end_sec + 1) and \
                        0 <= s <= window.end_sec - window.start_sec + 1 and \
                        0 <= e <= window.end_sec - window.start_sec + 1:
                    s, e = s + window.start_sec, e + window.start_sec
                if s < window.start_sec - 1 or e > window.end_sec + 1 or e < s:
                    current.status = "insufficient_footage"
                    current.window_start_sec = current.window_end_sec = None
                else:
                    current.window_start_sec, current.window_end_sec = s, e
            elif current.status in ("consistent", "potential_inconsistency"):
                current.status = "insufficient_footage"
            previous = best.get(current.claim_id)
            if previous is None or rank[current.status] > rank[previous.status]:
                best[current.claim_id] = current
        step("Checking each claim against the footage", 0.6 + 0.19 * (i + 1) / len(windows))
    return best


def _finish(g: Gemini, case: str, clip: Path, dur: float, claim: Claim, chk: ClaimCheck | None,
            events: list[PoseEvent], log) -> ClaimResult:
    out = CASES / case
    if chk is None:
        r = ClaimResult(claim=claim, status="insufficient_footage", observation="The model returned no check for this claim.")
    else:
        r = ClaimResult(claim=claim, status=chk.status, observation=chk.observation,
                        window_start_sec=chk.window_start_sec, window_end_sec=chk.window_end_sec,
                        person_track_id=chk.person_track_id)
    if r.window_start_sec is not None and r.window_end_sec is not None:
        s, e = sorted((min(max(r.window_start_sec, 0.0), dur), min(max(r.window_end_sec, 0.0), dur)))
        r.window_start_sec, r.window_end_sec = round(s, 1), round(max(e, min(dur, s + 1.0)), 1)
    else:
        r.window_start_sec = r.window_end_sec = None

    if claim.claim_type == "subjective_or_legal":
        r.status = "outside_assessment"

    # Every flag gets an independent second look at a clean, narrow window before it's shown.
    if r.status == "potential_inconsistency":
        if r.window_start_sec is None:
            r.status, r.downgraded = "insufficient_footage", True
            r.second_look = "No footage window was given, so the flag could not be re-checked."
        else:
            s, e = max(r.window_start_sec - WINDOW_PAD, 0.0), min(r.window_end_sec + WINDOW_PAD, dur)
            if e - s < MIN_WINDOW:
                mid = (s + e) / 2
                s, e = max(0.0, mid - MIN_WINDOW / 2), min(dur, mid + MIN_WINDOW / 2)
            win = out / f"window_{claim.id}.mp4"
            video.cut(clip, win, s, e, height=480)
            look = ck.second_look(g, win, claim, s, e, r.window_start_sec, r.window_end_sec)
            r.second_look = look.observation
            log(f"  second look {claim.id} {s:.0f}-{e:.0f}s: {'confirmed' if look.confirmed else 'NOT confirmed'}")
            if not look.confirmed:
                r.status, r.downgraded = "insufficient_footage", True

    if r.window_start_sec is not None:
        s, e = r.window_start_sec, r.window_end_sec
        for k, t in enumerate((s, (s + e) / 2, e)):
            p = out / "frames" / f"{claim.id}_{k}.jpg"
            p.parent.mkdir(parents=True, exist_ok=True)
            video.frame(clip, min(t, dur - 0.1), p)
            r.evidence_frames.append(_media(case, f"frames/{p.name}"))
        r.pose_events = [ev for ev in events if ev.start_sec <= e and ev.end_sec >= s
                         and (r.person_track_id is None or ev.track_id == r.person_track_id)]
    return r


def run(case: str, src: Path, report_text: str, repose: bool = False, reextract: bool = False, log=print,
        progress=None, origin: str = "demo", publish: bool = True, source_url: str | None = None,
        source_title: str | None = None, source_start_seconds: float = 0) -> CaseResult:
    """progress(stage, fraction) is called as each step starts and after every pose frame; the upload API shows it
    to the user, and may raise to stop the run."""
    def step(stage, fraction):
        check()
        if progress:
            progress(stage, fraction)
    out = CASES / case
    log(f"[{case}] preparing clip and pose")
    step("Preparing footage", 0.01)
    clip, dur, events = prepare(case, src, repose, progress=step)
    if repose:
        (out / "transcript.json").unlink(missing_ok=True)
    step("Transcribing audio", 0.4)
    _transcript(clip, out, log)
    step("Encoding footage for analysis", 0.45)
    overlay = os.getenv("GEMINI_VIDEO", "annotated") == "annotated"
    source_video = out / "annotated.mp4" if overlay else clip
    if dur <= 90:
        model_video = out / f"model_{'annotated' if overlay else 'clean'}.mp4"
        if not model_video.exists():
            video.for_model(source_video, model_video)

    g = Gemini()
    try:
        step("Splitting the report into claims", 0.5)
        claims = _claims(g, out, report_text, reextract)
        log(f"[{case}] {len(claims)} claims; checking with {ck.CLAIMS_MODEL} at {ck.CHECK_FPS} fps "
            f"({'pose overlay' if overlay else 'clean video'})")
        step("Checking each claim against the footage", 0.6)
        if dur <= 90:
            checks = {c.claim_id: c for c in ck.check(g, model_video, claims, pose.summarize(events), dur, overlay)}
        else:
            checks = _check_recording(g, source_video, out, claims, events, dur, overlay, step)
        results = []
        for i, c in enumerate(claims):
            step("Re-checking flags and building the ledger", 0.8 + 0.2 * i / max(len(claims), 1))
            results.append(_finish(g, case, clip, dur, c, checks.get(c.id), events, log))
    finally:
        g.close()

    res = CaseResult(case=case, origin=origin, source_url=source_url, source_title=source_title,
                     source_start_seconds=source_start_seconds,
                     model=ck.CLAIMS_MODEL, created_at=datetime.now(timezone.utc).isoformat(),
                     report_text=report_text, duration_sec=dur, video_url=_media(case, "clip.mp4"),
                     annotated_video_url=_media(case, "annotated.mp4"), results=results, pose_events=events)
    step("Saving results", 0.99)
    if publish:
        save(out / "result.json", res)
        runs = out / "runs"
        runs.mkdir(exist_ok=True)
        save(runs / f"{datetime.now():%Y%m%d-%H%M%S}.json", res)
    return res


if __name__ == "__main__":
    import argparse
    import sys

    from . import evaluate

    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("--repose", action="store_true", help="redo normalize + pose")
    ap.add_argument("--reextract", action="store_true", help="redo claim extraction")
    a = ap.parse_args()
    report = (DATA / "reports" / f"{a.case}.txt").read_text(encoding="utf-8")
    res = run(a.case, DATA / "clips" / f"{a.case}.mp4", report, a.repose, a.reextract)
    gt = DATA / "ground_truth" / f"{a.case}.json"
    if gt.exists():
        sys.exit(evaluate.report(res, json.loads(gt.read_text(encoding="utf-8"))))
    for r in res.results:
        print(f"{r.status:24} {r.claim.text[:90]}")

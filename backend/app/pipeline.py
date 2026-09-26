"""End-to-end pipeline with on-disk cache (data/cache/<case_id>/).

CLI:  python -m app.pipeline ..\\data\\clips\\clip1.mp4 ..\\data\\reports\\clip1.txt [--force]
      [--fixture ..\\data\\ground_truth\\clip1.json | --no-fixture]
Without --fixture, data/ground_truth/<report_stem>.json is used when it exists.
Fixtures only drive the mock LLM backend (see llm.py).
"""
import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from . import llm, pose, video  # noqa: E402
from .schema import AnalysisResult, ClaimResult, ClaimType, Verdict  # noqa: E402

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
CACHE = DATA / "cache"
GROUND_TRUTH = DATA / "ground_truth"


def case_id(report_text: str, video_bytes: bytes, backend_tag: str) -> str:
    h = hashlib.sha256(backend_tag.encode() + b"\0" + report_text.encode() + video_bytes)
    return h.hexdigest()[:12]


def run(video_src: Path, report_text: str, force: bool = False,
        fixture: Path | None = None) -> AnalysisResult:
    backend = llm.backend()
    cid = case_id(report_text, Path(video_src).read_bytes(), llm.cache_tag(fixture))
    out = CACHE / cid
    result_path = out / "result.json"
    if result_path.exists() and not force:
        return AnalysisResult.model_validate_json(result_path.read_text(encoding="utf-8"))
    (out / "frames").mkdir(parents=True, exist_ok=True)

    # 1. normalize (ffmpeg)
    clip = out / "clip.mp4"
    video.normalize(video_src, clip)
    dur = video.duration(clip)

    # 2. pose (YOLO) -> annotated video with original audio
    events, raw = pose.analyze(clip, out)
    annotated = out / "annotated.mp4"
    video.mux_annotated(raw, clip, annotated)

    # 3. claims + verdicts (Gemini, or the mock in development)
    claims = llm.extract_claims(report_text, fixture=fixture)
    gem_video = annotated if os.getenv("GEMINI_VIDEO", "annotated") == "annotated" else clip
    verdicts = {v.claim_id: v for v in llm.verify_claims(gem_video, claims, events, fixture=fixture)}

    results: list[ClaimResult] = []
    for c in claims:
        v = verdicts.get(c.id)
        r = (ClaimResult(**v.model_dump()) if v else
             ClaimResult(claim_id=c.id, verdict=Verdict.not_visible, timestamp_sec=None,
                         person_track_id=None, reason="Model returned no verdict."))
        if c.claim_type == ClaimType.subjective:
            r.verdict = Verdict.not_visible
        if r.verdict == Verdict.contradicted and r.timestamp_sec is None:
            # No moment to re-check or show -> can't pass the red-verdict gate.
            r.verdict, r.downgraded = Verdict.not_visible, True
            r.reason = f"Not confirmed (no timestamp given): {r.reason}"

        if r.timestamp_sec is not None:
            t = min(max(r.timestamp_sec, 0.0), dur - 0.1)
            r.pose_support = [e for e in events
                              if e.start_sec - 2 <= t <= e.end_sec + 2
                              and (r.person_track_id is None or e.track_id == r.person_track_id)]

            # 4. red-verdict gate: independent re-check on a clean 10 s window
            if r.verdict == Verdict.contradicted:
                start = max(t - 5, 0.0)
                win = out / f"win_{c.id}.mp4"
                video.cut_window(clip, start, 10, win)
                chk = llm.skeptic(win, c, r.reason, start, start + 10, fixture=fixture)
                if not chk.confirmed:
                    r.verdict, r.downgraded = Verdict.not_visible, True
                    r.reason = f"Not confirmed on re-check: {chk.reason}"

            # 5. evidence frames at t-1, t, t+1
            for k, off in enumerate((-1, 0, 1)):
                p = out / "frames" / f"{c.id}_{k}.jpg"
                video.extract_frame(clip, min(max(t + off, 0.0), dur - 0.1), p)
                r.evidence_frames.append(f"/media/{cid}/frames/{p.name}")
        results.append(r)

    res = AnalysisResult(case_id=cid, llm_backend=backend, report_text=report_text,
                         video_url=f"/media/{cid}/clip.mp4",
                         annotated_video_url=f"/media/{cid}/annotated.mp4",
                         claims=claims, results=results, pose_events=events)
    result_path.write_text(res.model_dump_json(indent=2), encoding="utf-8")
    return res


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("report")
    ap.add_argument("--force", action="store_true")
    fx = ap.add_mutually_exclusive_group()
    fx.add_argument("--fixture", type=Path, help="ground-truth JSON for the mock backend")
    fx.add_argument("--no-fixture", action="store_true", help="don't auto-detect a fixture")
    a = ap.parse_args()
    fixture = a.fixture
    if fixture is None and not a.no_fixture:
        auto = GROUND_TRUTH / f"{Path(a.report).stem}.json"
        fixture = auto if auto.exists() else None
    print(f"backend: {llm.backend()}   fixture: {fixture or '-'}")
    res = run(Path(a.video), Path(a.report).read_text(encoding="utf-8"), a.force, fixture)
    text = {c.id: c.text for c in res.claims}
    for r in res.results:
        ts = f"{r.timestamp_sec:.1f}s" if r.timestamp_sec is not None else "--"
        print(f"{r.verdict.value:13} {ts:>7}  {text[r.claim_id][:80]}")
    print(f"\ncase_id: {res.case_id}  ->  {CACHE / res.case_id / 'result.json'}")

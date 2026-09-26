"""End-to-end pipeline with on-disk cache (data/cache/<case_id>/).

CLI:  python -m app.pipeline ..\\data\\clips\\clip1.mp4 ..\\data\\reports\\clip1.txt [--force]
"""
import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from . import gemini, pose, video  # noqa: E402
from .schema import AnalysisResult, ClaimResult, ClaimType, Verdict  # noqa: E402

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
CACHE = DATA / "cache"


def case_id(report_text: str, video_bytes: bytes) -> str:
    return hashlib.sha256(report_text.encode() + video_bytes).hexdigest()[:12]


def run(video_src: Path, report_text: str, force: bool = False) -> AnalysisResult:
    cid = case_id(report_text, Path(video_src).read_bytes())
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

    # 3. claims + verdicts (Gemini)
    claims = gemini.extract_claims(report_text)
    gem_video = annotated if os.getenv("GEMINI_VIDEO", "annotated") == "annotated" else clip
    verdicts = {v.claim_id: v for v in gemini.verify_claims(gem_video, claims, events)}

    results: list[ClaimResult] = []
    for c in claims:
        v = verdicts.get(c.id)
        r = (ClaimResult(**v.model_dump()) if v else
             ClaimResult(claim_id=c.id, verdict=Verdict.not_visible, timestamp_sec=None,
                         person_track_id=None, reason="Model returned no verdict."))
        if c.claim_type == ClaimType.subjective:
            r.verdict = Verdict.not_visible

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
                chk = gemini.skeptic(win, c, r.reason, start, start + 10)
                if not chk.confirmed:
                    r.verdict, r.downgraded = Verdict.not_visible, True
                    r.reason = f"Not confirmed on re-check: {chk.reason}"

            # 5. evidence frames at t-1, t, t+1
            for k, off in enumerate((-1, 0, 1)):
                p = out / "frames" / f"{c.id}_{k}.jpg"
                video.extract_frame(clip, min(max(t + off, 0.0), dur - 0.1), p)
                r.evidence_frames.append(f"/media/{cid}/frames/{p.name}")
        results.append(r)

    res = AnalysisResult(case_id=cid, report_text=report_text,
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
    a = ap.parse_args()
    res = run(Path(a.video), Path(a.report).read_text(encoding="utf-8"), a.force)
    text = {c.id: c.text for c in res.claims}
    for r in res.results:
        ts = f"{r.timestamp_sec:.1f}s" if r.timestamp_sec is not None else "--"
        print(f"{r.verdict.value:13} {ts:>7}  {text[r.claim_id][:80]}")
    print(f"\ncase_id: {res.case_id}  ->  {CACHE / res.case_id / 'result.json'}")

"""YOLO pose + ByteTrack -> per-person pose events, a measurements CSV and an overlay video.

Runs once per case, offline, and is cached; Gemini gets the events as extra evidence.
Pose never sets a claim's status by itself.

Events (left/right are the SUBJECT's, per COCO keypoints):
  arms_at_sides, left_arm_out, right_arm_out, hands_raised,
  left_hand_to_face, right_hand_to_face, head_tilted (pitch changed from the person's own
  baseline), foot_raised, swaying, lying_down

Known limits (say these in the pitch): 2D keypoints can't see motion toward the camera,
so front-to-back sway is invisible from a frontal camera; the bodycam itself moves, so
measurements are relative to the person's own body, never to the frame.

CLI: python -m app.pose ../data/clips/sfst2.mp4 [out_dir]
"""
import csv
import math
import os
from pathlib import Path

import cv2
import numpy as np

from .ledger import PoseEvent
from .runtime import check

# COCO-17 keypoints
NOSE, LEYE, REYE, LEAR, REAR = 0, 1, 2, 3, 4
LSH, RSH, LEL, REL, LWR, RWR = 5, 6, 7, 8, 9, 10
LHIP, RHIP, LKN, RKN, LANK, RANK = 11, 12, 13, 14, 15, 16

KP_CONF = 0.5
ARM_OUT_DEG = 35          # upper arm vs. torso side; relaxed arms hang at ~5-15 degrees
AT_SIDES_DEG = 20
FACE_DIST = 0.35          # wrist-to-nose distance / torso length
HEAD_TILT = 0.15          # change in (eye line y - nose y) / eye spacing from the person's own median
FOOT_UP = 0.12            # ankle height difference / torso length
SWAY_STD = 0.04           # std of body lean over SWAY_WIN seconds
SWAY_WIN = 2.0
WALK_STD = 0.1            # std of (left ankle x - right ankle x) / torso above which the person is stepping
CAM_MOVE = 0.01           # frame-to-frame camera shift / frame width that counts as "camera moving"
CAM_GUARD = 0.5           # seconds around camera motion where sway/tilt measurements are dropped
CAMERA = -1               # track_id used for camera_moving events
MIN_DUR = 0.4
MIN_DUR_BY_EVENT = {"left_hand_to_face": 0.0, "right_hand_to_face": 0.0,  # a nose touch is brief
                    "swaying": 1.0}
GAP_FACTOR = 1.5
SAMPLE_FPS = float(os.getenv("POSE_FPS", "10"))

_model = None


def _get_model():
    global _model
    if _model is None:
        weights = Path(os.getenv("POSE_MODEL", "yolo11n-pose.pt"))
        if not weights.is_absolute():
            weights = Path(__file__).resolve().parents[1] / weights
        if not weights.is_file():
            raise FileNotFoundError(f"Pose model not installed at {weights}. Set POSE_MODEL to a local weights file.")
        check()
        from ultralytics import YOLO  # heavy import, load once
        _model = YOLO(str(weights))
    return _model


def _angle(u, v) -> float:
    cos = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def measure(kp: np.ndarray, kc: np.ndarray) -> dict | None:
    """kp: (17,2) pixel coords, y grows downward; kc: (17,) confidences.
    Returns body-relative measurements, or None if this isn't a usable full person."""
    def ok(*idx):
        return all(kc[i] > KP_CONF for i in idx)

    # Need shoulders and hips: drops the wearer's own arms and half-visible people.
    if not ok(LSH, RSH, LHIP, RHIP):
        return None
    sh = (kp[LSH] + kp[RSH]) / 2
    hip = (kp[LHIP] + kp[RHIP]) / 2
    torso = float(np.linalg.norm(sh - hip)) + 1e-6
    m: dict = {"torso_px": round(torso, 1)}

    for side, s, e, h in (("l", LSH, LEL, LHIP), ("r", RSH, REL, RHIP)):
        m[f"abd_{side}"] = round(_angle(kp[h] - kp[s], kp[e] - kp[s]), 1) if ok(s, e) else None
    m["wrists_up"] = ok(LWR, RWR) and kp[LWR, 1] < sh[1] and kp[RWR, 1] < sh[1]
    for side, w in (("l", LWR), ("r", RWR)):
        m[f"face_{side}"] = (round(float(np.linalg.norm(kp[w] - kp[NOSE])) / torso, 3)
                             if ok(w, NOSE) else None)
    # Head tilt, scaled by eye spacing (the torso is ~10x larger and swamps the signal).
    m["head_back"] = m["ear_nose"] = None
    if ok(NOSE, LEYE, REYE):
        eye_d = float(np.linalg.norm(kp[LEYE] - kp[REYE])) + 1e-6
        m["head_back"] = round(float((kp[LEYE, 1] + kp[REYE, 1]) / 2 - kp[NOSE, 1]) / eye_d, 3)
        ears = [kp[i, 1] for i in (LEAR, REAR) if kc[i] > KP_CONF]
        if ears:
            m["ear_nose"] = round(float(np.mean(ears) - kp[NOSE, 1]) / eye_d, 3)
    if ok(LANK, RANK):
        ank = (kp[LANK] + kp[RANK]) / 2
        m["foot_dy"] = round(abs(float(kp[LANK, 1] - kp[RANK, 1])) / torso, 3)
        m["feet_dx"] = round(float(kp[LANK, 0] - kp[RANK, 0]) / torso, 3)  # changes with every step
        m["lean"] = round(float(sh[0] - ank[0]) / float(ank[1] - sh[1] + 1e-6), 3)
    else:
        # Feet out of frame: fall back to upper-body lean (shoulders over hips).
        m["foot_dy"] = m["feet_dx"] = None
        m["lean"] = round(float(sh[0] - hip[0]) / torso, 3)
    dx, dy = sh - hip
    m["lying"] = abs(dx) > abs(dy)
    return m


def flags(m: dict) -> set[str]:
    f: set[str] = set()
    abd = [m["abd_l"], m["abd_r"]]
    if all(a is not None and a < AT_SIDES_DEG for a in abd):
        f.add("arms_at_sides")
    for side, key in (("left", "face_l"), ("right", "face_r")):
        if m[key] is not None and m[key] < FACE_DIST:
            f.add(f"{side}_hand_to_face")
    for side, a in zip(("left", "right"), abd):
        # A hand at the face lifts the arm too; that isn't "arms out for balance".
        if a is not None and a > ARM_OUT_DEG and f"{side}_hand_to_face" not in f:
            f.add(f"{side}_arm_out")
    if m["wrists_up"]:
        f.add("hands_raised")
    if m["foot_dy"] is not None and m["foot_dy"] > FOOT_UP:
        f.add("foot_raised")
    if m["lying"]:
        f.add("lying_down")
    return f


def camera_shift(prev: np.ndarray | None, img: np.ndarray) -> tuple[np.ndarray, float]:
    """Frame-to-frame camera motion as a fraction of frame width (phase correlation on a small grey copy).
    Returns (small grey frame for the next call, shift)."""
    h, w = img.shape[:2]
    small = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (160, max(1, round(160 * h / w)))).astype(np.float32)
    if prev is None or prev.shape != small.shape:
        return small, 0.0
    (dx, dy), _ = cv2.phaseCorrelate(prev, small)
    return small, float(math.hypot(dx, dy)) / 160


def still(series: list[tuple[float, float]], moving: list[float]) -> list[tuple[float, float]]:
    """Drop samples within CAM_GUARD seconds of camera motion: body measurements there are unreliable."""
    return [(t, v) for t, v in series if not any(abs(t - u) <= CAM_GUARD for u in moving)]


def sway_times(series: list[tuple[float, float]], dt: float, steps: list[tuple[float, float]] = ()) -> list[float]:
    """series: (t, lean) for one track. Times whose surrounding SWAY_WIN window has lean std > SWAY_STD.
    steps: (t, feet_dx) for the same track; windows where the feet move (walking) are skipped, since
    every step shifts the lean."""
    half = SWAY_WIN / 2
    out = []
    for t, _ in series:
        vals = [v for u, v in series if abs(u - t) <= half]
        feet = [v for u, v in steps if abs(u - t) <= half]
        if len(feet) >= 3 and float(np.std(feet)) > WALK_STD:
            continue
        if len(vals) >= max(3, int(SWAY_WIN / dt * 0.6)) and float(np.std(vals)) > SWAY_STD:
            out.append(t)
    return out


def tilt_times(series: list[tuple[float, float]]) -> list[float]:
    """series: (t, head_back) for one track. Times where the head's pitch differs from the person's own
    median by more than HEAD_TILT. The sign depends on camera height, so only the change is used."""
    if len(series) < 10:
        return []
    base = float(np.median([v for _, v in series]))
    return [t for t, v in series if abs(v - base) > HEAD_TILT]


def to_intervals(hits: dict, gap: float) -> list[PoseEvent]:
    out = []
    for (tid, ev), ts in hits.items():
        ts = sorted(ts)
        start = prev = ts[0]
        min_dur = MIN_DUR_BY_EVENT.get(ev, MIN_DUR)
        for t in ts[1:] + [None]:
            if t is None or t - prev > gap:
                if prev - start >= min_dur:
                    out.append(PoseEvent(track_id=tid, event=ev, start_sec=round(start, 2), end_sec=round(prev, 2)))
                start = t
            if t is not None:
                prev = t
    return sorted(out, key=lambda e: (e.start_sec, e.track_id, e.event))


def analyze(video_path: Path, out_dir: Path, sample_fps: float = SAMPLE_FPS, on_frame=None, on_stage=None) -> tuple[list[PoseEvent], Path]:
    """Writes out_dir/pose_raw.mp4 (overlay, no audio) and out_dir/pose_features.csv.
    Returns (events, overlay path). on_frame(fraction_done) is called after each sampled frame."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    stride = max(1, round(fps / sample_fps))
    sampled = max(1, total / stride)
    dt = stride / fps

    raw_path = out_dir / "pose_raw.mp4"
    writer = None
    hits: dict[tuple[int, str], list[float]] = {}
    leans: dict[int, list[tuple[float, float]]] = {}
    heads: dict[int, list[tuple[float, float]]] = {}
    steps: dict[int, list[tuple[float, float]]] = {}
    moving: list[float] = []
    prev = None
    rows = []

    check()
    if on_stage:
        on_stage("Loading pose model")
    model = _get_model()
    check()
    if on_stage:
        on_stage("Starting pose tracking")
    results = model.track(source=str(video_path), stream=True, vid_stride=stride, tracker="bytetrack.yaml",
                                 imgsz=int(os.getenv("POSE_IMGSZ", "640")), verbose=False)
    try:
        for i, r in enumerate(results):
            check()
            t = round(i * dt, 2)
            prev, shift = camera_shift(prev, r.orig_img)
            if shift > CAM_MOVE * sample_fps / 10:  # threshold is per 0.1 s
                moving.append(t)
                hits.setdefault((CAMERA, "camera_moving"), []).append(t)
            frame = r.plot(labels=True, conf=False)
            if r.boxes is not None and r.boxes.id is not None and r.keypoints is not None and r.keypoints.conf is not None:
                for tid, box, kp, kc in zip(r.boxes.id.int().tolist(), r.boxes.xyxy.cpu().numpy(),
                                            r.keypoints.xy.cpu().numpy(), r.keypoints.conf.cpu().numpy()):
                    m = measure(kp, kc)
                    if m is None:
                        continue
                    fl = flags(m)
                    for ev in fl:
                        hits.setdefault((tid, ev), []).append(t)
                    if m["lean"] is not None:
                        leans.setdefault(tid, []).append((t, m["lean"]))
                    if m["head_back"] is not None:
                        heads.setdefault(tid, []).append((t, m["head_back"]))
                    if m["feet_dx"] is not None:
                        steps.setdefault(tid, []).append((t, m["feet_dx"]))
                    rows.append({"t": t, "track": tid, "cam_shift": round(shift, 4), **m, "flags": " ".join(sorted(fl))})
                    x1, y1 = int(box[0]), int(box[1])
                    for j, ev in enumerate(sorted(fl)):
                        cv2.putText(frame, ev, (x1 + 4, y1 + 40 + 18 * j), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
            h, w = frame.shape[:2]
            # Video time on every frame: Gemini reads it instead of estimating timestamps, which drift on long clips.
            stamp, scale = f"t={t:5.1f}s", h / 480
            org = (int(10 * scale), h - int(14 * scale))
            cv2.putText(frame, stamp, org, cv2.FONT_HERSHEY_SIMPLEX, 0.9 * scale, (0, 0, 0), int(6 * scale), cv2.LINE_AA)
            cv2.putText(frame, stamp, org, cv2.FONT_HERSHEY_SIMPLEX, 0.9 * scale, (255, 255, 255), int(2 * scale), cv2.LINE_AA)
            if writer is None:
                writer = cv2.VideoWriter(str(raw_path), cv2.VideoWriter_fourcc(*"mp4v"), 1 / dt, (w, h))
            writer.write(frame)
            if on_frame:
                on_frame(min(1.0, (i + 1) / sampled))
    finally:
        if writer is not None:
            writer.release()
        results.close()
        # Ultralytics does not release its input capture on generator.close().
        dataset = getattr(model.predictor, "dataset", None)
        capture = getattr(dataset, "cap", None)
        if capture is not None:
            capture.release()
    check()

    for tid, series in leans.items():
        for t in sway_times(still(series, moving), dt, steps.get(tid, [])):
            hits.setdefault((tid, "swaying"), []).append(t)
    for tid, series in heads.items():
        for t in tilt_times(still(series, moving)):
            hits.setdefault((tid, "head_tilted"), []).append(t)

    if rows:
        cols = list(dict.fromkeys(k for row in rows for k in row))
        with open(out_dir / "pose_features.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
    return to_intervals(hits, gap=GAP_FACTOR * dt), raw_path


def summarize(events: list[PoseEvent]) -> str:
    """Pose events as prompt text, grouped by person, noisy one-off tracks dropped."""
    if not events:
        return "(no pose events detected)"
    by_track: dict[int, list[PoseEvent]] = {}
    for e in events:
        by_track.setdefault(e.track_id, []).append(e)
    lines = []
    for tid, evs in sorted(by_track.items()):
        span = sum(e.end_sec - e.start_sec for e in evs)
        if span < 1.0:
            continue
        label = "camera (measurements unreliable while moving)" if tid == CAMERA else f"id:{tid}"
        lines.append(f"{label}: " + "; ".join(f"{e.event} {e.start_sec:.1f}-{e.end_sec:.1f}s" for e in evs))
    return "\n".join(lines) or "(no sustained pose events)"


if __name__ == "__main__":
    import sys
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".") / f"pose_{src.stem}"
    evs, raw = analyze(src, out)
    print(summarize(evs))
    print(f"\n{len(evs)} events; overlay {raw}; measurements {out / 'pose_features.csv'}")

"""YOLO pose + ByteTrack -> per-person pose events and an annotated video.

Features are computed from 2D COCO keypoints. Known limits (say these in the pitch):
- An arm pointed straight at the camera is foreshortened in 2D; arm_extended
  only catches lateral extension. Gemini covers the head-on case visually.
- The bodycam itself moves, so displacement-based "running" is omitted;
  add camera-motion compensation (optical flow) as a stretch.
"""
import os
from pathlib import Path

import cv2
import numpy as np

from .schema import PoseEvent

# COCO-17 keypoint indices
NOSE, LSH, RSH, LEL, REL, LWR, RWR, LHIP, RHIP = 0, 5, 6, 7, 8, 9, 10, 11, 12
KP_CONF = 0.5

_model = None


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO  # heavy import, load once
        _model = YOLO(os.getenv("POSE_MODEL", "yolo11n-pose.pt"))  # auto-downloads
    return _model


def _angle(a, b, c) -> float:
    """Angle at b, degrees."""
    ba, bc = a - b, c - b
    cos = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def frame_flags(kp: np.ndarray, kc: np.ndarray) -> set[str]:
    """kp: (17,2) pixel coords (y grows downward), kc: (17,) confidences."""
    def ok(*idx):
        return all(kc[i] > KP_CONF for i in idx)

    flags: set[str] = set()
    # Require both shoulders: drops the wearer's own arms at the frame edge.
    if not ok(LSH, RSH):
        return flags

    sh_mid = (kp[LSH] + kp[RSH]) / 2
    sh_w = abs(kp[LSH, 0] - kp[RSH, 0]) + 1e-6

    if ok(LWR, RWR) and kp[LWR, 1] < sh_mid[1] and kp[RWR, 1] < sh_mid[1]:
        flags.add("hands_raised")

    for s, e, w in ((LSH, LEL, LWR), (RSH, REL, RWR)):
        if ok(s, e, w) and _angle(kp[s], kp[e], kp[w]) > 150 and abs(kp[w, 0] - kp[s, 0]) > 1.2 * sh_w:
            flags.add("arm_extended")

    if ok(LHIP, RHIP):
        hip = (kp[LHIP] + kp[RHIP]) / 2
        torso = np.linalg.norm(sh_mid - hip) + 1e-6
        for w in (LWR, RWR):
            if ok(w) and np.linalg.norm(kp[w] - hip) < 0.35 * torso:
                flags.add("hand_at_waist")
        dx, dy = sh_mid - hip
        if abs(dx) > abs(dy):  # torso closer to horizontal than vertical
            flags.add("lying_down")
    return flags


def _to_intervals(hits: dict, gap: float, min_dur: float) -> list[PoseEvent]:
    out = []
    for (tid, ev), ts in hits.items():
        start = prev = ts[0]
        for t in ts[1:] + [None]:
            if t is None or t - prev > gap:
                if prev - start >= min_dur:
                    out.append(PoseEvent(track_id=tid, event=ev,
                                         start_sec=round(start, 2), end_sec=round(prev, 2)))
                start = t
            prev = t if t is not None else prev
    return sorted(out, key=lambda e: (e.start_sec, e.track_id))


def analyze(video_path: Path, out_dir: Path, sample_fps: float = 5.0,
            min_dur: float = 0.4) -> tuple[list[PoseEvent], Path]:
    """Returns (events, path to annotated mp4v video without audio)."""
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    stride = max(1, round(fps / sample_fps))
    dt = stride / fps

    raw_path = out_dir / "annotated_raw.mp4"
    writer = None
    hits: dict[tuple[int, str], list[float]] = {}

    results = _get_model().track(source=str(video_path), stream=True, vid_stride=stride,
                                 tracker="bytetrack.yaml", verbose=False)
    for i, r in enumerate(results):
        t = i * dt
        frame = r.plot()  # boxes + "id:N" labels + skeletons
        if writer is None:
            h, w = frame.shape[:2]
            writer = cv2.VideoWriter(str(raw_path), cv2.VideoWriter_fourcc(*"mp4v"), 1 / dt, (w, h))
        writer.write(frame)

        if r.boxes is None or r.boxes.id is None or r.keypoints is None or r.keypoints.conf is None:
            continue
        ids = r.boxes.id.int().tolist()
        kps = r.keypoints.xy.cpu().numpy()
        kcs = r.keypoints.conf.cpu().numpy()
        for tid, kp, kc in zip(ids, kps, kcs):
            for ev in frame_flags(kp, kc):
                hits.setdefault((tid, ev), []).append(t)

    if writer is not None:
        writer.release()
    return _to_intervals(hits, gap=1.5 * dt, min_dur=min_dur), raw_path


if __name__ == "__main__":
    import sys
    evs, raw = analyze(Path(sys.argv[1]), Path("."))
    for e in evs:
        print(f"{e.start_sec:6.2f}-{e.end_sec:6.2f}s  id:{e.track_id:<3} {e.event}")
    print("annotated:", raw)

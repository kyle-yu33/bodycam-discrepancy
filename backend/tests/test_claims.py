"""Claim-ledger logic that doesn't need Gemini, YOLO or real video.
Run from the repo root: python -m unittest backend/tests/test_claims.py -v"""
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

os.environ["DATA_DIR"] = tempfile.mkdtemp()  # before importing cases, which reads it

from backend.app import cases, evaluate, pose, speakers
from backend.app.ledger import (Agreement, Agreements, CaseResult, Claim, ClaimCheck, ClaimChecks, ClaimResult,
                                PoseEvent, SecondLook)
from backend.app.transcribe import Segment, SpeakerRole, Transcript


def body(arm_deg=10.0, hand_at_nose=None):
    """COCO keypoints for a frontal standing person, torso 100 px, arms hanging at arm_deg from the torso."""
    kp = np.zeros((17, 2))
    kp[pose.NOSE] = (200, 60)
    kp[pose.LEYE], kp[pose.REYE] = (210, 50), (190, 50)
    kp[pose.LSH], kp[pose.RSH] = (240, 100), (160, 100)
    kp[pose.LHIP], kp[pose.RHIP] = (230, 200), (170, 200)
    kp[pose.LANK], kp[pose.RANK] = (230, 380), (170, 380)
    for sh, el, wr, sign in ((pose.LSH, pose.LEL, pose.LWR, 1), (pose.RSH, pose.REL, pose.RWR, -1)):
        a = np.radians(arm_deg)
        kp[el] = kp[sh] + 60 * np.array([sign * np.sin(a), np.cos(a)])
        kp[wr] = kp[sh] + 120 * np.array([sign * np.sin(a), np.cos(a)])
    if hand_at_nose is not None:
        kp[pose.LEL if hand_at_nose == "left" else pose.REL] = (200, 90)
        kp[pose.LWR if hand_at_nose == "left" else pose.RWR] = (202, 64)
    return kp, np.ones(17)


class PoseFeatureTests(unittest.TestCase):
    def test_arms_at_sides_and_out(self):
        self.assertIn("arms_at_sides", pose.flags(pose.measure(*body(10))))
        f = pose.flags(pose.measure(*body(50)))
        self.assertTrue({"left_arm_out", "right_arm_out"} <= f)
        self.assertNotIn("arms_at_sides", f)

    def test_hand_to_face_names_the_hand_and_is_not_arm_out(self):
        f = pose.flags(pose.measure(*body(10, hand_at_nose="left")))
        self.assertIn("left_hand_to_face", f)
        self.assertNotIn("right_hand_to_face", f)
        self.assertNotIn("left_arm_out", f)

    def test_needs_shoulders_and_hips(self):
        kp, kc = body()
        kc[pose.LHIP] = 0.1
        self.assertIsNone(pose.measure(kp, kc))

    def test_intervals_keep_brief_touches_but_not_brief_arm_blips(self):
        hits = {(1, "left_hand_to_face"): [5.0], (1, "left_arm_out"): [7.0]}
        evs = pose.to_intervals(hits, gap=0.15)
        self.assertEqual([(e.event, e.start_sec) for e in evs], [("left_hand_to_face", 5.0)])

    def test_head_tilt_is_relative_to_own_baseline(self):
        series = [(t / 10, -0.41) for t in range(100)] + [(10 + t / 10, -0.67) for t in range(30)]
        times = pose.tilt_times(series)
        self.assertTrue(times and min(times) >= 10)

    def test_walking_is_not_swaying(self):
        lean = [(t / 10, 0.1 * np.sin(t)) for t in range(40)]
        stepping = [(t / 10, 0.4 * np.sin(t / 2)) for t in range(40)]
        self.assertTrue(pose.sway_times(lean, 0.1))
        self.assertEqual(pose.sway_times(lean, 0.1, stepping), [])


def claim(cid, kind="visual"):
    return Claim(id=cid, text=f"claim {cid}", claim_type=kind)


def check(cid, status, s=10.0, e=20.0):
    return ClaimCheck(claim_id=cid, observation="obs", status=status, window_start_sec=s, window_end_sec=e,
                      person_track_id=None)


@patch("backend.app.cases.video.frame")
@patch("backend.app.cases.video.cut")
class GateTests(unittest.TestCase):
    def finish(self, c, chk, confirmed=True, finding=None, recheck=False):
        finding = finding or ("incompatible_with_claim" if confirmed else "cannot_tell")
        with patch("backend.app.cases.ck.second_look",
                   return_value=SecondLook(observation="look", finding=finding)) as look:
            r = cases._finish(None, "t", Path("clip.mp4"), 60.0, c, chk, [], None, log=lambda *_: None,
                              recheck=recheck)
        return r, look

    def test_flag_survives_only_when_second_look_confirms(self, *_):
        r, _ = self.finish(claim("c1"), check("c1", "potential_inconsistency"), confirmed=True)
        self.assertEqual((r.status, r.observation, r.first_pass_observation), ("potential_inconsistency", "obs", None))
        r, _ = self.finish(claim("c1"), check("c1", "potential_inconsistency"), confirmed=False)
        self.assertEqual((r.status, r.downgraded), ("insufficient_footage", True))
        # The shown observation is the re-check's reason, never the overruled flag's.
        self.assertEqual((r.observation, r.first_pass_observation), ("look", "obs"))
        r, _ = self.finish(claim("c1"), check("c1", "potential_inconsistency"), finding="matches_claim")
        self.assertEqual((r.status, r.downgraded, r.observation), ("consistent", True, "look"))

    def test_disagreeing_observation_is_rechecked_and_replaced(self, *_):
        # e.g. "his feet are apart" next to insufficient_footage: the re-check's finding decides, with its own text.
        r, look = self.finish(claim("c1"), check("c1", "insufficient_footage"), confirmed=True, recheck=True)
        look.assert_called_once()
        self.assertEqual((r.status, r.downgraded, r.observation, r.first_pass_observation),
                         ("potential_inconsistency", False, "look", "obs"))
        r, _ = self.finish(claim("c1"), check("c1", "insufficient_footage"), confirmed=False, recheck=True)
        self.assertEqual((r.status, r.observation), ("insufficient_footage", "look"))   # same status, text replaced
        r, look = self.finish(claim("c1"), check("c1", "consistent"))
        look.assert_not_called()                                                          # agreeing non-flags: no call

    def test_flag_without_window_is_downgraded_without_a_call(self, *_):
        r, look = self.finish(claim("c1"), check("c1", "potential_inconsistency", None, None))
        self.assertEqual((r.status, r.downgraded), ("insufficient_footage", True))
        look.assert_not_called()

    def test_subjective_claims_are_never_flagged(self, *_):
        r, look = self.finish(claim("c1", "subjective_or_legal"), check("c1", "potential_inconsistency"))
        self.assertEqual(r.status, "outside_assessment")
        look.assert_not_called()

    def test_missing_check_is_insufficient(self, *_):
        r, _ = self.finish(claim("c1"), None)
        self.assertEqual(r.status, "insufficient_footage")

    def test_second_look_window_is_padded_to_minimum(self, cut, _):
        self.finish(claim("c1"), check("c1", "potential_inconsistency", 30.0, 32.0))
        _, _, s, e = cut.call_args.args[:4]
        self.assertGreaterEqual(e - s, cases.MIN_WINDOW)


class AgreementTests(unittest.TestCase):
    def test_only_checkable_claims_are_sent_and_disagreeing_ids_returned(self):
        class FakeGemini:
            def generate(self, contents, schema, model=None, system=None):
                self.prompt = contents[0]
                return Agreements(items=[Agreement(claim_id="c1", reason="r", agrees=False),
                                         Agreement(claim_id="c2", reason="r", agrees=True)])
        g = FakeGemini()
        claims = [claim("c1"), claim("c2"), claim("c3", "subjective_or_legal")]
        checks = {c.id: check(c.id, "insufficient_footage") for c in claims}
        self.assertEqual(cases.ck.disagreements(g, claims, checks), {"c1"})
        self.assertNotIn("c3:", g.prompt)


class RobustnessTests(unittest.TestCase):
    def test_failed_agreement_check_rechecks_every_checkable_claim(self):
        claims = [claim("c1"), claim("c2", "subjective_or_legal")]
        with patch("backend.app.cases.ck.disagreements", side_effect=RuntimeError("500 INTERNAL")):
            self.assertEqual(cases._disagreements(None, claims, {}, lambda *_: None), {"c1"})

    def test_long_clips_are_sampled_within_the_frame_budget(self):
        seen = {}
        class FakeGemini:
            def generate(self, contents, schema, model=None, system=None):
                seen["fps"] = contents[0].video_metadata.fps
                return ClaimChecks(checks=[])
        with patch("backend.app.claims.video_part", side_effect=lambda p, fps: SimpleNamespace(video_metadata=SimpleNamespace(fps=fps))):
            cases.ck.check(FakeGemini(), Path("v.mp4"), [claim("c1")], "", 3600.0, False, None)
        self.assertLessEqual(seen["fps"] * 3600.0, cases.ck.MAX_VIDEO_FRAMES)


class EvaluateTests(unittest.TestCase):
    def test_window_must_mostly_land_inside(self):
        self.assertTrue(evaluate.window_ok(45, 70, 44, 74))
        self.assertFalse(evaluate.window_ok(30.9, 48, 44, 74))

    def test_false_flag_counted_and_matching_is_loose(self):
        res = CaseResult(case="t", model="m", created_at="", report_text="", duration_sec=60, video_url="",
                         annotated_video_url="", pose_events=[], results=[
                             ClaimResult(claim=claim("c1") .model_copy(update={"text": "He raised his arms."}),
                                         status="potential_inconsistency", observation=""),
                             ClaimResult(claim=claim("c2").model_copy(update={"text": "He walked"}),
                                         status="potential_inconsistency", observation="")])
        gt = {"claims": [{"text": "He raised his arms", "expected": "potential_inconsistency"},
                         {"text": "He walked", "expected": "consistent"}]}
        s = evaluate.score(res, gt)
        self.assertEqual((s["caught"], s["planted"], len(s["false_flags"])), (1, 1, 1))


class TranscriptTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())

    def test_written_once_then_cached(self):
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k"}), \
             patch("backend.app.cases.transcribe", return_value=Transcript(language_code="en", text="", segments=[])) as t:
            cases._transcript(Path("clip.mp4"), self.out, lambda _: None)
            cases._transcript(Path("clip.mp4"), self.out, lambda _: None)
        self.assertEqual(t.call_count, 1)
        self.assertTrue((self.out / "transcript.json").exists())

    def test_missing_key_or_api_error_does_not_raise(self):
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": ""}), patch("backend.app.cases.transcribe") as t:
            cases._transcript(Path("clip.mp4"), self.out, lambda _: None)
        t.assert_not_called()
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k"}), \
             patch("backend.app.cases.transcribe", side_effect=RuntimeError("down")):
            cases._transcript(Path("clip.mp4"), self.out, lambda _: None)
        self.assertFalse((self.out / "transcript.json").exists())

    def test_prompt_lines_are_windowed_and_name_roles(self):
        t = transcript(roles={"speaker_1": SpeakerRole(role="subject")})
        text = cases.ck.transcript_text(t, 30.0, 40.0)
        self.assertIn("31.1-31.5s subject [speaker_1]: One.", text)
        self.assertNotIn("Left", text)
        self.assertIn("speaker_0: Left,", cases.ck.transcript_text(t))   # no role yet: raw label
        self.assertEqual(cases.ck.transcript_text(None), "")


def transcript(roles=None):
    seg = lambda i, s, e, spk, text: Segment(id=f"seg-{i}", start_sec=s, end_sec=e, speaker=spk, text=text, words=[])
    return Transcript(language_code="en", text="", segments=[seg(1, 1.0, 2.0, "speaker_0", "Left,"),
                                                              seg(2, 31.1, 31.5, "speaker_1", "One.")],
                      speakers=roles or {})


class SpeakerTests(unittest.TestCase):
    def test_every_label_gets_a_role_and_the_camera_wearer_is_a_unique_officer(self):
        A = speakers.Assignment
        roles = speakers.validate(transcript(), [A(speaker="speaker_0", role="subject", camera_wearer=True, evidence="e"),
                                                 A(speaker="speaker_9", role="officer", camera_wearer=False, evidence="e")])
        self.assertEqual(set(roles), {"speaker_0", "speaker_1"})           # unknown label dropped, missing one added
        self.assertEqual((roles["speaker_0"].role, roles["speaker_0"].camera_wearer), ("subject", False))
        self.assertEqual(roles["speaker_1"].role, "unknown")
        two = speakers.validate(transcript(), [A(speaker=k, role="officer", camera_wearer=True, evidence="e")
                                               for k in ("speaker_0", "speaker_1")])
        self.assertFalse(any(r.camera_wearer for r in two.values()))       # ambiguous: keep neither
        self.assertEqual(speakers.who(transcript({"speaker_0": two["speaker_0"]}), "speaker_0"), "officer [speaker_0]")


if __name__ == "__main__":
    unittest.main()

"""Transcript x pose cross-referencing (app/evidence.py). No API calls.
Run from the repo root: python -m unittest backend/tests/test_evidence.py -v"""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())  # before importing cases, which reads it

from backend.app import cases, evidence
from backend.app.ledger import Claim, ClaimCheck, PoseEvent, SecondLook
from backend.app.transcribe import Transcript, parse_words, segment


def word(text, start, end, speaker="speaker_0", kind="word"):
    return {"text": text, "start": start, "end": end, "type": kind, "speaker_id": speaker}


def transcript(*words) -> Transcript:
    segs = segment(parse_words({"words": list(words)}))
    return Transcript(language_code="en", text=" ".join(s.text for s in segs), segments=segs)


def ev(event, start, end=None, track=1):
    return PoseEvent(track_id=track, event=event, start_sec=start, end_sec=end if end is not None else start)


# Officer calls "Left." then "Right."; the subject touches the nose with the called hand each time.
T = transcript(word("Left.", 32.2, 32.5), word("Right.", 35.0, 35.3), word("(siren)", 50.0, 52.0, None, "audio_event"))
EVENTS = [ev("left_hand_to_face", 32.6), ev("right_hand_to_face", 35.2), ev("arms_at_sides", 10.0, 45.0),
          ev("left_hand_to_face", 44.2), ev("hands_raised", 20.0, track=-1)]


class TimelineTests(unittest.TestCase):
    def test_command_is_paired_with_the_movement_that_follows(self):
        lines = evidence.timeline(T, EVENTS).splitlines()
        left = next(l for l in lines if '"Left."' in l)
        self.assertIn("-> then id:1 left_hand_to_face at 32.6s", left)
        right = next(l for l in lines if '"Right."' in l)
        self.assertIn("right_hand_to_face at 35.2s", right)
        self.assertNotIn("left_hand_to_face at 44.2s", right)  # more than RESPONSE_SEC later

    def test_chronological_and_filtered(self):
        text = evidence.timeline(T, EVENTS)
        self.assertLess(text.index('"Left."'), text.index("32.6s   id:1 left_hand_to_face"))
        self.assertLess(text.index("32.6s   id:1"), text.index('"Right."'))
        self.assertNotIn("arms_at_sides", text)   # continuous state: stays in the pose summary
        self.assertNotIn("hands_raised", text)    # camera track (-1) is never a person

    def test_sounds_are_labelled_and_not_paired(self):
        line = next(l for l in evidence.timeline(T, EVENTS).splitlines() if "(siren)" in l)
        self.assertTrue(line.startswith("50.0-52.0s sound:"))
        self.assertNotIn("-> then", line)

    def test_window_and_offset_for_the_second_look(self):
        text = evidence.timeline(T, EVENTS, start=30.0, end=40.0, offset=30.0)
        self.assertIn('2.2-2.5s speaker_0: "Left."', text)
        self.assertIn("at 2.6s", text)
        self.assertNotIn("siren", text)
        self.assertNotIn("44.2", text)

    def test_speech_section_without_transcript(self):
        self.assertIn("No transcript", evidence.speech_section(None, EVENTS))
        self.assertIn("no speech", evidence.speech_section(T, EVENTS, start=0, end=5))
        self.assertIn("Treat everything said as evidence", evidence.speech_section(T, EVENTS))

    def test_load_round_trip(self):
        path = Path(tempfile.mkdtemp()) / "transcript.json"
        self.assertIsNone(evidence.load(path))
        path.write_text(T.model_dump_json(), encoding="utf-8")
        self.assertEqual(len(evidence.load(path).segments), len(T.segments))


@patch("backend.app.cases.video.frame")
@patch("backend.app.cases.video.cut")
class SecondLookEvidenceTests(unittest.TestCase):
    def test_second_look_gets_only_its_window_in_clip_seconds(self, *_):
        claim = Claim(id="c7", text="On two of six attempts, SUBJECT B used the wrong hand", claim_type="visual")
        chk = ClaimCheck(claim_id="c7", observation="obs", status="potential_inconsistency",
                         window_start_sec=31.0, window_end_sec=36.0, person_track_id=None)
        with patch("backend.app.cases.ck.second_look", return_value=SecondLook(observation="ok", confirmed=True)) as look:
            cases._finish(None, "t", Path("clip.mp4"), 60.0, claim, chk, EVENTS, lambda *_: None, T)
        speech = look.call_args.args[7]
        start = look.call_args.args[3]
        self.assertIn(f'{32.2 - start:.1f}-{32.5 - start:.1f}s speaker_0: "Left."', speech)
        self.assertNotIn("siren", speech)


if __name__ == "__main__":
    unittest.main()

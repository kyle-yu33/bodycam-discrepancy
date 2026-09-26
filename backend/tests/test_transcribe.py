import unittest

from backend.app.transcribe import parse_words, segment


def raw_word(text, start, end, speaker="speaker_0", kind="word"):
    return {"text": text, "start": start, "end": end, "type": kind, "speaker_id": speaker}


RAW = {"words": [
    raw_word("Hands", 0.1, 0.4), raw_word(" ", 0.4, 0.5, kind="spacing"), raw_word("up!", 0.5, 0.8),
    raw_word("Okay", 1.0, 1.3, "speaker_1"), raw_word("okay.", 1.4, 1.7, "speaker_1"),
    raw_word("(siren)", 2.0, 4.0, kind="audio_event"),
    raw_word("Step", 4.2, 4.4), raw_word("back", 5.8, 6.0),
]}


class TranscribeTests(unittest.TestCase):
    def test_parse_drops_spacing(self):
        self.assertEqual([w.text for w in parse_words(RAW)], ["Hands", "up!", "Okay", "okay.", "(siren)", "Step", "back"])

    def test_segments_split_on_sentence_speaker_event_and_pause(self):
        segs = segment(parse_words(RAW))
        self.assertEqual([s.text for s in segs], ["Hands up!", "Okay okay.", "(siren)", "Step", "back"])
        self.assertEqual([s.speaker for s in segs][:2], ["speaker_0", "speaker_1"])
        self.assertEqual((segs[0].start_sec, segs[0].end_sec), (0.1, 0.8))
        self.assertEqual([s.id for s in segs], [f"seg-{i}" for i in range(1, 6)])

    def test_long_run_splits_on_max_duration(self):
        words = parse_words({"words": [raw_word("w", i * 0.5, i * 0.5 + 0.4) for i in range(20)]})
        segs = segment(words, max_duration=3)
        self.assertTrue(all(s.end_sec - s.start_sec <= 3 for s in segs))
        self.assertEqual(sum(len(s.words) for s in segs), 20)

    def test_empty(self):
        self.assertEqual(segment(parse_words({})), [])

import json
import os
import tempfile
import time
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from pydantic import ValidationError

from backend.app.schema import (
    EvidenceReview, EvidenceWindow, ExtractedClaim, ExtractedClaims,
    Grounding, Job, Localization, Result,
)
from backend.app.pipeline import run, source_claims

REPORT = "The person raised both hands. The person stepped backward. The person intended to flee."


def extraction():
    return ExtractedClaims(claims=[
        ExtractedClaim(reportText="The person raised both hands.", category="visual", assessableByVideo=True),
        ExtractedClaim(reportText="The person stepped backward.", category="visual", assessableByVideo=True),
        # Deliberately incorrect model eligibility: the server must override it.
        ExtractedClaim(reportText="The person intended to flee.", category="subjective_or_legal", assessableByVideo=True),
    ])


class FakeGemini:
    def __init__(self):
        self.localized = []
        self.reviewed = []
        self.uploads = 0
        self.deleted = 0
        self.closed = False

    def extract(self, report):
        return extraction()

    @contextmanager
    def video_file(self, path):
        self.uploads += 1
        try:
            yield "uploaded-video"
        finally:
            self.deleted += 1

    def locate(self, full_video, claim, duration):
        self.localized.append(claim.id)
        if claim.id == "claim-2":
            return Localization(outcome="unable_to_locate", window=None, reason="Camera faces away.")
        return Localization(outcome="located", window=EvidenceWindow(startSeconds=18, endSeconds=25), reason="The relevant interaction is visible.")

    def review(self, path, claim, duration):
        self.reviewed.append(claim.id)
        return Grounding(status="consistent_with_visible_evidence", observations=["Both hands are above shoulder height."], frameTimes=[3, 5])

    def close(self):
        self.closed = True


def execute(fake, duration=60):
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        with patch("backend.app.pipeline.video.duration", return_value=duration), patch("backend.app.pipeline.video.normalize"), patch("backend.app.pipeline.video.cut") as cut, patch("backend.app.pipeline.Gemini", return_value=fake):
            result = run(root / "original.mp4", root, "test", "public.mp4", REPORT, lambda *args: None)
        return result, cut.call_args_list


class ClaimTests(unittest.TestCase):
    def test_clip_limit_allows_container_rounding_but_not_long_videos(self):
        result, _ = execute(FakeGemini(), duration=90.01)
        self.assertEqual(len(result.reviews), 3)
        with self.assertRaisesRegex(ValueError, "at most 90 seconds"):
            execute(FakeGemini(), duration=91)

    def test_exact_quotes_ids_and_eligibility(self):
        claims = source_claims(REPORT, extraction())
        self.assertEqual([c.id for c in claims], ["claim-1", "claim-2", "claim-3"])
        for claim in claims:
            self.assertEqual(REPORT[claim.reportStart:claim.reportEnd], claim.reportText)
        self.assertFalse(claims[-1].assessableByVideo)

    def test_reject_paraphrased_and_out_of_order_quotes(self):
        extracted = extraction()
        extracted.claims[0].reportText = "The individual raised both hands."
        with self.assertRaises(ValueError):
            source_claims(REPORT, extracted)
        extracted = extraction()
        extracted.claims.reverse()
        with self.assertRaises(ValueError):
            source_claims(REPORT, extracted)

    def test_audio_and_documentary_claims_cannot_be_visually_assessed(self):
        for category in ("audio", "documentary", "subjective_or_legal"):
            claims = source_claims("A claim.", ExtractedClaims(claims=[ExtractedClaim(reportText="A claim.", category=category, assessableByVideo=True)]))
            self.assertFalse(claims[0].assessableByVideo)

    def test_pipeline_claims_abstention_and_original_timestamps(self):
        fake = FakeGemini()
        result, cuts = execute(fake)
        self.assertEqual(fake.localized, ["claim-1", "claim-2"])
        self.assertEqual(fake.reviewed, ["claim-1"])
        review, missing, outside = result.reviews
        self.assertEqual(review.frameTimes, [19, 21])  # local frames + padded clip start (16)
        self.assertEqual(review.evidenceWindow, EvidenceWindow(startSeconds=16, endSeconds=27))
        self.assertEqual(cuts[0].args[-2:], (16, 27))
        self.assertEqual(missing.status, "insufficient_footage_to_assess")
        self.assertIsNone(missing.evidenceWindow)
        self.assertEqual(outside.status, "outside_automated_assessment")
        self.assertTrue(all(r.humanReviewRequired for r in result.reviews))
        self.assertEqual(fake.uploads, 1)
        self.assertEqual(fake.deleted, 1)
        self.assertTrue(fake.closed)

    def test_only_ineligible_claims_skip_video_model_calls(self):
        fake = FakeGemini()
        fake.extract = lambda _: ExtractedClaims(claims=[extraction().claims[-1]])
        result, cuts = execute(fake)
        self.assertEqual(fake.uploads, 0)
        self.assertEqual(fake.localized, [])
        self.assertEqual(cuts, [])
        self.assertEqual(result.reviews[0].status, "outside_automated_assessment")

    def test_reject_out_of_bounds_window_and_cleanup(self):
        fake = FakeGemini()
        fake.locate = lambda *args: Localization(outcome="located", window=EvidenceWindow(startSeconds=55, endSeconds=65), reason="Bad time")
        with self.assertRaisesRegex(ValueError, "original recording"):
            execute(fake)
        self.assertEqual(fake.deleted, 1)
        self.assertTrue(fake.closed)

    def test_reject_out_of_bounds_source_frame(self):
        fake = FakeGemini()
        fake.review = lambda *args: Grounding(status="consistent_with_visible_evidence", observations=["Hands up"], frameTimes=[12])
        with self.assertRaisesRegex(ValueError, "frame outside"):
            execute(fake)
        self.assertTrue(fake.closed)

    def test_unclear_and_inconsistent_results_preserved(self):
        for status in ("insufficient_footage_to_assess", "potential_visual_inconsistency_review_recommended"):
            fake = FakeGemini()
            fake.review = lambda *args: Grounding(status=status, observations=["Hands are partially visible below waist height."], frameTimes=[3])
            result, _ = execute(fake)
            self.assertEqual(result.reviews[0].status, status)

    def test_invalid_model_contracts_are_rejected(self):
        with self.assertRaises(ValidationError):
            Localization(outcome="unable_to_locate", window=EvidenceWindow(startSeconds=1, endSeconds=2), reason="Ambiguous")
        for start, end in ((2, 1), (1, 1), (-1, 2), (0, float("inf"))):
            with self.assertRaises(ValidationError):
                EvidenceWindow(startSeconds=start, endSeconds=end)
        with self.assertRaises(ValidationError):
            Grounding(status="contradicted", observations=[], frameTimes=[])
        with self.assertRaises(ValidationError):
            EvidenceReview(claimId="claim-1", status="consistent_with_visible_evidence", observations=["Hands up"], frameTimes=[1])


class APITests(unittest.TestCase):
    def test_report_job_lifecycle_validation_and_legacy_result(self):
        from fastapi.testclient import TestClient
        from backend.app import main
        with tempfile.TemporaryDirectory() as folder, patch.object(main, "DATA", Path(folder)), patch.dict(os.environ, {"GOOGLE_API_KEY": "test"}), patch.object(main.shutil, "which", return_value="binary"):
            stale_id = str(uuid.uuid4())
            stale_folder = Path(folder)/stale_id
            stale_folder.mkdir()
            main.save(stale_folder/"job.json", Job(id=stale_id, filename="old.mp4", created_at=datetime.now(timezone.utc).isoformat()))
            (stale_folder/"result.json").write_text(json.dumps({"pipeline_version": "1", "events": []}))
            def fake_run(original, directory, job_id, filename, report_text, progress):
                self.assertEqual(report_text, REPORT)
                self.assertEqual((directory / "report.txt").read_text(), REPORT)
                progress("Extracting claims", .5)
                claims = source_claims(REPORT, extraction())
                return Result(id=job_id, filename=filename, report_text=report_text, duration_sec=4, video_url="/video", original_url="/original", model="test", claims=claims, reviews=[])
            with patch.object(main, "run", side_effect=fake_run), TestClient(main.app) as client:
                self.assertEqual(client.get(f"/analyses/{stale_id}").json()["status"], "failed")
                self.assertEqual(client.get(f"/analyses/{stale_id}/result").status_code, 409)
                for report in (None, "   ", "x"*12001):
                    data = {} if report is None else {"report_text": report}
                    self.assertEqual(client.post("/analyses", data=data, files={"video": ("test.mp4", b"video")}).status_code, 422)
                self.assertEqual(client.post("/analyses", data={"report_text": REPORT}, files={"video": ("bad.txt", b"bad")}).status_code, 415)
                self.assertEqual(client.post("/analyses", data={"report_text": REPORT}, files={"video": ("empty.mp4", b"")}).status_code, 400)
                response = client.post("/analyses", data={"report_text": REPORT}, files={"video": ("test.mp4", b"video")})
                self.assertEqual(response.status_code, 202)
                job_id = response.json()["id"]
                for _ in range(100):
                    job = client.get(f"/analyses/{job_id}").json()
                    if job["status"] in ("complete", "failed"):
                        break
                    time.sleep(.01)
                self.assertEqual(job["status"], "complete")
                result = client.get(f"/analyses/{job_id}/result").json()
                self.assertEqual(result["report_text"], REPORT)
                self.assertEqual(len(result["claims"]), 3)
                self.assertEqual(client.get("/analyses/not-a-uuid").status_code, 404)
                self.assertEqual(len(client.get("/analyses").json()), 2)

    def test_missing_api_key_explained(self):
        from fastapi.testclient import TestClient
        from backend.app import main
        with tempfile.TemporaryDirectory() as folder, patch.object(main, "DATA", Path(folder)), patch.dict(os.environ, {"GOOGLE_API_KEY": ""}), TestClient(main.app) as client:
            response = client.post("/analyses", data={"report_text": REPORT}, files={"video": ("test.mp4", b"video")})
            self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()

"""Report -> exact claims -> relevant windows -> bounded visual reviews."""
from pathlib import Path
from . import video
from .gemini import Gemini, MODEL
from .schema import Claim, EvidenceReview, EvidenceWindow, ExtractedClaims, Result


def source_claims(report: str, extracted: ExtractedClaims) -> list[Claim]:
    """Reject invented/paraphrased quotes and assign IDs outside the model."""
    claims = []
    cursor = 0
    for i, item in enumerate(extracted.claims):
        start = report.find(item.reportText, cursor)
        if start < 0:
            raise ValueError("Extracted claim is not an exact, ordered report excerpt")
        end = start + len(item.reportText)
        claims.append(Claim(**{**item.model_dump(),
            "assessableByVideo": item.category == "visual" and item.assessableByVideo},
            id=f"claim-{i+1}", order=i+1, reportStart=start, reportEnd=end))
        cursor = end
    return claims


def abstain(claim: Claim, reason: str, outside: bool = False) -> EvidenceReview:
    return EvidenceReview(claimId=claim.id,
        status="outside_automated_assessment" if outside else "insufficient_footage_to_assess",
        observations=[], frameTimes=[], uncertaintyReason=reason)


def run(original: Path, folder: Path, job_id: str, filename: str, report_text: str, progress) -> Result:
    progress("Checking demo clip", .03)
    duration = video.duration(original)
    # Encoded audio/container duration can extend a cut by a few milliseconds.
    if duration > 90.1:
        raise ValueError("Use a demo excerpt of at most 90 seconds")
    gemini = Gemini()
    try:
        progress("Extracting report claims and eligibility", .08)
        claims = source_claims(report_text, gemini.extract(report_text))
        progress("Preparing evidence video", .15)
        normalized = folder / "video.mp4"
        video.normalize(original, normalized)
        duration = video.duration(normalized)
        clip_dir = folder / "clips"
        clip_dir.mkdir(exist_ok=True)
        reviews = []

        # Prepare the inline video once and reuse it for each localization request.
        def review_claims(full_video=None):
            for i, claim in enumerate(claims):
                progress(f"Reviewing claim {i+1}/{len(claims)}", .2 + .75*i/len(claims))
                if not claim.assessableByVideo:
                    reviews.append(abstain(claim,
                        f"This {claim.category.replace('_', ' ')} claim is outside automated visual assessment.", outside=True))
                    continue
                located = gemini.locate(full_video, claim, duration)
                if located.window is None:
                    reviews.append(abstain(claim,
                        f"Unable to locate relevant footage: {located.reason} Absence from footage does not establish that the event did not happen."))
                    continue
                if located.window.endSeconds > duration:
                    raise ValueError("Localization is outside the original recording")
                # Include context, especially for temporal claims such as 'before'.
                start = max(0, located.window.startSeconds - 2)
                end = min(duration, located.window.endSeconds + 2)
                path = clip_dir / f"{claim.id}.mp4"
                video.cut(normalized, path, start, end)
                detail = gemini.review(path, claim, end - start)
                if any(t > end - start for t in detail.frameTimes):
                    raise ValueError("Grounding returned a frame outside the supplied clip")
                reviews.append(EvidenceReview(**{**detail.model_dump(),
                    "frameTimes": sorted(set(t + start for t in detail.frameTimes))},
                    claimId=claim.id, evidenceWindow=EvidenceWindow(startSeconds=start, endSeconds=end),
                    localizationReason=located.reason, clip_url=f"/media/{job_id}/clips/{path.name}"))

        if any(c.assessableByVideo for c in claims):
            with gemini.video_file(normalized) as full_video:
                review_claims(full_video)
        else:
            review_claims()
        return Result(id=job_id, filename=filename, report_text=report_text,
            duration_sec=duration, video_url=f"/media/{job_id}/video.mp4",
            original_url=f"/media/{job_id}/{original.name}", model=MODEL, claims=claims, reviews=reviews)
    finally:
        gemini.close()

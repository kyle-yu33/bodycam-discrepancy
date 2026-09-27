"""Gemini calls for the claim-evidence ledger: extract claims, check them, second look."""
import os
from pathlib import Path

from .video import ensure_model_size
from .gemini import MODEL, Gemini, video_part
from .ledger import Agreements, Claim, ClaimCheck, ClaimChecks, Claims, SecondLook
from .speakers import who
from .transcribe import Transcript

CLAIMS_MODEL = os.getenv("CLAIMS_MODEL", MODEL)
CHECK_FPS = float(os.getenv("CHECK_FPS", "2"))
SECOND_LOOK_FPS = float(os.getenv("SECOND_LOOK_FPS", "5"))
MAX_VIDEO_FRAMES = 2000   # ~600k tokens at high media resolution; long clips are sampled more sparsely to fit

GUIDE = Path(__file__).with_name("review_guide.md").read_text(encoding="utf-8")  # system instruction for checks

EXTRACT_PROMPT = """Split the narrative of this police report into atomic claims for evidence review.
- Skip header and administrative lines (disclaimers, occurrence numbers, report type, officer, subject).
- One claim per sentence of the narrative, in order. text is the sentence's exact wording without the final period.
- claim_type:
  "visual": a body position, movement, action, object or scene a camera could show. A physical movement is
  visual even when phrased as an inability ("unable to stand still"), with an estimated size ("swayed
  about two inches"), or as a count of actions ("used the wrong hand on two of six attempts", "stepped off
  the line twice"). An officer's observation of eye movements is visual too (the check decides whether the
  footage can resolve it);
  "audio": what someone said, asked, instructed or stated;
  "documentary": facts from records or events outside the recording (dispatch, prior driving);
  "subjective_or_legal": opinions, sensations such as smell, characterizations such as "slurred" or "unsteady",
  a tally of test clues ("six of eight clues"), intent, impairment, or any legal conclusion.

REPORT:
"""

CHECK_PROMPT = """Compare each claim from a team-written police report with this {dur:.0f}-second video and its audio.

For each claim give the window (start and end seconds) of footage that bears on it; a lawyer clicks it to jump
to that moment, so keep it tight: the moment itself, or for a claim about a whole test, the whole test, or for a
claim about the place, the first seconds that show it. Use null only when no footage bears on it.
person_track_id: the id:N of the person the claim is about, if a pose overlay labels them, else null.
observation: one or two neutral sentences citing seconds.

{overlay}{transcript}

Automated pose events:
{pose}

CLAIMS:
{claims}
"""

OVERLAY_NOTE = """The video has overlays: the "t=12.3s" clock in the bottom-left corner, and for each detected person a box
labelled id:N, a skeleton, and yellow text naming automated pose flags for that frame.

"""

SECOND_LOOK_PROMPT = """This clip is seconds {start:.1f}-{end:.1f} of a body-worn camera video, without overlays: clip second 0
is video second {start:.1f}. Give every time as a video second (clip second + {start:.1f}), as the transcript does.
It bears on this claim from a team-written police report:
"{text}"
The claim concerns roughly video seconds {c0:.1f}-{c1:.1f}; the seconds before and after are context only.
Judge only from this clip, including its audio. Would a lawyer watching it clearly see or hear something
incompatible with the claim?
finding (about the claim, not about any earlier check):
- incompatible_with_claim only if the relevant action is in clear view (or clearly audible) for its whole
  duration and does not match what the claim says.
- matches_claim only if the relevant action is in clear view (or clearly audible) and is what the claim says.
- cannot_tell otherwise: the action the claim is about (the walk, the turn, the touch) does not happen in this
  clip, the view is blocked, dark, blurred, too far or too small, the key moment may fall outside this clip, or
  the claim could be accurate but the clip doesn't clearly show it.
observation: one or two neutral sentences citing video seconds.

{transcript}

Automated pose events in this clip (video seconds; noisy; left/right are the person's own, measured from their
body, so they don't depend on which side of the image the person is on). Confirm them in the video:
{pose}
"""

ADJUDICATE_PROMPT = """This clip is seconds {start:.1f}-{end:.1f} of a body-worn camera video, without overlays: clip second 0
is video second {start:.1f}. Give every time as a video second (clip second + {start:.1f}).
It bears on this claim from a team-written police report:
"{text}"
Two independent reviews of this footage contradict each other about it:
- Review A: {a}
- Review B: {b}
At most one of them is right. Watch the moments they describe and decide what the footage shows. Check each
specific detail they disagree on (which hand, which moment, whether the action happens) frame by frame. Left and
right are the person's own; a person facing the camera uses their left hand on the right side of the image. The
transcript and the pose events below are independent evidence; use them to check the reviews.
finding: incompatible_with_claim, matches_claim or cannot_tell, with the same meaning as always: a finding other
than cannot_tell needs the relevant action in clear view (or clearly audible).
observation: one or two neutral sentences citing video seconds, stating what the footage shows.

{transcript}

Automated pose events in this clip (video seconds; noisy; left/right are the person's own):
{pose}
"""


AGREEMENT_PROMPT = """Each item below is one claim from a police report, the status a reviewer gave it after watching
the footage, and the reviewer's observation. Statuses: consistent (the footage shows what the claim says),
potential_inconsistency (the footage clearly shows something incompatible with the claim), insufficient_footage
(the footage can't settle it). For each item, does the observation fit its status? It does not fit if, for
example, the observation describes the footage clearly showing something incompatible with the claim while the
status is not potential_inconsistency, or describes the footage clearly showing the claim while the status is
potential_inconsistency. Judge only the text, not the footage.

{items}
"""


def disagreements(gemini: Gemini, claims: list[Claim], checks: dict[str, ClaimCheck]) -> set[str]:
    """Claim ids whose observation doesn't fit their status. Text only; it can only trigger a re-check."""
    items = [f"{c.id}: claim: {c.text}\nstatus: {checks[c.id].status}\nobservation: {checks[c.id].observation}"
             for c in claims if c.id in checks and c.claim_type != "subjective_or_legal"
             and checks[c.id].status != "outside_assessment"]
    if not items:
        return set()
    found = gemini.generate([AGREEMENT_PROMPT.format(items="\n\n".join(items))], Agreements, model=CLAIMS_MODEL)
    return {a.claim_id for a in found.items if not a.agrees}


def transcript_text(t: Transcript | None, start: float = 0.0, end: float = float("inf")) -> str:
    """Lines overlapping [start, end] (video seconds), with each speaker's role."""
    lines = [f"{s.start_sec:.1f}-{s.end_sec:.1f}s {who(t, s.speaker)}: {s.text}"
             for s in (t.segments if t else []) if s.end_sec >= start and s.start_sec <= end]
    return "Timed transcript:\n" + "\n".join(lines) if lines else ""


def extract(gemini: Gemini, report_text: str) -> list[Claim]:
    return gemini.generate([EXTRACT_PROMPT + report_text], Claims, model=CLAIMS_MODEL).claims


def check(gemini: Gemini, video: Path, claims: list[Claim], pose_text: str, duration: float,
          overlay: bool, transcript: Transcript | None, segment_start: float | None = None,
          segment_end: float | None = None) -> list[ClaimCheck]:
    """segment_start/end: this video is only that part of the recording (long clips are checked in windows)."""
    ensure_model_size(video)
    listing = "\n".join(f"{c.id} [{c.claim_type}] {c.text}" for c in claims)
    windowed = segment_start is not None and segment_end is not None
    lines = transcript_text(transcript, segment_start, segment_end) if windowed else transcript_text(transcript)
    prompt = CHECK_PROMPT.format(dur=duration, overlay=OVERLAY_NOTE if overlay else "", pose=pose_text,
                                 claims=listing, transcript=lines)
    if windowed:
        prompt += (f"\nThis is only original-recording seconds {segment_start:.1f} to {segment_end:.1f} "
                   f"of the {duration:.1f}-second video. Return all window timestamps in ORIGINAL-recording "
                   "seconds (the t= overlay shows these seconds when present). If a claim's event is not in this window, use "
                   "insufficient_footage with null window times; other windows are checked separately. "
                   "Do not call an event inconsistent merely because it is absent from this window.\n")
    fps = min(CHECK_FPS, MAX_VIDEO_FRAMES / ((segment_end - segment_start) if windowed else duration))
    return gemini.generate([video_part(video, fps), prompt], ClaimChecks, model=CLAIMS_MODEL, system=GUIDE).checks


def second_look(gemini: Gemini, window: Path, claim: Claim, start: float, end: float,
                claim_start: float, claim_end: float, transcript: Transcript | None,
                pose_text: str = "(no pose events)") -> SecondLook:
    """claim_start/claim_end: the first pass's window, in original-video seconds."""
    ensure_model_size(window)
    prompt = SECOND_LOOK_PROMPT.format(start=start, end=end, c0=claim_start, c1=claim_end, text=claim.text,
                                       transcript=transcript_text(transcript, start, end), pose=pose_text)
    return gemini.generate([video_part(window, SECOND_LOOK_FPS), prompt], SecondLook, model=CLAIMS_MODEL,
                           system=GUIDE)


def adjudicate(gemini: Gemini, window: Path, claim: Claim, start: float, end: float, a: str, b: str,
               transcript: Transcript | None, pose_text: str = "(no pose events)") -> SecondLook:
    """Third look when the first two reviews contradict each other. It isn't told which review came first."""
    ensure_model_size(window)
    prompt = ADJUDICATE_PROMPT.format(start=start, end=end, text=claim.text, a=a, b=b,
                                      transcript=transcript_text(transcript, start, end), pose=pose_text)
    return gemini.generate([video_part(window, SECOND_LOOK_FPS), prompt], SecondLook, model=CLAIMS_MODEL,
                           system=GUIDE)

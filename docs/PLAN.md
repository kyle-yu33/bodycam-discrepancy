# EvidenceLens: plan and workflow

Status as of 2026-09-26. How the pieces fit, where each one stands, and what's left before judging.
Product rules and wording live in [`context/`](../context/README.md); this file is the build plan.

## 1. What we're building

A defence lawyer has a police report and bodycam footage. EvidenceLens splits the report into
individual claims, checks each against the video, and shows a ledger. Every claim gets one of four
statuses, linked to the exact moment in the footage:

| Status | Meaning | Example (sfst2) |
|---|---|---|
| Consistent with visible evidence | The footage shows it | "I demonstrated the finger-to-nose test" |
| Potential inconsistency — review recommended | The footage clearly shows something else | "Used the wrong hand on 2 of 6 attempts": he uses the called hand every time |
| Insufficient footage to assess | The camera can't show it | "Opened both eyes": head tilted back, eyes not visible |
| Outside automated assessment | Opinion or legal conclusion | "Was impaired by a drug" |

**The demo moment:** click an amber claim, the video jumps to that moment, and the judges see the
mismatch themselves. Then a gray claim: it says when it can't tell.

## 2. Workflow

```
PREPARE A CASE (once per demo case)
  python -m app.fetch_clips sfst2  -> data/clips/sfst2.mp4           YouTube section, never committed
  team writes                      -> data/reports/sfst2.txt         fictional report, planted misdescriptions
  team labels                      -> data/ground_truth/sfst2.json   answer key: expected status + window

ANALYZE  python -m app.cases sfst2   (~3 min, each step cached)
  1. ffmpeg     normalize -> clip.mp4 (<=720p, H.264/AAC)
  2. YOLO pose  tracking + body measurements at 10 fps
                -> pose events (arms_at_sides, left_hand_to_face 32.6s, head_tilted, ...)
                -> overlay video: skeletons, id:N boxes, "t=12.3s" clock on every frame
  3. Gemini     report -> claims, typed visual / audio / documentary / subjective_or_legal
  4. Gemini     overlay video + audio + pose events -> status, window, observation per claim
  5. Guards     subjective_or_legal -> always "outside"
                every amber flag -> independent second look at a clean, narrow window;
                not confirmed -> "insufficient footage"
  6. ffmpeg     3 evidence frames per claim
  -> data/cases/sfst2/result.json   (gitignored; every run also archived in runs/)

SCORE    python -m app.evaluate sfst2
  planted inconsistencies caught, FALSE FLAGS (must be 0), windows landing on the right moment

SERVE    uvicorn app.main:app --port 8000
  GET /cases, GET /cases/{case}, /case-media/{case}/...   (video supports seeking)

UPLOAD   (from the UI, instead of PREPARE + ANALYZE)
  /new -> POST /cases  video (.mp4/.mov, <=90 s) + report text or .txt + optional name
       -> 202 + job; the single worker thread runs steps 1-6 into data/cases/<id>/
       -> UI polls GET /cases/{id}/job (stage + progress) -> opens /cases/{id}
       GET /case-jobs lists every queued or running upload; /new shows it as the analysis queue
  Results carry origin "upload"; no ground truth, so no scoring. Jobs cut off by a restart are marked failed.

REVIEW UI  (Next.js, to build)
  claims | video | evidence ledger; clicking a claim seeks the video to its window
```

A false amber flag is the worst failure. Three layers guard against it: prompt rules (observe, don't
infer; "insufficient" when in doubt), an independent second look that must see the action itself,
and the scoring script, which fails any run with a false flag.

The claims pipeline sits alongside the existing event API (`/analyses`); nothing the current frontend
uses has changed.

## 3. Setup (backend)

From `backend/` with the venv active:

```powershell
pip install -r requirements-dev.txt     # includes ultralytics (YOLO) and yt-dlp
# backend/.env: GOOGLE_API_KEY=<Vertex AI key>
python -m app.fetch_clips               # data/clips/sfst1.mp4, sfst2.mp4
python -m app.cases sfst2               # analyze + score; --repose / --reextract to redo those steps
uvicorn app.main:app --port 8000        # then open http://localhost:8000/cases/sfst2
```

Default model: `gemini-3.8-flash`, thinking level `high`, video media resolution `high`, temperature 0
(`app/gemini.py`). The reviewer rules live in `app/review_guide.md`, sent as the system instruction for every
check and second look; edit that file to change how the model judges footage.
Tuning knobs (env): `CLAIMS_MODEL`, `CHECK_FPS` (default 2), `SECOND_LOOK_FPS` (5),
`GEMINI_TEMPERATURE` (0), `GEMINI_VIDEO=annotated|clean`, `POSE_MODEL`, `POSE_FPS` (10), `POSE_IMGSZ` (640).
Tests (repo root): `python -m unittest backend/tests/test_claims.py backend/tests/test_pipeline.py`.

## 4. Where things stand

| Piece | Status |
|---|---|
| Clip fetcher, 2 demo clips | Done (`main`) |
| Fictional reports + answer keys | Done (`main`); answer keys still DRAFT: need a human check with audio |
| YOLO pose decision | Done (`main`, `context/decisions.md`) |
| Claims pipeline, pose, scoring, `/cases` API, 19 tests | Working on real Gemini (branch `claims-pipeline`) |
| Model choice | Done: gemini-3.8-flash with the harness in section 5 |
| Timestamps on the 80 s night clip | Solved: the answer key was ~13 s late; the timed transcript now anchors the checks |
| Review UI (claims ledger) | Built: cached demo replay plus upload flow at `/new` (branch `upload-feature`) |
| Demo script, backup recording | Not started |

## 5. Accuracy so far

How we tune: run, score, read the observation behind each miss, fix the cause (prompt, pose feature,
or our own label), rerun. Runs are archived in `data/cases/<case>/runs/` for comparison.

Fixes that mattered:
1. Gemini said the eyes were closed "following the officer's instruction". It inferred rather than
   observed. The prompts now forbid inferring from instructions.
2. The second look confirmed "stumbled during the turn" on a window where he only stands there. It
   must now see the action itself.
3. Pose features for the sobriety tests: which hand touches the nose (all 6 touches found, L R L R R L),
   arms at sides, head tilt relative to the person's own baseline.
4. Walking and camera movement no longer read as "swaying".

**Results vary between runs, even at temperature 0.** Same inputs:

| Model | sfst2 (3 planted) | sfst1 (4 planted) | Timing on sfst1 |
|---|---|---|---|
| gemini-2.5-flash | caught 3/3, 3/3, 1/3 (3 runs); 0 false flags | 3/4, 4/4 (2 runs); **1 false flag** (heel-to-toe) | Walk placed ~15 s early |
| gemini-3-flash-preview | 2/3, 0 false flags | 2/4, 0 false flags | Correct |
| gemini-2.5-pro | 2/3, 0 false flags | 1/4, 0 false flags | Correct; very cautious |
| gemini-3.1-pro-preview | 2/3, 1 "false flag" (see below) | 3/4, 0 false flags | Walk placed early |
| gemini-3.8-flash (thinking high), old harness | 0/3, 0 false flags | 2/4, 0 false flags | 2 windows off on each clip |
| **gemini-3.8-flash, current harness** | **2/3, 2/3, 2/3; 0 false flags; 9/12 exact every run** | **3/4, 2/4, 3/4; 0 false flags; 10-11/12 exact** | Correct (0 windows off) |

"Walk placed early" above was the answer key's error, not the models': the subject counts his steps aloud from
31.1 s ("one") to 52.6 s ("nine"), and the key had the walk at 44-55 s. Windows are now re-timed from the
transcript.

Harness changes on 3.8 Flash (2026-09-26), 3 runs per clip per change, each aimed at a miss read in the
model's own observations:
1. Extraction typed "on two of six attempts, used the wrong hand" and "lack of smooth pursuit" as
   subjective, which forces *outside*. Counts of observable actions and eye observations are now visual.
2. The timed ElevenLabs transcript goes into the check and second look; counting aloud and called-out
   "left"/"right" place each step and attempt. This fixed the sfst1 timing.
3. `app/review_guide.md` as the system instruction: statuses, observe-don't-infer rules, and fixes for
   specific misreadings (an arm crossing the face is not a head movement, the camera wearer's own face is never
   in view, commands are not evidence of how much happened, out-of-frame body parts are never inferred), plus
   what each sobriety test looks like.
4. (Tried, then removed: three checks with a majority vote. The independent second look already guards
   every flag, and one check is enough.)
5. Second-look windows are at least 20 s, so the person's own rhythm is visible ("stopped after the fourth
   step" was being confirmed on the normal pause between heel-to-toe steps).
6. Video media resolution `high`: at the default, the model read a head held tilted back as "lowered"
   3/3 times; at `high` it read it correctly 3/3 (about 3.5x the video tokens). 720p vs 480p video made no
   difference on the night clip, so model videos stay 480p.
7. Speaker roles: each diarized label (speaker_0, ...) is named officer / officer wearing the camera /
   subject / other / unknown by one Gemini call that watches the clip against the timed transcript, quoting its
   evidence (`app/speakers.py`, saved as `speakers` in `transcript.json`). Loudness can't do it: the subject is
   as loud as the camera wearer on sfst2. 3/3 runs per clip gave the same, correct roles.
8. The shown observation always agrees with the status. The guide makes the observation the reason for the
   status; a text-only agreement check then reads every observation next to its status, and any claim where they
   don't fit goes to the second look like a flag does (if that call fails, every claim does). The second look
   answers with a finding (incompatible_with_claim / matches_claim / cannot_tell) that sets the status, and its
   own text is then shown; the replaced text is kept in `first_pass_observation`. Second-look observations cite
   video seconds, not clip seconds.
9. Built for new clips, not tuned to these two: the guide states principles (small distances can't be measured,
   the reporting officer is not always the camera wearer, test procedure never proves what happened); the video
   sent to Gemini is re-encoded to fit the 15 MB inline cap and long clips are sampled at a lower fps to stay
   within the token budget. The planted claims include some no footage could settle (2 inches of sway, feet
   at night), so accuracy on these keys understates the system; new cases should plant resolvable claims.
Temperature 0 vs 1 made no measurable difference (3 runs each); 0 is kept because 1 accepted "raised both arms
more than six inches" as consistent, which the footage doesn't clearly show.

Every remaining miss is a label the team should settle, not a model error: sfst2 feet together (feet are never
in frame), front-to-back sway (can't be resolved), flashlight (goes into his mouth); sfst1 arms raised (his arms
do drift from his sides and the officer says "hands down" twice) and stepping off the line (night, walking away).

So one good run proves nothing. Plan: choose the model on several runs, then flag a claim only if a
majority of 3 checks flag it and the second look confirms, then freeze a perfect run as the demo
result. The demo never depends on a live model call. Current model: gemini-3.8-flash with the harness above.

**The models found three problems in our own answer key and report (not fixed yet; team call):**
- "I checked SUBJECT B's eyes with my flashlight": the flashlight goes into his mouth (frame at
  59.5 s; the officer asks about weed). 3.1 Pro's "false flag" is a correct catch.
- "Stood with feet together": his feet are out of frame for the whole clip, so *insufficient* is right.
- "Swayed two inches front to back": no model can see front-to-back sway from a camera facing him.
  Reword to "side to side" or expect *insufficient*.

## 6. Remaining work

**A. Accuracy (backend)**
1. ~~Model comparison~~, ~~sfst1 timestamps~~, ~~majority voting~~: done (section 5).
2. A human confirms both answer keys with audio, settles the disputed labels listed in section 5 (sfst1 arms
   raised is new: the officer says "hands down" twice), and deletes the `DRAFT` field.
3. Trim each report to 5-7 claims (`context/mvp.md`).

**B. Review UI (frontend): the biggest piece left, can start now against the cached sfst2 result**
- Three panels per `context/frontend.md`: claims | video | ledger.
- Data: `GET /cases/{case}` returns a `CaseResult` (`backend/app/ledger.py`). Per result: `claim.text`,
  `status`, `observation`, `window_start_sec`/`window_end_sec`, `evidence_frames`, `second_look`,
  `downgraded`, `pose_events`. Media URLs are relative; prefix the API base.
- Click a claim: `video.currentTime = window_start_sec - 1`. Toggle clean video (`video_url`) vs.
  pose overlay (`annotated_video_url`).
- Amber for review (never red), the required disclaimer, none of the banned words.

**C. Integration**
1. Merge `claims-pipeline`.
2. Log in `context/decisions.md` that the claims pipeline is Python (FastAPI), not Next.js route
   handlers; this differs from `context/backend.md`.
3. Get demo results onto the demo laptop: `data/cases/` is gitignored, so either run `fetch_clips` +
   `app.cases` there or copy the folder. Test well before judging.

**D. Demo and pitch**
- Lead case: sfst2 (bright, close, steady). sfst1 only if its timestamps become reliable.
- Script (~3 min): hook -> report + clip -> claims appear -> click amber "wrong hand", video jumps to
  the six nose touches -> gray "eyes opened" (face tilted away) -> pose overlay as the vision-AI
  angle -> limits and future work.
- Record a backup video.

## 7. Risks

| Risk | Mitigation |
|---|---|
| False amber flag in front of judges | Freeze a perfect run; majority voting; second look |
| Wrong timestamps, so a click lands on the wrong moment | Clock overlay, model choice, pose-based windows; lead with sfst2 |
| Run-to-run variance | Majority voting; demo reads cached results only |
| Wi-Fi or API failure | Cached results + backup video |
| sfst2 shows a real person's face beside a fictional report | Labelled fictional and team-written on screen; public footage per `context/decisions.md` |

## 8. Decisions needed

1. Claims pipeline in Python rather than Next.js route handlers.
2. Who builds the review UI, and by when.
3. Lead demo case: sfst2 (recommended), or both.

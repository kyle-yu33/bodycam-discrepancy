# EvidenceLens: team alignment

Updated 2026-09-26, after PRs #5 and #6. **If you read one doc, read this one.** It covers what we're
building, what's on `main`, how to run it, who's doing what, and the rules. Product principles and
wording live in [`context/`](../context/README.md); this doc is about the build.

## TL;DR

- **The core pipeline works on `main`.** A team-written report and a bodycam clip go in; every claim
  comes out with one of our four statuses, a time window, a neutral observation and evidence frames.
- **Gemini (Vertex AI) checks the claims; YOLO pose adds frame-level body evidence.** Every amber flag
  gets an independent second look before it can reach the screen.
- **The backend serves results at `GET /cases/{case}`.** The review UI that shows them is the
  biggest piece left, and it needs an owner.
- **Accuracy is promising but not demo-ready.** Best runs catch every planted misdescription with 0
  false flags, but results vary between runs. Next: pick the model, add majority voting, freeze a
  checked result per case.
- **Always branch from the latest `main` and merge through a reviewed PR.** Merging an old branch
  (PR #2) broke `main` today; #5 reverted it.

## 1. What we're building

A defence lawyer has a police report and bodycam footage and no time to watch it all. EvidenceLens
splits the report into individual claims, checks each against the video, and shows a ledger that
says which moments deserve a human look. It is a review aid, not a lie detector.

| Status (UI label) | Colour | Meaning | Example from our demo (sfst2) |
|---|---|---|---|
| Consistent with visible evidence | Green | The footage shows it | "I demonstrated the finger-to-nose test" |
| Potential visual inconsistency — review recommended | Amber | The footage clearly shows something else | "Used the wrong hand on 2 of 6 attempts": he uses the called hand every time |
| Insufficient footage to assess | Slate | The camera can't show it | "Opened both eyes": head tilted back, eyes not visible |
| Outside automated assessment | Purple | Opinion, sensation or legal conclusion | "Was impaired by a drug" |

**The demo moment:** click an amber claim, the video jumps to that moment, and the judges see the
mismatch themselves. Then a slate claim: the tool says when it can't tell.

**Core rule: a false amber flag is the worst possible failure.** When unsure, the answer is
"insufficient footage".

## 2. What's on `main` now

```
                      ┌────────────────── backend/ (Python, FastAPI :8000) ──────────────────┐
report + clip ──────► │ CLAIMS PIPELINE (new, the product)       EVENT API (Lolan's skeleton) │
                      │ python -m app.cases <case>               POST /analyses (upload)      │
                      │   -> data/cases/<case>/result.json       generic event detection      │
                      │ GET /cases, GET /cases/{case}            GET /analyses/...            │
                      │ /case-media/<case>/...                   /media/...                   │
                      └──────────────────────────────────────────────────────────────────────┘
                                         │                                  │
                         review UI (to build)                  frontend/ today (Next.js)
```

The two APIs sit side by side. The current frontend still shows the event API and compiles; the
claims ledger UI replaces it once it's built. `schema.py` / `pipeline.py` / `/analyses` stay until then.

| Path | What it does |
|---|---|
| `backend/app/cases.py` | Claims pipeline + CLI; caches each step in `data/cases/<case>/` |
| `backend/app/claims.py` | The Gemini prompts: extract claims, check claims, second look |
| `backend/app/ledger.py` | The claims data contract (`CaseResult`, `ClaimResult`, statuses) |
| `backend/app/pose.py` | YOLO pose + ByteTrack: pose events, overlay video, per-frame CSV |
| `backend/app/evaluate.py` | Scores a result against the answer key; fails on any false flag |
| `backend/app/fetch_clips.py` | Downloads the demo clips from YouTube (clips are never committed) |
| `backend/app/gemini.py` | Vertex AI client shared by both APIs |
| `backend/app/video.py` | ffmpeg helpers |
| `backend/app/main.py` | FastAPI app: `/analyses` (event API) and `/cases` (claims) |
| `backend/app/schema.py`, `pipeline.py` | Event API (legacy until the UI moves) |
| `backend/tests/` | 19 unit tests, no API key or video needed |
| `data/reports/`, `data/ground_truth/` | Fictional reports and their answer keys (committed) |
| `data/clips/`, `data/cases/` | Clips and results (gitignored; local only) |
| `docs/CLIPS.md` | How to fetch and add clips |
| `context/` | Product brief, rules, decision log |

## 3. Setup

You need Python 3.11, ffmpeg on PATH (`ffmpeg -version`), and Node for the frontend.

```powershell
# backend, from the repo root
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt        # includes ultralytics (YOLO, CPU) and yt-dlp
copy .env.example .env                     # then set GOOGLE_API_KEY (the team's Vertex AI key; ask Kyle)
python -m app.fetch_clips                  # data/clips/sfst1.mp4 and sfst2.mp4
python -m app.cases sfst2                  # ~3 min: pose, Gemini, scoring against the answer key
uvicorn app.main:app --reload --port 8000  # http://localhost:8000/cases/sfst2
```

```powershell
# frontend, in a second terminal
cd frontend
npm install
npm run dev                                # http://localhost:3000
```

Tests (from the repo root): `python -m unittest backend/tests/test_claims.py backend/tests/test_pipeline.py`.

The key is a **Vertex AI** key: it goes in `GOOGLE_API_KEY`, not `GEMINI_API_KEY`, and never gets
committed. The YOLO model file downloads itself on first run.

## 4. How the claims pipeline works

`python -m app.cases sfst2` reads `data/clips/sfst2.mp4` and `data/reports/sfst2.txt`:

1. **Normalize** the clip with ffmpeg (≤720p, H.264/AAC) → `clip.mp4`.
2. **Pose:** YOLO pose + ByteTrack at 10 fps. Produces pose events (`arms_at_sides`,
   `left_hand_to_face`, `head_tilted`, `foot_raised`, ...) and an overlay video with skeletons, `id:N`
   boxes and a `t=12.3s` clock on every frame, so Gemini reads timestamps instead of guessing.
3. **Extract claims:** Gemini splits the report into claims typed `visual`, `audio`, `documentary` or
   `subjective_or_legal`.
4. **Check:** Gemini watches the overlay video with audio, plus the pose events as text, and returns a
   status, window and observation per claim.
5. **Guards:**
   - `subjective_or_legal` claims are always "outside".
   - Every amber flag gets an **independent second look**: a clean, narrow window, a fresh Gemini call
     that doesn't see the first answer, and it must see the action itself. Not confirmed → "insufficient".
6. **Evidence frames:** three per claim → `result.json`. If `data/ground_truth/sfst2.json` exists, the
   run is scored straight away.

Steps 1–3 are cached, so reruns only repeat the Gemini checks (~2–3 min). `--repose` redoes
normalize + pose; `--reextract` redoes claim extraction. Every run is archived in
`data/cases/<case>/runs/` for comparison.

Tuning knobs (env vars): `CLAIMS_MODEL` (default `GEMINI_MODEL`, `gemini-2.5-flash`), `CHECK_FPS` (2),
`SECOND_LOOK_FPS` (5), `GEMINI_VIDEO=annotated|clean`, `POSE_MODEL`, `POSE_FPS` (10), `POSE_IMGSZ` (640).

## 5. For the review UI: API contract

- `GET /cases` → `[{case, model, created_at, claims, consistent, potential_inconsistency, insufficient_footage, outside_assessment}]`
- `GET /cases/{case}` → a `CaseResult` (source of truth: `backend/app/ledger.py`):

| Field | Meaning |
|---|---|
| `case`, `model`, `created_at` | Which case, which model, when it ran |
| `report_text` | The full report, to show on screen |
| `video_url` | Clean clip |
| `annotated_video_url` | Pose-overlay clip (skeletons, `id:N`, clock) |
| `duration_sec` | Clip length |
| `results[]` | One per claim, in report order (below) |
| `pose_events[]` | All pose events: `track_id`, `event`, `start_sec`, `end_sec` (`track_id` -1 = camera) |

Each `results[i]`:

| Field | Meaning |
|---|---|
| `claim.id`, `claim.text`, `claim.claim_type` | The claim, in the report's exact words |
| `status` | `consistent` / `potential_inconsistency` / `insufficient_footage` / `outside_assessment` |
| `observation` | What is seen or heard, neutral, with seconds |
| `window_start_sec`, `window_end_sec` | The moment that bears on the claim (null if none) |
| `second_look`, `downgraded` | The re-check's observation; `downgraded` = a flag the re-check didn't confirm |
| `evidence_frames[]` | Three frames (start, middle, end of the window) |
| `pose_events[]` | Pose events overlapping the window |

UI rules:
- Media URLs are relative: prefix the API base (`http://localhost:8000`).
- Click a claim → `video.currentTime = max(0, window_start_sec - 1)`.
- Offer a toggle between `video_url` and `annotated_video_url`.
- Show which model produced the result and that it is cached analysis.
- Colours and labels as in section 1. Never red, never "lie", "false", "verdict", "guilt",
  "proven". Show the disclaimer from `context/frontend.md` and "Human review required".
- Add a TypeScript mirror of `ledger.py` in `frontend/src/lib/types.ts`; leave the event API types
  until that UI is removed.
- CORS allows `http://localhost:3000` (`FRONTEND_ORIGIN` to change it).

## 6. Demo data

| Case | Clip | Report | What it shows |
|---|---|---|---|
| `sfst1` | YouTube `4ThCZOa20wc`, 3:40–5:00 (80 s) | `data/reports/sfst1.txt` | Walk-and-turn test at night, subject far from the camera |
| `sfst2` | YouTube `mXw1nvF3klk`, 15:20–16:20 (60 s) | `data/reports/sfst2.txt` | Finger-to-nose test indoors, bright, close, steady |

Both are real, publicly released bodycam footage. The reports are fictional, written by us, labelled
as such, and deliberately misdescribe the footage (5 planted claims each). The answer keys in
`data/ground_truth/` list every claim's expected status and window.

**The answer keys are still DRAFT**, and the models found three problems in them (not fixed yet):
- sfst2 "I checked SUBJECT B's eyes with my flashlight": the flashlight goes into his **mouth** (frame
  at 59.5 s; the officer asks about weed). Decide: reword the report, or keep it as an unplanted
  inconsistency the tool catches.
- sfst2 "Stood with feet together": his feet are out of frame for the whole clip, so the answer should
  be *insufficient*.
- sfst2 "Swayed two inches front to back": can't be seen from a camera facing him. Reword to "side to
  side", or expect *insufficient*.

To add a case, see `docs/CLIPS.md`: add the clip to `fetch_clips.py`, write the report, write the
answer key after watching the clip with audio.

## 7. Accuracy

**How we measure:** `python -m app.evaluate <case>` compares a result with the answer key and prints
planted inconsistencies caught, **false flags** (must be 0), statuses matched, and whether each window
lands on the right moment.

**How we tune:** run, score, read the observation behind each miss, fix the cause (prompt, pose
feature, or our own answer key), rerun. Fixes that mattered so far: forbidding Gemini to infer from
instructions ("eyes closed because he was told to close them"); making the second look see the
action itself; the clock overlay; pose features for the sobriety tests; guarding sway against walking
and camera motion.

**Model comparison (9 runs, current prompts):**

| Model | sfst2 (3 planted) | sfst1 (4 planted) | Timing on sfst1 |
|---|---|---|---|
| gemini-2.5-flash | caught 3/3, 3/3, 1/3 (3 runs); 0 false flags | 3/4, 4/4 (2 runs); 1 false flag | Walk placed ~15 s early |
| gemini-3-flash-preview | 2/3, 0 false flags | 2/4, 0 false flags | Correct |
| gemini-2.5-pro | 2/3, 0 false flags | 1/4, 0 false flags | Correct, very cautious |
| gemini-3.1-pro-preview | 2/3, 1 "false flag" (the correct mouth catch above) | 3/4, 0 false flags | Walk placed early |

Takeaways: **results vary between runs even at temperature 0**, so one good run proves nothing.
Front-runner: gemini-3-flash-preview (no false flags, correct timing, cheaper). Plan: repeat runs,
majority voting over 3 checks, then freeze one checked result per case. **The demo only ever serves
frozen results**, never a live model call.

## 8. Who's doing what

| # | Work | Owner | Status |
|---|---|---|---|
| 1 | **Review UI**: claims, video, ledger; click-to-seek; overlay toggle; section 5 | **unassigned** | Not started; can start now against `GET /cases/sfst2` |
| 2 | Watch both clips with audio; confirm the answer keys; decide the three fixes in section 6 | **unassigned** | ~30 min |
| 3 | Model choice, majority voting, freeze demo results | Kyle | Next |
| 4 | Trim reports to 5–7 claims (`context/mvp.md`) | Kyle + whoever does #2 | After #2 |
| 5 | Demo script and backup recording | **unassigned** | Not started |
| 6 | Get `data/cases/` onto the demo laptop and test it offline | whoever presents | Before judging |
| 7 | Pitch deck, including the limits in section 11 | **unassigned** | Not started |

Claim a row in the team chat and put your name here in a PR.

## 9. Decisions

Settled (details in `context/decisions.md`):
- Report-claims first, not generic event detection; four statuses; never a lie detector.
- Real, publicly released footage with a team-written, labelled report.
- Gemini via Vertex AI (`GOOGLE_API_KEY`); clips sent inline.
- YOLO pose as supporting evidence; it never sets a status on its own.
- **The claims pipeline stays in Python (FastAPI)**, not Next.js route handlers.
- **Lead demo case: either works**, as long as the result shown is frozen and checked by a person.
  sfst2 is visually clearer, so it's a good opener.

Open:
- The three answer-key fixes (section 6), including how to handle the flashlight claim.
- Final model (after repeat runs).

## 10. Team rules

**Git**
- Pull `main`, branch from it, keep branches short, open a PR, get a quick review, merge.
- **Never merge an old branch.** Anything branched before the latest `main` gets rebuilt or rebased
  first. That's what broke `main` today (PR #2).
- If a PR shows conflicts, ask its author before resolving them. Don't let a bot pick a side.
- One PR per piece of work; say in the description how you tested it.

**Never commit:** clips (`data/clips/`), results (`data/cases/`), `.env` / API keys, `*.pt` model files.

**Wording** (UI, pitch, prompts): say "potential inconsistency", "review recommended", "insufficient
footage". Never "lie", "false", "verdict", "guilt", "proves", or red.

**Contract changes:** a change to `ledger.py` needs a matching change in the frontend types, in the
same PR.

## 11. Limits to say out loud in the pitch

- Video models still hallucinate and misjudge timing; that's why every flag is re-checked and a
  human always decides.
- 2D pose can't see motion toward the camera (front-to-back sway); the camera itself moves.
- Timestamps drift on long, dark clips with some models.
- Absence from one camera view is not proof something didn't happen.
- This is a prototype on public footage, not a deployed legal tool.

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `KeyError: 'GOOGLE_API_KEY'` or 403 from Gemini | Put the Vertex key in `backend/.env` as `GOOGLE_API_KEY` |
| `Clip ... is too large to send inline` | Keep clips ≤90 s; the model copy is 480p, well under 15 MB |
| yt-dlp "Sign in to confirm you're not a bot" | `pip install -U yt-dlp`; see `docs/CLIPS.md` |
| `ffmpeg failed` | Check `ffmpeg -version` works in the same terminal |
| First pose run is slow | Normal: YOLO downloads its model and runs on CPU (~30–60 s per clip) |
| `/cases` is empty | Run `python -m app.cases <case>` first; results are local, not in git |

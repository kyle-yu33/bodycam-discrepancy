# Handoff: Bodycam vs. Report Discrepancy Finder

Status as of 2026-09-26. Written so a new Claude Code session can pick up the work with
no other context. Read this whole file before changing code.

> **Update (branch `clips`):** the Hugging Face dataset and the copa184 case are dropped.
> All clips now come from YouTube via `python -m app.fetch_clips` (see `docs/CLIPS.md`),
> clips can be up to 90 s, and the demo is a field sobriety test (`sfst1`, `sfst2`).
> Sections below that mention copa184, BodyCam-VQA, or 30 s clips are out of date.

---

## 1. Mission

Hackathon project: 24 hours, a team of 4, two of whom are beginners. The targets are the
general track and **Best Use of Gemini API**.

A police report and a ~30 s bodycam clip go in. Out comes one verdict per claim in the
report, each `supported`, `contradicted` or `not_visible`. Each verdict carries a
timestamp, a one-sentence reason, evidence frames and supporting pose events. The target
user is an overloaded public defender. The product is a review aid that says which
10 seconds to watch. It is not a lie detector.

**Core design rule: a false `contradicted` is the worst possible failure. When unsure,
default to `not_visible`.**

The Gemini story, which must be visible in the demo:
- Gemini takes the video with audio natively, in one call, and returns a timestamp per claim.
- Structured output via `response_schema`.
- Custom frame-rate sampling (`video_metadata.fps`).
- Two stages, verify then skeptic: each red verdict is re-judged on a clean 10 s window
  with no overlays, and downgraded to `not_visible` if the skeptic doesn't confirm it.
- Pose evidence: YOLO pose + ByteTrack draws `id:N` boxes on the video Gemini watches,
  and the pose events are passed to it as text.

The mock LLM backend is for development only. **The demo runs on real Gemini.** Don't add
other LLM providers.

**Success criteria:** every planted contradiction in the demo cases is caught, with zero
false `contradicted` verdicts on true claims. The demo ends on a red claim: clicking it
jumps the video to the moment. A gray `not_visible` claim is shown on purpose, as the
"it never guesses" beat.

### Scope changes from the original plan (already decided; don't revisit)

| Original | Now | Why |
|---|---|---|
| 36 h, 2–5 min clips | 24 h, 30 s clips | Time, token cost, demo pacing |
| WhisperX + pyannote transcription, then transcript-cue alignment | Dropped. Gemini hears the audio directly | Removes the hardest integration |
| Per-segment VLM captions | Dropped. Gemini watches the whole 30 s clip | Fits in one call |
| MediaPipe Pose | YOLO pose + ByteTrack (`yolo11n-pose`) | Multi-person, occluded, shaky footage; stable IDs |
| "Require pose/transcript support before a red verdict" | Skeptic re-check on a clean window | Pose can't see everything |
| SQLite / Tiger Data | JSON on disk in `data/cache/` | Hackathon scale |
| Live processing | Precompute and cache `result.json`; the UI only reads the cache | Demo survives API or Wi-Fi failure |

**Out of scope:** auth, databases, multi-camera sync, long footage, deployment, a
transcription pipeline.

**Limitations to state honestly in the pitch:**
- 2D pose can't judge motion toward the camera.
- Camera shake makes "running" unreliable, so it's omitted.
- Gemini timestamps are approximate (±1–2 s), so the UI seeks 2 s early.

---

## 2. Environment and gotchas

- **Repo:** `C:\Users\kyley\code\bodycam-discrepancy`. Remote `origin`, default branch `main`.
- Windows 11, PowerShell, Python 3.11. The venv is `backend/.venv`; run backend commands
  from `backend/` with it active (`.\.venv\Scripts\Activate.ps1`).
- ffmpeg, ffprobe and ffplay 9.0.2 are on PATH. `drawtext` segfaults because fontconfig
  is missing, so avoid it.
- Installed in the venv: google-genai 2.25.0, ultralytics 8.4.163, starlette 1.7.0,
  fastapi, pydantic 2, opencv, torch (CPU), `lap` 0.5.13.
- `huggingface_hub` 2.0 (the `hf` CLI) is installed in the **global** Python 3.11, not the venv.
- `yolo11n-pose.pt` is downloaded into `backend/` and gitignored.
- **There's no Gemini API key yet.** `backend/.env` still has the placeholder, so
  everything runs on the mock.
- **google-genai 2.x gotcha:** never chain `genai.Client().models...`. The temporary
  client gets garbage-collected and closes its connection. `gemini.py` already keeps a
  module-level client (`_c()`).
- **Tooling gotchas for Claude sessions:**
  - The Bash tool's cwd resets after every call, so use absolute paths.
  - Bash heredocs feeding `python -` mangle backslashes: `\\` becomes `\`, and one run
    wrote a NUL byte into a source file. Use the Edit/Write tools for code that contains
    backslashes or escape sequences.
  - Edit requires a Read of the file first in the same session.
  - Git warns about LF→CRLF on commit; that's harmless.

---

## 3. Repo layout (current)

```
bodycam-discrepancy/
  README.md                 setup + commands (updated for mock mode + fetch_clips)
  docs/HANDOFF.md           this file
  backend/
    requirements.txt        fastapi, uvicorn, python-multipart, python-dotenv, pydantic, google-genai,
                            ultralytics, numpy, lap   (pytest/httpx NOT yet added; Task 4)
    .env.example            LLM_BACKEND (commented), GEMINI_API_KEY placeholder, GEMINI_MODEL=gemini-2.5-flash,
                            GEMINI_VIDEO=annotated, POSE_MODEL=yolo11n-pose.pt
    app/
      schema.py             pydantic contract (mirrored in shared/types.ts AND frontend/src/lib/types.ts)
      video.py              ffmpeg: normalize, mux_annotated, extract_frame, cut_window, duration
      pose.py               YOLO pose + ByteTrack -> PoseEvent intervals + annotated_raw.mp4 (5 fps)
      gemini.py             extract_claims, verify_claims, skeptic (structured output; untested; no key yet)
      llm.py                NEW: backend dispatch (mock|gemini) + cache_tag()
      mock_llm.py           NEW: fixture-replay / keyword-classifier mock
      pipeline.py           orchestration + cache; CLI
      main.py               FastAPI: POST /analyze, GET /cases, GET /cases/{id}, static /media
      eval.py               OLD ground-truth format; runs at import time (Task 2 rewrites it)
      fetch_clips.py        NEW: pulls single videos out of the HF dataset zips via HTTP Range
  shared/types.ts           TS mirror of schema.py
  frontend/                 Next.js skeleton (another teammate owns it); src/lib/types.ts is a copy of shared/types.ts
  data/
    clips/                  gitignored; copa184.mp4 lives here locally
    reports/copa184.txt     fictional report (committed)
    ground_truth/copa184.json   DRAFT labels (committed)
    cache/<case_id>/        gitignored; clip.mp4, annotated_raw.mp4, annotated.mp4, frames/*.jpg, win_*.mp4, result.json
    hf/                     gitignored; the user's local copy of the full eval set (71 videos)
```

---

## 4. Invariants (do not break)

- `schema.py` is the contract. Any change must land in `shared/types.ts` **and**
  `frontend/src/lib/types.ts` in the same commit; the two TS files are currently identical.
- Models sent to Gemini as `response_schema` (`Claim`, `ModelVerdict`, `SkepticCheck`)
  must have **no default values**. Nullable fields are `Optional[X]` with no default.
- Subjective claims are always `not_visible`. `pipeline.run` enforces this after
  verification, whichever backend runs.
- Every claim gets exactly one result, even if the LLM omits it. The pipeline fills in
  `not_visible` with "Model returned no verdict."
- UI copy says "discrepancy", never "lie" or "false". The Gemini prompts also forbid those words.
- Media URLs in results are relative (`/media/<case_id>/...`); the frontend prefixes the API base.
- Use `pathlib` and `subprocess` with arg lists everywhere. No `shell=True`. Must work on Windows.
- Never commit clips, cache, `.env`, `*.pt`, or `data/hf/`.
- Working style:
  - Make small commits, one per task.
  - Once Task 4 exists, run `pytest -q` before each commit.
  - When a design choice is ambiguous, pick the demo-safe option (cached, offline-capable,
    conservative verdicts) and note it in the commit message.
  - Commit messages end with a `Co-Authored-By` line.

---

## 5. Pipeline (`pipeline.run(video_src, report_text, force=False, fixture=None)`)

1. `video.normalize` trims to 30 s and scales to **at most** 720p (it never upscales;
   the COPA sources are 480p). Output is H.264/AAC with faststart → `clip.mp4`.
2. `pose.analyze` runs YOLO pose + ByteTrack at 5 fps and emits `PoseEvent`s
   (`hands_raised`, `arm_extended`, `hand_at_waist`, `lying_down`) plus
   `annotated_raw.mp4`. `video.mux_annotated` re-encodes that to H.264 and copies in the
   original audio → `annotated.mp4`. Verified: clip and annotated durations are both
   exactly 30.000 s.
3. `llm.extract_claims(report_text, fixture)`.
4. `llm.verify_claims(video, claims, events, fixture=fixture)`. The video is the annotated
   one unless `GEMINI_VIDEO=original`.
5. Per claim:
   - Missing verdict → `not_visible`.
   - Subjective → `not_visible`.
   - **NEW:** `contradicted` with `timestamp_sec=None` → `not_visible` + `downgraded=True`.
     Previously this skipped the skeptic gate and stayed red.
   - Pose events within ±2 s of the timestamp are attached, filtered to
     `person_track_id` when it's set.
   - Red-verdict gate: cut a 10 s window around t from the clean clip and call
     `llm.skeptic`. If it isn't confirmed → `not_visible` + `downgraded=True`.
   - Evidence frames are extracted at t−1, t and t+1.
6. `result.json` is written as an `AnalysisResult`, which now includes
   `llm_backend: "mock" | "gemini"`.

**Cache key:**
`sha256(cache_tag + b"\0" + report_text + video_bytes)[:12]`, where `cache_tag` is
`"gemini"`, `"mock:<sha of fixture file>"` or `"mock:none"`. So a mock run never serves a
Gemini result, and mock runs with and without a fixture don't collide. `--force`
bypasses the cache. Known gap: changing `POSE_MODEL`, the pose thresholds or
`GEMINI_VIDEO` doesn't change the key, so use `--force`.

**LLM backend selection (`llm.backend()`):** `LLM_BACKEND=mock|gemini` wins. When unset,
it's `gemini` only if `GEMINI_API_KEY` is set and not the placeholder
`paste-key-from-aistudio.google.com`; otherwise `mock`. Any other value raises
`ValueError`. `gemini.py` is imported lazily, only when that backend is used.

**Mock (`mock_llm.py`):**
- With a fixture, `extract_claims` builds claims `c1..cn` from `fixture.claims`, and
  `verify_claims` replays `expected`, `timestamp_sec` and `person_track_id` with reason
  `"[mock] " + note`. Matching is on exact claim text.
- Without a fixture, the report is split on `.!?` and each sentence classified.
  Subjective keywords (appeared, seemed, felt, feared, believed) are checked **before**
  speech verbs (said, stated, ordered, yelled, told, asked, requested, shouted →
  audio); everything else is visual. All verdicts are `not_visible` with no timestamp.
- `skeptic` always returns `confirmed=True`, reason `"[mock]"`. The downgrade path is
  therefore untested in mock mode; Task 4 should cover it with a monkeypatch.

**Interfaces:**
- **CLI:** `python -m app.pipeline <clip> <report> [--force] [--fixture PATH | --no-fixture]`.
  With neither flag, `data/ground_truth/<report_stem>.json` is used if it exists. The
  CLI prints the backend and fixture in use.
- **API:** `POST /analyze` takes a multipart `video`, a `report_text`, optional `force`,
  and an optional `fixture_name`. `fixture_name` is a bare name (`copa184` or
  `copa184.json`), resolved inside `data/ground_truth/`; a missing name or a path
  attempt returns 400. `GET /cases` still returns bare ids (Task 5 changes that).
  `GET /cases/{id}` returns 404 when the case is unknown.

---

## 6. Data: BodyCam-VQA dataset + the copa184 demo case

**Source:** Hugging Face `BodyCam-VQA/BWC-VideoText-359`, real Chicago COPA (Civilian
Office of Police Accountability) public-record bodycam footage in 1-minute segments.
There's no explicit open license; the README says it's subject to COPA public-disclosure
terms and asks for ethical use with no person identification. Files:
- `eval_videos.zip`: 916 MB, 71 videos named `eval_videos/videoN.mp4`, 480–540p H.264 +
  AAC, ~60 s each, all with audio.
- `train_videos.zip`: 3.8 GB, 288 videos.
- `eval_transcripts.zip`: WhisperX transcripts named
  `eval_transcripts/VideoNTranscript_timestamped.txt`, with lines like
  `[00:00:03.256 --> 00:00:05.760] [Unknown]` followed by the text.
- `human_annotated_ground_truth_eval_set.json`: keyed `"videoN"`, with fields
  `important_details`, `visual_enrichment_details`, `auxiliary_details` and `transcript`.
  These are human-written descriptions. They are **not** police reports and **not**
  claim verdicts.

**Caution:** COPA mostly releases footage of shootings and serious force, so many clips
are graphic. The plan requires non-graphic demo clips. Check each candidate visually
(contact sheets: `ffmpeg -t 30 -i X -vf "fps=1/3,scale=384:-2,tile=5x2" -frames:v 1 out.jpg`).

**Getting it:**
- Demo clips only: from `backend/`, run `python -m app.fetch_clips [name]`. It reads
  single zip members with HTTP Range requests, ~12–20 MB each, and is verified to give
  byte-identical output. The case registry is the `CLIPS` dict in `fetch_clips.py`
  (`"copa184": ("eval_videos.zip", "eval_videos/video184.mp4")`). Add entries there for
  new cases; the case name must match the `data/reports/` and `data/ground_truth/` stems.
- The whole eval set, for browsing: from the repo root, run
  `hf download BodyCam-VQA/BWC-VideoText-359 eval_videos.zip human_annotated_ground_truth_eval_set.json eval_transcripts.zip --repo-type dataset --local-dir data\hf`,
  then `Expand-Archive`. The user has already done this: `data/hf/eval_videos/` holds all
  71 videos. To browse them in a browser with audio:
  `python -m http.server 8001 -d data\hf\eval_videos`.

**Screened so far:**

| Video | Verdict |
|---|---|
| `video184` | **Chosen** as case `copa184`. Daylight, non-graphic, civilian's face already blurred, steady camera. The subject (white t-shirt) stands handcuffed beside a black SUV's driver door for the whole first 30 s; officers stand around him; an officer handles the cuffs at ~22–29 s. |
| `video41` | Rejected: dark, and shows an injured shirtless person on the ground. |
| `video198` | Rejected: all dashboard and laptop, no people. |
| `video321`, `video283`, `video61`, `video289`, `video190`, `video241`, `video280` | Flagged by keyword scan only, not watched. Mostly driving, searches or crashes, so likely poor fits. |

**copa184 transcript highlights (WhisperX, seconds):**

| Time (s) | Line |
|---|---|
| 3.26–5.76 | "One of y'all unloosen this one right here." |
| 6.3–11.0 | "1441 on Lawndale..." |
| 12.07–15.10 | "I'll start the magazine over there to tape that whole area off." |
| 15.36–17.04 | "He's got the magazine, the whole block." |
| 18.9–26.2 | "All right, there's Sergeant with tape for 1441 on Lawndale and also shell casing at 1448 on Lawndale." |
| 26.23–28.22 | "1400 block of Lawndale needs taped off." |

The clip audio is quiet (mean −30 dB).

**copa184 report (`data/reports/copa184.txt`, fictional, 11 sentences → 11 claims):**

| # | Claim | Expected | t (s) |
|---|---|---|---|
| c1 | responded to 1400 block of Lawndale (audio) | supported | 26.5 |
| c2 | subject standing at driver's side of black SUV, cuffed behind back | supported | 2.0 |
| c3 | several officers standing around subject | supported | 8.0 |
| c4 | **asked another officer to TIGHTEN the handcuffs** (audio; audio says "unloosen") | **contradicted** | 4.5 |
| c5 | officers discussed a magazine (audio) | supported | 13.5 |
| c6 | subject appeared agitated and uncooperative | not_visible (subjective) | – |
| c7 | **subject dropped to the ground and had to be lifted** (stands throughout) | **contradicted** | 15.0 |
| c8 | sergeant arrived with tape (audio) | supported | 19.5 |
| c9 | **subject pulled away when officers checked his cuffs** (stays still) | **contradicted** | 25.0 |
| c10 | I feared the subject might try to run | not_visible (subjective) | – |
| c11 | before camera activated, subject discarded a magazine | not_visible (pre-recording) | – |

**The ground truth is a DRAFT.** It was labeled from 1 fps contact sheets and the
WhisperX timestamps. The JSON carries a `"status": "DRAFT..."` field and extra
`"source"`/`"status"` keys beyond the spec format; the code ignores unknown keys. **A
human must watch the clip, confirm the timestamps, and then remove `status`.** All
`person_track_id`s are `null`; see pose observations below.

**Ethics notes:**
- The report names the real block (1400 Lawndale) because the audio says it.
- The footage relates to a firearm/shell-casing incident but isn't graphic.
- The UI must label reports as fictional.
- Confirm with the team that they're comfortable with this clip.

**Current cache (local only):**
- `data/cache/43227c65bd49/`: mock backend + copa184 fixture (3 red, 5 green, 3 gray).
- `data/cache/7bc15ea490ca/`: mock backend, no fixture (all `not_visible`).

---

## 7. Done so far (branch `task1-llm-mock`, NOT pushed, NOT merged)

```
2b74f73 Ignore data/hf/ (local copy of the BodyCam-VQA dataset)
5f659d3 Task 1: LLM backend abstraction + mock mode
8c25df6 Add copa184 demo case and clip fetcher
884a1dd Next.js skeleton                       (origin/main)
d5f9d92 Scaffold: pipeline, pose, Gemini, schema
```

**Task 1 is complete and verified end to end with no key:**
- `python -m app.pipeline ..\data\clips\copa184.mp4 ..\data\reports\copa184.txt` runs in
  26 s on CPU. It produces 11/11 results, 24 evidence frames (8 timestamped claims × 3)
  and 10 pose events.
- Uvicorn serves the result:
  - `/cases` lists the case, and `/cases/<id>` returns it.
  - An unknown id returns 404.
  - Evidence frames come back 200 as image/jpeg.
  - A path-traversal `fixture_name` returns 400.
  - Re-posting the same clip, report and fixture hits the CLI's cache entry, so the keys
    are consistent.
- **The `/media` Range request returns 206**, so Task 5's Range check is already satisfied
  by Starlette's StaticFiles.
- Other changes in these commits:
  - `llm_backend` added to the schema and both TS files.
  - `lap` added to requirements.
  - `normalize` no longer upscales.
  - README documents mock mode, `fetch_clips` and the dataset source.
  - `.gitignore` ignores `data/hf/`.

---

## 8. Still to do (priority order)

### Task 2: rewrite `eval.py` for the new ground-truth format
- The current `eval.py` reads the OLD format (a list of `{quote, expected}`) and **runs
  at module import**. Wrap it in `main()` / `if __name__ == "__main__"`, with a pure
  scoring function that Task 4 tests can import.
- The new format is `{"report": ..., "claims": [{text, claim_type, actor, action,
  expected, timestamp_sec, person_track_id, note}]}`. Tolerate extra keys (`source`,
  `status`).
- Match each ground-truth claim to result claims by normalized substring, in either
  direction and case-insensitively. Normalize by lowercasing, collapsing whitespace and
  stripping punctuation.
- Print OK/MISS per claim, then a summary:
  - planted contradictions caught X/Y
  - false reds: `contradicted` on a claim expected `supported` or `not_visible`
  - unmatched claims
  - mean absolute timestamp error over matched claims where both sides have a timestamp
- Exit code 1 on any false red.
- CLI: `python -m app.eval <case_id> ..\data\ground_truth\copa184.json`.
- Sanity check: on `43227c65bd49` (the mock + fixture case) it should score 3/3 caught,
  0 false reds and 0 s timestamp error.
- Suggestion: print a warning when the result's `llm_backend` is `mock`, since that
  score is trivially perfect.

### Task 3: pose debugging and tuning
- `python -m app.pose <clip> --debug <out_dir>` should write `features.csv`, one row per
  (frame time, track_id), with:
  - both elbow angles
  - wrist-to-shoulder-y deltas normalized by shoulder width
  - wrist-to-hip distance / torso length
  - torso angle from vertical
  - keypoint confidences
  - flags fired
- Refactor `frame_flags` to return the measurements plus the flags, so the CSV and the
  tests share one code path.
- Draw active flags next to each person's box in the annotated video (e.g. `id:2
  hands_raised`). `r.plot()` draws the boxes; add text with `cv2.putText`, **not** ffmpeg
  drawtext (it segfaults here).
- Move thresholds to module-level constants: `KP_CONF=0.5`, `HANDS_RAISED_MARGIN`,
  `ARM_EXTENDED_ANGLE=150`, `ARM_EXTENDED_REACH=1.2`, `WAIST_DIST=0.35`, lying-down ratio,
  `MIN_DUR=0.4`, gap factor 1.5.
- Wearer's-arms filter: besides requiring both shoulders, drop detections whose box
  touches the bottom frame edge and have no confident nose or shoulders.
- `POSE_MODEL` is already read from env. Try `yolo26n-pose.pt`; if it loads in
  Ultralytics 8.4, compare its event counts against `yolo11n-pose.pt` on copa184.
- **Observations from the copa184 run:**
  - 10 events, 9 of them `hand_at_waist` and 1 `arm_extended`, over tracks 2, 4, 7, 16,
    27 and 31. No `lying_down`, which is consistent with c7.
  - At 12 s the **subject is `id:17`**. Track 2 is an **officer resting his hands on his
    duty belt**, so `hand_at_waist` fires on officers' resting hands.
  - The subject's hands are cuffed behind his back and don't trigger anything.
  - Track IDs fragment across the clip: about 6 IDs for 4–5 people.
  - Consider tightening `hand_at_waist`, or requiring a hand to be in front of the torso.
  - Once IDs are understood, fill `person_track_id` into copa184.json where it's stable.

### Task 4: tests (pytest)
- Add `pytest` and `httpx` to `requirements.txt`.
- `tests/conftest.py`:
  - Session fixture: a 10 s synthetic clip with a tone, via ffmpeg lavfi
    `testsrc=size=1280x720:rate=30` + `sine`, in `tmp_path_factory`.
  - **Set `DATA_DIR` to a tmp directory BEFORE importing `app.pipeline` / `app.main`**.
    Both compute `CACHE` at import, and `main.py` mounts `/media` at import. Otherwise
    tests write into the real `data/cache`.
- `test_video.py`:
  - `normalize` trims to ≤30 s (feed a >30 s clip or pass `max_seconds`).
  - `mux_annotated` keeps audio.
  - `cut_window` duration.
  - `extract_frame` writes a non-empty jpg.
- `test_pose_features.py`:
  - Synthetic keypoint arrays for each flag, positive and negative cases.
  - `_to_intervals` gap and min-duration behavior.
  - No YOLO.
- `test_api.py`:
  - `TestClient` with `LLM_BACKEND=mock`; monkeypatch `pose.analyze` to return fixed
    events plus a raw video (e.g. copy the clip).
  - POST /analyze → 200 with a valid `AnalysisResult`.
  - GET /cases lists it.
  - An unknown case → 404.
  - A bad `fixture_name` → 400.
- `test_invariants.py`:
  - Every claim has exactly one result, even when the LLM omits one: monkeypatch
    verify to drop a claim.
  - Subjective claims are always `not_visible`, even when the LLM says otherwise.
  - Gemini-facing models have no field defaults: check
    `model_fields[f].is_required()` for `Claim`, `ModelVerdict` and `SkepticCheck`.
  - **Add:** a skeptic returning `confirmed=False` → `not_visible` + `downgraded=True`.
  - **Add:** a contradicted verdict with no timestamp → downgraded.
  - **Add:** cache-key separation between mock with a fixture, mock without, and gemini.

### Task 5: API polish
- `GET /cases` should return `[{case_id, report_name, created_at, llm_backend,
  n_contradicted}]`. Store `report_name` and `created_at` in `AnalysisResult`, and
  update both TS files. `report_name` comes from the CLI report path stem; the API needs
  a `report_name` form field or a default like "upload".
- Validate uploads: allow only mp4/mov/webm, reject files over 200 MB, and return a 400
  JSON body.
- Turn pipeline exceptions (ffmpeg `RuntimeError`, LLM parse failure) into a 500 with
  JSON `{"detail": "..."}` and log the full traceback.
- Range support: **already verified as 206.** Nothing to do beyond an optional test.

### Task 6: demo seeding script
- `python -m app.seed` runs the pipeline for every `data/reports/*.txt` that has a
  matching `data/clips/<stem>.mp4`.
- It prints a table of case_id, name, contradicted/supported/not_visible counts, and the
  eval result when ground truth exists.
- **Add:** warn loudly (or refuse without `--allow-mock`) when `llm.backend()` is `mock`,
  so nobody pre-caches mock results for the demo.
- Use it to pre-cache every demo case before judging.

### When the Gemini key arrives
- Put the key in `backend/.env`. `llm.backend()` then auto-selects gemini.
- Check `GEMINI_MODEL` (currently `gemini-2.5-flash`) against the models available in AI
  Studio, and pick the best current video model.
- Run copa184 with `--force` and then `app.eval`. Iterate on the prompts in `gemini.py`
  until all 3 planted contradictions are caught with 0 false reds; eval's exit code gates
  this.
- Things to watch:
  - **c4** is an audio contradiction ("tighten" vs "unloosen"). It tests whether Gemini
    uses the audio.
  - **c9** is subtle: a slight movement could read as "pulled away".
  - **c1** mixes "I responded" with a location that's only heard.
- Inline video bytes are fine under ~20 MB. The annotated 480p 30 s clip is small.
- `verify_claims` sends `fps=5`; `skeptic` sends `fps=10` on the 10 s window.
- Compare `GEMINI_VIDEO=annotated` against `original` on copa184.

### More demo cases
- The plan calls for 2–3 cases, each with 3–4 planted contradictions, at least one
  subjective claim, and non-graphic footage.
- Browse the rest of `data/hf/eval_videos/`. The best candidates show people interacting
  in daylight with a steady camera, so pose has something to say: hands up, someone on
  the ground, an arm extended.
- For each new case:
  - Add it to `CLIPS` in `fetch_clips.py`.
  - Write `data/reports/<name>.txt`, with each claim as a sentence whose text is an
    exact substring of the report.
  - Write `data/ground_truth/<name>.json` after a human watches the clip.

### Housekeeping
- Push `task1-llm-mock` and open a PR, or merge to `main`, whichever the team prefers.
  The README says schema changes go "via PR only", and this branch changes the schema.
- The frontend owner must know that `AnalysisResult.llm_backend` exists; the frontend
  copy of the types is already updated.

---

## 9. Handy commands

```powershell
# from backend/ with the venv active
python -m app.fetch_clips                                   # demo clips -> data/clips/
python -m app.pose ..\data\clips\copa184.mp4
python -m app.pipeline ..\data\clips\copa184.mp4 ..\data\reports\copa184.txt [--force] [--fixture ..\data\ground_truth\copa184.json | --no-fixture]
python -m app.eval 43227c65bd49 ..\data\ground_truth\copa184.json    # after Task 2
uvicorn app.main:app --reload --port 8000                   # /docs for Swagger
pytest -q                                                   # after Task 4

# watch footage (from repo root)
ffplay -ss 3 data\clips\copa184.mp4                         # space=pause, .=step frame
python -m http.server 8001 -d data\hf\eval_videos           # browse all 71 with audio at http://localhost:8001
```

# EvidenceLens (bodycam-discrepancy)

**Hack the Hill III · Civic Tech · Team: Artem, Lucas, Ayan, Kyle**

EvidenceLens turns a written incident narrative and bodycam-style footage into a claim-by-claim
evidence map, helping defence-side legal teams find the moments that deserve close human review.

> **No claim without a source. No source without a timestamp. No certainty when footage is unclear.**

This is a hackathon prototype using publicly released bodycam footage and a team-written report. It surfaces source-linked review questions; it does not
make legal conclusions. Human review is always required.

## Project context

The team's source of truth lives in [`context/`](context/README.md). Read
[`context/main.md`](context/main.md) before changing scope, and `mvp.md`, `stack.md`, and
`skeleton.md` before building. `safety.md` and `positioning.md` are guardrails for all UI copy
and pitch claims. The build plan, workflow and status are in [`docs/PLAN.md`](docs/PLAN.md).

## Quick start: analyze your own clip

You only need the backend and the frontend running. Requirements: Python 3.11+, Node 20+, FFmpeg
on `PATH`, and `GOOGLE_API_KEY` (Vertex AI) in `backend/.env`. `ELEVENLABS_API_KEY` is optional
and adds a timed transcript.

    cd backend
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

    cd frontend
    npm install
    npm run dev                 # http://localhost:3000/new

On `/new`, choose an MP4/MOV clip (90 s or less), paste the report or attach a `.txt`, and click
Analyze. The frontend sends `POST /cases`; the backend runs the analysis as a background job
(about 2 to 5 minutes) while the page polls `GET /cases/{case}/job`, then opens the ledger.
Uploads must be publicly released footage (`context/safety.md`).

## Claims pipeline (claim-evidence ledger)

The demo cases (`sfst1`, `sfst2`, `gunpoint`, `porch`, `hospital`, `parkedcar`; see `docs/CLIPS.md`) are prepared from the command line and replayed from cache.
From `backend/`, with `GOOGLE_API_KEY` in `backend/.env`:

    python -m app.fetch_clips           # demo clips -> data/clips/
    python -m app.cases sfst2           # report vs. footage -> data/cases/sfst2/result.json, then scored
    python -m app.evaluate sfst2        # re-score the latest result against data/ground_truth/sfst2.json

The API serves results at `GET /cases` and `GET /cases/{case}`, media under `/case-media/`.
`POST /cases` and `GET /cases/{case}/job` run the same pipeline on an upload.
Details and tuning knobs: [`docs/PLAN.md`](docs/PLAN.md).

## Current state of the repo

The code in `backend/`, `frontend/` and `shared/` is the **original scaffold** (commit `d5f9d92`),
built before the direction in `context/` was agreed. Where they disagree, **`context/` wins**;
the scaffold is kept runnable until it is replaced.

| Topic | Scaffold (current code) | Target (`context/`) |
|---|---|---|
| Vision layer | Event API: Gemini only. Claims pipeline: Gemini + YOLO pose (`app/pose.py`) | Gemini + YOLO pose (offline Python preprocessing) as frame-level evidence for physical claims (`stack.md`) |
| Backend | Python FastAPI on :8000 | Next.js route handler `POST /api/analyze` (`backend.md`) |
| Result states | Event API: `retained` / `uncertain` / `dismissed`. Claims pipeline: the 4 approved states (`app/ledger.py`) | 4 approved states, amber for review, no "contradiction" (`frontend.md`) |
| Claim types | Claims pipeline: `visual` / `audio` / `documentary` / `subjective_or_legal`. Event API: none | `visual` / `audio` / `documentary` / `subjective_or_legal` |
| API key | Required (Vertex AI `GOOGLE_API_KEY`) | App must run without one; mock/cached analysis by default (`mvp.md`) |
| Secrets file | `backend/.env` | `.env.local` (`backend.md`) |

Migrating means following the build order in [`context/skeleton.md`](context/skeleton.md), then
logging the change in [`context/decisions.md`](context/decisions.md).

## Legacy scaffold setup

Gemini-only event discovery, matching the two-pass pipeline diagram. No reports or claim comparison.

### Backend (PowerShell)
    cd backend
    py -3.11 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements-dev.txt
    copy .env.example .env      # add GOOGLE_API_KEY (Vertex AI key, see context/backend.md)
    python smoke_test.py        # one Vertex AI call; prints status + reply, never the key
    uvicorn app.main:app --reload --port 8000                           # http://localhost:8000/docs

Tests (from the repo root): `python -m unittest backend/tests/test_pipeline.py -v`

### Frontend
    cd frontend
    npm run dev                 # http://localhost:3000

## Rules
- `schema.py` and `shared/types.ts` change together, via PR only (while the Python backend exists).
- Clips are not committed; `python -m app.fetch_clips` (from `backend/`) downloads them into
  `data/clips/`. See [`docs/CLIPS.md`](docs/CLIPS.md) to add one.
- Footage must be publicly released by an official source, non-graphic, and cited. Reports are
  team-written and labelled as such. No non-public case material (`context/safety.md`).
- Never commit API keys; `.env` / `.env.local` stay local.
- UI and pitch copy never say lie, false, verdict, guilt, risk score, or contradiction proven.

## Backend reliability and operations

Run one API process per data directory (`uvicorn app.main:app --port 8000`). A file lock prevents a second process from taking over running jobs. Queued work is in memory; restart marks unfinished jobs failed rather than silently resuming them. A normal shutdown retains interrupted uploads for inspection or deletion.

Each upload attempt has a `run_id`. Stop/delete clients should send `?run_id=...` to avoid acting on a newer upload with the same case name. `POST /cases/{case}/stop` cancels queued jobs immediately and requests cancellation of running jobs. A processing response means deletion is pending; keep polling until the job returns 404. A locked file produces an explicit deletion failure that can be retried. `DELETE /cases/{case}` and `DELETE /analyses/{id}` also remove completed or failed uploads and their artifacts. Closing a tab still only hides the tab; the queue's Delete action removes the files.

`GET /case-jobs` remains active-only for compatibility. Use `?include_finished=true` to recover completed and failed jobs after refreshing. Job responses include `updated_at`, `heartbeat_at`, `cancellation_requested`, and `progress_kind: "estimate"`. The heartbeat indicates worker liveness, not measured model progress. Upload bytes are reported separately by the browser; model stages use estimated milestones.

Incoming multipart requests are bounded before disk spooling, with 1 MiB allowance for report/headers beyond `MAX_UPLOAD_MB`. Video bytes and report text are separately checked. Model copies are re-encoded and size-checked against the inline byte limit. Configure `FFMPEG_TIMEOUT_SEC` (300), `API_TIMEOUT_SEC` (60 per network attempt), and `ANALYSIS_TIMEOUT_SEC` (1800 for a running job). FFmpeg is cancellable during execution; synchronous network calls and pose inference stop at operation boundaries. Model retries check cancellation between attempts. This is a local single-worker service, not a durable distributed job queue.

Run backend regressions from the repository root:

    .\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v

The suite mocks paid model services and exercises cancellation races, replacement uploads, Windows read retries, atomic results, recoverable deletion errors, incoming upload limits, and actual subprocess cancellation/timeouts.

### Preparation progress, Windows deletion, and Home navigation

Preparation now reports normalization, local pose-model loading, tracker startup, pose frames, and overlay encoding separately. FFmpeg stages report processed timestamps rather than waiting until they exit. Pose weights resolve relative to `backend/` (or an absolute `POSE_MODEL` path); a missing model fails explicitly rather than silently downloading during analysis. Install the local weights before starting analysis. The overall percentage remains an estimate; a live heartbeat does not mean a model step is advancing.

Windows/OneDrive may set the read-only attribute on case directories as well as files. Deletion clears that attribute only inside the validated case directory when Windows rejects deletion, then retries. Genuine sharing or access errors remain visible. The browser releases the case's video playback request before deletion. Previously failed deletions can be retried using Delete.

Home (`/`) is now a case overview with the active queue, failed jobs, and completed cases. It no longer redirects into the default case, so leaving the upload page has a stable destination. Running analyses continue on the server.

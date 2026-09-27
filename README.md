# evidently (bodycam-discrepancy)

**Hack the Hill III · Civic Tech · Team: Artem, Lucas, Ayan, Kyle**

**Live: [evidently.work](https://evidently.work)**

evidently checks a written police report against body-worn camera footage, one claim at a time, and takes
defence-side legal teams to the moments that deserve a closer look.

> **No claim without a source. No source without a timestamp. No certainty when footage is unclear.**

This is a hackathon prototype. It surfaces source-linked review questions; it does not make legal conclusions,
and human review is always required. Demo reports are fictional and written by the team; demo footage is
publicly released body-worn camera video, credited on each case.

## Try it

| | |
|---|---|
| [evidently.work](https://evidently.work) | Landing page |
| [evidently.work/cases/sfst2](https://evidently.work/cases/sfst2) | A finished demo case: report, footage and findings side by side |
| [evidently.work/cases](https://evidently.work/cases) | All cases: demo examples and your uploads |
| [evidently.work/new](https://evidently.work/new) | Upload a video (MP4/MOV or a YouTube link) and its report, then follow the analysis |

Only upload publicly released footage (`context/safety.md`). Uploads are sent to Gemini on Vertex AI for analysis,
and their audio to ElevenLabs for a transcript when the server has that key.

## What you get

Every sentence of the report's narrative becomes a claim, and every claim gets one of four statuses, with the time
window and frames it relied on:

| Status | Meaning |
|---|---|
| **Potential inconsistency, review recommended** | The footage appears incompatible with the claim, and an independent re-check agreed. |
| **Consistent** | The footage visibly or audibly matches the claim. |
| **Insufficient footage** | The camera can't establish it: off-screen, dark, too far, too small. Not evidence it didn't happen. |
| **Outside assessment** | An opinion, a sensation or a legal conclusion, which the tool deliberately doesn't judge. |

A false flag is the worst failure, so anything uncertain ends up as insufficient footage.

## How it works

For each case (`backend/app/cases.py`):

1. **Prepare the footage.** FFmpeg normalizes the clip.
2. **Measure body pose.** YOLO11 pose estimation finds 17 keypoints per person at 10 fps, and ByteTrack follows
   each person between frames. Movements (arm out, hand to face, head tilted, foot raised…) become timed events,
   and an overlay video with a burned-in clock is made for the model (`pose.py`).
3. **Transcribe the audio** with ElevenLabs Scribe: word timings and speakers (`transcribe.py`). Optional; skipped
   without a key.
4. **Split the report into claims**, typed visual, audio, documentary or opinion/legal (`claims.py`).
5. **Check every claim** with Gemini 3.8 Flash, which watches the video and listens to its audio in one pass,
   alongside the pose events and the transcript. Clips over 90 s are checked in 60 s windows.
6. **Re-check.** A text pass flags any claim whose status doesn't fit its own observation. Every flag, and every
   such claim, gets a second look at a clean, narrow clip at 5 fps that doesn't see the first answer, and that
   look's finding sets the status. If one look says inconsistent and the other consistent, a third look decides.
7. **Build the ledger:** status, time window, observation, re-check notes and evidence frames for every claim
   (`ledger.py`).

The review page (`frontend/`) shows the report with each sentence marked, the footage with the claim's window
on the timeline and an optional pose overlay, and the findings.

## Architecture

| Part | Where | Hosted at |
|---|---|---|
| Frontend: Next.js 16, React 19, Tailwind 4 | `frontend/` | `https://evidently.work` |
| Backend: FastAPI, the analysis pipeline, a single-worker job queue | `backend/` | `https://api.evidently.work` |
| Shared API types (frontend mirror of `backend/app/ledger.py`) | `shared/types.ts` | |
| Team docs: scope, safety rules, positioning | `context/`, `docs/` | |

Main API routes: `GET /cases`, `GET /cases/{case}`, `GET /cases/{case}/summary`, `POST /cases` (upload; starts a background job),
`GET /cases/{case}/job`, `POST /cases/{case}/stop`, `DELETE /cases/{case}`, `GET /case-jobs`, `GET /health`,
and media under `/case-media/`.

## Run it locally

For development only; the live site needs none of this. Requirements: Python 3.11+, Node 20+, FFmpeg on PATH, and a
Vertex AI key.

```powershell
# Backend (from backend/)
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env                  # set GOOGLE_API_KEY (Vertex AI); ELEVENLABS_API_KEY is optional
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
npm install
npm run dev                             # http://localhost:3000
```

The frontend reads the API address from `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`, see
`frontend/.env.example`). The backend only accepts browser requests from `FRONTEND_ORIGIN` (default
`http://localhost:3000`). The pose model loads from `POSE_MODEL` (default `backend/yolo11n-pose.pt`). Install the
weights before the first analysis; they are not downloaded mid-run.

### Demo cases and scoring

The demo cases (`sfst1`, `sfst2`, `gunpoint`, `porch`, `hospital`, `parkedcar`) are prepared from the command line.
Clips are never committed; `fetch_clips` re-downloads the exact sections (see `docs/CLIPS.md`). From `backend/`:

```powershell
python -m app.fetch_clips             # data/clips/<case>.mp4
python -m app.cases sfst2             # analyze -> data/cases/sfst2/result.json, then score it
python -m app.evaluate sfst2          # re-score against data/ground_truth/sfst2.json
```

Reports are in `data/reports/`, answer keys in `data/ground_truth/`. Results in `data/cases/` stay on the machine
that made them.

### Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | (required) | Vertex AI key |
| `GEMINI_MODEL` / `CLAIMS_MODEL` | `gemini-3.8-flash` | Model for the claim checks |
| `ELEVENLABS_API_KEY` | (none) | Enables the timed transcript |
| `CHECK_FPS` / `SECOND_LOOK_FPS` | `2` / `5` | Frames per second sent for the check and the re-check |
| `POSE_MODEL` / `POSE_FPS` | `yolo11n-pose.pt` / `10` | Pose weights and sampling rate |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed browser origin (CORS) |
| `DATA_DIR` | `data/` | Where clips, cases and uploads live |
| `MAX_UPLOAD_MB` | `2048` | Upload size limit |
| `FFMPEG_TIMEOUT_SEC` / `API_TIMEOUT_SEC` / `ANALYSIS_TIMEOUT_SEC` | `300` / `60` / `1800` | Time limits |

### Tests

From the repository root (model services are mocked, so no key is needed):

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

## Operations notes

- Run **one** API process per data directory. A file lock stops a second process from taking over running jobs.
  Jobs queue in memory and run one at a time; a restart marks unfinished jobs as failed rather than resuming them.
- Each upload attempt has a `run_id`. Stop and delete requests should pass `?run_id=…` so they never act on a newer
  upload with the same case name. `GET /case-jobs?include_finished=true` recovers finished and failed jobs after a
  refresh.
- Progress percentages are estimates; the job heartbeat shows the worker is alive, not that a model call is
  advancing.
- On Windows/OneDrive, deletion clears read-only attributes inside the case folder and retries. Genuine sharing
  errors are reported and can be retried.

## Rules

- `backend/app/ledger.py` and `shared/types.ts` change together, in one PR.
- Footage must be publicly released, non-graphic and cited. Reports are team-written and labelled as such. No
  non-public case material (`context/safety.md`).
- Never commit API keys; `.env` files stay local.
- UI and pitch copy never say lie, false, verdict, guilt, risk score or "contradiction proven"
  (`context/frontend.md`).
- Scope and decisions: read `context/main.md` first; decisions are logged in `context/decisions.md`.

`/events` and `app/pipeline.py` are the original Gemini-only event-detection prototype, kept for reference; the
product flow does not use them.

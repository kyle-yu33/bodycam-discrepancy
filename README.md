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
and pitch claims.

## Current state of the repo

The code in `backend/`, `frontend/` and `shared/` is the **original scaffold** (commit `d5f9d92`),
built before the direction in `context/` was agreed. Where they disagree, **`context/` wins**;
the scaffold is kept runnable until it is replaced.

| Topic | Scaffold (current code) | Target (`context/`) |
|---|---|---|
| Vision layer | YOLO pose + tracking fused with Gemini | Gemini only; no YOLO/tracking/pose (`stack.md`) |
| Backend | Python FastAPI on :8000 | Next.js route handler `POST /api/analyze` (`backend.md`) |
| Result states | `supported` / `contradicted` / `not_visible`, red verdicts | 4 approved states, amber for review, no "contradiction" (`frontend.md`) |
| Claim types | `visual` / `audio` / `subjective` | `visual` / `audio` / `documentary` / `subjective_or_legal` |
| API key | Required | App must run without one; mock/cached analysis by default (`mvp.md`) |
| Secrets file | `backend/.env` | `.env.local` (`backend.md`) |

Migrating means following the build order in [`context/skeleton.md`](context/skeleton.md), then
logging the change in [`context/decisions.md`](context/decisions.md).

## Legacy scaffold setup

Pipeline: ffmpeg normalize -> YOLO pose + tracking -> Gemini claim extraction -> Gemini
verification (annotated video + pose events) -> skeptic re-check on red verdicts ->
ffmpeg evidence frames -> cached JSON -> Next.js review UI.

### Backend (PowerShell)
    cd backend
    py -3.11 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    copy .env.example .env      # add GEMINI_API_KEY
    python -m app.pose ..\data\clips\clip1.mp4                          # pose only
    python -m app.pipeline ..\data\clips\clip1.mp4 ..\data\reports\clip1.txt
    python -m app.eval <case_id> ..\data\ground_truth\clip1.json
    uvicorn app.main:app --reload --port 8000                           # http://localhost:8000/docs

### Frontend
    cd frontend
    npm run dev                 # http://localhost:3000

## Rules
- `schema.py` and `shared/types.ts` change together, via PR only (while the Python backend exists).
- Clips are not committed; shared drive -> `data/clips/`.
- Footage must be publicly released by an official source, non-graphic, and cited. Reports are
  team-written and labelled as such. No non-public case material (`context/safety.md`).
- Never commit API keys; `.env` / `.env.local` stay local.
- UI and pitch copy never say lie, false, verdict, guilt, risk score, or contradiction proven.

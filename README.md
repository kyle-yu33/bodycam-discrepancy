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

## Claims pipeline (claim-evidence ledger)

From `backend/`, with `GOOGLE_API_KEY` in `backend/.env`:

    python -m app.fetch_clips           # demo clips -> data/clips/
    python -m app.cases sfst2           # report vs. footage -> data/cases/sfst2/result.json, then scored
    python -m app.evaluate sfst2        # re-score the latest result against data/ground_truth/sfst2.json

The API serves results at `GET /cases` and `GET /cases/{case}`, media under `/case-media/`.
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

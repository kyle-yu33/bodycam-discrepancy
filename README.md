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
| Vision layer | Gemini only, via Vertex AI (YOLO removed in `47efabe`) | Gemini + YOLO pose (offline Python preprocessing) as frame-level evidence for physical claims (`stack.md`) |
| Backend | Python FastAPI on :8000 | Next.js route handler `POST /api/analyze` (`backend.md`) |
| Result states | Event statuses `retained` / `uncertain` / `dismissed` | 4 approved states, amber for review, no "contradiction" (`frontend.md`) |
| Claim types | None yet: event discovery only, no report claims | `visual` / `audio` / `documentary` / `subjective_or_legal` |
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

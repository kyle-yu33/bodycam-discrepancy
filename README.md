# EvidenceLens (bodycam-discrepancy)

**Hack the Hill III · Civic Tech · Team: Artem, Lucas, Ayan, Kyle**

EvidenceLens links the assertions in a team-written incident report to relevant
bodycam footage for human review. It does not make legal conclusions.

> No claim without a source. No source without a timestamp. No certainty when footage is unclear.

## Current implementation

The prototype accepts a report and a short public demo clip, either uploaded as a
file or imported from a public YouTube video:

1. Gemini extracts exact, ordered report excerpts and classifies claim eligibility.
2. For each eligible visual claim, Gemini locates a relevant video window. This is
   localization, not a decision about whether the claim is consistent.
3. FFmpeg cuts the window with surrounding context. Gemini reviews the narrow clip
   and returns observations, source-frame times, limitations, and a review status.
4. The UI shows report claims, video seeking, and a claim–evidence ledger.

The statuses are consistent with visible evidence, potential visual inconsistency
(review recommended), insufficient footage to assess, and outside automated assessment.
Audio, documentary, and subjective/legal claims skip automated visual review.
Missing footage is not treated as evidence of inconsistency.

Gemini runs on Vertex AI using `GOOGLE_API_KEY` from `backend/.env`. Video bytes
are sent inline with each request; clips over 15 MB are rejected. The full demo
clip is used for localization and narrow clips for review. Persisted
report text, footage, and analysis results stay in the local ignored `data/analyses/`
directory. This local development server has no authentication.

The frontend uses Next.js/TypeScript; the backend remains FastAPI/Pydantic. The team's
product direction is in [context/](context/README.md), with the current implementation
checkpoint recorded in [decisions.md](context/decisions.md). The seeded public case,
in-app source attribution, and default mock/cached demo flow are still outstanding.
Live analysis requires an API key and FFmpeg; no claim of completed MVP is made.

## Setup

Use Python 3.11+ and Node.js 20+ with npm. Install FFmpeg (including ffprobe) on your PATH.
The backend requirements include `yt-dlp[default]` for YouTube imports; Node must
also be available to the backend process for YouTube's JavaScript challenges.

### Backend (macOS/Linux)

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Add GOOGLE_API_KEY (Vertex AI) to .env, then:
uvicorn app.main:app --reload --port 8000
```

On Windows, use `py -3.11 -m venv .venv`, `.\.venv\Scripts\Activate.ps1`, and
`copy .env.example .env` for the corresponding steps.

To check Vertex AI credentials with one live text request, run
`python smoke_test.py` from `backend/`.

### Frontend

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and paste a team-written report. Choose **Upload file**
for a public MP4/MOV excerpt, or **YouTube link** and paste a video URL. For YouTube,
set the start/end in seconds (for example, 120–180 for 02:00–03:00). The selected
excerpt must be 1–90 seconds. Then click **Analyze report + video**.

YouTube downloads run in the background before analysis. Regular watch links,
`youtu.be` links, Shorts, and embed links are supported. Playlist-only URLs,
unfinished live streams, and videos requiring sign-in are not supported. YouTube
can block downloads; a failed import offers the file-upload alternative. The
importer does not read browser cookies or your personal yt-dlp configuration.

The downloaded excerpt plays locally. Its evidence timestamps start at zero;
the UI shows the offset into YouTube and links the selected evidence window back
to the source. Results retain `source_url`, `source_title`, and
`source_start_seconds`. Explicit start/end fields take precedence over URL timestamps.
Only use public demo footage; do not submit non-public case evidence. The report is
limited to 12,000 characters and extraction to 30 claims. Review the extracted claims
against the original report: exact-quote validation does not guarantee completeness
or correct eligibility classification.

The API accepts form fields at `POST /analyses`: `report_text` plus exactly one of
multipart `video` or `youtube_url`. YouTube requests also take `start_seconds`
(default 0) and `end_seconds` (default 60). The endpoint returns a queued job
immediately; downloads occur in the worker. Source details are stored in the job's
`source.json` and completed result.
Poll `GET /analyses/{id}` and load `GET /analyses/{id}/result` once complete.
Old event-only results remain on disk but must be re-analyzed with a report to use
the new claim ledger.

## Verification

From the repo root:

```sh
backend/.venv/bin/python -m unittest discover -s backend/tests -v
cd frontend
npm run lint
npm run build
```

Tests use a fake model; they check source quoting, eligibility, abstention,
timestamp conversion/bounds, cleanup, and API lifecycle without sending footage
to Gemini. A live run on the team's chosen clip is still needed to assess model quality.

## Rules

- `backend/app/schema.py` and `shared/types.ts` change together, via PR only.
- Do not commit clips, reports containing non-public data, or API keys.
- Footage must be publicly released by an official source, non-graphic, and cited.
  Reports must be team-written and labeled as such; see `context/safety.md`.
- Human review is always required. Structured output validates shape, not factual accuracy.

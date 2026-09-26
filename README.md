# Bodycam vs. Report Discrepancy Finder

Pipeline: ffmpeg normalize -> YOLO pose + tracking -> Gemini claim extraction -> Gemini
verification (annotated video + pose events) -> skeptic re-check on red verdicts ->
ffmpeg evidence frames -> cached JSON -> Next.js review UI.

## Backend (PowerShell)
    cd backend
    py -3.11 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    copy .env.example .env      # add GEMINI_API_KEY
    python -m app.fetch_clips                                           # demo clips -> data/clips/
    python -m app.pose ..\data\clips\copa184.mp4                        # pose only
    python -m app.pipeline ..\data\clips\copa184.mp4 ..\data\reports\copa184.txt
    python -m app.eval <case_id> ..\data\ground_truth\copa184.json
    uvicorn app.main:app --reload --port 8000                           # http://localhost:8000/docs

## LLM backend
No key yet? The pipeline runs on a mock (`app/mock_llm.py`). With a ground-truth file
(`data/ground_truth/<report_stem>.json`, auto-detected; `--no-fixture` to skip) the mock
replays its labels; without one every claim is `not_visible`. Force a backend with
`LLM_BACKEND=mock|gemini`. Results carry `llm_backend`: never demo a `mock` result.

## Frontend
    cd frontend
    npm run dev                 # http://localhost:3000

## Rules
- schema.py and shared/types.ts change together, via PR only.
- Clips are not committed; `python -m app.fetch_clips` pulls them into data/clips/.
  Source: BodyCam-VQA/BWC-VideoText-359 on Hugging Face (COPA Chicago public records).
- Reports in data/reports/ are fictional and labelled as such.

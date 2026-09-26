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
    python -m app.pose ..\data\clips\clip1.mp4                          # pose only
    python -m app.pipeline ..\data\clips\clip1.mp4 ..\data\reports\clip1.txt
    python -m app.eval <case_id> ..\data\ground_truth\clip1.json
    uvicorn app.main:app --reload --port 8000                           # http://localhost:8000/docs

## Frontend
    cd frontend
    npm run dev                 # http://localhost:3000

## Rules
- schema.py and shared/types.ts change together, via PR only.
- Clips are not committed; shared drive -> data/clips/.
- Reports in data/reports/ are fictional and labelled as such.

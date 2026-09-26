"""FastAPI server.  uvicorn app.main:app --reload --port 8000   (docs at /docs)"""
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .pipeline import CACHE, run
from .schema import AnalysisResult

app = FastAPI(title="Bodycam Discrepancy Finder")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_methods=["*"], allow_headers=["*"])
CACHE.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=CACHE), name="media")


@app.post("/analyze", response_model=AnalysisResult)
def analyze(video: UploadFile = File(...), report_text: str = Form(...), force: bool = Form(False)):
    suffix = Path(video.filename or "clip.mp4").suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(video.file, tmp)
    try:
        return run(Path(tmp.name), report_text, force)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


@app.get("/cases", response_model=list[str])
def list_cases():
    return sorted(p.parent.name for p in CACHE.glob("*/result.json"))


@app.get("/cases/{case_id}", response_model=AnalysisResult)
def get_case(case_id: str):
    p = CACHE / case_id / "result.json"
    if not p.exists():
        raise HTTPException(404, "unknown case")
    return AnalysisResult.model_validate_json(p.read_text(encoding="utf-8"))

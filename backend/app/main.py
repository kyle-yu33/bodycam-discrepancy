"""FastAPI server.  uvicorn app.main:app --reload --port 8000   (docs at /docs)"""
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .pipeline import CACHE, GROUND_TRUTH, run
from .schema import AnalysisResult

app = FastAPI(title="Bodycam Discrepancy Finder")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_methods=["*"], allow_headers=["*"])
CACHE.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=CACHE), name="media")


@app.post("/analyze", response_model=AnalysisResult)
def analyze(video: UploadFile = File(...), report_text: str = Form(...), force: bool = Form(False),
            fixture_name: str | None = Form(None)):
    fixture = None
    if fixture_name:
        # Name only (e.g. "sfst1" or "sfst1.json"); never a path from the client.
        fixture = GROUND_TRUTH / Path(fixture_name).with_suffix(".json").name
        if not fixture.is_file():
            raise HTTPException(400, f"unknown fixture: {fixture.name}")
    suffix = Path(video.filename or "clip.mp4").suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(video.file, tmp)
    try:
        return run(Path(tmp.name), report_text, force, fixture)
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

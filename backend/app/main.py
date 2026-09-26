"""Local MVP API with persisted jobs and a single background worker."""
import json
import logging
import os
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .schema import Job, Result
from .pipeline import run
from . import youtube

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "analyses"
DATA.mkdir(parents=True, exist_ok=True)

def save(path: Path, model):
    temp = path.with_suffix(".tmp")
    temp.write_text(model.model_dump_json(indent=2), encoding="utf-8")
    temp.replace(path)

@asynccontextmanager
async def lifespan(app):
    for path in DATA.glob("*/job.json"):
        job = Job.model_validate_json(path.read_text())
        if job.status in ("queued", "processing"):
            job.status, job.stage, job.error = "failed", "Interrupted", "Server restarted; upload again to retry."
            save(path, job)
    app.state.worker = ThreadPoolExecutor(max_workers=1)
    yield
    app.state.worker.shutdown(wait=True)

app = FastAPI(title="EvidenceLens Claim Review", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")], allow_methods=["GET", "POST"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=DATA), name="media")

def folder_for(job_id: str) -> Path:
    try:
        if str(uuid.UUID(job_id)) != job_id:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "Unknown analysis")
    folder = DATA / job_id
    if not (folder / "job.json").exists():
        raise HTTPException(404, "Unknown analysis")
    return folder

def process(job: Job, folder: Path, original: Path, report_text: str, source: dict | None = None):
    def progress(stage, value):
        job.status, job.stage, job.progress = "processing", stage, value
        save(folder / "job.json", job)
    try:
        if source:
            original, title = youtube.download(source["url"], source["start"], source["end"], folder, progress)
            job.filename = title
        result = run(original, folder, job.id, job.filename, report_text, progress)
        if source:
            result.source_url = source["url"]
            result.source_title = job.filename
            result.source_start_seconds = source["start"]
        save(folder / "result.json", result)
        job.status, job.stage, job.progress = "complete", "Ready for review", 1
    except Exception as exc:
        logging.exception("Analysis %s failed", job.id)
        job.status, job.stage = "failed", "Analysis failed"
        job.error = str(exc) if isinstance(exc, youtube.YouTubeError) else f"{type(exc).__name__}: analysis could not finish. Check the backend log, then try again."
    save(folder / "job.json", job)

@app.get("/health")
def health():
    return {"gemini_configured": bool(os.getenv("GOOGLE_API_KEY")), "ffmpeg_available": bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))}

@app.post("/analyses", response_model=Job, status_code=202)
def create_analysis(
    report_text: str = Form(..., min_length=1, max_length=12000),
    video: UploadFile | None = File(None),
    youtube_url: str | None = Form(None, max_length=2048),
    start_seconds: float = Form(0), end_seconds: float = Form(60),
):
    if not report_text.strip():
        raise HTTPException(422, "Add the team-written report before analyzing")
    if bool(video) == bool(youtube_url and youtube_url.strip()):
        raise HTTPException(422, "Provide exactly one video file or YouTube URL")
    source = None
    if youtube_url and youtube_url.strip():
        try:
            source = {"url": youtube.canonical_url(youtube_url), "start": start_seconds, "end": end_seconds}
            youtube.validate_range(start_seconds, end_seconds)
        except youtube.YouTubeError as exc:
            raise HTTPException(422, str(exc)) from None
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(503, "Set GOOGLE_API_KEY in backend/.env first")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(503, "Install FFmpeg and ffprobe first")
    suffix = Path(video.filename or "").suffix.lower() if video else ".mp4"
    if suffix not in (".mp4", ".mov"):
        raise HTTPException(415, "Upload an MP4 or MOV video")
    filename = Path(video.filename).name if video else f"YouTube · {source['url'].split('v=')[1]}"
    job = Job(id=str(uuid.uuid4()), filename=filename, created_at=datetime.now(timezone.utc).isoformat())
    folder = DATA / job.id
    folder.mkdir()
    original = folder / f"original{suffix}"
    try:
        if video:
            total = 0
            with original.open("wb") as output:
                while chunk := video.file.read(1024*1024):
                    total += len(chunk)
                    if total > int(os.getenv("MAX_UPLOAD_MB", "2048"))*1024*1024:
                        raise HTTPException(413, "Video exceeds upload size limit")
                    output.write(chunk)
            if not total:
                raise HTTPException(400, "Video is empty")
        if source:
            (folder / "source.json").write_text(json.dumps(source), encoding="utf-8")
        (folder / "report.txt").write_text(report_text, encoding="utf-8")
        save(folder / "job.json", job)
    except Exception:
        shutil.rmtree(folder)
        raise
    finally:
        if video:
            video.file.close()
    app.state.worker.submit(process, job.model_copy(), folder, original, report_text, source)
    return job

@app.get("/analyses", response_model=list[Job])
def list_analyses():
    return sorted([Job.model_validate_json(p.read_text()) for p in DATA.glob("*/job.json")], key=lambda j: j.created_at, reverse=True)

@app.get("/analyses/{job_id}", response_model=Job)
def get_analysis(job_id: str):
    return Job.model_validate_json((folder_for(job_id)/"job.json").read_text())

@app.get("/analyses/{job_id}/result", response_model=Result)
def get_result(job_id: str):
    path = folder_for(job_id)/"result.json"
    if not path.exists():
        raise HTTPException(409, "Analysis is not complete")
    data = json.loads(path.read_text())
    if data.get("pipeline_version") != "2":
        raise HTTPException(409, "This older analysis contains events only. Submit the video with a report to create claim reviews.")
    return Result.model_validate(data)

"""Local MVP API with persisted jobs and a single background worker."""
import json
import logging
import os
import re
import shutil
import time
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
from . import cases as claim_cases
from . import video as ffmpeg
from .cases import CASES
from .ledger import CaseResult

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "analyses"
DATA.mkdir(parents=True, exist_ok=True)

def save(path: Path, model):
    temp = path.with_suffix(".tmp")
    temp.write_text(model.model_dump_json(indent=2), encoding="utf-8")
    for attempt in range(40):
        try:
            temp.replace(path)
            return
        except PermissionError:  # Windows refuses the rename while a status request is reading the file
            if attempt == 39:
                raise
            time.sleep(0.025)

@asynccontextmanager
async def lifespan(app):
    for path in [*DATA.glob("*/job.json"), *CASES.glob("*/job.json")]:
        job = Job.model_validate_json(path.read_text())
        if job.status in ("queued", "processing"):
            job.status, job.stage, job.error = "failed", "Interrupted", "Server restarted; upload again to retry."
            save(path, job)
    app.state.worker = ThreadPoolExecutor(max_workers=1)
    yield
    app.state.worker.shutdown(wait=True)

app = FastAPI(title="Bodycam Event Analysis", lifespan=lifespan)
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

def process(job: Job, folder: Path, original: Path):
    def progress(stage, value):
        job.status, job.stage, job.progress = "processing", stage, value
        save(folder / "job.json", job)
    try:
        result = run(original, folder, job.id, job.filename, progress)
        save(folder / "result.json", result)
        job.status, job.stage, job.progress = "complete", "Ready for review", 1
    except Exception as exc:
        logging.exception("Analysis %s failed", job.id)
        job.status, job.stage = "failed", "Analysis failed"
        job.error = f"{type(exc).__name__}: analysis could not finish. Check the backend log, then upload again."
    save(folder / "job.json", job)

@app.get("/health")
def health():
    return {"gemini_configured": bool(os.getenv("GOOGLE_API_KEY")), "ffmpeg_available": bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))}

@app.post("/analyses", response_model=Job, status_code=202)
def create_analysis(video: UploadFile = File(...)):
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(503, "Set GOOGLE_API_KEY in backend/.env first")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(503, "Install FFmpeg and ffprobe first")
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in (".mp4", ".mov"):
        raise HTTPException(415, "Upload an MP4 or MOV video")
    job = Job(id=str(uuid.uuid4()), filename=Path(video.filename).name, created_at=datetime.now(timezone.utc).isoformat())
    folder = DATA / job.id
    folder.mkdir()
    original = folder / f"original{suffix}"
    try:
        total = 0
        with original.open("wb") as output:
            while chunk := video.file.read(1024*1024):
                total += len(chunk)
                if total > int(os.getenv("MAX_UPLOAD_MB", "2048"))*1024*1024:
                    raise HTTPException(413, "Video exceeds upload size limit")
                output.write(chunk)
        if not total:
            raise HTTPException(400, "Video is empty")
        save(folder / "job.json", job)
    except Exception:
        shutil.rmtree(folder)
        raise
    finally:
        video.file.close()
    app.state.worker.submit(process, job.model_copy(), folder, original)
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
    return Result.model_validate_json(path.read_text())

# ---------- Claim-evidence ledger: precomputed demo cases (python -m app.cases <case>) ----------

CASES.mkdir(parents=True, exist_ok=True)
app.mount("/case-media", StaticFiles(directory=CASES), name="case-media")

CASE_ID = re.compile(r"[a-z0-9_-]+")
MAX_CLIP_SEC = float(os.getenv("MAX_CLIP_SEC", "90"))  # full clips go to Vertex AI inline, which caps request size
MAX_REPORT_BYTES = 200_000

def case_result(case: str) -> CaseResult:
    path = CASES / case / "result.json"
    if not CASE_ID.fullmatch(case) or not path.exists():
        raise HTTPException(404, "Unknown case")
    return CaseResult.model_validate_json(path.read_text(encoding="utf-8"))

@app.get("/cases")
def list_cases():
    out = []
    for path in sorted(CASES.glob("*/result.json")):
        res = case_result(path.parent.name)
        counts = {s: sum(r.status == s for r in res.results) for s in
                  ("consistent", "potential_inconsistency", "insufficient_footage", "outside_assessment")}
        out.append({"case": res.case, "origin": res.origin, "model": res.model, "created_at": res.created_at,
                    "claims": len(res.results), **counts})
    return out

@app.get("/cases/{case}", response_model=CaseResult)
def get_case(case: str):
    return case_result(case)

# ---------- Uploaded cases: clip + report from the frontend, analyzed in the background ----------

def new_case_id(name: str) -> str:
    if not name.strip():
        return f"upload-{uuid.uuid4().hex[:8]}"
    slug = re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-_")[:40]
    if not slug:
        raise HTTPException(400, "The case name needs at least one letter or digit")
    return slug

def read_report(report_text: str, report: UploadFile | None) -> str:
    text = report_text.strip()
    if not text and report is not None and report.filename:
        if Path(report.filename).suffix.lower() != ".txt":
            raise HTTPException(415, "Attach the report as a .txt file")
        raw = report.file.read(MAX_REPORT_BYTES + 1)
        if len(raw) > MAX_REPORT_BYTES:
            raise HTTPException(413, "Report file is too large")
        try:
            text = raw.decode("utf-8-sig").strip()
        except UnicodeDecodeError:
            raise HTTPException(400, "The report file must be UTF-8 text")
    if not text:
        raise HTTPException(400, "Add the report text or attach a .txt report")
    return text

def process_case(job: Job, folder: Path, original: Path, report_text: str):
    log = logging.getLogger("uvicorn.error")
    def progress(stage, value):
        job.status, job.stage, job.progress = "processing", stage, round(value, 3)
        save(folder / "job.json", job)
    try:
        claim_cases.run(job.id, original, report_text, log=log.info, progress=progress, origin="upload")
        job.status, job.stage, job.progress = "complete", "Ready for review", 1
    except Exception as exc:
        log.exception("Case %s failed", job.id)
        job.status, job.stage = "failed", "Analysis failed"
        job.error = f"{type(exc).__name__}: {str(exc)[:300]}"
    save(folder / "job.json", job)

@app.post("/cases", response_model=Job, status_code=202)
def create_case(video: UploadFile = File(...), report_text: str = Form(""),
                report: UploadFile | None = File(None), name: str = Form("")):
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(503, "Set GOOGLE_API_KEY in backend/.env first")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(503, "Install FFmpeg and ffprobe first")
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in (".mp4", ".mov"):
        raise HTTPException(415, "Upload an MP4 or MOV video")
    text = read_report(report_text, report)
    case = new_case_id(name)
    folder = CASES / case
    old_job = folder / "job.json"
    if old_job.exists() and not (folder / "result.json").exists() \
            and Job.model_validate_json(old_job.read_text(encoding="utf-8")).status == "failed":
        shutil.rmtree(folder)  # a failed upload doesn't reserve its name
    try:
        folder.mkdir()
    except FileExistsError:
        raise HTTPException(409, f"A case named '{case}' already exists; choose another name")
    original = folder / f"original{suffix}"
    try:
        total = 0
        with original.open("wb") as output:
            while chunk := video.file.read(1024*1024):
                total += len(chunk)
                if total > int(os.getenv("MAX_UPLOAD_MB", "2048"))*1024*1024:
                    raise HTTPException(413, "Video exceeds upload size limit")
                output.write(chunk)
        if not total:
            raise HTTPException(400, "Video is empty")
        try:
            dur = ffmpeg.duration(original)
        except Exception:
            raise HTTPException(400, "Could not read the video; is it a playable MP4 or MOV?")
        if dur > MAX_CLIP_SEC:
            raise HTTPException(413, f"The clip is {dur:.0f} s long; trim it to {MAX_CLIP_SEC:.0f} s or less")
        (folder / "report.txt").write_text(text, encoding="utf-8")
        job = Job(id=case, filename=Path(video.filename).name, created_at=datetime.now(timezone.utc).isoformat())
        save(folder / "job.json", job)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    finally:
        video.file.close()
    app.state.worker.submit(process_case, job.model_copy(), folder, original, text)
    return job

@app.get("/cases/{case}/job", response_model=Job)
def get_case_job(case: str):
    path = CASES / case / "job.json"
    if not CASE_ID.fullmatch(case) or not path.exists():
        raise HTTPException(404, "No upload job for this case")
    return Job.model_validate_json(path.read_text(encoding="utf-8"))

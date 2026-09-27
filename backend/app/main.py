"""Local API: one worker, generation-scoped jobs, atomic state, and bounded operations."""
import logging
import os
import re
import shutil
import stat
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
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
from .storage import LOCK, read, save
from .runtime import Cancelled, Control, current
from .uploads import UploadLimit

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "analyses"
DATA.mkdir(parents=True, exist_ok=True)
CASES.mkdir(parents=True, exist_ok=True)
CASE_ID = re.compile(r"[a-z0-9_-]+")
MAX_CLIP_SEC = float(os.getenv("MAX_CLIP_SEC", "90"))
MAX_REPORT_BYTES = 200_000
ACTIVE = ("queued", "processing")
log = logging.getLogger("uvicorn.error")


def now():
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Task:
    job: Job
    control: Control
    future: Future | None = None


def read_job(path):
    data = read(path)
    if not isinstance(data, dict):
        raise ValueError("Job must be a JSON object")
    data.setdefault("run_id", uuid.uuid5(uuid.NAMESPACE_URL, f"{path.resolve()}:{data.get('created_at')}").hex)
    return Job.model_validate(data)


def jobs_in(root):
    for path in root.glob("*/job.json"):
        try:
            job = read_job(path)
            if job.id != path.parent.name or not CASE_ID.fullmatch(job.id):
                raise ValueError("Job ID does not match its directory")
            yield job
        except (OSError, ValueError):
            log.warning("Cannot read job %s", path)


@asynccontextmanager
async def lifespan(app):
    # A shared data directory supports one server process. Fail explicitly rather
    # than letting a second worker invalidate jobs owned by the first process.
    from .server_lock import server_lock
    with server_lock(DATA.parent / ".worker.lock"):
        with LOCK:
            for root in (DATA, CASES):
                for job in jobs_in(root):
                    if job.status in ACTIVE:
                        job.status, job.stage = "failed", "Interrupted"
                        job.error = "Server restarted; upload again to retry."
                        job.updated_at = now()
                        save(root / job.id / "job.json", job)
            app.state.tasks = {}
            app.state.worker = ThreadPoolExecutor(max_workers=1)
        try:
            yield
        finally:
            with LOCK:
                for key, task in list(app.state.tasks.items()):
                    task.control.cancel.set()
                    if task.future.cancel():
                        task.job.status, task.job.stage = "failed", "Interrupted"
                        task.job.error = "Server stopped before this job ran; upload again to retry."
                        persist(task.job, Path(key))
                        del app.state.tasks[key]
            # Wait for bounded network calls and cooperative subprocess cleanup.
            app.state.worker.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title="Bodycam Event Analysis", lifespan=lifespan)
app.add_middleware(UploadLimit)
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
                   allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=DATA), name="media")
app.mount("/case-media", StaticFiles(directory=CASES), name="case-media")


def folder_for(job_id: str, root):
    if not CASE_ID.fullmatch(job_id):
        raise HTTPException(404, "Unknown analysis")
    folder = root / job_id
    if folder.is_symlink() or folder.resolve().parent != root.resolve():
        raise HTTPException(404, "Unknown analysis")
    if not (folder / "job.json").exists():
        raise HTTPException(404, "Unknown analysis")
    return folder


def remove_folder(folder):
    # Never follow a case-directory symlink during recursive deletion.
    if folder.is_symlink() or folder.resolve().parent not in (DATA.resolve(), CASES.resolve()):
        raise ValueError("Invalid case directory")
    def clear_readonly(function, path, exc_info):
        error = exc_info[1]
        target = Path(path)
        # OneDrive marks directories read-only too; Windows then rejects rmdir,
        # even after every child was removed. Do not change ACLs or follow links.
        if not isinstance(error, PermissionError) or target.is_symlink():
            raise error
        if not target.resolve().is_relative_to(folder.resolve()):
            raise error
        attributes = target.stat(follow_symlinks=False)
        readonly = getattr(attributes, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_READONLY
        if not readonly:
            raise error
        os.chmod(target, stat.S_IWRITE | stat.S_IREAD)
        function(path)

    for attempt in range(10):
        try:
            if folder.exists():
                shutil.rmtree(folder, onerror=clear_readonly)
            return
        except PermissionError:
            if attempt == 9:
                raise
            time.sleep(0.05)


def persist(job, folder):
    job.updated_at = now()
    save(folder / "job.json", job)


def cleanup(job, folder):
    try:
        remove_folder(folder)
    except OSError as exc:
        log.exception("Could not delete %s", folder)
        folder.mkdir(exist_ok=True)
        job.status, job.stage = "failed", "Deletion failed"
        filename = Path(exc.filename).name if exc.filename else "case files"
        reason = "File is in use" if getattr(exc, "winerror", None) in (32, 33) else "Filesystem refused deletion"
        job.error = f"{reason}: {filename} ({exc.strerror or str(exc)}). Close playback and retry."
        persist(job, folder)
        return False
    return True


def process_task(task, folder, original, report_text):
    job, control = task.job, task.control
    key = str(folder)
    done = threading.Event()
    control.deadline = time.monotonic() + float(os.getenv("ANALYSIS_TIMEOUT_SEC", "1800"))
    token = current.set(control)

    def owns_folder():
        return app.state.tasks.get(key) is task

    def progress(stage, value):
        with LOCK:
            control.check()
            if not owns_folder():
                raise Cancelled()
            value = max(job.progress, min(0.99, round(value, 2)))
            if (job.status, job.stage, job.progress) == ("processing", stage, value):
                return
            job.status, job.stage, job.progress = "processing", stage, value
            job.heartbeat_at = now()
            persist(job, folder)

    def heartbeat():
        while not done.wait(2):
            with LOCK:
                if not owns_folder() or job.status not in ACTIVE:
                    return
                job.heartbeat_at = now()
                try:
                    save(folder / "job.json", job)
                except OSError:
                    log.exception("Cannot save heartbeat for %s", job.id)

    monitor = None
    try:
        with LOCK:
            if not owns_folder():
                return
            progress("Starting", 0)
        monitor = threading.Thread(target=heartbeat, daemon=True)
        monitor.start()
        if report_text is None:
            result = run(original, folder, job.id, job.filename, progress)
        else:
            result = claim_cases.run(job.id, original, report_text, log=log.info,
                                     progress=progress, origin="upload", publish=False)
        with LOCK:
            control.check()  # includes a stop arriving during the very last claim
            if not owns_folder():
                return
            save(folder / "result.json", result)
            job.status, job.stage, job.progress = "complete", "Ready for review", 1
            persist(job, folder)
    except Cancelled:
        with LOCK:
            if owns_folder():
                if job.cancellation_requested:
                    cleanup(job, folder)
                else:
                    job.status, job.stage = "failed", "Interrupted"
                    job.error = "Server stopped during analysis; upload again to retry."
                    persist(job, folder)
    except Exception as exc:
        log.exception("Analysis %s failed", job.id)
        with LOCK:
            if owns_folder():
                if job.cancellation_requested:
                    cleanup(job, folder)
                else:
                    job.status, job.stage = "failed", "Analysis failed"
                    job.error = f"{type(exc).__name__}: {str(exc)[:300]}"
                    persist(job, folder)
    finally:
        done.set()
        if monitor is not None:
            monitor.join()
        with LOCK:
            if owns_folder():
                del app.state.tasks[key]
        current.reset(token)


def submit(job, folder, original, report_text=None):
    with LOCK:
        task = Task(job.model_copy(), Control())
        app.state.tasks[str(folder)] = task
        try:
            task.future = app.state.worker.submit(process_task, task, folder, original, report_text)
        except RuntimeError:
            del app.state.tasks[str(folder)]
            job.status, job.stage, job.error = "failed", "Not scheduled", "Server is shutting down; retry the upload."
            persist(job, folder)
            raise HTTPException(503, job.error)


def prerequisites(video):
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(503, "Set GOOGLE_API_KEY in backend/.env first")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(503, "Install FFmpeg and ffprobe first")
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in (".mp4", ".mov"):
        raise HTTPException(415, "Upload an MP4 or MOV video")
    return suffix


def copy_video(video, original):
    try:
        total = 0
        with original.open("wb") as output:
            while chunk := video.file.read(1024 * 1024):
                total += len(chunk)
                if total > int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024:
                    raise HTTPException(413, "Video exceeds upload size limit")
                output.write(chunk)
        if not total:
            raise HTTPException(400, "Video is empty")
    finally:
        video.file.close()


@app.get("/health")
def health():
    return {"gemini_configured": bool(os.getenv("GOOGLE_API_KEY")),
            "ffmpeg_available": bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))}


@app.post("/analyses", response_model=Job, status_code=202)
def create_analysis(video: UploadFile = File(...)):
    suffix = prerequisites(video)
    job = Job(id=str(uuid.uuid4()), filename=Path(video.filename).name, created_at=now())
    folder = DATA / job.id
    folder.mkdir()
    original = folder / f"original{suffix}"
    try:
        copy_video(video, original)
        with LOCK:
            persist(job, folder)
            submit(job, folder, original)
    except HTTPException as exc:
        if exc.status_code != 503:
            remove_folder(folder)
        raise
    except Exception:
        remove_folder(folder)
        raise
    return job


@app.get("/analyses", response_model=list[Job])
def list_analyses():
    return sorted(jobs_in(DATA), key=lambda j: j.created_at, reverse=True)


@app.get("/analyses/{job_id}", response_model=Job)
def get_analysis(job_id: str):
    return job_response(DATA, job_id)


@app.get("/analyses/{job_id}/result", response_model=Result)
def get_result(job_id: str):
    with LOCK:
        folder = folder_for(job_id, DATA)
        if read_job(folder / "job.json").status != "complete":
            raise HTTPException(409, "Analysis is not complete")
        return result_response(folder / "result.json", Result)


def result_response(path, model):
    try:
        return model.model_validate(read(path))
    except FileNotFoundError:
        raise HTTPException(404, "Unknown case")
    except (OSError, ValueError):
        raise HTTPException(503, "Result is unavailable; retry or re-analyze this case")


def case_result(case):
    if not CASE_ID.fullmatch(case):
        raise HTTPException(404, "Unknown case")
    with LOCK:
        folder = CASES / case
        if (folder / "job.json").exists() and read_job(folder / "job.json").status != "complete":
            raise HTTPException(409, "Analysis is not complete")
        return result_response(folder / "result.json", CaseResult)


@app.get("/cases")
def list_cases():
    out = []
    for path in sorted(CASES.glob("*/result.json")):
        try:
            res = case_result(path.parent.name)
        except (HTTPException, OSError, ValueError):
            log.warning("Skipping unavailable case %s", path.parent.name)
            continue
        counts = {s: sum(r.status == s for r in res.results) for s in
                  ("consistent", "potential_inconsistency", "insufficient_footage", "outside_assessment")}
        out.append({"case": res.case, "origin": res.origin, "model": res.model, "created_at": res.created_at,
                    "claims": len(res.results), **counts})
    return out


@app.get("/cases/{case}", response_model=CaseResult)
def get_case(case: str):
    return case_result(case)


def new_case_id(name):
    if not name.strip():
        return f"upload-{uuid.uuid4().hex[:8]}"
    slug = re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-_")[:40]
    if not slug:
        raise HTTPException(400, "The case name needs at least one letter or digit")
    return slug


def read_report(report_text, report):
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
    if len(text.encode("utf-8")) > MAX_REPORT_BYTES:
        raise HTTPException(413, "Report text is too large")
    if not text:
        raise HTTPException(400, "Add the report text or attach a .txt report")
    return text


@app.post("/cases", response_model=Job, status_code=202)
def create_case(video: UploadFile = File(...), report_text: str = Form(""),
                report: UploadFile | None = File(None), name: str = Form("")):
    suffix = prerequisites(video)
    text = read_report(report_text, report)
    case = new_case_id(name)
    folder = CASES / case
    with LOCK:
        old_job = folder / "job.json"
        previous = app.state.tasks.get(str(folder))
        if previous and previous.job.status in ACTIVE:
            raise HTTPException(409, "This case is still running or stopping; wait before retrying")
        if old_job.exists() and not (folder / "result.json").exists() and read_job(old_job).status == "failed":
            try:
                remove_folder(folder)
            except OSError:
                raise HTTPException(409, "Files are still locked; retry deleting this case first")
        try:
            folder.mkdir()
        except FileExistsError:
            raise HTTPException(409, f"A case named '{case}' already exists; choose another name")
    original = folder / f"original{suffix}"
    try:
        copy_video(video, original)
        try:
            dur = ffmpeg.duration(original)
        except Exception:
            raise HTTPException(400, "Could not read the video; is it a playable MP4 or MOV?")
        if dur > MAX_CLIP_SEC:
            raise HTTPException(413, f"The clip is {dur:.0f} s long; trim it to {MAX_CLIP_SEC:.0f} s or less")
        (folder / "report.txt").write_text(text, encoding="utf-8")
        job = Job(id=case, filename=Path(video.filename).name, created_at=now())
        with LOCK:
            persist(job, folder)
            submit(job, folder, original, text)
    except HTTPException as exc:
        if exc.status_code != 503:
            remove_folder(folder)
        raise
    except Exception:
        remove_folder(folder)
        raise
    return job


@app.get("/case-jobs", response_model=list[Job])
def list_case_jobs(include_finished: bool = False):
    # Preserve the active-only API while allowing clients to recover terminal jobs after refresh.
    return sorted((j for j in jobs_in(CASES) if include_finished or j.status in ACTIVE), key=lambda j: j.created_at)


def job_response(root, job_id):
    with LOCK:
        folder = folder_for(job_id, root)
        try:
            return read_job(folder / "job.json")
        except FileNotFoundError:
            raise HTTPException(404, "Unknown analysis")
        except (OSError, ValueError):
            raise HTTPException(503, "Job status is temporarily unavailable; retry")


def stop_or_delete(root, job_id, delete=False, run_id=None):
    with LOCK:
        folder = folder_for(job_id, root)
        task = app.state.tasks.get(str(folder))
        job = task.job if task else read_job(folder / "job.json")
        if run_id is not None and job.run_id != run_id:
            raise HTTPException(409, "This case has been replaced by a newer upload; refresh before deleting")
        if not delete and job.status not in ACTIVE:
            raise HTTPException(409, "This analysis has already finished")
        if task and job.status in ACTIVE:
            task.control.cancel.set()
            job.cancellation_requested = True
            if task.future.cancel():
                del app.state.tasks[str(folder)]
            else:
                job.status, job.stage = "processing", "Stopping after the current operation"
                persist(job, folder)
                return job.model_copy()
        job.status, job.stage, job.error = "failed", "Stopped", "Stopped by reviewer."
        if not cleanup(job, folder):
            raise HTTPException(409, job.error)
        return job.model_copy()


@app.post("/cases/{case}/stop", response_model=Job)
def stop_case(case: str, run_id: str | None = None):
    return stop_or_delete(CASES, case, run_id=run_id)


@app.delete("/cases/{case}", response_model=Job)
def delete_case(case: str, run_id: str | None = None):
    return stop_or_delete(CASES, case, delete=True, run_id=run_id)


@app.delete("/analyses/{job_id}", response_model=Job)
def delete_analysis(job_id: str, run_id: str | None = None):
    return stop_or_delete(DATA, job_id, delete=True, run_id=run_id)


@app.get("/cases/{case}/job", response_model=Job)
def get_case_job(case: str):
    return job_response(CASES, case)

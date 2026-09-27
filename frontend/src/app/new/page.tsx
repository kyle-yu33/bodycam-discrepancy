"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCase, getCaseJob, getHealth, stopCase, type CaseJob, type Health } from "@/lib/ledger";
import { QueueList, useCaseJobs } from "@/components/review/Queue";

const MAX_CLIP_SEC = 90; // backend MAX_CLIP_SEC: full clips go to Gemini inline
const POLL_MS = 2000;

// Reads a local video's duration without uploading it.
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
    v.src = url;
  });
}

// Every upload the backend is running or holding, so a waiting job can see what is ahead of it.
function AnalysisQueue({ mine, onStopMine }: { mine?: string; onStopMine: () => void }) {
  const { active, finished, dismiss, stop, remove, stopping, stopError } = useCaseJobs();
  const others = finished.filter((j) => j.id !== mine);
  if (!active.length && !others.length && !stopError) return null;
  return (
    <section className="mt-6 rounded-xl border border-hairline bg-surface p-5" aria-live="polite">
      <h2 className="text-sm font-semibold">Analysis queue</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">Cases run one at a time, in upload order.</p>
      <QueueList active={active} finished={others} mine={mine} onDismiss={dismiss} onDelete={remove} stopping={stopping}
        onStop={(id) => (id === mine ? onStopMine() : stop(id))} />
      {stopError && <p className="mt-3 text-xs text-review" role="alert">{stopError}</p>}
    </section>
  );
}

export default function NewCase() {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [report, setReport] = useState("");
  const [reportFile, setReportFile] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [stoppingMine, setStoppingMine] = useState(false);
  const [job, setJob] = useState<CaseJob | null>(null);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const reportInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((e: Error) => setHealthError(e.message));
  }, []);

  // Wait for each response before scheduling another poll; discard stale responses.
  const jobId = job?.id;
  const runId = job?.run_id;
  const isActive = job?.status === "queued" || job?.status === "processing";
  const cancelRequested = !!job?.cancellation_requested;
  useEffect(() => {
    if (!jobId || !isActive) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getCaseJob(jobId);
        if (!alive) return;
        if (next.run_id !== runId) {
          setJob(null);
          setNotice("This case has been replaced by a newer upload. Check the queue.");
          return;
        }
        setJob(next);
        setError("");
        if (next.status === "complete") router.push(`/cases/${encodeURIComponent(jobId)}?instant=1`);
      } catch (e) {
        if (!alive) return;
        if ((e as Error & { status?: number }).status === 404) {
          setJob(null);
          setStoppingMine(false);
          setNotice(cancelRequested ? `Stopped ${jobId}. Its files have been deleted.` : "This case was deleted.");
        } else setError(`Status update failed: ${(e as Error).message}`);
      } finally {
        if (alive) { setNow(Date.now()); timer = setTimeout(poll, POLL_MS); }
      }
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [jobId, runId, isActive, cancelRequested, router]);

  async function pickVideo(file: File | null) {
    setVideo(file);
    setDuration(file ? await videoDuration(file) : null);
  }

  async function attachReport(file: File | null) {
    if (!file) return;
    setReport((await file.text()).replace(/^\uFEFF/, ""));
    setReportFile(file.name);
    if (reportInput.current) reportInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!video) return;
    setError("");
    setNotice("");
    setSubmitting(true);
    setUploadPercent(0);
    setStoppingMine(false);
    const form = new FormData();
    form.append("video", video);
    form.append("report_text", report);
    form.append("name", name);
    try {
      const created = await createCase(form, setUploadPercent);
      setStarted(Date.now());
      setNow(Date.now());
      setJob(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Keeps the form filled in, so the same clip and report can be resubmitted.
  async function stopMine() {
    if (!job || !window.confirm(`Stop analyzing ${job.id} and delete its files?`)) return;
    setStoppingMine(true);
    try {
      const stopped = await stopCase(job.id, job.run_id);
      setError("");
      if (stopped.status === "processing") setJob(stopped);
      else {
        setJob(null);
        setStoppingMine(false);
        setNotice(`Stopped ${job.id}. Its files have been deleted.`);
      }
    } catch (e) {
      setError((e as Error).message);
      setStoppingMine(false);
    }
  }

  const blocked = health && (!health.gemini_configured || !health.ffmpeg_available);
  const tooLong = duration != null && duration > MAX_CLIP_SEC;
  const canSubmit = !!video && report.trim().length > 0 && !tooLong && !blocked && !submitting;
  const running = job && (job.status === "queued" || job.status === "processing");
  const elapsed = started ? Math.max(0, Math.round((now - started) / 1000)) : 0;

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b border-hairline bg-surface px-5 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">EvidenceLens</Link>
        <span className="text-sm text-muted">New case</span>
        <span className="ml-auto rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white">Human review required</span>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold tracking-tight">Analyze a clip against a report</h1>
        <p className="mt-1 text-sm text-muted">
          Upload body-worn camera footage and the written report. Each claim in the report is checked against the footage and
          linked to the moment that bears on it.
        </p>

        {healthError && <p className="mt-4 rounded-lg bg-review-bg p-3 text-sm text-review" role="alert">{healthError}</p>}
        {health && !health.gemini_configured && (
          <p className="mt-4 rounded-lg bg-review-bg p-3 text-sm text-review" role="alert">
            The analysis server has no Gemini key. Add GOOGLE_API_KEY to backend/.env and restart the server.
          </p>
        )}
        {health && !health.ffmpeg_available && (
          <p className="mt-4 rounded-lg bg-review-bg p-3 text-sm text-review" role="alert">
            The analysis server can&apos;t find FFmpeg. Install it and restart the server.
          </p>
        )}

        {running || job?.status === "complete" ? (
          <section className="el-fade-up mt-6 rounded-xl border border-hairline bg-surface p-5" aria-live="polite">
            <h2 className="text-base font-semibold">Analyzing {job.filename}</h2>
            <p className="mt-1 text-sm text-muted">
              {job.status === "complete" ? "Done. Opening the review…"
                : job.status === "queued" ? "Waiting for another analysis to finish. Cases run one at a time."
                : job.stage}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </div>
            <p className="mt-3 text-xs text-muted">
              {elapsed} s elapsed · Estimated progress; some steps may take several minutes. You can leave this page; the case appears in the case list when it&apos;s done.
            </p>
            {error && <p className="mt-2 text-xs text-review" role="alert">{error}</p>}
            {running && job.updated_at && now - Date.parse(job.updated_at) > 30000 && <p className="mt-2 text-xs text-muted">This step has not advanced for {Math.floor((now - Date.parse(job.updated_at)) / 1000)} seconds. Model startup and processing can take longer on the first run.</p>}
            {running && job.heartbeat_at && <p className="mt-2 text-xs text-muted">{now - Date.parse(job.heartbeat_at) > 15000 ? "Worker heartbeat delayed. Checking for an update…" : "Worker active"}</p>}
            {running && (
              <button onClick={stopMine} disabled={stoppingMine || job.cancellation_requested} className="mt-4 rounded-lg border border-hairline px-3 py-1.5 text-sm text-review hover:bg-review-bg">
                {stoppingMine || job.cancellation_requested ? "Stopping after the current operation…" : "Stop analysis"}
              </button>
            )}
          </section>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border border-hairline bg-surface p-5">
            <label className="block">
              <span className="text-sm font-medium">Footage</span>
              <span className="block text-xs text-muted">MP4 or MOV with its original audio, {MAX_CLIP_SEC} seconds or less.</span>
              <input type="file" accept=".mp4,.mov,video/mp4,video/quicktime" required
                onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full cursor-pointer text-sm file:mr-3 file:rounded-lg file:border file:border-transparent file:bg-sunken file:px-3 file:py-2 file:text-sm file:text-ink-2 file:transition-[background-color,border-color,color,transform] file:duration-200 hover:file:scale-[1.03] hover:file:border-brass/50 hover:file:bg-hairline hover:file:text-ink motion-reduce:hover:file:scale-100" />
              {tooLong && (
                <span className="mt-1 block text-xs text-review">
                  This clip is {Math.round(duration!)} s long. Trim it to {MAX_CLIP_SEC} s or less first.
                </span>
              )}
            </label>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="report" className="text-sm font-medium">Report</label>
                <button type="button" onClick={() => reportInput.current?.click()}
                  className="rounded-md px-2 py-1 text-xs text-brand underline decoration-brand/40 underline-offset-2 transition-[background-color,color,text-decoration-color,transform] duration-200 hover:scale-[1.03] hover:bg-hairline hover:text-ink hover:decoration-ink motion-reduce:hover:scale-100">
                  {reportFile ? `Attached ${reportFile} · replace` : "Attach .txt instead"}
                </button>
                <input ref={reportInput} type="file" accept=".txt,text/plain" hidden
                  onChange={(e) => attachReport(e.target.files?.[0] ?? null)} />
              </div>
              <span className="block text-xs text-muted">Paste the narrative, or attach a text file and edit it here.</span>
              <textarea id="report" value={report} onChange={(e) => setReport(e.target.value)} rows={10} required
                placeholder="I conducted a traffic stop on…"
                className="mt-2 block w-full rounded-lg border border-hairline bg-sunken p-3 text-sm" />
            </div>

            <label className="block">
              <span className="text-sm font-medium">Case name <span className="font-normal text-muted">(optional)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. traffic-stop-3"
                className="mt-2 block w-full rounded-lg border border-hairline bg-sunken px-3 py-2 text-sm" />
            </label>

            {job?.status === "failed" && (
              <p className="rounded-lg bg-review-bg p-3 text-sm text-review" role="alert">
                The analysis couldn&apos;t finish: {job.error ?? "unknown error"}. Check the backend log, then try again.
              </p>
            )}
            {notice && <p className="rounded-lg bg-sunken p-3 text-sm" role="status">{notice}</p>}
            {error && <p className="rounded-lg bg-review-bg p-3 text-sm text-review" role="alert">{error}</p>}

            {submitting && <progress className="w-full" value={uploadPercent} max={100} aria-label="Upload progress" />}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={!canSubmit}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Uploading…" : "Analyze"}
              </button>
              <Link href="/" className="text-sm text-muted hover:text-ink">Cancel</Link>
            </div>

            <p className="rounded-lg bg-sunken p-3 text-xs text-muted">
              Use publicly released footage only. Processing runs on this computer; the footage is sent to Gemini for analysis
              (and its audio to ElevenLabs for a transcript, if the server has that key).
              Results point to moments worth reviewing; they are not legal conclusions.
            </p>
          </form>
        )}

        <AnalysisQueue mine={job?.id} onStopMine={stopMine} />
      </main>
    </div>
  );
}

"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createCase, getCaseJob, getHealth, stopCase, type CaseJob, type Health } from "@/lib/ledger";
import { QueueList, useCaseJobs } from "@/components/review/Queue";
import { CloseIcon, FileIcon, InfoIcon, LinkIcon, UploadIcon, VideoIcon } from "@/components/review/Icons";
import { AnalysisScreen } from "@/components/site/AnalysisScreen";
import { ReviewPill, SiteHeader } from "@/components/site/SiteHeader";
import { UploadBackdrop } from "@/components/site/UploadBackdrop";
import { BUTTON_PRIMARY, EYEBROW } from "@/components/site/styles";

const POLL_MS = 2000;
type SourceMode = "upload" | "youtube";

// No margin or font size here, so each field can set its own without conflicting utilities.
const INPUT = "block w-full rounded-lg border border-hairline bg-sunken px-3 py-2.5 text-ink placeholder:text-muted/70 transition-colors focus:border-brass/50";
const FOCUS_FROM_INPUT = "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brass";
const LABEL = "text-[13px] font-medium text-ink-2";

const isVideo = (file: File) => /\.(mp4|mov)$/i.test(file.name) || ["video/mp4", "video/quicktime"].includes(file.type);

// Every upload the backend is running or holding, so a waiting job can see what is ahead of it.
function AnalysisQueue({ mine, onStopMine, othersOnly = false }: { mine?: string; onStopMine: () => void; othersOnly?: boolean }) {
  const { active, finished, dismiss, stop, stopping, stopError } = useCaseJobs();
  const shown = othersOnly ? active.filter((j) => j.id !== mine) : active;
  const others = finished.filter((j) => j.id !== mine);
  if (!shown.length && !others.length) return null;
  return (
    <section className="mt-8 rounded-xl border border-hairline bg-surface p-5" aria-live="polite">
      <h2 className={EYEBROW}>{othersOnly ? "Other analyses" : "Analysis queue"}</h2>
      <p className="mb-3 mt-1 text-xs text-muted">Cases run one at a time, in upload order.</p>
      <QueueList active={shown} finished={others} mine={mine} onDismiss={dismiss} stopping={stopping}
        onStop={(id) => (id === mine ? onStopMine() : stop(id))} />
      {stopError && <p className="mt-3 text-xs text-review" role="alert">{stopError}</p>}
    </section>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex gap-2.5 rounded-lg border border-rose/30 bg-raised px-4 py-3 text-sm leading-6 text-ink">
      <InfoIcon className="mt-1 h-4 w-4 shrink-0 text-rose" />
      <span>{children}</span>
    </p>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-5 shadow-panel sm:p-6">
      <div className="flex gap-4">
        <span className="font-serif text-lg leading-6 tabular-nums text-muted">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-muted">{hint}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

// useSearchParams (for ?job=) needs a Suspense boundary.
export default function NewCasePage() {
  return (
    <Suspense fallback={null}>
      <NewCase />
    </Suspense>
  );
}

function NewCase() {
  const router = useRouter();
  const resumeId = useSearchParams().get("job");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [name, setName] = useState("");
  const [report, setReport] = useState("");
  const [reportFile, setReportFile] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploaded, setUploaded] = useState(0); // percent of the video sent
  const [job, setJob] = useState<CaseJob | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const reportInput = useRef<HTMLInputElement>(null);
  const resumed = useRef(false);

  useEffect(() => {
    getHealth().then(setHealth).catch((e: Error) => setHealthError(e.message));
  }, []);

  // /new?job=<id> reopens the analysis screen after a reload; only on arrival, not after leaving the screen.
  useEffect(() => {
    if (resumed.current || !resumeId) return;
    resumed.current = true;
    getCaseJob(resumeId).then(setJob).catch(() => window.history.replaceState(null, "", "/new"));
  }, [resumeId]);

  // Poll the background job while it is queued or running.
  useEffect(() => {
    if (!job || job.status === "complete" || job.status === "failed") return;
    const id = job.id;
    const timer = window.setInterval(async () => {
      try {
        setJob(await getCaseJob(id));
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [job]);

  // Replace, not push: Back from the review shouldn't land on a finished job and bounce forward again.
  useEffect(() => {
    if (job?.status === "complete") router.replace(`/cases/${encodeURIComponent(job.id)}`);
  }, [job, router]);

  function pickVideo(file: File | null) {
    if (file && !isVideo(file)) {
      setError("Choose an MP4 or MOV video.");
      return;
    }
    setError("");
    setVideo(file);
  }

  function clearVideo() {
    setVideo(null);
    if (videoInput.current) videoInput.current.value = "";
  }

  async function attachReport(file: File | null) {
    if (!file) return;
    if (file.size > 200_000) {
      setError("The report must be 200 KB or smaller.");
      return;
    }
    setError("");
    setReport((await file.text()).replace(/^﻿/, ""));
    setReportFile(file.name);
    if (reportInput.current) reportInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sourceMode === "upload" && !video) return;
    setError("");
    setNotice("");
    setSubmitting(true);
    setUploaded(0);
    const form = new FormData();
    if (sourceMode === "upload" && video) form.append("video", video);
    if (sourceMode === "youtube") form.append("youtube_url", youtubeUrl);
    form.append("report_text", report);
    form.append("name", name);
    try {
      const created = await createCase(form, setUploaded);
      window.history.replaceState(null, "", `/new?job=${encodeURIComponent(created.id)}`);
      setJob(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Back to the form, which still holds the clip and report while this tab stays open.
  function leaveScreen() {
    window.history.replaceState(null, "", "/new");
    setJob(null);
    setError("");
  }

  async function stopMine() {
    if (!job || !window.confirm(`Stop analyzing ${job.id}? The upload is deleted; submit again to retry.`)) return;
    try {
      await stopCase(job.id);
      leaveScreen();
      setNotice(`Stopped ${job.id}.${video || report ? " Your clip and report are still filled in below." : ""}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (job) {
    return (
      <div className="min-h-screen">
        <UploadBackdrop />
        <SiteHeader context="New case"><ReviewPill /></SiteHeader>
        <AnalysisScreen job={job} onStop={stopMine} onRetry={leaveScreen}>
          {error && <div className="mt-6"><Alert>Couldn&apos;t check on the analysis: {error}. Retrying…</Alert></div>}
          <AnalysisQueue mine={job.id} onStopMine={stopMine} othersOnly />
        </AnalysisScreen>
      </div>
    );
  }

  const blocked = health && (!health.gemini_configured || !health.ffmpeg_available);
  const haveFootage = sourceMode === "upload" ? !!video : !!youtubeUrl.trim();
  const canSubmit = haveFootage && report.trim().length > 0 && !blocked && !submitting;
  const missing = !haveFootage ? "Add the footage to continue." : !report.trim() ? "Add the report to continue." : "";

  return (
    <div className="min-h-screen">
      <UploadBackdrop />
      <SiteHeader context="New case"><ReviewPill /></SiteHeader>

      <main className="el-enter mx-auto max-w-3xl px-4 pb-16 pt-12 sm:px-6">
        <p className={EYEBROW}>New case</p>
        <h1 className="mt-2 text-balance font-serif text-4xl font-medium tracking-tight text-ink">Upload the report and the footage</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-2">
          evidently checks each claim in the report against the video and its audio, then links every claim to the
          moment that bears on it. A short clip usually takes a few minutes.
        </p>

        <div className="mt-6 space-y-3 empty:hidden">
          {healthError && <Alert>The analysis server isn&apos;t reachable: {healthError}</Alert>}
          {health && !health.gemini_configured && (
            <Alert>The analysis server has no Gemini key. Add GOOGLE_API_KEY to backend/.env and restart the server.</Alert>
          )}
          {health && !health.ffmpeg_available && (
            <Alert>The analysis server can&apos;t find FFmpeg. Install it and restart the server.</Alert>
          )}
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Step n={1} title="Footage" hint="The body-worn camera video as MP4 or MOV, or a YouTube link to publicly released footage.">
            <div className="inline-flex rounded-lg border border-hairline bg-sunken p-1" role="group" aria-label="Video source">
              {([["upload", "Upload a file", UploadIcon], ["youtube", "YouTube link", LinkIcon]] as const).map(([mode, label, Icon]) => (
                <button key={mode} type="button" aria-pressed={sourceMode === mode} onClick={() => setSourceMode(mode)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${sourceMode === mode ? "bg-raised text-ink shadow-sm ring-1 ring-inset ring-brass/40" : "text-muted hover:text-ink"}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {/* Visually hidden; the drop zone or file card below shows its focus ring (peer). */}
            <input ref={videoInput} id="video" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" className="peer sr-only"
              tabIndex={sourceMode === "upload" ? 0 : -1} onChange={(e) => pickVideo(e.target.files?.[0] ?? null)} />
            {sourceMode === "upload" ? (
              video ? (
                <div className={`mt-4 flex items-center gap-3 rounded-lg border border-hairline bg-sunken px-4 py-3 ${FOCUS_FROM_INPUT}`}>
                  <VideoIcon className="h-5 w-5 shrink-0 text-brass" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{video.name}</p>
                    <p className="text-xs text-muted">{(video.size / 1e6).toFixed(1)} MB</p>
                  </div>
                  <label htmlFor="video" className="cursor-pointer text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">Replace</label>
                  <button type="button" onClick={clearVideo} aria-label="Remove the video" className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink">
                    <CloseIcon />
                  </button>
                </div>
              ) : (
                <label htmlFor="video"
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); pickVideo(e.dataTransfer.files?.[0] ?? null); }}
                  className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-9 text-center transition-colors ${FOCUS_FROM_INPUT} ${dragging ? "border-brass bg-brass/5" : "border-hairline bg-sunken/60 hover:border-muted/50"}`}>
                  <UploadIcon className={`h-6 w-6 ${dragging ? "text-brass" : "text-muted"}`} />
                  <span className="text-sm text-ink">Drop the video here, or <span className="underline underline-offset-2">choose a file</span></span>
                  <span className="text-xs text-muted">MP4 or MOV · longer recordings are checked a minute at a time</span>
                </label>
              )
            ) : (
              <div className="mt-4">
                <label htmlFor="youtube" className={LABEL}>YouTube link</label>
                <input id="youtube" type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} required
                  placeholder="https://www.youtube.com/watch?v=…" className={`mt-1.5 text-sm ${INPUT}`} />
                <p className="mt-1.5 text-xs text-muted">The whole video is imported and analyzed, even if the link contains a timestamp.</p>
              </div>
            )}
          </Step>

          <Step n={2} title="Report" hint="The written police report. Each sentence of the narrative becomes a claim to check.">
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="report" className={LABEL}>Report narrative</label>
              <button type="button" onClick={() => reportInput.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink">
                <FileIcon className="h-3.5 w-3.5" /> {reportFile ? "Replace .txt" : "Attach .txt"}
              </button>
              <input ref={reportInput} type="file" accept=".txt,text/plain" hidden onChange={(e) => attachReport(e.target.files?.[0] ?? null)} />
            </div>
            <textarea id="report" value={report} onChange={(e) => setReport(e.target.value)} rows={11} required
              placeholder="I conducted a traffic stop on…" className={`mt-1.5 font-serif text-[15px] leading-7 ${INPUT}`} />
            <p className="mt-1.5 text-xs text-muted">
              {reportFile ? `Loaded from ${reportFile}; edit it here if needed.` : "Paste the narrative, or attach a text file and edit it here."}
            </p>
          </Step>

          <Step n={3} title="Case name" hint="Optional. Used in the case's address; one is generated if you leave it blank.">
            <label htmlFor="name" className="sr-only">Case name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. traffic-stop-3"
              className={`max-w-sm text-sm ${INPUT}`} />
          </Step>

          {notice && <p className="rounded-lg border border-hairline bg-raised px-4 py-3 text-sm text-ink-2" role="status">{notice}</p>}
          {error && <Alert>{error}</Alert>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
            <button type="submit" disabled={!canSubmit} className={BUTTON_PRIMARY}>
              {submitting ? (sourceMode === "youtube" ? "Importing the video…" : uploaded < 100 ? `Uploading… ${uploaded}%` : "Starting…") : "Analyze case"}
            </button>
            <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">Cancel</Link>
            {missing && !submitting && <span className="text-[13px] text-muted">{missing}</span>}
          </div>

          <p className="flex gap-2.5 pt-2 text-xs leading-5 text-muted">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Use publicly released footage only. Processing runs on this computer; the footage is sent to Gemini for analysis
              (and its audio to ElevenLabs for a transcript, if the server has that key). Results point to moments worth
              reviewing; they are not legal conclusions.
            </span>
          </p>
        </form>

        <AnalysisQueue onStopMine={stopMine} />
      </main>
    </div>
  );
}

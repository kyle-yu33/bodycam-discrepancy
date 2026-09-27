"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getHealth, type Health } from "@/lib/ledger";
import { AppHeader } from "@/components/AppHeader";
import { useUploads } from "@/components/Uploads";

type SourceMode = "upload" | "youtube";

export default function NewCase() {
  const uploads = useUploads();
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [name, setName] = useState("");
  const [report, setReport] = useState("");
  const [reportFile, setReportFile] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reportInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((e: Error) => setHealthError(e.message));
  }, []);

  function pickVideo(file: File | null) {
    setVideo(file);
  }

  async function attachReport(file: File | null) {
    if (!file) return;
    if (file.size > 200_000) { setError("Report must be 200 KB or smaller."); return; }
    setError("");
    setReport((await file.text()).replace(/^\uFEFF/, ""));
    setReportFile(file.name);
    if (reportInput.current) reportInput.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || (sourceMode === "upload" && !video) || !report.trim()) return;
    setSubmitting(true);
    const form = new FormData();
    if (sourceMode === "upload" && video) form.append("video", video);
    if (sourceMode === "youtube") form.append("youtube_url", youtubeUrl);
    form.append("report_text", report);
    form.append("name", name);
    uploads.start(form);
    router.push("/cases");
  }

  const blocked = health && (!health.gemini_configured || !health.ffmpeg_available);
  const canSubmit = (sourceMode === "upload" ? !!video : !!youtubeUrl.trim())
    && report.trim().length > 0 && !blocked && !submitting;
  return (
    <div className="min-h-screen">
      <AppHeader title="New case" />

      <main className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-3xl">New case</h1>
        <p className="mt-1 text-sm text-muted">
          Add body-worn camera footage and the written report. Each claim in the report is checked against the footage and
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

          <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border border-hairline bg-surface p-5">
            <label className="block">
              <span className="text-sm font-medium">Case name <span className="font-normal text-muted">(optional)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. traffic-stop-3"
                className="mt-2 block w-full rounded-lg border border-hairline bg-sunken px-3 py-2 text-sm" />
            </label>

            <fieldset className="block">
              <span className="text-sm font-medium">Footage</span>
              <span className="block text-xs text-muted">Upload MP4/MOV footage or import a full video from YouTube.</span>
              <div className="mt-2 flex gap-2" role="group" aria-label="Video source">
                <button type="button" aria-pressed={sourceMode === "upload"} onClick={() => setSourceMode("upload")}
                  className={`rounded-lg border px-3 py-2 text-sm ${sourceMode === "upload" ? "border-brass/50 bg-brand-soft text-ink" : "border-hairline"}`}>Upload video</button>
                <button type="button" aria-pressed={sourceMode === "youtube"} onClick={() => setSourceMode("youtube")}
                  className={`rounded-lg border px-3 py-2 text-sm ${sourceMode === "youtube" ? "border-brass/50 bg-brand-soft text-ink" : "border-hairline"}`}>YouTube link</button>
              </div>
              {sourceMode === "upload" ? <>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={() => videoInput.current?.click()} aria-describedby="video-filename"
                    className="shrink-0 rounded-lg border border-hairline bg-sunken px-3 py-2 text-sm text-ink-2 transition-colors hover:border-brass/50 hover:bg-hairline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                    {video ? "Replace video" : "Choose video"}
                  </button>
                  <span id="video-filename" className="min-w-0 break-words text-sm text-muted" aria-live="polite">{video?.name ?? "No video selected"}</span>
                  <input ref={videoInput} type="file" accept=".mp4,.mov,video/mp4,video/quicktime" hidden
                    onChange={(e) => pickVideo(e.target.files?.[0] ?? null)} />
                </div>
              </> : <div className="mt-3 space-y-3">
                <label className="block text-sm">YouTube video link
                  <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required
                    className="mt-1 block w-full rounded-lg border border-hairline bg-sunken px-3 py-2 text-sm" />
                </label>
                <p className="text-xs text-muted">The whole video is imported and analyzed, even if the link contains a timestamp.</p>
              </div>}
            </fieldset>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="report" className="text-sm font-medium">Report</label>
                <button type="button" onClick={() => reportInput.current?.click()}
                  className="rounded-md px-2 py-1 text-xs text-brass underline decoration-brass/40 underline-offset-2 transition-[background-color,color,text-decoration-color,transform] duration-200 hover:scale-[1.03] hover:bg-hairline hover:text-ink hover:decoration-ink motion-reduce:hover:scale-100">
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

            {error && <p role="alert" className="text-sm text-review">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={!canSubmit}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Starting…" : "Start analysis"}
              </button>
              <Link href="/cases" className="text-sm text-muted hover:text-ink">Cancel</Link>
            </div>

            <details className="text-xs text-muted"><summary className="cursor-pointer">How your footage is used</summary><p className="mt-2 leading-5">
              Use publicly released footage only. Processing runs on this computer; the footage is sent to Gemini for analysis
              (and its audio to ElevenLabs for a transcript, if the server has that key).
              Results point to moments worth reviewing; they are not legal conclusions.
            </p></details>
          </form>
      </main>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon } from "@/components/review/Icons";
import type { CaseJob } from "@/lib/ledger";
import { clock } from "@/lib/present";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, EYEBROW } from "./styles";

// The stages backend/app/cases.py reports through the job's progress callback, in order, with the progress
// fraction at which each one starts.
const STEPS = [
  { stage: "Preparing footage and tracking body pose", from: 0, title: "Prepare the footage and measure body pose",
    detail: "Normalize the video, then estimate body pose ten times a second: arms, hands, head and feet." },
  { stage: "Transcribing audio", from: 0.4, title: "Transcribe the audio",
    detail: "A timed transcript with speakers, when the server has an ElevenLabs key." },
  { stage: "Splitting the report into claims", from: 0.5, title: "Split the report into claims",
    detail: "One checkable claim per sentence: visual, audio, documentary or opinion." },
  { stage: "Checking each claim against the footage", from: 0.6, title: "Check each claim against the footage",
    detail: "Gemini watches the video and listens to the audio, with the pose measurements. Long videos are checked a minute at a time." },
  { stage: "Re-checking flags and building the ledger", from: 0.8, title: "Re-check flags and build the ledger",
    detail: "Each flag gets an independent look at a clean clip; unconfirmed flags become “insufficient footage”." },
];

/** The running step. "Starting", "Stopping after the current step" and unknown stages are placed by progress. */
function stepIndex(job: CaseJob): number {
  const named = STEPS.findIndex((s) => s.stage === job.stage);
  if (named >= 0) return named;
  return STEPS.reduce((at, s, i) => (job.progress >= s.from ? i : at), 0);
}

/** Full-page progress for one uploaded case, from queued to "opening the review". */
export function AnalysisScreen({ job, onStop, onRetry, children }: {
  job: CaseJob; onStop: () => void; onRetry: () => void; children?: ReactNode;
}) {
  const queued = job.status === "queued";
  const active = queued || job.status === "processing";
  const done = job.status === "complete";
  const failed = job.status === "failed";

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [active]);

  const started = Date.parse(job.created_at);
  const elapsed = now != null && Number.isFinite(started) ? Math.max(0, Math.round((now - started) / 1000)) : null;
  const current = queued ? -1 : done ? STEPS.length : stepIndex(job);
  const pct = Math.round((done ? 1 : job.progress) * 100);

  const eyebrow = done ? "Analysis complete" : failed ? "Analysis stopped" : queued ? "Queued" : `Step ${current + 1} of ${STEPS.length}`;
  const title = done ? "Opening the review…" : failed ? "The analysis couldn’t finish"
    : queued ? "Waiting for the analysis to start" : "Checking the report against the footage";

  return (
    <main className="el-enter mx-auto max-w-2xl px-4 pb-16 pt-12 sm:px-6">
      <p className={EYEBROW} aria-live="polite">{eyebrow}</p>
      <h1 className="mt-2 text-balance font-serif text-4xl font-medium tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        {job.filename} · case <span className="font-mono text-ink-2">{job.id}</span>
      </p>

      {failed ? (
        <div className="mt-8 rounded-xl border border-hairline bg-surface p-6 shadow-panel">
          <p className="text-sm leading-6 text-ink" role="alert">{job.error ?? "Unknown error."}</p>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Check the analysis server&apos;s log, then submit again. The form keeps your clip and report while this tab stays open.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={onRetry} className={BUTTON_PRIMARY}>Back to the form</button>
            <Link href="/" className={BUTTON_SECONDARY}>Home</Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-hairline bg-surface p-6 shadow-panel">
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-ink-2">
              {queued ? "Cases run one at a time, in upload order." : done ? "Every step finished." : job.stage}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {pct}%{elapsed != null && ` · ${clock(elapsed, 0)} elapsed`}
            </span>
          </div>
          <div role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brass transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
          </div>

          <ol className="relative mt-7 space-y-5 before:absolute before:bottom-2 before:left-2.75 before:top-2 before:w-px before:bg-hairline">
            {STEPS.map((s, i) => {
              const isDone = i < current, isCurrent = i === current;
              return (
                <li key={s.stage} aria-current={isCurrent ? "step" : undefined}
                  className={`relative flex gap-4 transition-opacity duration-300 ${i > current ? "opacity-45" : ""}`}>
                  <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${isDone ? "bg-brand text-white" : isCurrent ? "border-2 border-brass bg-surface text-brass" : "border border-hairline bg-surface text-muted"}`}>
                    {isDone ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                    {isCurrent && <span className="absolute -inset-1 rounded-full ring-2 ring-brass/30 motion-safe:animate-pulse" aria-hidden />}
                  </span>
                  <span className="pt-0.5">
                    <span className="block text-sm font-medium text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-muted">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {active && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button onClick={onStop} className="inline-flex h-10 items-center rounded-md border border-hairline px-4 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink">
            Stop analysis
          </button>
          <p className="text-[13px] leading-5 text-muted">You can leave this page; the case appears on the home page when it&apos;s ready.</p>
        </div>
      )}
      {done && (
        <Link href={`/cases/${encodeURIComponent(job.id)}?instant=1`} className={`mt-6 ${BUTTON_PRIMARY}`}>Open the review</Link>
      )}
      {children}
    </main>
  );
}

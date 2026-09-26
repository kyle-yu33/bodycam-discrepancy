"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCaseJob, listCaseJobs, stopCase, type CaseJob } from "@/lib/ledger";

const POLL_MS = 3000;

const queuedLabel = (ahead: number) => (ahead === 0 ? "Queued, next" : `Queued, ${ahead + 1} in line`);

// Uploads the backend is running or holding, plus the ones that finished while this page was open.
export function useCaseJobs(onComplete?: (job: CaseJob) => void) {
  const [active, setActive] = useState<CaseJob[]>([]);
  const [finished, setFinished] = useState<CaseJob[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const completeRef = useRef(onComplete);

  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let jobs: CaseJob[];
      try {
        jobs = await listCaseJobs();
      } catch {
        return;
      }
      if (!alive) return;
      const ids = new Set(jobs.map((j) => j.id));
      const gone = [...seen.current].filter((id) => !ids.has(id));
      seen.current = ids;
      setActive(jobs);
      // /case-jobs only lists active jobs, so ask each vanished one how it ended.
      for (const id of gone) {
        getCaseJob(id).then((job) => {
          if (!alive || (job.status !== "complete" && job.status !== "failed")) return;
          setFinished((f) => [job, ...f.filter((x) => x.id !== id)]);
          if (job.status === "complete") completeRef.current?.(job);
        }).catch(() => {});
      }
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [stopError, setStopError] = useState("");

  const dismiss = (id: string) => setFinished((f) => f.filter((x) => x.id !== id));
  const stop = async (id: string) => {
    if (!window.confirm(`Stop analyzing ${id}? The upload is deleted; upload it again to retry.`)) return;
    setStopError("");
    setStopping((s) => new Set(s).add(id));
    try {
      const job = await stopCase(id);
      seen.current.delete(id);  // it was stopped, not finished
      if (job.status !== "processing") setActive((a) => a.filter((x) => x.id !== id));
    } catch (e) {
      setStopError((e as Error).message);
      setStopping((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };
  return { active, finished, dismiss, stop, stopping, stopError };
}

export function QueueList({ active, finished = [], mine, onDismiss, onStop, stopping }: {
  active: CaseJob[]; finished?: CaseJob[]; mine?: string; onDismiss?: (id: string) => void;
  onStop?: (id: string) => void; stopping?: Set<string>;
}) {
  return (
    <ol className="space-y-3">
      {active.map((j, i) => (
        <li key={j.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="font-medium">{j.id}</span>
              <span className="text-muted"> · {j.filename}{j.id === mine ? " · your upload" : ""}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted">
              {j.status === "processing" ? "Running" : queuedLabel(active.slice(0, i).filter((x) => x.status === "queued").length)}
              {onStop && (
                <button onClick={() => onStop(j.id)} disabled={stopping?.has(j.id)}
                  className="rounded border border-hairline px-1.5 py-0.5 text-review hover:bg-review-bg disabled:opacity-60">
                  {stopping?.has(j.id) ? "Stopping…" : "Stop"}
                </button>
              )}
            </span>
          </div>
          <p className="text-xs text-muted">{stopping?.has(j.id) ? "Stopping after the current step" : j.status === "processing" ? j.stage : "Waiting to start"}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.round(j.progress * 100)}%` }} />
          </div>
        </li>
      ))}
      {finished.map((j) => (
        <li key={j.id} className="flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate">
              <span className="font-medium">{j.id}</span>
              <span className="text-muted"> · {j.filename}</span>
            </span>
            {j.status === "complete" ? (
              <Link href={`/cases/${encodeURIComponent(j.id)}?instant=1`} className="text-xs text-brand underline">Ready · open</Link>
            ) : (
              <span className="block text-xs text-review">Failed: {j.error ?? "unknown error"}</span>
            )}
          </span>
          {onDismiss && (
            <button onClick={() => onDismiss(j.id)} aria-label={`Dismiss ${j.id}`} className="shrink-0 text-muted hover:text-ink">×</button>
          )}
        </li>
      ))}
    </ol>
  );
}

// Header pill: shows only while something is queued, running, or just finished; opens the full list.
export function QueueMenu({ onComplete }: { onComplete?: (job: CaseJob) => void }) {
  const { active, finished, dismiss, stop, stopping, stopError } = useCaseJobs(onComplete);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!active.length && !finished.length) return null;
  const running = active.filter((j) => j.status === "processing").length;
  const queued = active.length - running;
  const ready = finished.filter((j) => j.status === "complete").length;
  const label = [running && `${running} analyzing`, queued && `${queued} queued`, !active.length && ready && `${ready} ready`,
    !active.length && !ready && `${finished.length} failed`].filter(Boolean).join(" · ");

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-hairline px-3 text-sm text-ink-2 transition-colors hover:bg-sunken">
        <span className={`h-2 w-2 rounded-full ${active.length ? "animate-pulse bg-review" : ready ? "bg-consistent" : "bg-review"}`} aria-hidden />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Analysis queue"
          className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg border border-hairline bg-raised p-4 text-left shadow-2xl">
          <h2 className="text-sm font-semibold">Analysis queue</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">Cases run one at a time, in upload order.</p>
          <QueueList active={active} finished={finished} onDismiss={dismiss} onStop={stop} stopping={stopping} />
          {stopError && <p className="mt-3 text-xs text-review" role="alert">{stopError}</p>}
        </div>
      )}
    </div>
  );
}

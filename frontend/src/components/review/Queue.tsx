"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteCase, releaseCaseMedia, listCaseJobs, stopCase, type CaseJob } from "@/lib/ledger";

const POLL_MS = 3000;

const queuedLabel = (ahead: number) => (ahead === 0 ? "Queued, next" : `Queued, ${ahead + 1} in line`);

// Persisted job history survives navigation and refresh, including failed uploads.
export function useCaseJobs(onComplete?: () => void) {
  const router = useRouter();
  const [active, setActive] = useState<CaseJob[]>([]);
  const [finished, setFinished] = useState<CaseJob[]>([]);
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [stopError, setStopError] = useState("");
  const [pollError, setPollError] = useState("");
  const dismissed = useRef<Set<string>>(new Set());
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let previous = new Map<string, string>();
    try { dismissed.current = new Set(JSON.parse(sessionStorage.getItem("dismissedJobs") ?? "[]")); } catch {}
    const load = async () => {
      try {
        const jobs = await listCaseJobs();
        if (!alive) return;
        setPollError("");
        const running = jobs.filter((j) => j.status === "queued" || j.status === "processing");
        setActive(running);
        setStopping(new Set(running.filter((j) => j.cancellation_requested).map((j) => j.id)));
        setFinished(jobs.filter((j) => (j.status === "complete" || j.status === "failed") && !dismissed.current.has(j.run_id)).reverse());
        if (jobs.some((job) => job.status === "complete" && previous.get(job.run_id) !== "complete")) {
          completeRef.current?.();
        }
        previous = new Map(jobs.map((j) => [j.run_id, j.status]));
      } catch (e) {
        if (alive) setPollError(`Queue update failed: ${(e as Error).message}`);
      } finally {
        if (alive) timer = setTimeout(load, POLL_MS);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const dismiss = (id: string) => {
    const job = finished.find((j) => j.id === id);
    if (job) dismissed.current.add(job.run_id);
    try { sessionStorage.setItem("dismissedJobs", JSON.stringify([...dismissed.current])); } catch {}
    setFinished((f) => f.filter((j) => j.id !== id));
  };
  const stop = async (id: string) => {
    if (!window.confirm(`Stop analyzing ${id} and delete its files?`)) return;
    setStopError("");
    setStopping((s) => new Set(s).add(id));
    try {
      const job = await stopCase(id, active.find((j) => j.id === id)?.run_id);
      if (job.status !== "processing") setActive((a) => a.filter((j) => j.id !== id));
    } catch (e) {
      setStopError((e as Error).message);
      setStopping((s) => { const next = new Set(s); next.delete(id); return next; });
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm(`Permanently delete ${id}, including its video, report, and analysis?`)) return;
    const restoreMedia = releaseCaseMedia(id);
    try {
      await deleteCase(id, finished.find((j) => j.id === id)?.run_id);
      setFinished((f) => f.filter((j) => j.id !== id));
      setStopError("");
      completeRef.current?.();
      if (window.location.pathname === `/cases/${encodeURIComponent(id)}`) router.push("/");
    } catch (e) { restoreMedia(); setStopError((e as Error).message); }
  };
  return { active, finished, dismiss, stop, remove, stopping, stopError: stopError || pollError };
}

export function QueueList({ active, finished = [], mine, onDismiss, onStop, onDelete, stopping }: {
  active: CaseJob[]; finished?: CaseJob[]; mine?: string; onDismiss?: (id: string) => void;
  onDelete?: (id: string) => void;
  onStop?: (id: string) => void; stopping?: Set<string>;
}) {
  return (
    <ol className="space-y-3">
      {active.map((j, i) => (
        <li key={j.run_id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="font-medium">{j.id}</span>
              <span className="text-muted"> · {j.filename}{j.id === mine ? " · your upload" : ""}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted">
              {j.status === "processing" ? "Running" : queuedLabel(active.slice(0, i).filter((x) => x.status === "queued").length)}
              {onStop && (
                <button onClick={() => onStop(j.id)} disabled={stopping?.has(j.id)}
                  className="rounded border border-hairline px-1.5 py-0.5 text-review transition-colors hover:border-review/40 hover:bg-review-bg hover:text-ink disabled:opacity-60">
                  {stopping?.has(j.id) ? "Stopping…" : "Stop"}
                </button>
              )}
            </span>
          </div>
          <p className="text-xs text-muted">{stopping?.has(j.id) ? "Stopping after the current step" : j.status === "processing" ? j.stage : "Waiting to start"}</p>
          {j.status === "processing" && <p className="text-xs text-muted">Estimated progress · {j.heartbeat_at ? `Last heartbeat ${new Date(j.heartbeat_at).toLocaleTimeString()}` : "Waiting for heartbeat"}</p>}
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.round(j.progress * 100)}%` }} />
          </div>
        </li>
      ))}
      {finished.map((j) => (
        <li key={j.run_id} className="flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate">
              <span className="font-medium">{j.id}</span>
              <span className="text-muted"> · {j.filename}</span>
            </span>
            {j.status === "complete" ? (
              <Link href={`/cases/${encodeURIComponent(j.id)}?instant=1`} className="text-xs text-brand underline decoration-brand/40 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink">Ready · open</Link>
            ) : (
              <span className="block text-xs text-review">Failed: {j.error ?? "unknown error"}</span>
            )}
          </span>
          {onDelete && <button onClick={() => onDelete(j.id)} className="shrink-0 px-1 text-xs text-review">Delete</button>}
          {onDismiss && (
            <button onClick={() => onDismiss(j.id)} aria-label={`Dismiss ${j.id}`} className="shrink-0 rounded px-1 text-muted transition-colors hover:bg-hairline hover:text-ink">×</button>
          )}
        </li>
      ))}
    </ol>
  );
}

// Header pill: shows only while something is queued, running, or just finished; opens the full list.
export function QueueMenu({ onComplete }: { onComplete?: () => void }) {
  const { active, finished, dismiss, stop, remove, stopping, stopError } = useCaseJobs(onComplete);
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

  if (!active.length && !finished.length && !stopError) return null;
  const running = active.filter((j) => j.status === "processing").length;
  const queued = active.length - running;
  const ready = finished.filter((j) => j.status === "complete").length;
  const label = [running && `${running} analyzing`, queued && `${queued} queued`, !active.length && ready && `${ready} ready`,
    !active.length && !ready && `${finished.length} failed`].filter(Boolean).join(" · ");

  return (
    <div ref={box} className="relative z-50">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm transition-colors ${open ? "border-brass/50 bg-hairline text-ink" : "border-hairline text-ink-2 hover:border-brass/50 hover:bg-hairline hover:text-ink"}`}>
        <span className={`h-2 w-2 rounded-full ${active.length ? "animate-pulse bg-review" : ready ? "bg-consistent" : "bg-review"}`} aria-hidden />
        {label || "Queue unavailable"}
      </button>
      {open && (
        <div role="dialog" aria-label="Analysis queue"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-hairline bg-raised p-4 text-left shadow-2xl">
          <h2 className="text-sm font-semibold">Analysis queue</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">Cases run one at a time, in upload order.</p>
          <QueueList active={active} finished={finished} onDismiss={dismiss} onDelete={remove} onStop={stop} stopping={stopping} />
          {stopError && <p className="mt-3 text-xs text-review" role="alert">{stopError}</p>}
        </div>
      )}
    </div>
  );
}

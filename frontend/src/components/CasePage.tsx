"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { Workspace } from "./review/Workspace";
import { useCaseJobs } from "./review/Queue";
import { getCaseJob, type CaseJob } from "@/lib/ledger";
import { caseMeta } from "@/lib/present";
export function CasePage({ caseId }: { caseId: string }) {
  const [job, setJob] = useState<CaseJob | null>(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const { allJobs, stop, remove, stopping, stopError } = useCaseJobs();
  useEffect(() => {
    let alive = true;
    let seenJob = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await getCaseJob(caseId);
        if (!alive) return;
        seenJob = true;
        setJob(next); setError("");
        if (next.status === "complete") { setReview(true); return; }
      } catch (e) {
        if (!alive) return;
        if ((e as Error & { status?: number }).status === 404) {
          if (seenJob) setMissing(true); else setReview(true); // Examples have results, but no upload job.
          return;
        }
        setError((e as Error).message);
      }
      if (alive) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [caseId]);
  if (review) return <Workspace key={caseId} caseId={caseId} />;
  const queued = allJobs.filter((j) => j.status === "queued");
  const position = queued.findIndex((j) => j.id === caseId) + 1;
  const failed = job?.status === "failed";
  return <div className="min-h-screen"><AppHeader title={caseMeta(caseId).title} /><main className="mx-auto max-w-2xl p-6 py-12">
    <Link href="/cases" className="text-sm text-muted hover:underline">← Back to cases</Link>
    <h1 className="mt-6 break-words font-serif text-3xl">{caseMeta(caseId).title}</h1>
    <section className="mt-6 rounded-xl border border-hairline bg-surface p-6" aria-live="polite">
      <h2 className="text-lg font-medium">{missing ? "Case deleted" : failed ? "Analysis couldn’t finish" : job?.cancellation_requested ? "Stopping analysis" : job?.status === "queued" ? "Waiting to start" : job ? "Analysis in progress" : "Loading case…"}</h2>
      {!missing && job && <><p className="mt-2 text-sm text-muted">{failed ? "Your case is still listed so you can inspect the error or delete it before uploading again." : job.status === "queued" ? `${position ? `Position ${position} in the waiting queue. ` : ""}Cases run one at a time.` : job.stage}</p>
        {!failed && <><progress className="mt-5 w-full" max={1} value={job.progress} aria-label="Estimated analysis progress" /><p className="mt-2 text-xs text-muted">Estimated progress · You can leave this page and return from Cases or Queue.</p></>}
        <details className="mt-5 text-sm text-muted"><summary className="cursor-pointer">Processing details</summary><div className="mt-3 space-y-2"><div>Submitted: {new Date(job.created_at).toLocaleString()}</div><div>Stage: {job.stage}</div>{job.heartbeat_at && <div>Last worker update: {new Date(job.heartbeat_at).toLocaleTimeString()}</div>}{job.error && <div className="break-words text-review">{job.error}</div>}</div></details>
        <div className="mt-6 flex gap-4">{failed ? <><Link href="/new" className="text-sm underline">Upload again</Link><button onClick={() => remove(caseId)} className="text-sm text-review">Delete case</button></> : <button disabled={stopping.has(caseId) || job.cancellation_requested} onClick={() => stop(caseId)} className="text-sm text-review disabled:opacity-50">{job.cancellation_requested ? "Stopping…" : "Stop and delete"}</button>}</div>
      </>}
      {(error || stopError) && <p role="alert" className="mt-4 break-words text-sm text-review">{error || stopError}</p>}
    </section>
  </main></div>;
}

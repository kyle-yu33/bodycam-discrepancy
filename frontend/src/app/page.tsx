"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listCases, type CaseSummary } from "@/lib/ledger";
import { QueueList, useCaseJobs } from "@/components/review/Queue";
import { caseMeta } from "@/lib/present";

export default function Home() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => listCases()
    .then((items) => { setCases(items); setError(""); })
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false)), []);
  const { active, finished, dismiss, stop, remove, stopping, stopError } = useCaseJobs(refresh);
  useEffect(() => { void refresh(); }, [refresh]);
  const failed = finished.filter((job) => job.status === "failed");

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <Link href="/" aria-label="EvidenceLens home" className="font-serif text-2xl font-semibold">EvidenceLens</Link>
        <Link href="/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hi">New case</Link>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <div>
          <h1 className="font-serif text-3xl">Your cases</h1>
          <p className="mt-2 text-sm text-muted">Open a case to review its evidence, or upload footage and a report. Analyses continue when you leave the upload page.</p>
        </div>
        {(active.length > 0 || failed.length > 0 || stopError) && (
          <section className="rounded-xl border border-hairline bg-surface p-5" aria-label="Analysis queue">
            <h2 className="mb-4 font-semibold">Analysis queue</h2>
            <QueueList active={active} finished={failed} onDismiss={dismiss} onStop={stop} onDelete={remove} stopping={stopping} />
            {stopError && <p role="alert" className="mt-3 text-sm text-review">{stopError}</p>}
          </section>
        )}
        {error && <div role="alert" className="text-sm text-review">{error} <button onClick={refresh} className="underline">Retry</button></div>}
        {loading && <p className="text-sm text-muted">Loading cases...</p>}
        {!loading && !error && !cases.length && <p className="text-sm text-muted">No completed cases yet. You can start a new case above.</p>}
        <ul className="grid gap-4 sm:grid-cols-2">
          {cases.map((item) => (
            <li key={item.case} className="rounded-xl border border-hairline bg-surface p-5">
              <Link href={`/cases/${encodeURIComponent(item.case)}?instant=1`} className="font-serif text-xl underline-offset-4 hover:underline">{caseMeta(item.case).title}</Link>
              <p className="mt-2 text-xs text-muted">{item.claims} claims · {item.origin === "demo" ? "Demo case" : "Uploaded case"}</p>
              {item.origin === "upload" && <button onClick={() => remove(item.case)} className="mt-4 text-xs text-review underline">Delete case</button>}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

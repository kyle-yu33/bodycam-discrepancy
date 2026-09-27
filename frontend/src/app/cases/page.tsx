"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppActions } from "@/components/AppHeader";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Transfers } from "@/components/Uploads";
import { useCaseJobs } from "@/components/review/Queue";
import { listCases, type CaseSummary } from "@/lib/ledger";
import { caseMeta, exampleRank } from "@/lib/present";
export default function Cases() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [examples, setExamples] = useState(false);
  const refresh = useCallback(() => listCases().then((items) => { setCases(items); setError(""); })
    .catch((e: Error) => setError(e.message)).finally(() => setLoading(false)), []);
  const { allJobs, active, remove, stop, stopping, stopError } = useCaseJobs(refresh);
  useEffect(() => { void refresh(); }, [refresh]);
  const ids = new Set([...cases.map((c) => c.case), ...allJobs.map((j) => j.id)]);
  const rows = [...ids].map((id) => ({ id, result: cases.find((c) => c.case === id), job: allJobs.find((j) => j.id === id) }))
    .filter(({ id, result }) => (result?.origin === "demo") === examples && caseMeta(id).title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (examples ? exampleRank(a.id) - exampleRank(b.id) : 0) || (b.job?.created_at ?? b.result?.created_at ?? "").localeCompare(a.job?.created_at ?? a.result?.created_at ?? ""));
  return <div className="min-h-screen"><SiteHeader><AppActions /></SiteHeader><main className="mx-auto max-w-5xl space-y-6 p-6">
    <div><h1 className="font-serif text-3xl">Cases</h1><p className="mt-2 text-sm text-muted">Upload footage, follow its analysis, and review the evidence.</p></div>
    <Transfers knownIds={[...ids]} />
    {active.length > 0 && <p className="text-sm text-muted">{active.filter((j) => j.status === "processing").length} analyzing · {active.filter((j) => j.status === "queued").length} queued. Open Queue for progress and processing order.</p>}
    <div className="flex flex-wrap gap-3"><div className="flex gap-1 rounded-lg border border-hairline p-1" role="group" aria-label="Case collection">{[false, true].map((value) => <button key={String(value)} aria-pressed={examples === value} onClick={() => setExamples(value)} className={`rounded-md px-3 py-1.5 text-sm ${examples === value ? "bg-hairline text-ink" : "text-muted"}`}>{value ? "Examples" : "Your cases"}</button>)}</div><input aria-label="Search cases" placeholder="Search cases" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm" /></div>
    {(error || stopError) && <p role="alert" className="text-sm text-review">{error || stopError} <button onClick={refresh} className="underline">Refresh cases</button></p>}
    {loading ? <p>Loading cases…</p> : !rows.length ? <div className="rounded-xl border border-dashed border-hairline p-10 text-center"><h2 className="font-serif text-2xl">{search ? "No matching cases" : examples ? "No examples available" : "Your first case starts here"}</h2><p className="mt-2 text-sm text-muted">{search ? "Try a different search." : "Add footage and a report to start a review."}</p>{!examples && !search && <Link href="/new" className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-white">New case</Link>}</div> :
    <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">{rows.map(({ id, result, job }) => {
      const running = job && ["queued", "processing"].includes(job.status);
      const status = job?.cancellation_requested ? "Stopping" : job?.status === "failed" ? "Failed" : result || job?.status === "complete" ? "Ready for review" : job?.status === "processing" ? "Analyzing" : "Queued";
      return <li key={id} className="flex items-center gap-4 p-5"><Link href={`/cases/${encodeURIComponent(id)}`} className="min-w-0 flex-1"><h2 className="truncate font-serif text-xl hover:underline">{caseMeta(id).title}</h2><p className="mt-1 text-xs text-muted">{new Date(job?.created_at ?? result?.created_at ?? "").toLocaleDateString()}{result ? ` · ${result.claims} claims` : ""}</p></Link><span className={`text-sm ${status === "Failed" ? "text-review" : "text-muted"}`}>{status}</span>{!examples && <details className="relative"><summary aria-label={`Actions for ${caseMeta(id).title}`} className="cursor-pointer list-none rounded px-3 py-2 hover:bg-hairline">•••</summary><div className="absolute right-0 z-10 w-40 rounded-lg border border-hairline bg-raised p-2 shadow-xl"><button disabled={stopping.has(id)} onClick={() => running ? stop(id) : remove(id)} className="w-full rounded p-2 text-left text-sm text-review hover:bg-review-bg">{running ? "Stop and delete" : "Delete case"}</button></div></details>}</li>;
    })}</ul>}
  </main></div>;
}

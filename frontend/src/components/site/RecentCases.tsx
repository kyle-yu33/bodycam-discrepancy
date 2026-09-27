"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listCases, type CaseSummary } from "@/lib/ledger";
import { caseMeta } from "@/lib/present";
import { ArrowRight } from "@/components/review/Icons";

// Every case with a finished analysis, newest first, one row each; a row opens straight onto its results.
export function RecentCases() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    listCases()
      .then((all) => setCases([...all].sort((a, b) => b.created_at.localeCompare(a.created_at))))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <p className="text-sm leading-6 text-muted">The analysis server isn&apos;t reachable, so saved cases can&apos;t be listed. Start it, then refresh.</p>;
  }
  if (!cases) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading cases">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-surface motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (!cases.length) {
    return (
      <p className="text-sm leading-6 text-muted">
        No analyzed cases yet. <Link href="/new" className="text-ink-2 underline underline-offset-2 hover:text-ink">Upload a report and its footage</Link> to start one.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {cases.map((c) => {
        const meta = caseMeta(c.case);
        const flagged = c.potential_inconsistency;
        return (
          <li key={c.case}>
            <Link href={`/cases/${encodeURIComponent(c.case)}?instant=1`}
              className="group -mx-3 flex items-center gap-4 rounded-md px-3 py-4 transition-colors hover:bg-surface">
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-lg leading-6 text-ink">{meta.title}</p>
                <p className="truncate text-[13px] text-muted">
                  {[meta.setting || "Uploaded footage", `${c.claims} claims`, c.origin === "upload" ? "uploaded" : "demo"].join(" · ")}
                </p>
              </div>
              {flagged > 0 && (
                <span className="hidden shrink-0 items-center gap-1.5 text-[13px] text-review sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-review-bar" aria-hidden />
                  {flagged} review recommended
                </span>
              )}
              <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

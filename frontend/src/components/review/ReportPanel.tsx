"use client";
import { useMemo } from "react";
import type { ClaimResult, Status } from "@/lib/ledger";
import { CLAIM_TYPE, STATUS, type ParsedReport, segment, windowLabel } from "@/lib/present";
import { StatusBadge } from "./Chrome";
import { FileIcon, InfoIcon } from "./Icons";

export type ReportView = "report" | "claims";

function Tabs({ view, setView, revealed, count }: { view: ReportView; setView: (v: ReportView) => void; revealed: boolean; count: number }) {
  return (
    <div className="flex h-12 shrink-0 items-stretch gap-6 border-b border-hairline px-6" role="tablist" aria-label="Report view">
      {(["report", "claims"] as const).map((v) => {
        const active = view === v || (!revealed && v === "report");
        return (
          <button key={v} role="tab" aria-selected={active} onClick={() => setView(v)} disabled={v === "claims" && !revealed}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-brass font-medium text-ink" : "border-transparent text-muted hover:border-brass/45 hover:text-ink"}`}>
            {v === "report" ? <><FileIcon className="h-4 w-4" /> Report</> : <>Claims {revealed && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-muted">{count}</span>}</>}
          </button>
        );
      })}
    </div>
  );
}

export function ReportPanel({ report, results, revealed, selectedId, onSelect, filter, view, setView }: {
  report: ParsedReport; results: ClaimResult[]; revealed: boolean; selectedId: string | null;
  onSelect: (id: string) => void; filter: Status | null; view: ReportView; setView: (v: ReportView) => void;
}) {
  const segments = useMemo(() => segment(report.narrative, results), [report.narrative, results]);
  const showClaims = revealed && view === "claims";

  return (
    <section className="relative flex min-h-105 flex-col overflow-hidden rounded-xl border border-hairline bg-surface bg-[linear-gradient(180deg,rgb(123_30_44/0.16),transparent_260px)] shadow-panel before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-linear-to-r before:from-brand-hi before:via-brand before:to-transparent xl:min-h-0" aria-label="Written report">
      <Tabs view={view} setView={setView} revealed={revealed} count={results.length} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!showClaims ? (
          <article className="@container px-7 pb-8 pt-5">
            {report.disclaimer && (
              <p className="mb-5 flex gap-2 rounded-md border-l-2 border-brand-hi bg-brand-soft px-3 py-2.5 text-xs leading-5 text-ink-2">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose" />
                <span>Fictional report, written by our team for this demonstration. It deliberately misdescribes the footage.</span>
              </p>
            )}
            {report.fields.length > 0 && (
              <dl className="mb-6 grid grid-cols-1 gap-x-5 gap-y-3 border-b border-hairline pb-5 @[22rem]:grid-cols-2">
                {report.fields.map(([k, v]) => (
                  <div key={k} className={v.length > 26 ? "@[22rem]:col-span-2" : ""}>
                    <dt className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{k}</dt>
                    <dd className="mt-0.5 text-[13px] leading-5 text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-rose">Narrative</p>
            <div className="whitespace-pre-wrap font-serif text-[18px] leading-[1.75] text-ink">
              {segments.map((seg, i) => {
                const r = seg.result;
                if (!r || !revealed) return <span key={i}>{seg.text}</span>;
                const s = STATUS[r.status];
                const selected = r.claim.id === selectedId;
                const dimmed = filter !== null && r.status !== filter;
                return (
                  <span key={i}
                    role="button" tabIndex={0} aria-pressed={selected}
                    aria-label={`Claim ${seg.n}, ${s.label}: ${r.claim.text}`}
                    title={`Claim ${seg.n} · ${s.short}`}
                    onClick={() => onSelect(r.claim.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.claim.id); } }}
                    style={{ animationDelay: `${(seg.n ?? 0) * 70}ms` }}
                    className={`transition-[background-color,opacity] duration-200 [box-decoration-break:clone] ${r.status === "potential_inconsistency" ? "el-mark rounded-[3px] px-[3px] py-px" : "rounded-[2px]"} ${selected ? s.markSelected : s.mark} ${dimmed ? "opacity-35" : ""}`}>
                    {seg.text}
                  </span>
                );
              })}
            </div>
            {revealed && (
              <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-4 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] bg-review-mark" /> Review recommended</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-4 border-b border-dotted border-ink/40" /> Other claims</span>
                <span>Select any sentence to see its evidence.</span>
              </p>
            )}
          </article>
        ) : (
          <ol className="divide-y divide-hairline">
            {results.map((r, i) => {
              if (filter && r.status !== filter) return null;
              const selected = r.claim.id === selectedId;
              return (
                <li key={r.claim.id}>
                  <button onClick={() => onSelect(r.claim.id)} aria-pressed={selected}
                    className={`flex w-full gap-4 border-l-2 px-6 py-4 text-left transition-colors ${selected ? "border-brass bg-brand-soft" : "border-transparent hover:bg-hairline"}`}>
                    <span className="w-6 shrink-0 pt-0.5 font-serif text-[15px] tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[16px] leading-6 text-ink">{r.claim.text}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <StatusBadge status={r.status} />
                        <span>{CLAIM_TYPE[r.claim.claim_type]}</span>
                        {windowLabel(r) && <span className="font-mono tabular-nums">{windowLabel(r)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

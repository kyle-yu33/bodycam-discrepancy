"use client";
import { useMemo } from "react";
import type { ClaimResult, Status } from "@/lib/ledger";
import { CLAIM_TYPE, STATUS, parseReport, segment, windowLabel } from "@/lib/present";
import { StatusBadge } from "./Chrome";

export type ReportView = "report" | "claims";

export function ReportPanel({ reportText, results, revealed, selectedId, onSelect, filter, view, setView }: {
  reportText: string; results: ClaimResult[]; revealed: boolean; selectedId: string | null;
  onSelect: (id: string) => void; filter: Status | null; view: ReportView; setView: (v: ReportView) => void;
}) {
  const report = useMemo(() => parseReport(reportText), [reportText]);
  const segments = useMemo(() => segment(report.narrative, results), [report.narrative, results]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-card shadow-sm" aria-label="Report">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Written report</h2>
        <div className="flex gap-1 rounded-lg bg-paper p-0.5 text-xs" role="tablist">
          {(["report", "claims"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} disabled={v === "claims" && !revealed}
              className={`rounded-md px-2.5 py-1 capitalize disabled:opacity-40 ${view === v ? "bg-card font-medium shadow-sm" : "text-muted"}`}>
              {v === "claims" ? `Claims${revealed ? ` (${results.length})` : ""}` : "Report"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {view === "report" || !revealed ? (
          <article>
            {report.disclaimer && (
              <p className="mb-4 rounded-md border border-dashed border-review/40 bg-review-bg/50 px-3 py-2 text-xs text-review">
                {report.disclaimer}
              </p>
            )}
            {report.fields.length > 0 && (
              <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-line pb-4 text-xs">
                {report.fields.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="uppercase tracking-wide text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Narrative</p>
            <div className="whitespace-pre-wrap font-serif text-[15px] leading-8">
              {segments.map((seg, i) => {
                const r = seg.result;
                if (!r || !revealed) return <span key={i}>{seg.text}</span>;
                const s = STATUS[r.status];
                const selected = r.claim.id === selectedId;
                const dimmed = filter !== null && r.status !== filter;
                return (
                  <span key={i}
                    role="button" tabIndex={0} aria-pressed={selected}
                    aria-label={`Claim ${seg.n}: ${STATUS[r.status].label}`}
                    onClick={() => onSelect(r.claim.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.claim.id); } }}
                    style={{ animationDelay: `${(seg.n ?? 0) * 90}ms` }}
                    className={`el-reveal cursor-pointer rounded px-0.5 [box-decoration-break:clone] underline decoration-2 underline-offset-4 transition ${selected ? s.markSelected : s.mark} ${dimmed ? "opacity-35" : ""}`}>
                    <sup className={`mr-0.5 select-none font-sans text-[10px] font-bold ${s.text}`}>{seg.n}</sup>
                    {seg.text}
                  </span>
                );
              })}
            </div>
          </article>
        ) : (
          <ol className="space-y-2">
            {results.map((r, i) => {
              if (filter && r.status !== filter) return null;
              const selected = r.claim.id === selectedId;
              return (
                <li key={r.claim.id}>
                  <button onClick={() => onSelect(r.claim.id)} aria-pressed={selected}
                    className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-brand bg-paper shadow-sm" : "border-line hover:bg-paper"}`}>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-ink">#{i + 1}</span>
                      <span>{CLAIM_TYPE[r.claim.claim_type]}</span>
                      {windowLabel(r) && <span className="font-mono">{windowLabel(r)}</span>}
                      <span className="ml-auto"><StatusBadge status={r.status} /></span>
                    </div>
                    <p className="mt-1.5 font-serif text-sm leading-6">{r.claim.text}</p>
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

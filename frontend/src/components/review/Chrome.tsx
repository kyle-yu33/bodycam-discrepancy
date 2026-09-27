"use client";
import type { Status } from "@/lib/ledger";
import { STATUS, STATUS_ORDER, caseMeta } from "@/lib/present";
import { AppHeader } from "@/components/AppHeader";
import { CheckIcon, CloseIcon, HelpIcon, ShieldCheck } from "./Icons";

export type Phase = "loading" | "ready" | "analyzing" | "loaded" | "failed";

export function StatusBadge({ status, size = "sm" }: { status: Status; size?: "sm" | "lg" }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 ring-1 ring-inset font-medium ${s.badge} ${size === "lg" ? "rounded-md px-3 py-1.5 text-left text-[13px] leading-5" : "whitespace-nowrap rounded-full px-2 py-0.5 text-xs"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {size === "lg" ? s.label : s.short}
    </span>
  );
}

export function TopBar({ caseId, onHow }: { caseId: string; onHow: () => void }) {
  return <AppHeader title={caseMeta(caseId).title}><button onClick={onHow} aria-label="How it works" className="rounded-lg p-2 text-muted hover:bg-hairline"><HelpIcon className="h-4 w-4" /></button></AppHeader>;
}

/** One slim line: serif matter title and details, then the findings summary (which doubles as the status filter). */
export function MatterHeader({ caseId, fields, duration, phase, counts, total, filter, setFilter }: {
  caseId: string; fields: [string, string][]; duration: number | null; phase: Phase;
  counts: Record<Status, number>; total: number; filter: Status | null; setFilter: (s: Status | null) => void;
}) {
  const meta = caseMeta(caseId);
  const officer = fields.find(([k]) => k.toLowerCase() === "reporting officer")?.[1];
  const loaded = phase === "loaded";
  const length = duration != null ? `${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")} of footage` : "";
  const details = [meta.setting, length].filter(Boolean).join(" · ");
  const sep = " · ";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        <h1 className="font-serif text-[27px] font-medium leading-none tracking-tight text-ink">{meta.title}</h1>
        <span className="text-[13px] text-muted">{details}{officer && <span className="hidden min-[1700px]:inline">{sep}{officer}</span>}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brass/10 px-2 py-0.5 text-xs font-medium text-brass ring-1 ring-inset ring-brass/25">
          <ShieldCheck className="h-3.5 w-3.5" /> Human review required
        </span>
      </div>

      <div className="flex items-center gap-3">
        {loaded && filter && (
          <button onClick={() => setFilter(null)} className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-ink">Show all {total}</button>
        )}
        {!loaded ? (
          <span className="rounded-full border border-hairline px-3 py-1.5 text-xs text-muted">
            {phase === "analyzing" ? "Analyzing…" : phase === "failed" ? "Analysis unavailable" : "Awaiting analysis"}
          </span>
        ) : (
          <div className="flex overflow-hidden rounded-lg border border-hairline bg-surface" role="group" aria-label="Findings by status">
            {STATUS_ORDER.map((s, i) => {
              const active = filter === s;
              return (
                <button key={s} disabled={!loaded} onClick={() => setFilter(active ? null : s)} aria-pressed={active}
                  title={loaded ? `Show only: ${STATUS[s].label}` : undefined}
                  className={`flex items-baseline gap-2 px-3.5 py-2 transition-colors disabled:cursor-default ${i ? "border-l border-hairline" : ""} ${active ? STATUS[s].tint : loaded ? "hover:bg-hairline" : ""}`}>
                  <span className={`font-serif text-xl leading-none tabular-nums ${loaded ? (s === "potential_inconsistency" ? "text-review" : "text-ink") : "text-hairline"}`}>
                    {loaded ? counts[s] : "–"}
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS[s].dot}`} aria-hidden />{STATUS[s].short}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const STEPS = [
  { title: "Prepare the footage", detail: "Normalize the clip; keep original timestamps and audio." },
  { title: "Measure body pose", detail: "Pose estimation at 10 frames per second: arms, hands, head, feet." },
  { title: "Split the report into claims", detail: "One checkable claim per sentence, typed visual, audio, documentary or opinion." },
  { title: "Check each claim against the footage", detail: "Gemini watches the video and listens to the audio, with the pose measurements." },
  { title: "Re-check every flag independently", detail: "A fresh look at a clean, narrow clip. Unconfirmed flags become “insufficient footage”." },
  { title: "Assemble the evidence ledger", detail: "Status, time window, observation and source frames for every claim." },
];

export function AnalyzeProgress({ step, model, createdAt }: { step: number; model: string; createdAt: string }) {
  return (
    <div className="el-enter">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Analysis</p>
      <h2 className="mt-1 font-serif text-2xl text-ink">Checking the report against the footage</h2>
      <ol className="relative mt-6 space-y-5 before:absolute before:bottom-2 before:left-2.75 before:top-2 before:w-px before:bg-hairline">
        {STEPS.map((s, i) => {
          const done = i < step, current = i === step;
          return (
            <li key={s.title} className={`relative flex gap-4 transition-opacity duration-300 ${i > step ? "opacity-45" : ""}`}>
              <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-brand text-white" : current ? "border-2 border-brass bg-surface text-brass" : "border border-hairline bg-surface text-muted"}`}>
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="pt-0.5">
                <span className="block text-sm font-medium text-ink">{s.title}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-muted">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 border-t border-hairline pt-4 text-xs leading-5 text-muted">
        Replaying the cached analysis ({model}, {new Date(createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}). The demo never depends on a live model call.
      </p>
    </div>
  );
}

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal aria-label="How EvidenceLens works">
      <div className="el-enter h-full w-full max-w-110 overflow-y-auto border-l border-hairline bg-raised px-8 py-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Method</p>
            <h2 className="mt-1 font-serif text-[26px] text-ink">How EvidenceLens works</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted transition-colors hover:bg-hairline hover:text-ink" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink-2">
          Each claim in the written report is located in the footage, checked, and linked to its source moment. The tool points to what deserves a closer look; the lawyer decides what it means.
        </p>
        <ol className="mt-6 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="font-serif text-lg leading-6 text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block text-sm font-medium text-ink">{s.title}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-muted">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <h3 className="mt-8 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">The four statuses</h3>
        <ul className="mt-3 space-y-4">
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <StatusBadge status={s} size="lg" />
              <p className="mt-1.5 text-[13px] leading-5 text-muted">{STATUS[s].why}</p>
            </li>
          ))}
        </ul>
        <h3 className="mt-8 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Keyboard</h3>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          {[["↑ ↓", "Previous / next claim"], ["P", "Play the selected moment"], ["O", "Toggle the pose overlay"], ["Esc", "Back to findings"]].map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border border-hairline bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{k}</kbd></dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 rounded-lg bg-sunken px-4 py-3 text-xs leading-5 text-ink-2">
          This prototype surfaces source-linked review questions. It does not make legal conclusions. The reports are fictional and written by our team; the footage is publicly released.
        </p>
      </div>
    </div>
  );
}

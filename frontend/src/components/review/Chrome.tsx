"use client";
import Link from "next/link";
import type { CaseSummary, Status } from "@/lib/ledger";
import { STATUS, STATUS_ORDER, caseMeta } from "@/lib/present";

export type Phase = "loading" | "ready" | "analyzing" | "loaded" | "failed";

export function StatusBadge({ status, size = "sm" }: { status: Status; size?: "sm" | "lg" }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-medium ${s.badge} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {size === "lg" ? s.label : s.short}
    </span>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <circle cx="14" cy="14" r="6.5" fill="none" stroke="white" strokeWidth="2.5" />
      <path d="M19 19l6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M11 14h6" stroke="#f5c96a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  loading: "Loading case",
  ready: "Ready",
  analyzing: "Analyzing",
  loaded: "Demo result loaded",
  failed: "Analysis failed",
};

export function Header({ caseId, cases, phase, onAnalyze, onHow }: {
  caseId: string; cases: CaseSummary[]; phase: Phase; onAnalyze: () => void; onHow: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-card px-5 py-3">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">EvidenceLens</span>
      </Link>

      <nav className="flex gap-1 rounded-lg bg-paper p-1" aria-label="Demo cases">
        {(cases.length ? cases.map((c) => c.case) : [caseId]).map((id) => (
          <Link key={id} href={`/cases/${id}`} aria-current={id === caseId ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition ${id === caseId ? "bg-card font-medium shadow-sm" : "text-muted hover:text-ink"}`}>
            {caseMeta(id).title}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2.5 py-1 text-muted">Demo case: public footage, team-written report</span>
        <span className="rounded-full bg-ink px-2.5 py-1 font-medium text-white">Human review required</span>
        <span className="flex items-center gap-1.5 px-1 text-muted" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${phase === "loaded" ? "bg-consistent" : phase === "analyzing" ? "animate-pulse bg-review" : phase === "failed" ? "bg-review" : "bg-insufficient"}`} />
          {PHASE_LABEL[phase]}
        </span>
        <button onClick={onHow} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-paper">How it works</button>
        <button onClick={onAnalyze} disabled={phase === "analyzing" || phase === "loading"}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
          {phase === "analyzing" ? "Analyzing…" : phase === "loaded" ? "Analyze again" : "Analyze case"}
        </button>
      </div>
    </header>
  );
}

export function SummaryBar({ counts, total, filter, setFilter, model, createdAt }: {
  counts: Record<Status, number>; total: number; filter: Status | null; setFilter: (s: Status | null) => void;
  model: string; createdAt: string;
}) {
  return (
    <div className="el-fade-up flex flex-wrap items-center gap-2 border-b border-line bg-card/60 px-5 py-2.5">
      <span className="mr-2 text-sm">
        <strong className="text-review">{counts.potential_inconsistency}</strong> of {total} claims recommended for review
      </span>
      {STATUS_ORDER.map((s) => (
        <button key={s} onClick={() => setFilter(filter === s ? null : s)} aria-pressed={filter === s}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition ${filter === s ? STATUS[s].badge + " font-semibold" : "bg-card text-muted ring-line hover:text-ink"}`}>
          <span className={`h-2 w-2 rounded-full ${STATUS[s].dot}`} />
          {STATUS[s].short} <span className="tabular-nums">{counts[s]}</span>
        </button>
      ))}
      {filter && <button onClick={() => setFilter(null)} className="text-xs text-muted underline">Show all</button>}
      <span className="ml-auto text-xs text-muted">
        Cached analysis · {model} · {new Date(createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
      </span>
    </div>
  );
}

export const STEPS = [
  { title: "Prepare the footage", detail: "Normalize the clip; keep original timestamps and audio." },
  { title: "Track body pose", detail: "YOLO pose estimation, 10 frames per second: arms, hands, head, feet." },
  { title: "Split the report into claims", detail: "One checkable claim per sentence, typed visual, audio, documentary or opinion/legal." },
  { title: "Check each claim against the footage", detail: "Gemini watches the video and listens to the audio, with the pose evidence." },
  { title: "Independent re-check of every flag", detail: "A fresh look at a clean, narrow clip. Unconfirmed flags become “insufficient footage”." },
  { title: "Build the evidence ledger", detail: "Status, time window, observation and source frames for every claim." },
];

export function AnalyzeProgress({ step, model, createdAt }: { step: number; model: string; createdAt: string }) {
  return (
    <div className="el-fade-up">
      <h2 className="text-base font-semibold">Analyzing the case</h2>
      <p className="mt-1 text-xs text-muted">
        Replaying the cached analysis ({model}, run {new Date(createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}). The demo never depends on a live model call.
      </p>
      <ol className="mt-4 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`flex gap-3 transition-opacity ${i > step ? "opacity-40" : ""}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i < step ? "bg-consistent text-white" : i === step ? "animate-pulse bg-review text-white" : "bg-line text-muted"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="block text-xs text-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose} role="dialog" aria-modal aria-label="How this demo works">
      <div className="el-fade-up h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">How this demo works</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-paper" aria-label="Close">✕</button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Claims → localization → grounding → ledger → human review. Every result links back to the report&apos;s exact wording and the moment in the footage.
        </p>
        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
              <span>
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block text-sm text-muted">{s.detail}</span>
              </span>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">✓</span>
            <span>
              <span className="block text-sm font-medium">A person reviews</span>
              <span className="block text-sm text-muted">The tool points to moments worth watching. The lawyer decides what they mean.</span>
            </span>
          </li>
        </ol>
        <h3 className="mt-6 text-sm font-semibold">The four statuses</h3>
        <ul className="mt-2 space-y-2">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="text-sm"><StatusBadge status={s} /> <span className="text-muted">{STATUS[s].why}</span></li>
          ))}
        </ul>
        <p className="mt-6 rounded-lg bg-paper p-3 text-xs text-muted">
          This prototype surfaces source-linked review questions. It does not make legal conclusions. The reports are fictional and written by our team; the footage is publicly released.
        </p>
      </div>
    </div>
  );
}

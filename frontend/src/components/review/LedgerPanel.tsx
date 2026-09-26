"use client";
import type { ReactNode } from "react";
import type { ClaimResult } from "@/lib/ledger";
import { CLAIM_TYPE, STATUS, STATUS_ORDER, clock, poseGroups } from "@/lib/present";
import { AnalyzeProgress, StatusBadge, type Phase } from "./Chrome";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h4>
      {children}
    </div>
  );
}

const REQUIRED_COPY = "This prototype surfaces source-linked review questions. It does not make legal conclusions.";

export function LedgerPanel({ phase, step, results, selected, onSelect, onPlay, onSeek, onAnalyze, model, createdAt, error }: {
  phase: Phase; step: number; results: ClaimResult[]; selected: ClaimResult | null;
  onSelect: (id: string) => void; onPlay: (r: ClaimResult) => void; onSeek: (t: number) => void; onAnalyze: () => void;
  model: string; createdAt: string; error: string;
}) {
  const index = selected ? results.findIndex((r) => r.claim.id === selected.claim.id) : -1;

  let body: ReactNode;
  if (phase === "failed") {
    body = (
      <div>
        <h2 className="text-base font-semibold">Analysis failed</h2>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <button onClick={onAnalyze} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Retry</button>
      </div>
    );
  } else if (phase === "analyzing") {
    body = <AnalyzeProgress step={step} model={model} createdAt={createdAt} />;
  } else if (phase !== "loaded") {
    body = (
      <div>
        <h2 className="text-base font-semibold">Claim–evidence ledger</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          EvidenceLens splits the written report into individual claims and checks each one against the footage and its audio.
          Every result links to the report&apos;s exact wording and the moment in the video.
        </p>
        <button onClick={onAnalyze} disabled={phase === "loading"}
          className="mt-4 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:opacity-60">
          Analyze case
        </button>
      </div>
    );
  } else if (!selected) {
    const flagged = results.filter((r) => r.status === "potential_inconsistency");
    body = (
      <div className="el-fade-up">
        <h2 className="text-base font-semibold">
          {flagged.length ? `${flagged.length} moment${flagged.length > 1 ? "s" : ""} worth a closer look` : "No claims flagged for review"}
        </h2>
        <p className="mt-1 text-sm text-muted">Select a claim in the report or on the timeline.</p>
        <ul className="mt-3 space-y-2">
          {flagged.map((r) => (
            <li key={r.claim.id}>
              <button onClick={() => onSelect(r.claim.id)} className="w-full rounded-lg border border-review/30 bg-review-bg/40 p-3 text-left hover:bg-review-bg">
                <span className="text-xs font-semibold text-review">#{results.indexOf(r) + 1} · Review recommended</span>
                <span className="mt-1 block font-serif text-sm leading-6">{r.claim.text}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-1.5">
          {STATUS_ORDER.map((s) => (
            <p key={s} className="flex items-center justify-between text-sm">
              <StatusBadge status={s} /> <span className="tabular-nums text-muted">{results.filter((r) => r.status === s).length}</span>
            </p>
          ))}
        </div>
      </div>
    );
  } else {
    const r = selected;
    const s = STATUS[r.status];
    const hasWindow = r.window_start_sec != null && r.window_end_sec != null;
    const pose = poseGroups(r.pose_events);
    body = (
      <div key={r.claim.id} className="el-fade-up space-y-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Claim {index + 1} of {results.length} · {CLAIM_TYPE[r.claim.claim_type]}</span>
          <span className="flex gap-1">
            <button onClick={() => index > 0 && onSelect(results[index - 1].claim.id)} disabled={index <= 0}
              className="rounded border border-line px-1.5 disabled:opacity-30" aria-label="Previous claim">↑</button>
            <button onClick={() => index < results.length - 1 && onSelect(results[index + 1].claim.id)} disabled={index >= results.length - 1}
              className="rounded border border-line px-1.5 disabled:opacity-30" aria-label="Next claim">↓</button>
          </span>
        </div>

        <StatusBadge status={r.status} size="lg" />

        <blockquote className="border-l-4 border-line pl-3 font-serif text-[15px] leading-7">&ldquo;{r.claim.text}.&rdquo;</blockquote>
        <p className="-mt-1 text-[11px] text-muted">Report wording, verbatim</p>

        <Section title="Evidence window">
          {hasWindow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm">
                {clock(r.window_start_sec!)} – {clock(r.window_end_sec!)}
                <span className="ml-1 text-muted">({(r.window_end_sec! - r.window_start_sec!).toFixed(1)} s)</span>
              </span>
              <button onClick={() => onPlay(r)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/85">▶ Play this moment</button>
            </div>
          ) : (
            <p className="text-sm text-muted">No footage window. Nothing in this recording bears on the claim.</p>
          )}
        </Section>

        <Section title="What the footage shows">
          <p className="text-sm leading-6">{r.observation}</p>
        </Section>

        {r.second_look && (
          <Section title="Independent re-check">
            <p className="text-sm leading-6">{r.second_look}</p>
            <p className="mt-1.5 text-xs text-muted">
              {r.downgraded
                ? "The re-check on a clean clip could not confirm the flag, so this claim is marked insufficient footage."
                : "Confirmed on a clean, narrow clip without overlays, by a separate model call that did not see the first answer."}
            </p>
          </Section>
        )}

        {pose.length > 0 && (
          <Section title="Body-pose evidence">
            <ul className="space-y-1.5">
              {pose.map((g) => (
                <li key={g.label} className="text-sm">
                  <span className="font-medium">{g.label}</span>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {g.times.slice(0, 8).map((t, i) => (
                      <button key={i} onClick={() => onSeek(t.start)} className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-ink">
                        {clock(t.start)}{t.end - t.start >= 1 ? `–${clock(t.end)}` : ""}
                      </button>
                    ))}
                    {g.times.length > 8 && <span className="text-[11px] text-muted">+{g.times.length - 8}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-muted">Measured from body keypoints at 10 frames per second. Supporting evidence only; it never sets the status.</p>
          </Section>
        )}

        <Section title="Why this status">
          <p className="text-sm leading-6 text-muted">{s.why}</p>
        </Section>
      </div>
    );
  }

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-card shadow-sm" aria-label="Claim–evidence ledger">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
      <footer className="border-t border-line px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-medium"><span className="h-2 w-2 rounded-full bg-ink" /> Human review required</p>
        <p className="mt-1 text-[11px] leading-4 text-muted">{REQUIRED_COPY}</p>
      </footer>
    </section>
  );
}

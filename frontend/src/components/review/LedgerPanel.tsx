"use client";
import type { ReactNode } from "react";
import type { ClaimResult } from "@/lib/ledger";
import { media } from "@/lib/ledger";
import { CLAIM_TYPE, STATUS, clock, poseGroups, windowLabel } from "@/lib/present";
import { AnalyzeProgress, StatusBadge, type Phase } from "./Chrome";
import { ArrowRight, CheckCircle, ChevronDown, ChevronUp, DashedCircle, PlayIcon, ShieldCheck } from "./Icons";

const REQUIRED_COPY = "This prototype surfaces source-linked review questions. It does not make legal conclusions.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Overline({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{children}</p>;
}

export function LedgerPanel({ phase, step, results, selected, onSelect, onPlay, onSeek, onAnalyze, model, createdAt, error }: {
  phase: Phase; step: number; results: ClaimResult[]; selected: ClaimResult | null;
  onSelect: (id: string) => void; onPlay: (r: ClaimResult) => void; onSeek: (t: number) => void; onAnalyze: () => void;
  model: string; createdAt: string; error: string;
}) {
  const index = selected ? results.findIndex((r) => r.claim.id === selected.claim.id) : -1;
  let body: ReactNode;

  if (phase === "failed") {
    body = (
      <div className="el-enter">
        <Overline>Analysis unavailable</Overline>
        <h2 className="mt-1 font-serif text-2xl text-ink">The case couldn&apos;t be loaded</h2>
        <p className="mt-3 text-sm leading-6 text-ink-2">{error}</p>
        <button onClick={onAnalyze} className="mt-5 inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hi">Try again</button>
      </div>
    );
  } else if (phase === "analyzing") {
    body = <AnalyzeProgress step={step} model={model} createdAt={createdAt} />;
  } else if (phase !== "loaded") {
    body = (
      <div className="el-enter">
        <Overline>Claim–evidence ledger</Overline>
        <h2 className="mt-1 font-serif text-2xl leading-tight text-ink">Check every claim in the report against the footage</h2>
        <p className="mt-3 text-sm leading-6 text-ink-2">
          Each result links the report&apos;s exact wording to the moment in the video, with what the footage shows and why the claim was or wasn&apos;t flagged.
        </p>
        <ul className="mt-5 space-y-2.5 text-[13px] text-ink-2">
          {["Every sentence becomes a checkable claim", "Each claim is located in the footage and its audio", "Every flag is independently re-checked before it's shown"].map((t) => (
            <li key={t} className="flex gap-2.5"><CheckCircle className="mt-px h-4 w-4 shrink-0 text-consistent" />{t}</li>
          ))}
        </ul>
        <button onClick={onAnalyze} disabled={phase === "loading"}
          className="mt-7 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-white shadow-sm transition hover:bg-brand-hi disabled:opacity-60">
          Analyze case <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  } else if (!selected) {
    const flagged = results.filter((r) => r.status === "potential_inconsistency");
    body = (
      <div className="el-enter">
        <Overline>Findings</Overline>
        <h2 className="mt-1 font-serif text-2xl leading-tight text-ink">
          {flagged.length ? `${flagged.length} moment${flagged.length > 1 ? "s" : ""} warrant${flagged.length > 1 ? "" : "s"} review` : "Nothing flagged for review"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          {flagged.length
            ? "In these windows the footage appears incompatible with the report, and an independent re-check agreed."
            : "No claim was found to conflict with the footage. Claims the footage can't address are marked as such."}
        </p>
        <ol className="mt-5 space-y-2">
          {flagged.map((r) => (
            <li key={r.claim.id}>
              <button onClick={() => onSelect(r.claim.id)}
                className="group flex w-full gap-3 rounded-lg border border-hairline bg-surface p-3.5 text-left transition-colors hover:border-review/30 hover:bg-review-bg/60">
                <span className="w-1 shrink-0 self-stretch rounded-full bg-review-bar" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between text-[11px] text-muted">
                    <span>Claim {results.indexOf(r) + 1}</span>
                    <span className="font-mono tabular-nums">{windowLabel(r)}</span>
                  </span>
                  <span className="mt-1 block font-serif text-[16px] leading-6 text-ink">{r.claim.text}</span>
                </span>
                <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted">Or select any sentence in the report, or a line on the timeline.</p>
      </div>
    );
  } else {
    const r = selected;
    const s = STATUS[r.status];
    const hasWindow = r.window_start_sec != null && r.window_end_sec != null;
    const pose = poseGroups(r.pose_events);
    body = (
      <article key={r.claim.id} className="el-enter">
        <div className="flex items-center justify-between">
          <Overline>Claim {index + 1} of {results.length} · {CLAIM_TYPE[r.claim.claim_type]}</Overline>
          <div className="flex gap-1">
            <button onClick={() => index > 0 && onSelect(results[index - 1].claim.id)} disabled={index <= 0}
              className="rounded-md border border-hairline p-1.5 text-ink-2 transition-colors hover:bg-sunken disabled:opacity-30" aria-label="Previous claim">
              <ChevronUp />
            </button>
            <button onClick={() => index < results.length - 1 && onSelect(results[index + 1].claim.id)} disabled={index >= results.length - 1}
              className="rounded-md border border-hairline p-1.5 text-ink-2 transition-colors hover:bg-sunken disabled:opacity-30" aria-label="Next claim">
              <ChevronDown />
            </button>
          </div>
        </div>

        <div className="mt-4"><StatusBadge status={r.status} size="lg" /></div>

        <blockquote className="mt-4 font-serif text-[21px] leading-[1.45] text-ink">
          &ldquo;{r.claim.text}.&rdquo;
        </blockquote>
        <p className="mt-1.5 text-xs text-muted">From the report, verbatim</p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-4 py-3">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">Evidence window</p>
            {hasWindow ? (
              <>
                <p className="mt-0.5 whitespace-nowrap font-mono text-sm tabular-nums text-ink">{clock(r.window_start_sec!)} – {clock(r.window_end_sec!)}</p>
                <p className="text-xs text-muted">{(r.window_end_sec! - r.window_start_sec!).toFixed(1)} s of footage</p>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-muted">None in this recording</p>
            )}
          </div>
          {hasWindow && (
            <button onClick={() => onPlay(r)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-brand px-3.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-hi">
              <PlayIcon className="h-3.5 w-3.5" /> Play moment
            </button>
          )}
        </div>

        {hasWindow && r.evidence_frames.length > 0 && (
          <Section title="Source frames">
            <div className="grid grid-cols-3 gap-2">
              {r.evidence_frames.map((f, i) => {
                const t = [r.window_start_sec!, (r.window_start_sec! + r.window_end_sec!) / 2, r.window_end_sec!][i] ?? r.window_start_sec!;
                return (
                  <button key={f} onClick={() => onSeek(t)} className="group text-left" aria-label={`Show the footage at ${clock(t)}`}>
                    <span className="block overflow-hidden rounded-md ring-1 ring-hairline transition group-hover:ring-brass/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={media(f)} alt={`Frame at ${clock(t)}`} className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                    </span>
                    <span className="mt-1 block text-center font-mono text-[10.5px] tabular-nums text-muted">{clock(t)}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Observed in the footage">
          <p className="text-[15px] leading-7 text-ink-2">{r.observation}</p>
        </Section>

        {r.second_look && (
          <Section title="Independent re-check">
            <div className="rounded-lg border border-hairline p-4">
              <p className={`flex items-center gap-2 text-[13px] font-medium ${r.status === "insufficient_footage" ? "text-insufficient" : "text-consistent"}`}>
                {r.status === "insufficient_footage" ? <DashedCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                {r.status === "potential_inconsistency" ? "Confirmed on the original footage"
                  : r.status === "consistent" ? "The re-check saw what the claim describes"
                  : "The re-check couldn't settle it, so marked insufficient footage"}
              </p>
              {r.first_pass_observation ? (
                <p className="mt-2 text-sm leading-6 text-ink-2">The first pass read: {r.first_pass_observation}</p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-ink-2">{r.second_look}</p>
              )}
              <p className="mt-2 text-xs leading-5 text-muted">A separate review of a clean, narrow clip, without overlays and without seeing the first answer.</p>
            </div>
          </Section>
        )}

        {pose.length > 0 && (
          <Section title="Body-pose measurements">
            <dl className="divide-y divide-hairline rounded-lg border border-hairline">
              {pose.map((g) => (
                <div key={g.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="pt-0.5 text-[13px] text-ink">{g.label}</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {g.times.slice(0, 6).map((t, i) => (
                      <button key={i} onClick={() => onSeek(t.start)} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ink-2 transition-colors hover:bg-brand-soft hover:text-ink">
                        {clock(t.start)}{t.end - t.start >= 1 ? `–${clock(t.end)}` : ""}
                      </button>
                    ))}
                    {g.times.length > 6 && <span className="px-1 py-0.5 text-[11px] text-muted">+{g.times.length - 6} more</span>}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs leading-5 text-muted">Measured from body keypoints at 10 frames per second. Supporting evidence only; it never sets the status.</p>
          </Section>
        )}

        <Section title="Why this status">
          <p className="text-sm leading-6 text-muted">{s.why}</p>
        </Section>
      </article>
    );
  }

  return (
    <section className="flex min-h-105 flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-panel xl:min-h-0" aria-label="Finding">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{body}</div>
      <footer className="flex shrink-0 items-start gap-2.5 border-t border-hairline bg-surface px-6 py-3.5">
        <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-brass" />
        <p className="text-[11px] leading-4 text-muted"><span className="font-medium text-ink">Human review required.</span> {REQUIRED_COPY}</p>
      </footer>
    </section>
  );
}

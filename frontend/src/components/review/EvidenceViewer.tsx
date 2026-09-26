"use client";
import { useMemo } from "react";
import type { RefObject } from "react";
import type { ClaimResult } from "@/lib/ledger";
import { media } from "@/lib/ledger";
import { STATUS, clock, laneOf } from "@/lib/present";

const LANE_H = 8;
const LANE_GAP = 4;

export function EvidenceViewer({ results, duration, selected, revealed, overlay, setOverlay, videoRef, src, poster, time,
  onSeek, onSelect, onTimeUpdate, onLoadedMetadata, source, sourceUrl }: {
  results: ClaimResult[]; duration: number; selected: ClaimResult | null; revealed: boolean;
  overlay: boolean; setOverlay: (v: boolean) => void; videoRef: RefObject<HTMLVideoElement | null>; src?: string; poster?: string;
  time: number; onSeek: (t: number) => void; onSelect: (id: string) => void;
  onTimeUpdate: () => void; onLoadedMetadata: () => void; source: string; sourceUrl: string;
}) {
  const lanes = useMemo(() => laneOf(results), [results]);
  const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;
  const ticks = Array.from({ length: Math.floor(duration / 10) + 1 }, (_, i) => i * 10);
  const hasWindow = selected && selected.window_start_sec != null && selected.window_end_sec != null;

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto" aria-label="Evidence viewer">
      <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Body-worn camera footage</h2>
          <div className="flex gap-1 rounded-lg bg-paper p-0.5 text-xs" role="tablist" aria-label="Video layer">
            {[false, true].map((v) => (
              <button key={String(v)} role="tab" aria-selected={overlay === v} onClick={() => setOverlay(v)}
                className={`rounded-md px-2.5 py-1 ${overlay === v ? "bg-card font-medium shadow-sm" : "text-muted"}`}>
                {v ? "Pose overlay" : "Clean footage"}
              </button>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} src={src} poster={poster} controls playsInline preload="auto" onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata} className="aspect-video w-full object-contain" />
          {hasWindow && revealed && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-xs text-white">
              Evidence window {clock(selected.window_start_sec!)} – {clock(selected.window_end_sec!)}
            </div>
          )}
        </div>

        {/* Timeline: every claim window, packed into lanes; click the track to seek, a bar to select. */}
        <div className="mt-3 select-none">
          <div
            className="relative cursor-pointer rounded-md bg-paper"
            style={{ height: laneCount * (LANE_H + LANE_GAP) + 10 }}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              onSeek(((e.clientX - box.left) / box.width) * duration);
            }}
            role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(time)}
          >
            {hasWindow && revealed && (
              <div className="absolute inset-y-0 bg-ink/[0.07]"
                style={{ left: pct(selected.window_start_sec!), width: `calc(${pct(selected.window_end_sec!)} - ${pct(selected.window_start_sec!)})` }} />
            )}
            {revealed && results.map((r) => {
              const lane = lanes.get(r.claim.id);
              if (lane == null) return null;
              const isSel = r.claim.id === selected?.claim.id;
              return (
                <button key={r.claim.id} title={r.claim.text}
                  onClick={(e) => { e.stopPropagation(); onSelect(r.claim.id); }}
                  className={`el-fade-up absolute rounded-full transition ${STATUS[r.status].bar} ${isSel ? "opacity-100 ring-2 ring-ink/70 ring-offset-1" : selected ? "opacity-35 hover:opacity-80" : "opacity-80 hover:opacity-100"}`}
                  style={{
                    left: pct(r.window_start_sec!), width: `max(6px, calc(${pct(r.window_end_sec!)} - ${pct(r.window_start_sec!)}))`,
                    top: 5 + lane * (LANE_H + LANE_GAP), height: LANE_H,
                  }}
                  aria-label={`Claim window ${clock(r.window_start_sec!)} to ${clock(r.window_end_sec!)}`} />
              );
            })}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: pct(time) }} />
          </div>
          <div className="relative mt-1 h-4 font-mono text-[10px] text-muted">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>{clock(t, 0)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold">Source frames</h3>
        {revealed && hasWindow && selected.evidence_frames.length ? (
          <div className="grid grid-cols-3 gap-2">
            {selected.evidence_frames.map((f, i) => {
              const s = selected.window_start_sec!, e = selected.window_end_sec!;
              const t = [s, (s + e) / 2, e][i] ?? s;
              return (
                <button key={f} onClick={() => onSeek(t)} className="group overflow-hidden rounded-lg border border-line text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(f)} alt={`Frame at ${clock(t)}`} className="aspect-video w-full object-cover transition group-hover:scale-[1.02]" />
                  <span className="block px-2 py-1 font-mono text-[11px] text-muted">{["Start", "Middle", "End"][i]} · {clock(t)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-paper p-3 text-xs text-muted">
            {!revealed ? "Run the analysis to link claims to moments in the footage."
              : !selected ? "Select a claim to see the frames it's based on."
              : "No footage window: nothing in the video bears on this claim, so there are no source frames."}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-5 text-muted">
          Source: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">{source}</a> : source}.
          Report: fictional, written by our team. Timestamps are approximate; watch around each window.
        </p>
      </div>
    </section>
  );
}

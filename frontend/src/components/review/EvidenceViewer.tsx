"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { ClaimResult } from "@/lib/ledger";
import { STATUS, clock } from "@/lib/present";
import {
  ChevronLeft, ChevronRight, FullscreenIcon, MuteIcon, PanelClose, PanelOpen, PauseIcon, PersonIcon, PlayIcon, VolumeIcon,
} from "./Icons";

const FRAME = 1 / 30; // one frame at 30 fps

/** The viewing room: the footage on a dark stage, with its own controls, captions and timeline. */
export function EvidenceViewer({ results, duration, selected, revealed, overlay, setOverlay, expanded, setExpanded,
  videoRef, src, poster, onSeek, onTimeUpdate, onLoadedMetadata, camera, source, sourceUrl }: {
  results: ClaimResult[]; duration: number; selected: ClaimResult | null; revealed: boolean;
  overlay: boolean; setOverlay: (v: boolean) => void; expanded: boolean; setExpanded: (v: boolean) => void;
  videoRef: RefObject<HTMLVideoElement | null>; src?: string; poster?: string;
  onSeek: (t: number) => void; onTimeUpdate: () => void; onLoadedMetadata: () => void;
  camera: string; source: string; sourceUrl: string;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  // Smooth playhead while playing (timeupdate alone fires only ~4 times a second).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      if (videoRef.current) setTime(videoRef.current.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, videoRef]);

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;
  const span = (a: number, b: number) => `calc(${pct(b)} - ${pct(a)})`;
  const win = revealed && selected && selected.window_start_sec != null && selected.window_end_sec != null
    ? { s: selected.window_start_sec, e: selected.window_end_sec } : null;
  const inWindow = win && time >= win.s - 0.3 && time <= win.e + 0.6;
  const claimNo = selected ? results.indexOf(selected) + 1 : 0;

  const v = () => videoRef.current;
  const togglePlay = () => { const el = v(); if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  const step = (dt: number) => { const el = v(); if (!el) return; el.pause(); onSeek(Math.min(duration, Math.max(0, el.currentTime + dt))); };
  const cycleRate = () => { const next = rate === 1 ? 0.5 : rate === 0.5 ? 0.25 : 1; setRate(next); if (v()) v()!.playbackRate = next; };
  const toggleMute = () => { const el = v(); if (el) el.muted = !el.muted; };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else screenRef.current?.requestFullscreen().catch(() => {});
  };
  const trackTime = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((e.clientX - box.left) / box.width) * duration));
  };

  const trackProps = {
    onClick: (e: React.MouseEvent<HTMLDivElement>) => onSeek(trackTime(e)),
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => setHover(trackTime(e)),
    onMouseLeave: () => setHover(null),
  };

  return (
    <section className="order-first flex min-h-0 flex-col gap-3 xl:order-none xl:overflow-y-auto" aria-label="Footage">
      <div className="@container flex min-h-0 flex-col overflow-hidden rounded-xl bg-stage text-white shadow-stage">
        <h2 className="sr-only">Body-worn camera footage{camera ? `, ${camera}` : ""}, publicly released</h2>

        {/* Screen */}
        <div ref={screenRef} className="el-screen group relative aspect-video w-full overflow-hidden bg-black xl:aspect-auto xl:h-[calc(100cqw*9/16)] xl:min-h-56 xl:shrink">
          <video ref={videoRef} src={src} poster={poster} playsInline preload="auto"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onTimeUpdate={() => { onTimeUpdate(); setTime(v()?.currentTime ?? 0); }}
            onSeeked={() => setTime(v()?.currentTime ?? 0)}
            onVolumeChange={() => setMuted(v()?.muted ?? false)}
            onLoadedMetadata={() => { onLoadedMetadata(); const el = v(); if (el) { el.playbackRate = rate; setTime(el.currentTime); } }}
            className="h-full w-full cursor-pointer object-contain" />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {win && (
              <span className="rounded-md bg-black/55 px-2.5 py-1 font-mono text-[11px] tracking-wide text-white/90 backdrop-blur-sm">
                EVIDENCE WINDOW {clock(win.s)} – {clock(win.e)}
              </span>
            )}
            {overlay && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-sm">
                <PersonIcon className="h-3.5 w-3.5 text-pose" /> Body keypoints · 10 fps
              </span>
            )}
          </div>

          {!playing && (
            <button onClick={togglePlay} aria-label="Play"
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:scale-105 hover:bg-black/60">
              <PlayIcon className="ml-0.5 h-5 w-5" />
            </button>
          )}

          {/* Caption: the claim under review, on screen while its moment plays. */}
          {inWindow && selected && (
            <div className="el-enter pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-5 pb-4 pt-14">
              <div className="flex max-w-[88%] gap-3">
                <span className={`w-1 shrink-0 rounded-full ${selected.status === "potential_inconsistency" ? "bg-review-glow" : "bg-white/50"}`} aria-hidden />
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/65">
                    Claim {claimNo} · {STATUS[selected.status].short}
                  </p>
                  <p className="mt-1 font-serif text-[17px] leading-snug text-white">&ldquo;{selected.claim.text}.&rdquo;</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seek bar: playhead, played portion, and the selected claim's window. */}
        <div className="shrink-0 px-4 pt-3">
          <div {...trackProps} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)} aria-valuetext={clock(time)}
            className="group/seek relative flex h-4 cursor-pointer items-center">
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/12 transition-[height] group-hover/seek:h-1.5">
              <div className="absolute inset-y-0 left-0 bg-ink/55" style={{ width: pct(time) }} />
              {win && <div className="absolute inset-y-0 bg-brass" style={{ left: pct(win.s), width: span(win.s, win.e) }} />}
            </div>
            <div className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow" style={{ left: pct(time) }} />
            {hover != null && (
              <span className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-ink px-1.5 font-mono text-[10.5px] text-stage" style={{ left: pct(hover) }}>{clock(hover)}</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1 px-4 py-2.5 text-white/80">
          <CtrlButton label="Back one frame" onClick={() => step(-FRAME)}><ChevronLeft /></CtrlButton>
          <CtrlButton label={playing ? "Pause" : "Play"} onClick={togglePlay} strong>
            {playing ? <PauseIcon /> : <PlayIcon className="ml-px h-4 w-4" />}
          </CtrlButton>
          <CtrlButton label="Forward one frame" onClick={() => step(FRAME)}><ChevronRight /></CtrlButton>
          <span className="ml-2 whitespace-nowrap font-mono text-xs tabular-nums text-white/85">
            {clock(time)} <span className="text-white/40">/ {clock(duration, 0)}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-1.5 flex rounded-md bg-white/6 p-0.5 text-xs ring-1 ring-white/10" role="tablist" aria-label="Video layer">
              {[false, true].map((o) => (
                <button key={String(o)} role="tab" aria-selected={overlay === o} onClick={() => setOverlay(o)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 py-1 transition-colors ${overlay === o ? "bg-ink text-stage" : "text-white/70 hover:text-white"}`}>
                  {o && <PersonIcon className="h-3.5 w-3.5" />}{o ? "Pose overlay" : "Original"}
                </button>
              ))}
            </div>
            <button onClick={cycleRate} aria-label={`Playback speed ${rate}x`}
              className="h-8 min-w-11 rounded-md px-2 font-mono text-xs tabular-nums text-white/80 transition-colors hover:bg-white/10 hover:text-white">
              {rate}×
            </button>
            <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>{muted ? <MuteIcon /> : <VolumeIcon />}</CtrlButton>
            <button onClick={() => setExpanded(!expanded)} aria-pressed={expanded} title={expanded ? "Show the report again" : "Expand the video (T)"}
              className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white xl:inline-flex">
              {expanded ? <PanelOpen /> : <PanelClose />}<span className="hidden 2xl:inline">{expanded ? "Show report" : "Expand"}</span>
            </button>
            <CtrlButton label="Full screen" onClick={fullscreen}><FullscreenIcon /></CtrlButton>
          </div>
        </div>

      </div>

      <p className="shrink-0 px-1 text-[11px] leading-5 text-muted">
        Source: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-hairline underline-offset-2 hover:text-ink">{source}</a> : source}.
        {" "}Report: fictional, written by our team. Timestamps are approximate; review the footage around each window.
      </p>
    </section>
  );
}

function CtrlButton({ label, onClick, strong, children }: { label: string; onClick: () => void; strong?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${strong ? "bg-ink text-stage hover:bg-ink/90" : "hover:bg-white/10 hover:text-white"}`}>
      {children}
    </button>
  );
}


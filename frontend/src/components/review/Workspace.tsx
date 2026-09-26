"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseResult, CaseSummary, ClaimResult, Status } from "@/lib/ledger";
import { getCase, listCases, media } from "@/lib/ledger";
import { STATUS_ORDER, caseMeta } from "@/lib/present";
import { Header, HowItWorks, STEPS, SummaryBar, type Phase } from "./Chrome";
import { EvidenceViewer } from "./EvidenceViewer";
import { LedgerPanel } from "./LedgerPanel";
import { ReportPanel, type ReportView } from "./ReportPanel";

const STEP_MS = 850;
const LEAD_IN = 1;    // seconds of context before a window when jumping to it
const LEAD_OUT = 0.75;

export function Workspace({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseResult | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [filter, setFilter] = useState<Status | null>(null);
  const [view, setView] = useState<ReportView>("report");
  const [how, setHow] = useState(false);
  const [time, setTime] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const resume = useRef<{ t: number; play: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  // Load the cached result. ?instant=1 skips the analysis replay (handy for development and recordings).
  useEffect(() => {
    let alive = true;
    Promise.all([getCase(caseId), listCases().catch(() => [] as CaseSummary[])])
      .then(([d, cs]) => {
        if (!alive) return;
        setData(d);
        setCases(cs);
        setError("");
        const q = new URLSearchParams(window.location.search);
        // Uploaded cases were just analyzed for real, so there is no cached replay to show.
        const instant = q.has("instant") || d.origin === "upload";
        setPhase(instant ? "loaded" : "ready");
        // ?instant=1&claim=c7 opens straight onto one claim (recordings, fallback during the demo).
        const claim = d.results.find((r) => r.claim.id === q.get("claim"));
        if (instant && claim) {
          setSelectedId(claim.claim.id);
          resume.current = { t: Math.max(0, (claim.window_start_sec ?? 0) - LEAD_IN), play: false };
        }
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setPhase("failed");
      });
    return () => { alive = false; };
  }, [caseId, attempt]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const results = useMemo(() => data?.results ?? [], [data]);
  const selected = results.find((r) => r.claim.id === selectedId) ?? null;
  const visible = useMemo(() => results.filter((r) => !filter || r.status === filter), [results, filter]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
    results.forEach((r) => c[r.status]++);
    return c;
  }, [results]);

  const analyze = useCallback(() => {
    if (!data) {
      setPhase("loading");
      setAttempt((a) => a + 1);
      return;
    }
    timers.current.forEach(clearTimeout);
    setSelectedId(null);
    setFilter(null);
    setView("report");
    setStep(0);
    setPhase("analyzing");
    timers.current = [
      ...STEPS.map((_, i) => window.setTimeout(() => setStep(i + 1), (i + 1) * STEP_MS)),
      window.setTimeout(() => setPhase("loaded"), STEPS.length * STEP_MS + 250),
    ];
  }, [data]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = null;
    v.currentTime = Math.max(0, t);
    setTime(v.currentTime);
  }, []);

  const play = useCallback((r: ClaimResult) => {
    const v = videoRef.current;
    if (!v || r.window_start_sec == null || r.window_end_sec == null) return;
    v.currentTime = Math.max(0, r.window_start_sec - LEAD_IN);
    stopAt.current = r.window_end_sec + LEAD_OUT;
    v.play().catch(() => {});
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const r = results.find((x) => x.claim.id === id);
    if (r) play(r);
    else stopAt.current = null;
  }, [results, play]);

  const toggleOverlay = useCallback((next: boolean) => {
    const v = videoRef.current;
    if (v) resume.current = { t: v.currentTime, play: !v.paused };
    setOverlay(next);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (stopAt.current != null && v.currentTime >= stopAt.current) {
      v.pause();
      stopAt.current = null;
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !resume.current) return;
    v.currentTime = resume.current.t;
    if (resume.current.play) v.play().catch(() => {});
    resume.current = null;
  }, []);

  // Keyboard: ↑/↓ (or k/j) move between claims, p plays the moment, o toggles the pose overlay, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "loaded" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "VIDEO") return;
      const i = visible.findIndex((r) => r.claim.id === selectedId);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = visible[Math.min(visible.length - 1, i + 1)];
        if (next) select(next.claim.id);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = visible[Math.max(0, i - 1)];
        if (prev) select(prev.claim.id);
      } else if (e.key === "p" && selected) {
        play(selected);
      } else if (e.key === "o") {
        toggleOverlay(!overlay);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, visible, selectedId, selected, select, play, toggleOverlay, overlay]);

  const meta = caseMeta(caseId);
  const revealed = phase === "loaded";
  // A frame from the footage instead of a black box before playback starts.
  const posterPath = results.flatMap((r) => r.evidence_frames)[0];
  const poster = posterPath ? media(posterPath) : undefined;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <Header caseId={caseId} cases={cases} phase={phase} origin={data?.origin ?? "demo"} onAnalyze={analyze} onHow={() => setHow(true)} />
      {revealed && data && (
        <SummaryBar counts={counts} total={results.length} filter={filter} setFilter={setFilter} model={data.model}
          createdAt={data.created_at} origin={data.origin} />
      )}

      <div className="flex items-baseline gap-3 px-5 pt-3">
        <h1 className="text-xl font-semibold tracking-tight">{meta.title}</h1>
        {meta.setting && <span className="text-sm text-muted">{meta.setting}{data ? ` · ${Math.round(data.duration_sec)} s` : ""}</span>}
      </div>

      <main className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(300px,1fr)_minmax(460px,1.55fr)_minmax(330px,1fr)]">
        <ReportPanel reportText={data?.report_text ?? ""} results={results} revealed={revealed} selectedId={selectedId}
          onSelect={select} filter={filter} view={view} setView={setView} />
        <EvidenceViewer results={results} duration={data?.duration_sec || 60} selected={selected} revealed={revealed}
          overlay={overlay} setOverlay={toggleOverlay} videoRef={videoRef}
          src={data ? media(overlay ? data.annotated_video_url : data.video_url) : undefined}
          poster={poster}
          time={time} onSeek={seek} onSelect={select} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
          source={meta.source} sourceUrl={meta.sourceUrl} />
        <LedgerPanel phase={phase} step={step} results={results} selected={revealed ? selected : null} onSelect={select}
          onPlay={play} onSeek={seek} onAnalyze={analyze} model={data?.model ?? ""} createdAt={data?.created_at ?? new Date().toISOString()} error={error} />
      </main>

      <HowItWorks open={how} onClose={() => setHow(false)} />
    </div>
  );
}

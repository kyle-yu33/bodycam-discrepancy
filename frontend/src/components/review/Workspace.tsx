"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseResult, CaseSummary, ClaimResult, Status } from "@/lib/ledger";
import { getCase, listCases, media } from "@/lib/ledger";
import { STATUS_ORDER, caseMeta, parseReport } from "@/lib/present";
import { HowItWorks, MatterHeader, STEPS, TopBar, type Phase } from "./Chrome";
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
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const resume = useRef<{ t: number; play: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const autoRun = useRef(false); // ?analyze=1: start the replay on load (for recording the demo)

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
        if (q.has("expand")) setExpanded(true);
        if (q.has("how")) setHow(true);
        autoRun.current = q.has("analyze") && !instant;
        // ?instant=1&claim=c7 opens straight onto one claim (recordings, fallback during the demo).
        const claim = d.results.find((r) => r.claim.id === q.get("claim"));
        if (instant && claim) {
          setSelectedId(claim.claim.id);
          resume.current = { t: claim.window_start_sec ?? 0, play: false };
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

  // A finished upload becomes a new case tab without reloading the page.
  const refreshCases = useCallback(() => { listCases().then(setCases).catch(() => {}); }, []);

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

  useEffect(() => {
    if (!autoRun.current || phase !== "ready") return;
    autoRun.current = false;
    const id = window.setTimeout(analyze, 600);
    return () => clearTimeout(id);
  }, [phase, analyze]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = null;
    v.currentTime = Math.max(0, t);
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

  // Keyboard. Player: space play/pause, , . one frame, O pose overlay, T expand video.
  // Claims (after analysis): ↑/↓ or k/j move, P plays the moment, Esc back to findings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const onControl = el.tagName === "BUTTON" || el.getAttribute("role") === "button";
      const v = videoRef.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " " && !onControl && v) {
        e.preventDefault();
        if (v.paused) v.play().catch(() => {}); else v.pause();
      } else if ((key === "," || key === ".") && v) {
        v.pause();
        seek(v.currentTime + (key === "," ? -1 : 1) / 30);
      } else if (key === "o") {
        toggleOverlay(!overlay);
      } else if (key === "t") {
        setExpanded((x) => !x);
      } else if (phase === "loaded") {
        const i = visible.findIndex((r) => r.claim.id === selectedId);
        if (key === "ArrowDown" || key === "j") {
          e.preventDefault();
          const next = visible[Math.min(visible.length - 1, i + 1)];
          if (next) select(next.claim.id);
        } else if (key === "ArrowUp" || key === "k") {
          e.preventDefault();
          const prev = visible[Math.max(0, i - 1)];
          if (prev) select(prev.claim.id);
        } else if (key === "p" && selected) {
          play(selected);
        } else if (key === "Escape") {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, phase, visible, selectedId, selected, select, play, seek, toggleOverlay, overlay]);

  const meta = caseMeta(caseId);
  const revealed = phase === "loaded";
  const report = useMemo(() => parseReport(data?.report_text ?? ""), [data]);
  // A frame from the footage instead of a black box before playback starts.
  const posterPath = results.flatMap((r) => r.evidence_frames)[0];
  const poster = posterPath ? media(posterPath) : undefined;
  // Where the result came from, always visible once shown (cached, which model, when).
  const uploaded = data?.origin === "upload";
  const provenance = revealed && data
    ? `${uploaded ? "Analysis" : "Cached analysis"} · ${data.model} · ${new Date(data.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
    : uploaded ? "Uploaded case" : "Demo · public footage, fictional team-written report";

  return (
    <div className="flex min-h-screen flex-col xl:h-screen">
      <TopBar caseId={caseId} cases={cases} phase={phase} origin={data?.origin ?? "demo"} provenance={provenance}
        onAnalyze={analyze} onHow={() => setHow(true)} onCaseReady={refreshCases} />
      <MatterHeader caseId={caseId} fields={report.fields} duration={data?.duration_sec ?? null} phase={phase}
        counts={counts} total={results.length} filter={filter} setFilter={setFilter} />

      <main className={`grid flex-1 gap-4 px-6 pb-6 xl:min-h-0 ${expanded ? "xl:grid-cols-[minmax(640px,2.7fr)_minmax(340px,1fr)]" : "xl:grid-cols-[minmax(280px,0.8fr)_minmax(580px,2.2fr)_minmax(330px,0.95fr)]"}`}>
        {!expanded && (
          <ReportPanel report={report} results={results} revealed={revealed} selectedId={selectedId}
            onSelect={select} filter={filter} view={view} setView={setView} />
        )}
        <EvidenceViewer results={results} duration={data?.duration_sec || 60} selected={selected} revealed={revealed}
          overlay={overlay} setOverlay={toggleOverlay} expanded={expanded} setExpanded={setExpanded} videoRef={videoRef}
          src={data ? media(overlay ? data.annotated_video_url : data.video_url) : undefined}
          poster={poster}
          onSeek={seek} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
          camera={meta.camera} source={meta.source} sourceUrl={meta.sourceUrl} uploaded={uploaded} />
        <LedgerPanel phase={phase} step={step} results={results} selected={revealed ? selected : null} onSelect={select}
          onPlay={play} onSeek={seek} onAnalyze={analyze} model={data?.model ?? ""} createdAt={data?.created_at ?? new Date().toISOString()} error={error} />
      </main>

      <HowItWorks open={how} onClose={() => setHow(false)} />
    </div>
  );
}

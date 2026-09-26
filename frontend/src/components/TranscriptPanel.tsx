"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { EvidenceWindow, Transcript } from "@/lib/types";

// Synced transcript: the current line is highlighted, the current word is bold, clicking a line seeks.
// Lines overlapping `evidenceWindow` (the selected claim's window) are marked.
const stamp = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const speakerName = (s: string | null) => s ? `Speaker ${Number(s.replace("speaker_", "")) + 1}` : "";
const MIN_WORD_SEC = 0.15; // Scribe sometimes returns zero-length words; keep them visible when spoken

export default function TranscriptPanel({ transcript, video, onSeek, evidenceWindow }: {
  transcript: Transcript;
  video: RefObject<HTMLVideoElement | null>;
  onSeek: (seconds: number) => void;
  evidenceWindow?: EvidenceWindow | null;
}) {
  const [now, setNow] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    // Rounded to 50 ms so React skips re-renders while paused or between word boundaries.
    const tick = () => { if (video.current) setNow(Math.round(video.current.currentTime * 20) / 20); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video]);

  // The last line that has started stays highlighted through pauses.
  const active = transcript.segments.findLast(s => s.start_sec <= now);
  useEffect(() => {
    const box = list.current, line = box?.querySelector<HTMLElement>(".transcript-line.active");
    if (box && line) box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2, behavior: "smooth" });
  }, [active?.id]);

  const inWindow = (start: number, end: number) => !!evidenceWindow && start < evidenceWindow.endSeconds && end > evidenceWindow.startSeconds;

  return <div className="transcript">
    <div className="transcript-top"><h3>Audio transcript</h3><span className="muted">{transcript.segments.length} lines · ElevenLabs Scribe · AI-generated, verify by listening</span></div>
    <div className="transcript-list" ref={list}>
      {transcript.segments.map(s => <button key={s.id} className={`transcript-line ${active?.id === s.id ? "active" : ""} ${inWindow(s.start_sec, s.end_sec) ? "in-window" : ""}`} onClick={() => onSeek(s.start_sec)}>
        <span className="transcript-meta">{stamp(s.start_sec)}{s.speaker && ` · ${speakerName(s.speaker)}`}</span>
        <span>{s.words.map((w, i) => {
          const state = now >= w.start_sec && now < Math.max(w.end_sec, w.start_sec + MIN_WORD_SEC) ? "now" : now >= w.start_sec ? "spoken" : "";
          return <span key={i}><span className={`word ${state} ${w.kind === "audio_event" ? "sound" : ""}`}>{w.text}</span>{i < s.words.length - 1 && " "}</span>;
        })}</span>
      </button>)}
      {!transcript.segments.length && <p className="muted">No speech detected in this recording.</p>}
    </div>
  </div>;
}

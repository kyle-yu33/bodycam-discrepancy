"use client";
import "./legacy.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE, type Job, type Result, type Event } from "@/lib/types";

const time = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const label = (s: string) => s.replaceAll("_", " ");
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(API_BASE + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status})`);
  }
  return response.json();
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("active");
  const player = useRef<HTMLVideoElement>(null);
  const active = useRef<string | null>(null);

  useEffect(() => { api<Job[]>("/analyses").then(setJobs).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!job || job.status === "complete" || job.status === "failed") return;
    const id = job.id;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const next = await api<Job>(`/analyses/${id}`);
        if (stopped || active.current !== id) return;
        const data = next.status === "complete" ? await api<Result>(`/analyses/${id}/result`) : null;
        if (stopped || active.current !== id) return;
        if (data) setResult(data);
        setJob(next);
        setJobs(previous => previous.map(item => item.id === id ? next : item));
      } catch (e) { if (!stopped) setError((e as Error).message); }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [job]);

  async function open(item: Job) {
    active.current = item.id;
    setJob(item); setResult(null); setSelected(null); setError("");
    try {
      if (item.status === "complete") {
        const data = await api<Result>(`/analyses/${item.id}/result`);
        if (active.current === item.id) setResult(data);
      }
    } catch (e) { setError((e as Error).message); }
  }
  async function upload() {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.append("video", file);
      const next = await api<Job>("/analyses", { method: "POST", body: form });
      setJobs(previous => [next, ...previous]); await open(next);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }
  function select(event: Event) {
    setSelected(event);
    if (player.current) { player.current.currentTime = Math.max(0, event.start_sec - 2); player.current.play().catch(() => {}); }
  }
  const visible = result?.events.filter(event => filter === "all" || (filter === "active" ? event.detail.status !== "dismissed" : event.detail.status === filter)) ?? [];

  return <div className="shell">
    <aside><Link className="brand" href="/events">▣ <span>fieldnote<span className="brand-dot">.</span></span></Link><div className="workspace">VIDEO INTELLIGENCE</div>
      <div className="nav-active">▤ &nbsp; Recording library</div><div className="library-heading">YOUR RECORDINGS <span>{jobs.length}</span></div>
      <div className="history">{jobs.map(item => <button className={`history-item ${job?.id === item.id ? "chosen" : ""}`} key={item.id} onClick={() => open(item)}><strong>{item.filename}</strong><span>{item.status} · {new Date(item.created_at).toLocaleDateString()}</span></button>)}{!jobs.length && <p className="muted">Your recordings will appear here.</p>}</div>
      <div className="aside-footer"><span className="live-dot"/> Gemini only <p>Two passes. One evidence timeline.</p></div>
    </aside>
    <main><header><span>Workspace <span className="slash">/</span> Recording review</span><span className="pill">MVP · v1.0</span></header>
      <section className="intro"><div className="eyebrow">FROM FOOTAGE TO FOCUS</div><h1>Find the moments that matter.</h1><p>Detect candidate events, inspect the context, and review the original recording.</p></section>
      <section className="upload"><div><h2>New recording</h2><p>MP4 or MOV · Original audio included</p></div><label className="file-picker">{file ? file.name : "Choose video"}<input aria-label="Choose bodycam video" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label><button className="primary" disabled={!file || uploading} onClick={upload}>{uploading ? "Uploading…" : "Analyze recording ↗"}</button></section>
      <div className="pipeline"><span>01 &nbsp; Preprocess</span><b>→</b><span>02 &nbsp; Detect candidates</span><b>→</b><span>03 &nbsp; Merge</span><b>→</b><span>04 &nbsp; Detailed review</span></div>
      {error && <div className="error" role="alert">{error}</div>}
      {job && !result && <section className="status" aria-live="polite"><h2>{job.filename}</h2><p>{job.stage}</p>{job.status !== "failed" && <progress max={1} value={job.progress}/>}<p>{job.error}</p></section>}
      {result ? <><div className="review-heading"><div><div className="eyebrow">ANALYSIS COMPLETE</div><h2>{result.filename}</h2></div><span className="muted">{time(result.duration_sec)} duration · {result.clips.length} clips · {result.events.length} candidates</span></div>
        <div className="review-grid"><section className="video-panel"><video ref={player} src={API_BASE + result.video_url} controls preload="metadata"/><div className="video-caption"><span>Original timeline · normalized playback</span><a href={API_BASE + result.original_url} target="_blank" rel="noreferrer">Open original ↗</a></div>
          <div className="timeline" aria-label="Event timeline">{result.events.filter(e => e.detail.status !== "dismissed").map(event => <button key={event.id} title={`${label(event.event_type)} · ${time(event.start_sec)}`} aria-label={`Seek to ${label(event.event_type)} at ${time(event.start_sec)}`} onClick={() => select(event)} style={{left: `${event.start_sec/result.duration_sec*100}%`, width: `${Math.max(.7, (event.end_sec-event.start_sec)/result.duration_sec*100)}%`}} />)}</div>
          {selected ? <div className="detail"><div className="eyebrow">EVENT DETAIL · {time(selected.start_sec)}–{time(selected.end_sec)}</div><h2>{label(selected.event_type)}</h2><p>{selected.detail.description}</p><h3>Observations</h3><ul>{selected.detail.observations.map((o,i) => <li key={i}>{o}</li>)}</ul><h3>Uncertainty</h3>{selected.detail.uncertainty.length ? <ul>{selected.detail.uncertainty.map((o,i) => <li key={i}>{o}</li>)}</ul> : <p>No specific uncertainty reported by the model.</p>}<a href={API_BASE + selected.clip_url} target="_blank" rel="noreferrer">Open context clip ↗</a><p className="muted">Model confidence: {selected.detail.confidence} · {selected.source_clips.length} source clip(s)</p></div> : <div className="detail empty-detail">Select an event to inspect its observations and uncertainty.</div>}
        </section><section className="events"><div className="events-top"><h2>Detected events <span>{visible.length}</span></h2><select aria-label="Filter events" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Retained + uncertain</option><option value="retained">Retained</option><option value="uncertain">Uncertain</option><option value="dismissed">Dismissed</option><option value="all">All candidates</option></select></div><div className="event-list">{visible.map(event => <button key={event.id} className={`event-card ${selected?.id === event.id ? "selected" : ""}`} onClick={() => select(event)}><div className="event-meta"><span>{time(event.start_sec)}–{time(event.end_sec)}</span><span className={`badge ${event.detail.status}`}>{event.detail.status}</span></div><h3>{label(event.event_type)}</h3><p>{event.detail.description}</p><span className="review-link">Review moment ↗</span></button>)}{!visible.length && <div className="empty-events">No events in this view.{result.events.length === 0 && <p>Gemini found no matching candidates in this recording.</p>}</div>}</div></section></div>
        <footer>{result.model} · Pipeline {result.pipeline_version} <a href={API_BASE + `/analyses/${result.id}/result`} target="_blank" rel="noreferrer">View analysis JSON ↗</a></footer></> : !job && <section className="empty"><div className="empty-icon">▷</div><h2>Your review starts here</h2><p>Add a recording to create a timestamped event timeline.<br/>Each candidate gets a second, closer look with Gemini.</p><div className="empty-tags"><span>Overlapping clips</span><span>Detailed observations</span><span>Explicit uncertainty</span></div></section>}
    </main>
  </div>;
}

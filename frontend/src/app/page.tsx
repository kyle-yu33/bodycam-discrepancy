"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE, type Job, type Result, type Claim, type ReviewStatus } from "@/lib/types";

const time = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const statuses: Record<ReviewStatus, { label: string; color: string }> = {
  consistent_with_visible_evidence: { label: "Consistent with visible evidence", color: "retained" },
  potential_visual_inconsistency_review_recommended: { label: "Potential visual inconsistency — review recommended", color: "uncertain" },
  insufficient_footage_to_assess: { label: "Insufficient footage to assess", color: "dismissed" },
  outside_automated_assessment: { label: "Outside automated assessment", color: "outside" },
};
function Badge({ status }: { status: ReviewStatus }) {
  return <span className={`badge ${statuses[status].color}`}>{statuses[status].label}</span>;
}
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
  const [selected, setSelected] = useState<Claim | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("60");
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [humanConclusions, setHumanConclusions] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("evidencelens-human-conclusions") ?? "{}"); }
    catch { return {}; }
  });
  const [uploading, setUploading] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const active = useRef<string | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const review = result?.reviews.find(item => item.claimId === selected?.id);
  const conclusionKey = result && selected ? `${result.id}:${selected.id}` : "";
  const humanConclusion = conclusionKey ? humanConclusions[conclusionKey] : undefined;

  useEffect(() => { api<Job[]>("/analyses").then(setJobs).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!job || job.status === "complete" || job.status === "failed") return;
    const id = job.id;
    let stopped = false;
    let fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<Job>(`/analyses/${id}`);
        if (stopped || active.current !== id) return;
        const data = next.status === "complete" ? await api<Result>(`/analyses/${id}/result`) : null;
        if (stopped || active.current !== id) return;
        if (data) { setResult(data); setVideoError(false); }
        setJob(next);
        setJobs(previous => previous.map(item => item.id === id ? next : item));
      } catch (e) { if (!stopped && active.current === id) setError((e as Error).message); }
      finally { fetching = false; }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [job]);

  async function open(item: Job) {
    active.current = item.id;
    pendingSeek.current = null;
    setJob(item); setResult(null); setSelected(null); setError(""); setVideoError(false);
    try {
      if (item.status === "complete") {
        const data = await api<Result>(`/analyses/${item.id}/result`);
        if (active.current === item.id) setResult(data);
      }
    } catch (e) { if (active.current === item.id) setError((e as Error).message); }
  }
  const validRange = startSeconds.trim() !== "" && endSeconds.trim() !== "" &&
    Number.isFinite(Number(startSeconds)) && Number.isFinite(Number(endSeconds)) &&
    Number(startSeconds) >= 0 && Number(endSeconds) - Number(startSeconds) >= 1 &&
    Number(endSeconds) - Number(startSeconds) <= 90;
  const hasSource = sourceMode === "file" ? !!file : !!youtubeUrl.trim() && validRange;
  async function upload() {
    if (!hasSource || !report.trim()) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      if (sourceMode === "file" && file) form.append("video", file);
      else {
        form.append("youtube_url", youtubeUrl.trim());
        form.append("start_seconds", startSeconds);
        form.append("end_seconds", endSeconds);
      }
      form.append("report_text", report);
      const next = await api<Job>("/analyses", { method: "POST", body: form });
      setJobs(previous => [next, ...previous]); await open(next);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }
  function seek(seconds: number) {
    pendingSeek.current = seconds;
    if (player.current && player.current.readyState >= 1) {
      player.current.currentTime = seconds;
      pendingSeek.current = null;
    }
  }
  function select(claim: Claim) {
    setSelected(claim);
    player.current?.pause();
    pendingSeek.current = null;
    const window = result?.reviews.find(item => item.claimId === claim.id)?.evidenceWindow;
    if (window) seek(window.startSeconds);
  }
  function setHumanConclusion(value: string) {
    if (!conclusionKey) return;
    setHumanConclusions(previous => {
      const next = { ...previous, [conclusionKey]: value };
      localStorage.setItem("evidencelens-human-conclusions", JSON.stringify(next));
      return next;
    });
  }
  function playEvidenceWindow() {
    if (!review?.evidenceWindow || !player.current) return;
    seek(review.evidenceWindow.startSeconds);
    void player.current.play();
  }

  return <div className="shell">
    <aside><Link className="brand" href="/">EvidenceLens</Link><div className="workspace">CLAIM–EVIDENCE REVIEW</div>
      <div className="nav-active">Case library</div><div className="library-heading">YOUR ANALYSES <span>{jobs.length}</span></div>
      <div className="history">{jobs.map(item => <button className={`history-item ${job?.id === item.id ? "chosen" : ""}`} key={item.id} onClick={() => open(item)}><strong>{item.filename}</strong><span>{item.status} · {new Date(item.created_at).toLocaleDateString()}</span></button>)}{!jobs.length && <p className="muted">Your analyses will appear here.</p>}</div>
      <div className="aside-footer">Human review required<p>Report claims linked to available footage.</p></div>
    </aside>
    <main><header><span>Workspace / Claim review</span><span className="pill">Prototype · Human review required</span></header>
      <section className="intro"><div className="eyebrow">FROM REPORT TO EVIDENCE</div><h1>Inspect each claim against the footage.</h1><p>This prototype surfaces source-linked review questions. It does not make legal conclusions.</p></section>
      <section className="report-input"><label htmlFor="report">Team-written incident report</label><p className="muted">Use your demo report and an already-public, non-graphic video excerpt of at most 90 seconds. Do not submit non-public case material.</p><textarea id="report" rows={5} maxLength={12000} value={report} onChange={e => setReport(e.target.value)} placeholder="Paste the report here. Include concrete observations and any claims the system should abstain from assessing."/></section>
      <section className="source-input">
        <fieldset className="source-options"><legend>Video evidence</legend>
          <label><input type="radio" name="source" checked={sourceMode === "file"} onChange={() => setSourceMode("file")}/> Upload file</label>
          <label><input type="radio" name="source" checked={sourceMode === "youtube"} onChange={() => setSourceMode("youtube")}/> YouTube link</label>
        </fieldset>
        {sourceMode === "youtube" && <div className="youtube-input">
          <label htmlFor="youtube-url">Public YouTube video URL</label>
          <input id="youtube-url" type="url" maxLength={2048} value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/>
          <div className="range-input"><label htmlFor="start-seconds">Start (seconds)<input id="start-seconds" type="number" min="0" step="0.1" value={startSeconds} onChange={e => setStartSeconds(e.target.value)}/></label><label htmlFor="end-seconds">End (seconds)<input id="end-seconds" type="number" min="1" step="0.1" value={endSeconds} onChange={e => setEndSeconds(e.target.value)}/></label></div>
          <p className="muted">Choose a 1–90 second excerpt. For example, 120 to 180 imports 02:00–03:00. These fields determine the range, including for links with a timestamp.</p>
          {!validRange && <p role="alert">Enter a start and end that select between 1 and 90 seconds.</p>}
        </div>}
        <div className="upload"><div><h2>Public demo footage</h2><p>{sourceMode === "youtube" ? "Import the selected excerpt from YouTube" : "MP4 or MOV"} · Live Gemini analysis</p></div>
          {sourceMode === "file" && <label className="file-picker">{file ? file.name : "Choose video"}<input aria-label="Choose public demo video" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>}
          <button className="primary" disabled={!hasSource || !report.trim() || uploading} onClick={upload}>{uploading ? "Submitting…" : "Analyze report + video"}</button>
        </div>
      </section>
      <div className="pipeline"><span>01 Extract claims</span><b>→</b><span>02 Locate evidence</span><b>→</b><span>03 Ground observations</span><b>→</b><span>04 Human review</span></div>
      {error && <div className="error" role="alert">{error} {job && <button onClick={() => open(job)}>Reload analysis</button>}</div>}
      {job && !result && <section className="status" aria-live="polite"><h2>{job.filename}</h2><p>{job.stage}</p>{(job.status === "queued" || job.status === "processing") && <progress max={1} value={job.progress}/>}<p>{job.error}</p>{job.status === "failed" && <p>Correct the inputs above and select Analyze report + video to retry.</p>}</section>}
      {result ? <><div className="review-heading"><div><div className="eyebrow">LIVE MODEL RESULT · HUMAN REVIEW REQUIRED</div><h2>{result.filename}</h2></div><span className="muted">{time(result.duration_sec)} duration · {result.claims.length} claims</span></div>
        <div className="claim-review-grid">
          <section className="events"><div className="events-top"><h2>Report claims</h2><details><summary>View submitted report</summary><p className="report-text">{result.report_text}</p></details></div><div className="event-list">{result.claims.map(claim => {
            const item = result.reviews.find(r => r.claimId === claim.id);
            return <button key={claim.id} aria-pressed={selected?.id === claim.id} className={`event-card ${selected?.id === claim.id ? "selected" : ""}`} onClick={() => select(claim)}><span className="muted">Claim {claim.order} · {claim.category.replaceAll("_", " ")}</span><blockquote>{claim.reportText}</blockquote>{item && <Badge status={item.status}/>}</button>;
          })}</div></section>
          <section className="video-panel"><video key={result.id} ref={player} src={API_BASE + result.video_url} controls preload="metadata" onError={() => setVideoError(true)} onLoadedMetadata={() => { if (pendingSeek.current !== null) seek(pendingSeek.current); }}/>
            {videoError && <p className="error">Video unavailable. Evidence references remain available below; restore the local media before reviewing.</p>}
            <div className="video-caption"><span>{result.source_url ? `Excerpt timestamps · 00:00 = YouTube ${time(result.source_start_seconds ?? 0)}` : "Original recording timestamps"}</span><a href={API_BASE + result.original_url} target="_blank" rel="noreferrer">{result.source_url ? "Open imported excerpt ↗" : "Open original ↗"}</a></div>
            {result.source_url && <div className="video-caption"><a href={`${result.source_url}&t=${Math.floor((result.source_start_seconds ?? 0) + (review?.evidenceWindow?.startSeconds ?? 0))}s`} target="_blank" rel="noreferrer">YouTube source: {result.source_title ?? result.filename} ↗</a></div>}
            <div className="timeline" aria-label="Selected claim evidence window">{review?.evidenceWindow && <button aria-label="Seek to selected claim evidence" onClick={() => seek(review.evidenceWindow!.startSeconds)} style={{ left: `${review.evidenceWindow.startSeconds/result.duration_sec*100}%`, width: `${(review.evidenceWindow.endSeconds-review.evidenceWindow.startSeconds)/result.duration_sec*100}%` }}/>}</div>
            <div className="detail">{review?.evidenceWindow ? <><h3>Evidence window</h3><p>{time(review.evidenceWindow.startSeconds)}–{time(review.evidenceWindow.endSeconds)}</p><p className="muted">AI-generated locator note: {review.localizationReason} This note helps find footage; it is not a confirmed finding.</p><button className="review-action" onClick={playEvidenceWindow}>▶ Play evidence window</button><h3>Source-frame references</h3><div className="frame-times">{review.frameTimes.map(t => <button key={t} onClick={() => seek(t)}>Inspect {time(t)}</button>)}</div>{!review.frameTimes.length && <p>No specific source frames identified.</p>}</> : <p>{selected ? "No evidence window available for this claim. The player shows the original recording only." : "Select a report claim to inspect the relevant footage."}</p>}</div>
          </section>
          <section className="events detail" aria-live="polite"><h2>Final Conclusion</h2>{selected && review ? <><blockquote>{selected.reportText}</blockquote><h3>Final result</h3>{humanConclusion ? <span className={`badge ${humanConclusion === "supported" ? "retained" : "dismissed"}`}>{humanConclusion === "supported" ? "Sufficient footage" : "Insufficient footage"}</span> : <p className="muted">Pending your review</p>}<h3>AI assessment</h3><Badge status={review.status}/><h3>Visible observations</h3>{review.observations.length ? <ul>{review.observations.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p>No visual assessment made.</p>}{review.clip_url && <a href={API_BASE + review.clip_url} target="_blank" rel="noreferrer">Open evidence clip ↗</a>}<p><strong>Review the footage above, then record your conclusion:</strong></p><div className="human-conclusions" role="group" aria-label="Record your conclusion"><button aria-pressed={humanConclusion === "supported"} onClick={() => setHumanConclusion("supported")}>Supported by footage</button><button aria-pressed={humanConclusion === "insufficient"} onClick={() => setHumanConclusion("insufficient")}>Insufficient footage</button></div>{humanConclusion && <p className="muted">Your conclusion is saved in this browser.</p>}<p><strong>Human review required.</strong> Absence from footage does not establish that an event did not happen.</p></> : <p>Select a claim to view its evidence review.</p>}</section>
        </div><details className="raw-json"><summary>Debug: full analysis JSON</summary><p className="muted">Includes the job record and the complete result returned by the API.</p><pre>{JSON.stringify({ job, analysis: result }, null, 2)}</pre></details><footer>{result.model} · Pipeline {result.pipeline_version}<a href={API_BASE + `/analyses/${result.id}/result`} target="_blank" rel="noreferrer">Open analysis JSON ↗</a></footer></> : !job && <section className="empty"><h2>Start with the report.</h2><p>Add a team-written report and public demo clip. Each claim gets an evidence review or an explicit abstention.</p></section>}
    </main>
  </div>;
}

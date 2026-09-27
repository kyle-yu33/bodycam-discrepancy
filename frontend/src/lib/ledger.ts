// Mirror of backend/app/ledger.py (the claims pipeline). Change both in the same PR.
// Media URLs (video_url, evidence_frames) are relative: prefix with API_BASE.
import { API_BASE } from "./types";

export type ClaimType = "visual" | "audio" | "documentary" | "subjective_or_legal";
export type Status = "consistent" | "potential_inconsistency" | "insufficient_footage" | "outside_assessment";

export interface Claim {
  id: string;
  text: string;
  claim_type: ClaimType;
}

export interface PoseEvent {
  track_id: number; // -1 = camera; never shown to users
  event: string;
  start_sec: number;
  end_sec: number;
}

export interface ClaimResult {
  claim: Claim;
  status: Status;
  observation: string;
  window_start_sec: number | null;
  window_end_sec: number | null;
  person_track_id: number | null;
  second_look: string | null;
  downgraded: boolean;
  evidence_frames: string[];
  pose_events: PoseEvent[];
}

export type Origin = "demo" | "upload"; // upload = analyzed from the frontend via POST /cases

export interface CaseResult {
  case: string;
  origin: Origin;
  model: string;
  created_at: string;
  report_text: string;
  duration_sec: number;
  video_url: string;
  annotated_video_url: string;
  results: ClaimResult[];
  pose_events: PoseEvent[];
}

export interface CaseSummary {
  case: string;
  origin: Origin;
  model: string;
  created_at: string;
  claims: number;
  consistent: number;
  potential_inconsistency: number;
  insufficient_footage: number;
  outside_assessment: number;
}

// Background analysis of an uploaded case (GET /cases/{case}/job).
export type CaseJob = import("./types").Job;

export interface Health {
  gemini_configured: boolean;
  ffmpeg_available: boolean;
}

export const media = (path: string) => API_BASE + path;

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { cache: "no-store", signal: AbortSignal.timeout(15000), ...init });
  } catch {
    throw new Error(`Can't reach the analysis server at ${API_BASE}. Start it from backend/ with: uvicorn app.main:app --port 8000`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`), { status: res.status });
  }
  return res.json();
}

export const listCases = () => get<CaseSummary[]>("/cases");
export const getCase = (id: string) => get<CaseResult>(`/cases/${encodeURIComponent(id)}`);
export const getHealth = () => get<Health>("/health");
// form fields: video (file), report_text and/or report (.txt file), name (optional)
export function createCase(form: FormData, onProgress: (percent: number) => void): Promise<CaseJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "/cases");
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error("Upload connection lost. Check the queue before retrying."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Check the queue before retrying."));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(typeof body.detail === "string" ? body.detail : `Upload failed (${xhr.status})`));
      } catch { reject(new Error(`Upload failed (${xhr.status})`)); }
    };
    xhr.send(form);
  });
}
export const getCaseJob = (id: string) => get<CaseJob>(`/cases/${encodeURIComponent(id)}/job`);
export const listCaseJobs = () => get<CaseJob[]>("/case-jobs?include_finished=true");
// Stops the job; a running operation may need to finish before files can be deleted.
export const stopCase = (id: string, runId?: string) => get<CaseJob>(`/cases/${encodeURIComponent(id)}/stop${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`, { method: "POST" });

export const deleteCase = (id: string, runId?: string) => get<CaseJob>(`/cases/${encodeURIComponent(id)}${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`, { method: "DELETE" });

// Release range requests before asking Windows to delete a currently open clip.
export function releaseCaseMedia(id: string): () => void {
  const prefix = `/case-media/${encodeURIComponent(id)}/`;
  const saved: { video: HTMLVideoElement; src: string; time: number }[] = [];
  for (const video of document.querySelectorAll("video")) {
    const src = video.currentSrc || video.src;
    if (!src || !new URL(src, window.location.href).pathname.startsWith(prefix)) continue;
    saved.push({ video, src, time: video.currentTime });
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  return () => {
    for (const { video, src, time } of saved) {
      if (!video.isConnected) continue;
      video.src = src;
      video.addEventListener("loadedmetadata", () => { video.currentTime = time; }, { once: true });
      video.load();
    }
  };
}

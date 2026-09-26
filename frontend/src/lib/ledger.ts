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
export interface CaseJob {
  id: string; // the case id
  filename: string;
  status: "queued" | "processing" | "complete" | "failed";
  stage: string;
  progress: number; // 0..1
  error: string | null;
  created_at: string;
}

export interface Health {
  gemini_configured: boolean;
  ffmpeg_available: boolean;
}

export const media = (path: string) => API_BASE + path;

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { cache: "no-store", ...init });
  } catch {
    throw new Error(`Can't reach the analysis server at ${API_BASE}. Start it from backend/ with: uvicorn app.main:app --port 8000`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.json();
}

export const listCases = () => get<CaseSummary[]>("/cases");
export const getCase = (id: string) => get<CaseResult>(`/cases/${encodeURIComponent(id)}`);
export const getHealth = () => get<Health>("/health");
// form fields: video (file), report_text and/or report (.txt file), name (optional)
export const createCase = (form: FormData) => get<CaseJob>("/cases", { method: "POST", body: form });
export const getCaseJob = (id: string) => get<CaseJob>(`/cases/${encodeURIComponent(id)}/job`);
export const listCaseJobs = () => get<CaseJob[]>("/case-jobs");
// Deletes the upload: at once if queued, at the next checkpoint (about a second) if running.
export const stopCase = (id: string) => get<CaseJob>(`/cases/${encodeURIComponent(id)}/stop`, { method: "POST" });

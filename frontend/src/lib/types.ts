// Mirror of backend/app/schema.py. Copy to frontend/src/lib/types.ts.
// Media URLs (video_url, evidence_frames) are relative: prefix with API_BASE.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ClaimType = "visual" | "audio" | "subjective";
export type Verdict = "supported" | "contradicted" | "not_visible";

export interface Claim {
  id: string;
  text: string;
  actor: string;
  action: string;
  claim_type: ClaimType;
  sequence_cue: string | null;
}

export interface PoseEvent {
  track_id: number;
  event: "hands_raised" | "arm_extended" | "hand_at_waist" | "lying_down" | string;
  start_sec: number;
  end_sec: number;
}

export interface ClaimResult {
  claim_id: string;
  verdict: Verdict;
  timestamp_sec: number | null;
  person_track_id: number | null;
  reason: string;
  evidence_frames: string[];
  pose_support: PoseEvent[];
  downgraded: boolean;
}

export interface AnalysisResult {
  case_id: string;
  llm_backend: "mock" | "gemini"; // mock results are dev-only, never demo
  report_text: string;
  video_url: string;
  annotated_video_url: string | null;
  claims: Claim[];
  results: ClaimResult[];
  pose_events: PoseEvent[];
}

// Seek slightly early so the moment is on screen: video.currentTime = Math.max(0, t - 2)

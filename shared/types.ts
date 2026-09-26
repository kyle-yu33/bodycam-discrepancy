export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export interface Job { id: string; filename: string; status: "queued" | "processing" | "complete" | "failed"; stage: string; progress: number; error: string | null; created_at: string }
export interface Candidate { id: string; event_type: string; start_sec: number; end_sec: number; description: string; source_clips: number[] }
export interface Event extends Candidate { detail: { status: "retained" | "uncertain" | "dismissed"; description: string; observations: string[]; uncertainty: string[]; confidence: "low" | "medium" | "high" }; clip_url: string; context_start_sec: number; context_end_sec: number }
export interface Result { id: string; filename: string; duration_sec: number; video_url: string; original_url: string; model: string; pipeline_version: string; clips: {index: number; start_sec: number; end_sec: number}[]; candidates: Candidate[]; events: Event[] }

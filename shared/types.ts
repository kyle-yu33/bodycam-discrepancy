// Keep this API contract aligned with backend/app/schema.py.
export interface Job { id: string; filename: string; status: "queued" | "processing" | "complete" | "failed"; stage: string; progress: number; error: string | null; created_at: string }
export type ClaimCategory = "visual" | "audio" | "documentary" | "subjective_or_legal";
export type ReviewStatus = "consistent_with_visible_evidence" | "potential_visual_inconsistency_review_recommended" | "insufficient_footage_to_assess" | "outside_automated_assessment";
export interface Claim { id: string; order: number; reportText: string; category: ClaimCategory; assessableByVideo: boolean; reportStart: number; reportEnd: number }
export interface EvidenceWindow { startSeconds: number; endSeconds: number }
export interface EvidenceReview {
  claimId: string;
  status: ReviewStatus;
  evidenceWindow: EvidenceWindow | null;
  observations: string[];
  frameTimes: number[];
  localizationReason: string | null;
  clip_url: string | null;
  humanReviewRequired: true;
}
export interface Result {
  id: string; filename: string; report_text: string; duration_sec: number;
  video_url: string; original_url: string; model: string;
  source_url?: string | null; source_title?: string | null; source_start_seconds?: number;
  pipeline_version: "2"; mode: "live"; claims: Claim[]; reviews: EvidenceReview[];
}

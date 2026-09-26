# Backend and Analysis Boundaries

## Purpose

**Current implementation:** The claim-driven prototype retains Python FastAPI and
Pydantic with `POST /analyses` (`report_text` plus either multipart `video` or
`youtube_url` with `start_seconds`/`end_seconds` for a 1–90 second excerpt), background
jobs, and `GET /analyses/{id}/result`. It implements the claim/review domain below;
the TypeScript service interfaces, mock default, Next.js route, and Zod validation
below are target recommendations. See `decisions.md` for the implementation checkpoint.

The backend exists to turn a report and video into a structured **claim–evidence ledger**. It should be thin, typed, deterministic in demo mode, and safe to replace with a real Gemini integration later.

## Domain types

```ts
export type ClaimCategory =
  | "visual"
  | "audio"
  | "documentary"
  | "subjective_or_legal";

export type ReviewStatus =
  | "consistent_with_visible_evidence"
  | "potential_visual_inconsistency_review_recommended"
  | "insufficient_footage_to_assess"
  | "outside_automated_assessment";

export type Claim = {
  id: string;
  order: number;
  reportText: string;
  category: ClaimCategory;
  assessableByVideo: boolean;
};

export type EvidenceWindow = {
  startSeconds: number;
  endSeconds: number;
};

export type EvidenceReview = {
  claimId: string;
  status: ReviewStatus;
  evidenceWindow?: EvidenceWindow;
  observations: string[];
  frameTimes: number[];
  humanReviewRequired: true;
};
```

## Service interfaces

```ts
export interface CaseAnalyzer {
  analyzeCase(input: CaseInput): Promise<CaseAnalysis>;
}

export interface ClaimLocalizer {
  locate(claim: Claim, video: VideoRef): Promise<CandidateWindow | UnableToLocate>;
}

export interface VisualGrounder {
  review(claim: Claim, clip: VideoRef, window: EvidenceWindow): Promise<EvidenceReview>;
}
```

Keep one mock implementation as the default. A Gemini implementation must be a replaceable adapter, not hard-wired UI logic.

## API boundary

Suggested route:

```text
POST /api/analyze
```

Expected demo response:

```json
{
  "mode": "mock",
  "caseId": "demo-001",
  "claims": [],
  "reviews": [],
  "analyzedAt": "ISO timestamp"
}
```

The UI must visibly distinguish `mock`/cached output from live model output.

## Future Gemini flow

### Pass 1 — claim-guided localization

Input: one visually assessable report claim plus the short full bodycam clip.

Output: candidate time window plus a short reason, or `unable_to_locate`.

### Clip preparation

If a candidate exists, use FFmpeg later to make a short clip with source timestamps preserved. This is an implementation seam, not an MVP dependency.

### Pass 2 — narrow visual grounding

Input: the atomic claim and only the relevant short clip.

Output: structured observations, source-frame timestamps, and approved review status.

Pass 2 must never output a legal conclusion, a credibility judgment, or a claim of independent verification.

## Validation

- Validate model responses with a Zod schema before rendering.
- Reject unknown statuses.
- Require `humanReviewRequired: true` in every review.
- Treat schema-valid but semantically questionable output as a product risk; structured JSON is formatting control, not truth control.
- Preserve raw model output only if needed for debugging; never display it as a legal conclusion.

## Secrets and data handling

- Gemini API key stays server-side only.
- Use `.env.local`, never commit it.
- Include `.env.example` with variable names only.
- Do not accept or upload non-public case evidence in the MVP.
- Only use footage that is already publicly released. Vertex AI has no Files API, so short video clips are sent inline; clips above 15 MB are rejected.

## YouTube video input

The prototype accepts a public YouTube URL with a 1–90 second excerpt range. `yt-dlp` downloads the excerpt in the background. No browser cookies are used. Result metadata preserves the source URL and excerpt offset; evidence timestamps remain relative to the downloaded excerpt.

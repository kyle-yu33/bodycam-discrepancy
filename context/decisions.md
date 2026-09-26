# Decision Log

This log records the core decisions that define EvidenceLens. Update it when the team changes a material product, safety, or scope assumption.

| Decision | Why | Consequence |
|---|---|---|
| Target Civic Tech as the primary project story. | The project addresses access-to-justice and overloaded defence review workflows. | Lead with people and legal-evidence burden, not model novelty. |
| Build for defence-side review, not police scoring or surveillance. | Aligns with the user problem and reduces harmful framing. | No danger scores, suspect tracking, or law-enforcement dashboard behavior. |
| Do not call it a lie detector or truth engine. | Video is incomplete and models are fallible. | Use evidence states and source-linked review language. |
| Treat `Insufficient footage to assess` as a valuable result. | Absence of evidence is not evidence of absence. | UI and pitch must make abstention visibly useful. |
| Use real, publicly released bodycam footage with a team-written report. | Real footage is more credible than staged video; limiting it to public releases avoids non-public evidence; writing the report ourselves gives known ground truth. | Cite the source, keep clips non-graphic, and label the report as team-written. No non-public case data. |
| Keep one narrow end-to-end case for the MVP. | A reliable happy path beats unfinished breadth at a hackathon. | No multi-camera, accounts, broad uploads, or full evidence platform. |
| Use Gemini as the visual-model layer. | Gemini accepts video input and is a natural hackathon/MLH-aligned integration. | Gemini must be central, not a bolted-on feature. |
| Use two Gemini passes. | A broad pass can localize; a narrow pass can ground observations in a short clip. | Pass 2 is not independent verification. |
| Start from report claims, not generic event detection. | The differentiator is claim-to-evidence audit, not surveillance-style event detection. | Remove generic firearm/fight/lunge detector logic from MVP. |
| Avoid custom CV modules in MVP. | YOLO/tracking/pose/model fusion increase risk without improving judge value. | Use one multimodal model and a transparent ledger. |
| Call Gemini through Vertex AI with a Google Cloud API key. | Billing goes through the team's Google Cloud project instead of AI Studio. | `GOOGLE_API_KEY` + `vertexai=True`; no Files API, so clips are sent inline and must stay short. Smoke test: `backend/smoke_test.py`. |
| Use cached/mock demo analysis by default. | Live API latency, quotas, Wi-Fi, and model variance can ruin the demo. | Label mocked/cached analysis honestly; offer live rerun only as optional. |
| Position against JusticeText carefully. | JusticeText clearly overlaps in bodycam review, documents, timelines, and inconsistency workflows. | Never claim it cannot analyze footage or definitively lacks vision AI; use public-documentation wording. |

## Implementation checkpoint — claim-driven prototype

- Replaced generic event detection with exact report-claim extraction, eligibility,
  claim-guided localization, and narrow visual grounding. Missing windows produce
  `Insufficient footage to assess`; non-visual claims skip visual model calls.
- Retain FastAPI, Pydantic, background jobs, FFmpeg, and the Next.js client during
  this iteration. `POST /analyses` accepts `video` and `report_text`; it returns a
  job, with claims/reviews available from the result endpoint. Next.js route handlers
  and Zod remain a proposed architecture, not a prerequisite for the product workflow.
- Live analysis currently accepts short demo excerpts (at most 90 seconds). The
  existing upload control is a local development input for public demo media,
  not the proposed final arbitrary-evidence upload product.
- Results now use pipeline version `2`. Existing version `1` event results are
  retained on disk and return an explicit re-analysis message when opened.
- The seeded public case, in-app source attribution, and default mock/cached demo
  path are still outstanding. This checkpoint is not completion of the MVP.

## YouTube evidence input

- Added YouTube links as an alternative to local files, using a selected 1–90 second
  excerpt and the same report-driven analysis pipeline. `yt-dlp` and FFmpeg import
  the excerpt in the existing background worker. No browser cookies are used.
- Persist the source URL/title and excerpt start offset. Evidence times stay local
  to the excerpt for player seeking; the UI identifies the offset and links back
  to the matching YouTube moment. This supports public demo footage, not private
  case material. Users must still select an appropriate official release.

## Open execution questions

- Which teammate owns frontend/UI, backend/integration, demo-data/video, and pitch/README?
- Which current Gemini Flash model and API quota are actually available to the team account?
- Does the chosen public clip yield clear, grounded outputs in a real test run?
- What are the final official submission mechanics and track rules for Hack the Hill III?

These are execution questions, not reasons to expand the MVP.

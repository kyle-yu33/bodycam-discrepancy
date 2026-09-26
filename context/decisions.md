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
| Use cached/mock demo analysis by default. | Live API latency, quotas, Wi-Fi, and model variance can ruin the demo. | Label mocked/cached analysis honestly; offer live rerun only as optional. |
| Position against JusticeText carefully. | JusticeText clearly overlaps in bodycam review, documents, timelines, and inconsistency workflows. | Never claim it cannot analyze footage or definitively lacks vision AI; use public-documentation wording. |

## Current open questions

- Which teammate owns frontend/UI, backend/integration, demo-data/video, and pitch/README?
- Which current Gemini Flash model and API quota are actually available to the team account?
- Does the chosen public clip yield clear, grounded outputs in a real test run?
- What are the final official submission mechanics and track rules for Hack the Hill III?

These are execution questions, not reasons to expand the MVP.
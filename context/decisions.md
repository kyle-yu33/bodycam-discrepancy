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
| Use YOLO pose estimation as supporting evidence for physical claims. *(Replaces "avoid custom CV modules", 2026-09-26.)* | The demo case is a field sobriety test, where the key claims are body positions (arms raised for balance, foot put down, stepping off the line). Gemini samples video at 1 FPS by default and has misjudged which object moved in our own testing; pose keypoints at 5 FPS give a measurable, frame-level check. It is also the concrete vision-AI wedge in `positioning.md`. | YOLO pose + ByteTrack runs once, offline, in Python; its events and an overlay video are cached with the demo case and passed to Gemini as extra evidence. Pose never produces a status on its own. Track IDs only link one person's poses within a clip; they are not identities and are not shown as tracking cards. |
| Keep the claims pipeline in the Python backend (FastAPI), not Next.js route handlers. *(Differs from `backend.md`, 2026-09-26.)* | YOLO pose needs Python, and ffmpeg, Gemini and the scoring script already live there; one language for the whole analysis path. | `python -m app.cases <case>` precomputes results; the Next.js UI only reads `GET /cases/{case}`. The event API (`/analyses`) stays until the UI moves to the claims ledger. |
| Call Gemini through Vertex AI with a Google Cloud API key. | Billing goes through the team's Google Cloud project instead of AI Studio. | `GOOGLE_API_KEY` + `vertexai=True`; no Files API, so clips are sent inline and must stay short. Smoke test: `backend/smoke_test.py`. |
| Use cached/mock demo analysis by default. | Live API latency, quotas, Wi-Fi, and model variance can ruin the demo. | Label mocked/cached analysis honestly; offer live rerun only as optional. |
| Let the review UI upload a clip and report and analyze them live. *(Narrows "no broad uploads", 2026-09-26.)* | Preparing each case from the command line made setup hard; teammates and judges should only need the backend and frontend running. | `POST /cases` (one clip up to 90 s, MP4/MOV, plus a pasted or `.txt` report) runs `cases.run` as a background job; `/new` polls `GET /cases/{case}/job`. Results carry `origin: "upload"` and are labelled "Uploaded case". Demo cases stay cached and replayed. Still one camera, no accounts; uploads must be publicly released footage. |
| Position against JusticeText carefully. | JusticeText clearly overlaps in bodycam review, documents, timelines, and inconsistency workflows. | Never claim it cannot analyze footage or definitively lacks vision AI; use public-documentation wording. |

## Current open questions

- Which teammate owns frontend/UI, backend/integration, demo-data/video, and pitch/README?
- Which current Gemini Flash model and API quota are actually available to the team account?
- Does the chosen public clip yield clear, grounded outputs in a real test run?
- What are the final official submission mechanics and track rules for Hack the Hill III?

These are execution questions, not reasons to expand the MVP.